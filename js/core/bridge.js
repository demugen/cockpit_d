/* JCarTools bridge. The only place in the app that touches window.androidApi. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var parse = App.core.bridgeParse;

  // Read on every call, not once at load: the host may inject ANDROID_TOKEN
  // after the page has started parsing (StreletS27 reads it lazily too).
  function token() {
    return (typeof window.ANDROID_TOKEN === 'string' && window.ANDROID_TOKEN)
      ? window.ANDROID_TOKEN
      : 'SECURE_TOKEN_2025';
  }

  var volumeRequestId = 0;

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
      record.value = api[method].apply(api, [token()].concat(args));
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
    // An EMPTY reply stays a success on purpose: some proxies answer '' for
    // commands they accepted without echoing state, and body.js would show
    // spurious failures otherwise. null/undefined above still mean failure.
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

  /* Async answers. requestRunEnumAsync returns `true` as soon as the request
     joins the host queue, so a command the head unit refuses — no licence, bad
     token, unknown enum — is still invisible to the call that sent it. The
     outcome comes back on this channel with the same requestId, and a step that
     has to be counted cannot be trusted until it lands. */
  // Must cover the JS-side promise timeouts (10 s): a host answer landing in
  // the 5–10 s window must still find its watch entry, or the promise would
  // reject with 'timeout' even though the command went through.
  var ANSWER_TTL = 10000;
  // A walk of a hundred steps must not leave a hundred closures behind if the
  // host answers nothing at all: past this many open requests the registry starts
  // over instead of growing for the rest of the session.
  var ANSWER_WATERMARK = 48;
  var answers = {};
  var answerCount = 0;

  function watchAnswer(requestId, onOutcome) {
    // RequestIds are unique by contract, but a collision must not leak the old
    // entry: its timer would keep running and the counter would drift.
    if (answers[requestId]) forgetAnswer(requestId);
    if (answerCount >= ANSWER_WATERMARK) {
      // Evict oldest entry instead of nuking all
      var oldestKey = null;
      var oldestAt = Infinity;
      Object.keys(answers).forEach(function (k) {
        if (answers[k].at < oldestAt) {
          oldestAt = answers[k].at;
          oldestKey = k;
        }
      });
      if (oldestKey) forgetAnswer(oldestKey);
    }
    var entry = {
      at: Date.now(),
      done: onOutcome,
      timer: setTimeout(function () {
        // A host that never answers this request keeps the step unproven rather
        // than failed: the poll in the caller still reads the real level.
        forgetAnswer(requestId);
      }, ANSWER_TTL)
    };
    answers[requestId] = entry;
    answerCount += 1;
  }

  function forgetAnswer(requestId) {
    var entry = answers[requestId];
    if (!entry) return;
    delete answers[requestId];
    answerCount -= 1;
    clearTimeout(entry.timer);
  }

  bus.on('android:carResponse', function (payload) {
    if (!payload || typeof payload !== 'object') return;
    var requestId = payload.requestId;
    if (!answers[requestId]) return;
    var entry = answers[requestId];
    forgetAnswer(requestId);
    entry.done(parse.payloadError(payload.response));
  });

  App.core.bridge = {
    token: token,
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
      if (!has('getvol')) return null;
      var record = invoke('getvol');
      if (!record.ok) return null;
      var value = parseInt(record.value, 10);
      if (!isFinite(value) || value < 0) return null;
      return Math.max(0, Math.min(100, value));
    },
    canSetVolume: function () {
      return has('setvol');
    },
    canStepVolume: function () {
      return has('requestRunEnumAsync') || has('runEnum');
    },
    setVolume: function (value) {
      return invoke('setvol', Math.max(0, Math.min(100, Math.round(Number(value) || 0))));
    },
    runEnum: function (name) {
      return invoke('runEnum', String(name || ''));
    },
    // One percent per command, so a long drag is queued asynchronously:
    // synchronous runEnum calls would block the WebView for every step.
    // onOutcome fires with the error the head unit later reports for this very
    // step, or null when it answers that the step went through.
    runEnumStep: function (name, onOutcome) {
      if (!has('requestRunEnumAsync')) return invoke('runEnum', String(name || ''));
      volumeRequestId += 1;
      var requestId = 'step-' + volumeRequestId;
      var record = invoke('requestRunEnumAsync', requestId, String(name || ''));
      if (record.ok && typeof onOutcome === 'function') watchAnswer(requestId, onOutcome);
      return record;
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
    ping: function () { return invoke('pingEvent'); },
    requestCarCommandAsync: function (requestId, payload) {
      if (!has('requestCarCommandAsync')) return { ok: false, error: 'unavailable' };
      var record = invoke('requestCarCommandAsync', requestId, typeof payload === 'string' ? payload : JSON.stringify(payload || {}));
      return record.ok ? { ok: true } : { ok: false, error: record.error };
    },
    requestCarDataAsync: function (requestId, name) {
      // The native method takes (token, requestId, name) — no timeout
      // argument (see core manifest; StreletS27 does not forward one either).
      if (!has('requestCarDataAsync')) return { ok: false, error: 'unavailable' };
      var record = invoke('requestCarDataAsync', requestId, String(name || 'all'));
      return record.ok ? { ok: true } : { ok: false, error: record.error };
    },
    // Promise-based async commands that resolve with the actual response
    requestCarCommandAsyncPromise: function (requestId, payload, timeoutMs) {
      if (!has('requestCarCommandAsync')) return Promise.reject({ error: 'unavailable' });
      var record = invoke('requestCarCommandAsync', requestId, typeof payload === 'string' ? payload : JSON.stringify(payload || {}));
      if (!record.ok) return Promise.reject({ error: record.error });
      var timeout = timeoutMs || 10000;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          forgetAnswer(requestId);
          reject({ error: 'timeout' });
        }, timeout);
        watchAnswer(requestId, function (error) {
          clearTimeout(timer);
          if (error) reject({ error: error });
          else resolve({ ok: true });
        });
      });
    },
    requestCarDataAsyncPromise: function (requestId, name, timeoutMs) {
      // timeoutMs only bounds the JS-side wait; the native method takes
      // (token, requestId, name).
      if (!has('requestCarDataAsync')) return Promise.reject({ error: 'unavailable' });
      var record = invoke('requestCarDataAsync', requestId, String(name || 'all'));
      if (!record.ok) return Promise.reject({ error: record.error });
      var timeout = timeoutMs || 10000;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          forgetAnswer(requestId);
          reject({ error: 'timeout' });
        }, timeout);
        watchAnswer(requestId, function (error) {
          clearTimeout(timer);
          if (error) reject({ error: error });
          else resolve({ ok: true });
        });
      });
    },
    runEnumAsyncPromise: function (requestId, name, timeoutMs) {
      if (!has('requestRunEnumAsync')) return Promise.reject({ error: 'unavailable' });
      var record = invoke('requestRunEnumAsync', requestId, String(name || ''));
      if (!record.ok) return Promise.reject({ error: record.error });
      var timeout = timeoutMs || 10000;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          forgetAnswer(requestId);
          reject({ error: 'timeout' });
        }, timeout);
        watchAnswer(requestId, function (error) {
          clearTimeout(timer);
          if (error) reject({ error: error });
          else resolve({ ok: true });
        });
      });
    }
  };
})(window.App);
