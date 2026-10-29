/* Weather service: saved device weather, optional GPS refresh, demand-driven timer. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var settings = App.services.settings;
  var utils = App.core.utils;

  var state = {
    city: '',
    temp: '',
    condition: '',
    icon: '',
    updatedAt: 0,
    error: null,
    loading: false
  };

  var demandCount = 0;
  var timer = null;
  var gps = null;
  var requestToken = 0;

  function emit() {
    bus.emit('weather:change', state);
  }

  function apply(raw) {
    if (!raw || raw.error) {
      state.error = raw && raw.error ? String(raw.error) : 'unavailable';
      state.loading = false;
      emit();
      return false;
    }
    if (raw.city !== undefined) state.city = raw.city;
    if (raw.temp !== undefined) state.temp = raw.temp;
    if (raw.condition !== undefined) state.condition = raw.condition;
    if (raw.icon !== undefined) state.icon = raw.icon;
    state.updatedAt = Date.now();
    state.error = null;
    state.loading = false;
    emit();
    return true;
  }

  function loadSaved() {
    var raw = bridge.getWeather();
    if (!raw) {
      state.error = bridge.isNative() ? 'unavailable' : 'no_bridge';
      emit();
      return false;
    }
    return apply(raw);
  }

  function refresh(manual) {
    if (!bridge.isNative()) {
      state.error = 'no_bridge';
      state.loading = false;
      emit();
      return false;
    }
    var token = ++requestToken;
    if (gps) {
      state.loading = true;
      emit();
      var result = bridge.refreshWeather(gps.lat, gps.lon);
      if (result && result.error) {
        state.loading = false;
        state.error = String(result.error);
        emit();
        return false;
      }
      // The device answers with the weather event; do not leave the spinner
      // forever when the head unit silently drops the request.
      setTimeout(function () {
        if (token !== requestToken || !state.loading) return;
        state.loading = false;
        state.error = 'timeout';
        emit();
      }, 12000);
      return true;
    }
    return loadSaved();
  }

  function intervalMs() {
    var current = settings.get();
    var minutes = current ? current.weather.refreshMinutes : 30;
    return Math.max(5, minutes) * 60000;
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
    timer = setInterval(function () { refresh(false); }, intervalMs());
  }

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0) {
      loadSaved();
      refresh(false);
      start();
    } else {
      stop();
    }
  }

  function init() {
    bus.on('android:weather', function (data) {
      requestToken += 1;
      apply(data && typeof data === 'object' ? data : {});
    });
    bus.on('android:gps', function (data) {
      if (!data || !isFinite(data.lat) || !isFinite(data.lon)) return;
      gps = { lat: Number(data.lat), lon: Number(data.lon) };
    });
    bus.on('settings:change', function () {
      if (demandCount > 0) start();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
  }

  function temperature() {
    var value = utils.toNumber(state.temp, null);
    return value === null ? null : value;
  }

  App.services.weather = {
    init: init,
    state: function () { return state; },
    demand: demand,
    refresh: refresh,
    temperature: temperature
  };
})(window.App);
