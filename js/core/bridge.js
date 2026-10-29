/* JCarTools bridge. The only place in the app that touches window.androidApi. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var parse = App.core.bridgeParse;

  var TOKEN = (typeof window.ANDROID_TOKEN === 'string' && window.ANDROID_TOKEN)
    ? window.ANDROID_TOKEN
    : 'SECURE_TOKEN_2025';

  function nativeApi() {
    return window.androidApi || null;
  }

  function isNative() {
    return !!nativeApi();
  }

  function isStub() {
    var api = nativeApi();
    return !!api && api.__stub === true;
  }

  function has(method) {
    var api = nativeApi();
    return !!api && typeof api[method] === 'function';
  }

  function invoke(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    var record = { method: method, args: args, ok: false, value: undefined, error: null };
    var api = nativeApi();

    if (!api || typeof api[method] !== 'function') {
      record.error = 'unavailable';
      bus.emit('bridge:call', record);
      return record;
    }

    try {
      record.value = api[method].apply(api, [TOKEN].concat(args));
      record.error = parse.payloadError(record.value);
      record.ok = !record.error;
    } catch (error) {
      record.error = error && error.message ? error.message : String(error);
      console.warn('[bridge] ' + method + ' failed', error);
    }

    bus.emit('bridge:call', record);
    return record;
  }

  function call(method) {
    var record = invoke.apply(null, arguments);
    return record.ok ? record.value : undefined;
  }

  function json(method) {
    var record = invoke.apply(null, arguments);
    return record.ok ? parse.parseJson(record.value, null) : null;
  }

  function command(payload) {
    var record = invoke('carCommand', typeof payload === 'string' ? payload : JSON.stringify(payload || {}));
    if (record.value === undefined || record.value === null) {
      return { success: false, error: record.error || 'unavailable' };
    }
    var data = parse.parseJson(record.value, null);
    // `{error: "..."}` without a success flag is a failure, not a state dump.
    if (record.error) {
      if (data && typeof data === 'object') {
        data.success = false;
        data.error = data.error || record.error;
        return data;
      }
      return { success: false, error: record.error };
    }
    if (data && typeof data === 'object') return data;
    // A non-empty reply that is not JSON is an error text from the host, not
    // a silent success.
    if (typeof record.value === 'string' && record.value.trim()) {
      return { success: false, error: 'invalid_response' };
    }
    return { success: true };
  }

  function handleEvent(type, data) {
    var payload = data;
    if (typeof payload === 'string') {
      var trimmed = payload.trim();
      if (trimmed && (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[')) {
        payload = parse.parseJson(trimmed, payload);
      }
    }
    bus.emit('android:event', { type: type, data: payload });
    bus.emit('android:' + type, payload);
  }

  window.onAndroidEvent = handleEvent;

  App.core.bridge = {
    token: TOKEN,
    isNative: isNative,
    isStub: isStub,
    has: has,
    invoke: invoke,
    call: call,
    json: json,
    command: command,
    imageData: parse.imageData,
    getUserApps: function () {
      var record = invoke('getUserApps');
      return record.ok ? parse.parseApps(record.value) : [];
    },
    getRunEnum: function () {
      var record = invoke('getRunEnum');
      return record.ok ? parse.parseEnum(record.value) : [];
    },
    getCarData: function (name) {
      var record = invoke('getCarData', name);
      return record.ok ? parse.parseCarData(record.value) : null;
    },
    getWeather: function () {
      var record = invoke('getWeather');
      return record.ok ? parse.parseWeather(record.value) : null;
    },
    refreshWeather: function (lat, lon) {
      var record = invoke('refreshWeather', lat, lon);
      return record.ok ? parse.parseWeather(record.value) : null;
    },
    getVolume: function () {
      var record = invoke('getvol');
      if (!record.ok) return null;
      var value = parseInt(record.value, 10);
      if (!isFinite(value) || value < 0) return null;
      return Math.max(0, Math.min(100, value));
    },
    setVolume: function (value) {
      return invoke('setvol', Math.max(0, Math.min(100, Math.round(Number(value) || 0))));
    },
    runEnum: function (name) {
      return invoke('runEnum', String(name || ''));
    },
    runApp: function (pkg) {
      return invoke('runApp', String(pkg || ''));
    },
    subscribeMiniMap: function () {
      return invoke('subscribeMiniMap');
    },
    setMiniMapTheme: function (mode) {
      return invoke('setMiniMapTheme', mode === 'day' ? 'day' : 'night');
    },
    unsubscribeMiniMap: function () {
      return invoke('unsubscribeMiniMap');
    },
    onJsReady: function () { return invoke('onJsReady'); },
    onClose: function () { return invoke('onClose'); },
    onSettings: function () { return invoke('onSettings'); },
    ping: function () { return invoke('pingEvent'); }
  };
})(window.App);
