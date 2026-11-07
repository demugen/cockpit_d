/* Body commands: windows. Moving the glass is fire-and-forget — the host answers
   a request with a bare success and the real position only comes from
   get_windows_state — so this service keeps the two apart: a command result
   says "sent", only the readout says "open". */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;

  // Index order is the one the host documents for get_windows_state.
  var WINDOW_INDEX = ['front_left', 'front_right', 'rear_left', 'rear_right'];

  var GROUPS = [
    {
      id: 'windows',
      label: 'Все окна',
      actions: [
        { id: 'win-close', cmd: 'close_windows', label: 'Закрыть', title: 'Закрыть все окна', done: 'Отправлено: закрыть окна' },
        // The profile has no percentage for the glass: this is the factory
        // ventilation mode, and the old `*_10` name only survived for
        // compatibility.
        { id: 'win-vent', cmd: 'open_windows_10', label: 'Проветрить', title: 'Штатное проветривание: все окна приоткрыты', done: 'Отправлено: проветривание' },
        { id: 'win-all', cmd: 'open_windows_full', label: 'Открыть', title: 'Открыть все окна полностью', confirm: true, done: 'Отправлено: открыть все окна' }
      ]
    },
    {
      id: 'corners',
      label: 'Каждое окно',
      hint: 'Касание — закрыть, удержание — открыть',
      actions: [
        // Four corners share two short labels otherwise ("Спереди" twice), and
        // the driver cannot tell which glass a button closes.
        { id: 'win-fl', window: 0, cmd: 'close_window_front_left', open: 'open_window_front_left_full', label: 'ЛП', title: 'Левое переднее окно', full: true, done: 'Отправлено: закрыть левое переднее', openDone: 'Отправлено: левое переднее полностью' },
        { id: 'win-fr', window: 1, cmd: 'close_window_front_right', open: 'open_window_front_right_full', label: 'ПП', title: 'Правое переднее окно', full: true, done: 'Отправлено: закрыть правое переднее', openDone: 'Отправлено: правое переднее полностью' },
        { id: 'win-rl', window: 2, cmd: 'close_window_rear_left', open: 'open_window_rear_left_full', label: 'ЛЗ', title: 'Левое заднее окно', full: true, done: 'Отправлено: закрыть левое заднее', openDone: 'Отправлено: левое заднее полностью' },
        { id: 'win-rr', window: 3, cmd: 'close_window_rear_right', open: 'open_window_rear_right_full', label: 'ПЗ', title: 'Правое заднее окно', full: true, done: 'Отправлено: закрыть правое заднее', openDone: 'Отправлено: правое заднее полностью' }
      ]
    }
  ];

  var byId = Object.create(null);
  GROUPS.forEach(function (group) {
    group.widget = 'windows';
    group.actions.forEach(function (action) {
      action.widget = 'windows';
      byId[action.id] = action;
    });
  });

  var ERROR_TEXT = {
    car_cmd_proxy_null: 'Нет связи с автомобилем',
    unavailable: 'Недоступно на этом автомобиле',
    empty_name: 'Команда не распознана',
    'Unknown command': 'Автомобиль не знает такой команды',
    rejected: 'Автомобиль не принял команду',
    failed: 'Автомобиль не принял команду'
  };

  function errorText(response) {
    if (!response) return 'Автомобиль не ответил';
    var code = String(response.error || (response.success === false ? 'failed' : ''));
    return ERROR_TEXT[code] || 'Автомобиль не принял команду';
  }

  function groups(widget) {
    if (!widget) return GROUPS;
    return GROUPS.filter(function (group) {
      return group.widget === widget;
    });
  }

  function get(id) {
    return byId[id] || null;
  }

  function publish(id, ok, text) {
    bus.emit('body:result', { id: id, ok: ok, text: text });
  }

  // `open` picks the fully-open command for a corner button held down. The
  // one-step `open_window_*_10` requests are left out on purpose: the host
  // accepts them and then the glass does not move.
  function run(id, open) {
    var action = byId[id];
    if (!action) return false;
    var command = open ? action.open : action.cmd;
    if (!command) return false;
    var done = open ? action.openDone : action.done;
    if (!bridge.has('carCommand')) {
      publish(id, false, 'Нет связи с автомобилем');
      return false;
    }
    var response = bridge.command({ cmd: command });
    var ok = !!response && response.success !== false;
    publish(id, ok, ok ? done : errorText(response));
    // The position arrives on its own getter a moment after the request.
    if (ok) setTimeout(read, 900);
    return ok;
  }

  function needsConfirm(id) {
    var action = byId[id];
    return !!(action && action.confirm);
  }

  /* The readout. `windows[i]` is null while the host gives no number for that
     corner; state carries the closed/open/partial answer, which firmwares
     report even when the position scale is unknown. */
  var windows = [null, null, null, null];
  var positions = [null, null, null, null];
  var reported = false;
  var demandCount = 0;
  var timer = null;

  function percentOf(item) {
    var value = item && item.openPercent;
    if (value === null || value === undefined || !isFinite(Number(value))) return null;
    return Math.max(0, Math.min(100, Math.round(Number(value))));
  }

  function stateOf(item) {
    var known = ['closed', 'open', 'partial', 'tilted'];
    var value = item && item.state;
    return known.indexOf(value) !== -1 ? value : null;
  }

  function applyWindows(items) {
    var changed = false;
    WINDOW_INDEX.forEach(function (name, index) {
      var match = null;
      items.forEach(function (item) {
        if (item && (item.name === name || Number(item.window) === index)) match = item;
      });
      var usable = match && match.available !== false;
      var nextPercent = usable ? percentOf(match) : null;
      var nextState = usable ? stateOf(match) : null;
      if (nextPercent !== positions[index] || nextState !== windows[index]) changed = true;
      positions[index] = nextPercent;
      windows[index] = nextState;
      if (nextPercent !== null || nextState !== null) reported = true;
    });
    if (changed) {
      bus.emit('body:windows', {
        windows: windows.slice(),
        positions: positions.slice(),
        reported: reported
      });
    }
  }

  function read() {
    if (demandCount <= 0 || document.hidden) return;
    var response = bridge.command({ cmd: 'get_windows_state' });
    // `success: true` with `available: false` means the route ran and there is
    // no glass data: that is a silent answer, not a set of closed windows.
    if (!response || response.success === false || !Array.isArray(response.windows)) return;
    applyWindows(response.windows);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    if (demandCount <= 0 || document.hidden) return;
    timer = setInterval(read, 2000);
  }

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0) {
      read();
      start();
    } else {
      stop();
    }
  }

  function snapshot() {
    return { windows: windows.slice(), positions: positions.slice(), reported: reported };
  }

  function init() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else {
        start();
        read();
      }
    });
  }

  App.services.body = {
    groups: groups,
    get: get,
    run: run,
    needsConfirm: needsConfirm,
    init: init,
    demand: demand,
    read: read,
    snapshot: snapshot
  };
})(window.App);
