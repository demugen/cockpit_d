/* Vehicle snapshot service: one snapshot per poll while a widget needs it. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var settings = App.services.settings;
  var utils = App.core.utils;

  var state = {
    vehicle: { speed: null, rpm: null, engine: null, outTemp: null, batteryVoltage: null, fuelPercent: null, sun: null, park: null },
    heat: { rulHeat: null, lobHeat: null, zadHeat: null, driverTemp: null, passengerTemp: null },
    seats: { frontLeft: null, frontRight: null, rearLeft: null, rearRight: null },
    extra: {},
    updatedAt: 0,
    error: null,
    available: false
  };

  var demandCount = 0;
  var timer = null;
  var inFlight = false;
  var signature = '';
  var watched = [];

  function number(value, min, max) {
    var result = utils.toNumber(value, null);
    if (result === null) return null;
    return utils.clamp(result, min, max);
  }

  // The host uses -99/-99f for "no sensor" outside and cabin temperatures.
  // Clamping that sentinel would show a plausible but false -60 °C.
  function temperature(value) {
    var result = utils.toNumber(value, null);
    if (result === null || result <= -90) return null;
    return utils.clamp(result, -60, 80);
  }

  function level(value) {
    var result = utils.toNumber(value, null);
    if (result === null) return null;
    return utils.clamp(Math.round(result), 0, 4);
  }

  function seat(source) {
    if (!source || typeof source !== 'object') return null;
    return { seat: level(source.seat), heat: level(source.heat), vent: level(source.vent) };
  }

  function apply(data) {
    var vehicle = data.vehicle && typeof data.vehicle === 'object' ? data.vehicle : {};
    var heat = data.heat && typeof data.heat === 'object' ? data.heat : {};
    var seats = data.seats && typeof data.seats === 'object' ? data.seats : {};
    var front = seats.front && typeof seats.front === 'object' ? seats.front : {};
    var rear = seats.rear && typeof seats.rear === 'object' ? seats.rear : {};

    state.vehicle = {
      speed: number(vehicle.speed, 0, 400),
      rpm: number(vehicle.rpm, 0, 12000),
      engine: typeof vehicle.engine === 'boolean' ? vehicle.engine : null,
      outTemp: temperature(vehicle.outTemp),
      batteryVoltage: number(vehicle.batteryVoltage, 0, 30),
      fuelPercent: number(vehicle.fuelPercent, 0, 100),
      sun: typeof vehicle.sun === 'boolean' ? vehicle.sun : null,
      park: typeof vehicle.park === 'boolean' ? vehicle.park : null
    };
    state.heat = {
      rulHeat: typeof heat.rulHeat === 'boolean' ? heat.rulHeat : null,
      lobHeat: typeof heat.lobHeat === 'boolean' ? heat.lobHeat : null,
      zadHeat: typeof heat.zadHeat === 'boolean' ? heat.zadHeat : null,
      driverTemp: temperature(heat.driverTemp),
      passengerTemp: temperature(heat.passengerTemp)
    };
    state.seats = {
      frontLeft: seat(front.frontLeft) || seat(data.frontSeats && data.frontSeats.frontLeft),
      frontRight: seat(front.frontRight) || seat(data.frontSeats && data.frontSeats.frontRight),
      rearLeft: seat(rear.rearLeft),
      rearRight: seat(rear.rearRight)
    };
    state.available = true;
    state.error = null;
    state.updatedAt = Date.now();
  }

  function currentSignature() {
    return JSON.stringify([state.vehicle, state.heat, state.seats, state.extra, state.error]);
  }

  function emitIfChanged() {
    var next = currentSignature();
    if (next === signature) return;
    signature = next;
    bus.emit('car:change', state);
  }

  // Custom car-data slots name a getCarData key the snapshot does not carry;
  // they ride along with the same poll.
  function readExtra(keys) {
    var result = {};
    keys.forEach(function (name) {
      var value = bridge.getCarData(name);
      if (value !== null) result[name] = value;
    });
    return result;
  }

  function setWatched(names) {
    var next = [];
    (Array.isArray(names) ? names : []).forEach(function (name) {
      if (typeof name === 'string' && name && next.indexOf(name) === -1 && next.length < 8) {
        next.push(name);
      }
    });
    if (next.join('\n') === watched.join('\n')) return;
    watched = next;
    if (demandCount > 0) setTimeout(refresh, 0);
  }

  function refresh() {
    if (inFlight) return;
    inFlight = true;
    var data = bridge.getCarData('all');
    var extra = readExtra(watched);
    inFlight = false;
    if (!data) {
      state.error = bridge.isNative() ? 'unavailable' : 'no_bridge';
      state.available = false;
      emitIfChanged();
      return;
    }
    state.extra = extra;
    apply(data);
    emitIfChanged();
  }

  function pollMs() {
    var value = settings.get() ? settings.get().car.pollSeconds : 5;
    return Math.max(2, value) * 1000;
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
    timer = setInterval(refresh, pollMs());
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
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
    bus.on('settings:change', function () {
      if (demandCount > 0) start();
    });
  }

  // Fire-and-forget host actions (rear seat levels, driver memory presets).
  // A quick re-read lets the car snapshot catch up without waiting a poll.
  function runEnum(name) {
    var result = bridge.runEnum(String(name || ''));
    var ok = !!result && result.ok !== false;
    if (ok) setTimeout(refresh, 700);
    return {
      ok: ok,
      error: ok ? null : (result && result.error ? String(result.error) : 'failed')
    };
  }

  App.services.car = {
    init: init,
    state: function () { return state; },
    demand: demand,
    refresh: refresh,
    setWatched: setWatched,
    runEnum: runEnum
  };
})(window.App);
