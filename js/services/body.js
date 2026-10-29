/* Body commands: windows only. The host answers with a bare success and has no
   getter for the glass position, so this service reports "sent" and never
   claims the car actually moved. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;

  var GROUPS = [
    {
      id: 'windows',
      label: 'Все окна',
      actions: [
        { id: 'win-10', cmd: 'open_windows_10', label: '+10%', title: 'Приоткрыть все окна', done: 'Отправлено: окна на 10%' },
        { id: 'win-50', cmd: 'open_windows_50', label: '+50%', title: 'Открыть все окна наполовину', done: 'Отправлено: окна на 50%' },
        { id: 'win-all', cmd: 'open_windows_full', label: 'Открыть', title: 'Открыть все окна полностью', confirm: true, done: 'Отправлено: открыть все окна' },
        { id: 'win-close', cmd: 'close_windows', label: 'Закрыть', title: 'Закрыть все окна', done: 'Отправлено: закрыть окна' }
      ]
    },
    {
      id: 'corners',
      label: 'Каждое окно',
      hint: 'Удержание — открыть полностью',
      actions: [
        { id: 'win-fl', cmd: 'open_window_front_left_10', label: 'Лев. перед.', title: 'Левое переднее окно', full: true, done: 'Отправлено: приоткрыть левое переднее' },
        { id: 'win-fr', cmd: 'open_window_front_right_10', label: 'Прав. перед.', title: 'Правое переднее окно', full: true, done: 'Отправлено: приоткрыть правое переднее' },
        { id: 'win-rl', cmd: 'open_window_rear_left_10', label: 'Лев. зад.', title: 'Левое заднее окно', full: true, done: 'Отправлено: приоткрыть левое заднее' },
        { id: 'win-rr', cmd: 'open_window_rear_right_10', label: 'Прав. зад.', title: 'Правое заднее окно', full: true, done: 'Отправлено: приоткрыть правое заднее' }
      ]
    }
  ];

  // The profile has no per-window close: a corner can only be opened 10% or
  // fully, closing is available for all windows at once.
  var CORNER_FULL = {
    'win-fl': { cmd: 'open_window_front_left_full', done: 'Отправлено: левое переднее полностью' },
    'win-fr': { cmd: 'open_window_front_right_full', done: 'Отправлено: правое переднее полностью' },
    'win-rl': { cmd: 'open_window_rear_left_full', done: 'Отправлено: левое заднее полностью' },
    'win-rr': { cmd: 'open_window_rear_right_full', done: 'Отправлено: правое заднее полностью' }
  };

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

  // `full` picks the fully-open command for a single-corner button.
  function run(id, full) {
    var action = byId[id];
    if (!action) return false;
    var extra = full && CORNER_FULL[id];
    var command = extra ? extra.cmd : action.cmd;
    var done = extra ? extra.done : action.done;
    if (!bridge.has('carCommand')) {
      publish(id, false, 'Нет связи с автомобилем');
      return false;
    }
    var response = bridge.command({ cmd: command });
    var ok = !!response && response.success !== false;
    publish(id, ok, ok ? done : errorText(response));
    return ok;
  }

  function needsConfirm(id) {
    var action = byId[id];
    return !!(action && action.confirm);
  }

  App.services.body = {
    groups: groups,
    get: get,
    run: run,
    needsConfirm: needsConfirm
  };
})(window.App);
