/* Climate service: one readable state, optimistic commands, reconcile by reading back. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var utils = App.core.utils;

  var TOGGLES = {
    power: 'climate_set_power',
    ac: 'climate_set_ac',
    auto: 'climate_set_auto',
    sync: 'climate_set_sync',
    recirculation: 'climate_set_recirculation',
    frontDefrost: 'climate_set_front_defrost',
    rearDefrost: 'climate_set_rear_defrost',
    frontGlassHeat: 'climate_set_front_glass_heat',
    steeringWheelHeat: 'climate_set_steering_wheel_heat'
  };
  var POLL_MS = 20000;
  var RECONCILE_MS = 450;
  // A slow host must not snap the UI back to a pre-command read. Pending
  // values survive unmatched reads for this long, then the car wins.
  var PENDING_TTL = 5000;
  // The host opens its own climate dialog for every command, so a burst of
  // taps is merged: the final value of every touched control goes out once,
  // 2 s after the last tap, so there is time to move from temperature to fan.
  // A continuous burst is capped at 4 s.
  var BATCH_MS = 2000;
  var BATCH_MAX_MS = 4000;

  var state = {
    available: false,
    power: false,
    ac: false,
    auto: false,
    sync: false,
    recirculation: false,
    frontDefrost: false,
    rearDefrost: false,
    frontGlassHeat: false,
    steeringWheelHeat: false,
    fanSpeed: 1,
    airMode: -1,
    driverTemperature: 22,
    passengerTemperature: 22,
    driverSeatHeat: 0,
    driverSeatVent: 0,
    passengerSeatHeat: 0,
    passengerSeatVent: 0,
    pending: {},
    queueCount: 0,
    error: null,
    updatedAt: 0
  };

  var demandCount = 0;
  var timer = null;
  var refreshTimer = null;
  var signature = '';
  var queue = {};
  var queueSeq = 0;
  var queueTimer = null;
  var queueStartedAt = 0;
  var queueLastAt = 0;

  // Async polling state
  var pollRequestId = 0;
  var pollPending = false;
  var currentPollRequestId = null;
  var lastSuccessfulPoll = 0;
  var POLL_TIMEOUT_MS = 5000;

  // A read clears only the keys it confirms. Everything still waiting for the
  // host keeps its optimistic value, and each command owns its own keys.
  function acceptPending(key, value) {
    var entry = state.pending[key];
    if (!entry) return true;
    // A queued value has not reached the car yet: a poll in the meantime
    // still reads the old state and must not overwrite the user's choice.
    if (entry.queued) return false;
    if (value === entry.value) {
      delete state.pending[key];
      return true;
    }
    if (Date.now() - entry.at > PENDING_TTL) {
      delete state.pending[key];
      return true;
    }
    return false;
  }

  function takeNumber(key, value, min, max) {
    var parsed = utils.toNumber(value, null);
    if (parsed === null) return;
    parsed = utils.clamp(parsed, min, max);
    if (acceptPending(key, parsed)) state[key] = parsed;
  }

  function apply(raw) {
    state.available = raw.available !== false;
    Object.keys(TOGGLES).forEach(function (key) {
      if (typeof raw[key] !== 'boolean') return;
      if (acceptPending(key, raw[key])) state[key] = raw[key];
    });
    takeNumber('fanSpeed', raw.fanSpeed, 1, 10);
    takeNumber('airMode', raw.airMode, -1, 6);
    takeNumber('driverTemperature', raw.driverTemperature, 16, 32);
    takeNumber('passengerTemperature', raw.passengerTemperature, 16, 32);
    takeNumber('driverSeatHeat', raw.driverSeatHeat, 0, 3);
    takeNumber('driverSeatVent', raw.driverSeatVent, 0, 3);
    takeNumber('passengerSeatHeat', raw.passengerSeatHeat, 0, 3);
    takeNumber('passengerSeatVent', raw.passengerSeatVent, 0, 3);
    state.error = null;
    state.updatedAt = Date.now();
  }

  function currentSignature() {
    var copy = utils.clone(state);
    delete copy.updatedAt;
    return JSON.stringify(copy);
  }

  function emitIfChanged() {
    var next = currentSignature();
    if (next === signature) return;
    signature = next;
    bus.emit('climate:change', state);
  }

  // Incoming carResponse for climate_get_state polls and climate command results.
  function handleCarResponse(payload) {
    if (!payload || payload.requestType !== 'command') return;
    var response = payload.response;
    if (typeof response === 'string') {
      try { response = JSON.parse(response); } catch (e) { return; }
    }
    if (!response) return;

    // Climate state poll response — matched by requestId. The host echoes the
    // command name in `command` (manifest format), some proxies in `cmd`;
    // only reject when a *different* command is explicitly named.
    if (payload.requestId === currentPollRequestId) {
      var pollCmd = response.command || response.cmd;
      if (pollCmd && pollCmd !== 'climate_get_state') return;
      pollPending = false;
      currentPollRequestId = null;
      if (response.success === false) {
        if (!state.available) {
          state.error = response.error || 'unavailable';
          emitIfChanged();
        }
        return;
      }
      lastSuccessfulPoll = Date.now();
      apply(response);
      emitIfChanged();
      return;
    }

    // Command response — match by requestId stored in pending entries
    var matchedKey = null;
    Object.keys(state.pending).forEach(function (key) {
      var entry = state.pending[key];
      if (entry && entry.requestId === payload.requestId) matchedKey = key;
    });
    if (!matchedKey) return;

    var entry = state.pending[matchedKey];
    if (response.success === false) {
      // Command failed — revert pending state
      delete state.pending[matchedKey];
      var prev = previousForKey(matchedKey);
      if (prev !== undefined) {
        state[matchedKey] = prev;
      }
      state.error = response.error || 'command failed';
      emitIfChanged();
      return;
    }
    // Command succeeded — clear pending, car wins on next poll
    delete state.pending[matchedKey];
    state.error = null;
    emitIfChanged();
  }

  function previousForKey(key) {
    // Starts undefined on purpose: a failed command whose previous value is
    // unknown must NOT overwrite the current value with null — the car wins
    // on the next poll instead. (flush() has already emptied the queue by
    // the time a command response arrives, so this lookup usually misses.)
    var found;
    Object.keys(queue).forEach(function (qk) {
      var e = queue[qk];
      if (e && e.previous && Object.prototype.hasOwnProperty.call(e.previous, key)) {
        found = e.previous[key];
      }
    });
    return found;
  }

  // `keepAvailable` is for a rejected command: one bad call must not black out
  // controls whose state we already know.
  function refresh(keepAvailable) {
    // One poll in flight at a time: its answer lands in handleCarResponse()
    // by requestId. Re-issuing while a poll is pending would only pile up
    // duplicate requests in the host queue.
    if (pollPending) return true;
    pollRequestId += 1;
    var requestId = 'climate-poll-' + pollRequestId;
    currentPollRequestId = requestId;
    pollPending = true;
    var result = bridge.requestCarCommandAsync(requestId, { cmd: 'climate_get_state' });
    if (!result.ok) {
      pollPending = false;
      currentPollRequestId = null;
      if (!keepAvailable) state.available = false;
      state.error = result && result.error ? String(result.error) : 'unavailable';
      emitIfChanged();
      return false;
    }
    // JS-side timeout: if the host never answers, stop waiting so the next
    // poll can go out. Until the first successful read the widget stays
    // "unavailable" instead of showing invented defaults.
    setTimeout(function () {
      if (pollPending && currentPollRequestId === requestId) {
        pollPending = false;
        currentPollRequestId = null;
        if (!state.available) {
          state.error = 'poll_timeout';
          emitIfChanged();
        }
      }
    }, POLL_TIMEOUT_MS);
    return true;
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      refresh();
    }, RECONCILE_MS);
  }

  function sendNow(cmd, payload, pendingKeys, previous) {
    var requestId = 'climate-cmd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    pendingKeys.forEach(function (key) {
      // The caller already moved state[key] to the requested value.
      var entry = state.pending[key];
      if (!entry) entry = state.pending[key] = { value: state[key], at: Date.now() };
      entry.value = state[key];
      entry.at = Date.now();
      entry.queued = false;
      entry.requestId = requestId;
    });
    emitIfChanged();

    // Non-blocking async command — response arrives via carResponse → handleCarResponse().
    // Does not block the WebView UI thread on a slow ГУ.
    var message = { cmd: cmd };
    Object.keys(payload || {}).forEach(function (key) { message[key] = payload[key]; });
    var accepted = bridge.requestCarCommandAsync(requestId, JSON.stringify(message));
    var ok = !!accepted;

    bus.emit('climate:command', {
      cmd: cmd,
      ok: ok,
      error: ok ? null : 'queue_failed'
    });

    if (!ok) {
      state.error = 'command queue failed';
      pendingKeys.forEach(function (key) {
        delete state.pending[key];
        if (previous && Object.prototype.hasOwnProperty.call(previous, key)) {
          state[key] = previous[key];
        }
      });
      emitIfChanged();
      refresh(true);
      return false;
    }

    scheduleRefresh();
    return true;
  }

  function nextFlushAt() {
    return Math.min(queueLastAt + BATCH_MS, queueStartedAt + BATCH_MAX_MS);
  }

  function armQueue() {
    if (queueTimer) clearTimeout(queueTimer);
    queueTimer = setTimeout(function () {
      queueTimer = null;
      flush();
    }, Math.max(0, nextFlushAt() - Date.now()));
  }

  function flush() {
    if (queueTimer) {
      clearTimeout(queueTimer);
      queueTimer = null;
    }
    var entries = Object.keys(queue).map(function (key) { return queue[key]; })
      .sort(function (a, b) { return a.seq - b.seq; });
    queue = {};
    queueStartedAt = 0;
    queueLastAt = 0;
    state.queueCount = 0;
    if (!entries.length) {
      emitIfChanged();
      return;
    }
    entries.forEach(function (entry) {
      entry.keys.forEach(function (key) {
        var pendingEntry = state.pending[key];
        if (!pendingEntry) return;
        pendingEntry.queued = false;
        pendingEntry.at = Date.now();
      });
      entry.steps.forEach(function (step) {
        sendNow(step.cmd, step.payload, entry.keys, entry.previous);
      });
    });
    emitIfChanged();
  }

  // `key` identifies one control, so repeated taps only update its target.
  // `steps` lets a linked pair (sync temperatures) travel as one batch.
  function enqueue(key, steps, pendingKeys, previous) {
    if (!state.available) return false;
    var now = Date.now();
    var entry = queue[key];
    if (!entry) {
      entry = queue[key] = { steps: [], keys: [], previous: {}, seq: queueSeq += 1 };
      queueStartedAt = queueStartedAt || now;
    }
    steps.forEach(function (step, index) {
      if (!entry.steps[index]) entry.steps[index] = { cmd: step.cmd, payload: {} };
      Object.keys(step.payload || {}).forEach(function (name) {
        entry.steps[index].payload[name] = step.payload[name];
      });
    });
    pendingKeys.forEach(function (pendingKey) {
      if (entry.keys.indexOf(pendingKey) === -1) entry.keys.push(pendingKey);
      if (previous && Object.prototype.hasOwnProperty.call(previous, pendingKey) &&
        !Object.prototype.hasOwnProperty.call(entry.previous, pendingKey)) {
        entry.previous[pendingKey] = previous[pendingKey];
      }
      state.pending[pendingKey] = { value: state[pendingKey], at: now, queued: true };
    });
    queueLastAt = now;
    state.queueCount = Object.keys(queue).length;
    armQueue();
    emitIfChanged();
    return true;
  }

  function toggle(key) {
    var cmd = TOGGLES[key];
    if (!cmd || !state.available) return false;
    var previous = {};
    previous[key] = state[key];
    var next = !state[key];
    state[key] = next;
    return sendNow(cmd, { value: next }, [key], previous);
  }

  function setTemperature(zone, delta) {
    if (!state.available) return false;
    var passenger = Number(zone) === 2;
    var current = passenger ? state.passengerTemperature : state.driverTemperature;
    // Whole degrees only: this also snaps a half-degree host reading.
    var next = utils.clamp(Math.round(current + Number(delta || 0)), 16, 32);
    if (next === current) return false;

    // Sync links the zones: both readouts move together and the host gets a
    // command for each side, so a refresh cannot pull them apart again.
    if (state.sync) {
      var previous = {
        driverTemperature: state.driverTemperature,
        passengerTemperature: state.passengerTemperature
      };
      state.driverTemperature = next;
      state.passengerTemperature = next;
      return enqueue('temperature:sync', [
        { cmd: 'climate_set_temperature', payload: { zone: 1, value: next } },
        { cmd: 'climate_set_temperature', payload: { zone: 2, value: next } }
      ], ['driverTemperature', 'passengerTemperature'], previous);
    }

    var key = passenger ? 'passengerTemperature' : 'driverTemperature';
    var before = {};
    before[key] = state[key];
    state[key] = next;
    return enqueue('temperature:' + (passenger ? 2 : 1),
      [{ cmd: 'climate_set_temperature', payload: { zone: passenger ? 2 : 1, value: next } }],
      [key], before);
  }

  function seatStateKey(seat, kind) {
    var side = seat === 2 ? 'passenger' : 'driver';
    return side + (kind === 'vent' ? 'SeatVent' : 'SeatHeat');
  }

  function setSeatLevel(seatNumber, kind, level) {
    if (!state.available) return false;
    var seat = Number(seatNumber) === 2 ? 2 : 1;
    var key = seatStateKey(seat, kind);
    var next = utils.clamp(Math.round(Number(level) || 0), 0, 3);
    if (next === state[key]) return false;
    var previous = {};
    previous[key] = state[key];
    state[key] = next;
    return enqueue('seat:' + key,
      [{
        cmd: kind === 'vent' ? 'climate_set_seat_vent' : 'climate_set_seat_heat',
        payload: { seat: seat, value: next }
      }], [key], previous);
  }

  function setSeatHeat(seat, level) {
    return setSeatLevel(seat, 'heat', level);
  }

  function setSeatVent(seat, level) {
    return setSeatLevel(seat, 'vent', level);
  }

  function setFanSpeed(delta) {
    if (!state.available) return false;
    var next = utils.clamp(Math.round(state.fanSpeed + Number(delta || 0)), 1, 10);
    if (next === state.fanSpeed) return false;
    var previous = { fanSpeed: state.fanSpeed };
    state.fanSpeed = next;
    return enqueue('fan',
      [{ cmd: 'climate_set_fan_speed', payload: { value: next } }],
      ['fanSpeed'], previous);
  }

  function fanUp() {
    return setFanSpeed(1);
  }

  function fanDown() {
    return setFanSpeed(-1);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    // A hidden panel must not leave a poll in flight: the guard in refresh()
    // would otherwise skip the first poll after the panel returns.
    pollPending = false;
    currentPollRequestId = null;
  }

  function start() {
    stop();
    if (demandCount <= 0 || document.hidden) return;
    refresh();
    timer = setInterval(refresh, POLL_MS);
  }

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0) {
      refresh();
      start();
    } else {
      stop();
    }
  }

  function init() {
    bus.on('android:carResponse', handleCarResponse);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
  }

  App.services.climate = {
    init: init,
    state: function () { return state; },
    demand: demand,
    refresh: refresh,
    toggle: toggle,
    setTemperature: setTemperature,
    setFanSpeed: setFanSpeed,
    fanUp: fanUp,
    fanDown: fanDown,
    setSeatHeat: setSeatHeat,
    setSeatVent: setSeatVent,
    flush: flush
  };
})(window.App);