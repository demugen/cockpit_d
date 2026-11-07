/* Navigation service: mini-map frames and the HUD route stream. The host
   sends frames only while subscribed, so the subscription follows demand. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var parse = App.core.bridgeParse;
  var navData = App.core.navData;

  var state = {
    subscribed: false,
    mapError: null,
    mapStatus: 'idle',
    reconnectFailures: 0,
    frame: '',
    frameAt: 0,
    receivedAt: 0,
    routeKnown: false,
    naviOn: false,
    turnType: null,
    turnDist: null,
    remainDist: null,
    nextRoad: '',
    speedLimit: null,
    gps: null
  };

  var demandCount = 0;
  var mapTheme = '';
  var subscribedAt = 0;
  var hadFrames = false;
  var paused = false;
  var watchdog = null;
  var reconnectTimer = null;

  /* Watchdog. A successful subscribeMiniMap() only means the host took the
     subscription: a firmware that cannot reach the map source stays silent
     forever. Reference launchers (ZeekrStyle, StreletS27) resubscribe
     periodically, so we do the same instead of showing "waiting" forever. */
  var WATCHDOG_MS = 2500;
  var FIRST_FRAME_MS = 12000;
  var STALL_MS = 10000;
  var MAX_RECONNECTS = 4;
  var RECONNECT_DELAY_MS = 250;

  function emit() {
    bus.emit('nav:change', state);
  }

  function themeName() {
    // The shell applies data-theme in its own settings listener, which may run
    // after this one: read the chosen theme from settings instead of the DOM.
    var settings = App.services.settings;
    if (settings && typeof settings.get === 'function' && (!settings.isReady || settings.isReady())) {
      var s = settings.get();
      // Check for widget-specific map theme setting first
      var navSettings = s.widgets && s.widgets.settings && s.widgets.settings.nav ? s.widgets.settings.nav : {};
      var mapTheme = navSettings.mapTheme || 'auto';
      
      if (mapTheme === 'day') return 'day';
      if (mapTheme === 'night') return 'night';
      if (mapTheme === 'auto') {
        // The shell resolves "auto" from the host `theme` event (or the OS)
        // and writes the result to data-theme; that value follows the head
        // unit, while matchMedia may keep reporting the WebView default.
        if (typeof document !== 'undefined' && document.documentElement) {
          var applied = document.documentElement.getAttribute('data-theme');
          if (applied === 'light') return 'day';
          if (applied === 'dark') return 'night';
        }
        var light = typeof window !== 'undefined' && window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: light)').matches;
        return light ? 'day' : 'night';
      }
      // Fallback to panel theme
      var theme = s.theme;
      if (theme === 'light') return 'day';
      if (theme === 'dark') return 'night';
      if (theme === 'auto') {
        if (typeof document !== 'undefined' && document.documentElement) {
          var applied = document.documentElement.getAttribute('data-theme');
          if (applied === 'light') return 'day';
          if (applied === 'dark') return 'night';
        }
        var light = typeof window !== 'undefined' && window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: light)').matches;
        return light ? 'day' : 'night';
      }
    }
    if (typeof document === 'undefined' || !document.documentElement) return 'night';
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'day' : 'night';
  }

  function applyMapTheme(force) {
    if (!state.subscribed) return;
    var next = themeName();
    if (!force && next === mapTheme) return;
    // Claim the theme before the call: a host that answers setMiniMapTheme by
    // pushing a frame would otherwise re-enter here through applyFrame.
    mapTheme = next;
    var record = bridge.setMiniMapTheme(next);
    if (!record || !record.ok) mapTheme = '';
  }

  function clearMapFrame() {
    state.frame = '';
    state.frameAt = 0;
    state.receivedAt = 0;
    subscribedAt = 0;
  }

  // Between two subscriptions the note has to stay honest: after a stall the
  // map is "lost", not "waiting for the first frame" again.
  function nextMapStatus() {
    if (state.mapStatus === 'blocked') return 'blocked';
    if (demandCount <= 0) return 'idle';
    return hadFrames ? 'stalled' : 'waiting';
  }

  function subscribe() {
    if (!bridge.has('subscribeMiniMap')) {
      state.subscribed = false;
      state.mapError = 'unavailable';
      state.mapStatus = 'no-method';
      clearMapFrame();
      emit();
      return false;
    }
    var record = bridge.subscribeMiniMap();
    if (!record || !record.ok) {
      failMap((record && record.error) || 'unavailable');
      return false;
    }
    state.subscribed = true;
    state.mapError = null;
    state.mapStatus = nextMapStatus();
    subscribedAt = Date.now();
    mapTheme = '';
    applyMapTheme(true);
    emit();
    return true;
  }

  // Every refused or lost subscription costs one attempt from a fixed budget.
  // A host that answers `license_required` must not be asked again forever.
  function failMap(reason) {
    state.subscribed = false;
    state.mapError = reason;
    state.reconnectFailures += 1;
    clearMapFrame();
    if (state.reconnectFailures > MAX_RECONNECTS) {
      state.mapStatus = 'blocked';
      stopWatchdog();
      emit();
      return;
    }
    state.mapStatus = 'rejected';
    emit();
    scheduleRetry();
  }

  function scheduleRetry() {
    if (reconnectTimer || paused || demandCount <= 0) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (paused || demandCount <= 0) return;
      subscribe();
    }, RECONNECT_DELAY_MS);
  }

  function unsubscribe() {
    if (state.subscribed) bridge.unsubscribeMiniMap();
    state.subscribed = false;
    state.mapError = null;
    state.mapStatus = nextMapStatus();
    clearMapFrame();
    mapTheme = '';
    emit();
  }

  function reconnect() {
    if (reconnectTimer || demandCount <= 0) return;
    state.reconnectFailures += 1;
    if (state.reconnectFailures > MAX_RECONNECTS) {
      state.mapStatus = 'blocked';
      unsubscribe();
      return;
    }
    unsubscribe();
    scheduleRetry();
  }

  function tick() {
    if (paused || demandCount <= 0 || state.reconnectFailures > MAX_RECONNECTS) return;
    if (!state.subscribed) {
      // A retry is already scheduled; the watchdog must not double-subscribe.
      if (reconnectTimer || state.mapStatus === 'no-method') return;
      subscribe();
      return;
    }
    var reference = state.receivedAt || subscribedAt;
    if (!reference) return;
    if (Date.now() - reference < (state.receivedAt ? STALL_MS : FIRST_FRAME_MS)) return;
    if (state.receivedAt) state.mapStatus = 'stalled';
    reconnect();
  }

  function startWatchdog() {
    if (watchdog || paused) return;
    watchdog = setInterval(tick, WATCHDOG_MS);
  }

  function stopWatchdog() {
    if (watchdog) clearInterval(watchdog);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    watchdog = null;
    reconnectTimer = null;
  }

  function demand(on) {
    var was = demandCount;
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0) {
      if (was === 0) {
        state.reconnectFailures = 0;
        hadFrames = false;
      }
      // A hidden WebView keeps its demand but no subscription: resume()
      // restores it without the widget having to unmount.
      if (paused) return;
      if (!state.subscribed && state.mapStatus !== 'blocked') subscribe();
      if (state.mapStatus !== 'blocked') startWatchdog();
      return;
    }
    stopWatchdog();
    hadFrames = false;
    state.reconnectFailures = 0;
    if (state.subscribed) unsubscribe();
    else {
      state.mapStatus = 'idle';
      clearMapFrame();
      emit();
    }
  }

  // The widget offers this after the watchdog gave up: a manual retry resets
  // the failure budget the automatic path burned through.
  function resubscribe() {
    state.reconnectFailures = 0;
    hadFrames = false;
    if (state.subscribed) unsubscribe();
    state.mapStatus = 'waiting';
    if (paused || demandCount <= 0) {
      emit();
      return;
    }
    subscribe();
    startWatchdog();
  }

  function applyFrame(data) {
    // A frame that arrives after unsubscribe is a leftover from the host queue.
    if (!state.subscribed) return;
    var payload = data;
    if (typeof payload === 'string') {
      // Some hosts send the data URL as the whole payload, plain or as a JSON
      // string; both have to reach the image parser instead of being dropped.
      var parsed = parse.parseJson(payload, null);
      if (typeof parsed === 'string') payload = { image: parsed };
      else payload = parsed || { image: payload };
    }
    if (!payload || typeof payload !== 'object') return;
    // Hosts disagree on the field carrying the image: image, src and frame all
    // appear in the wild.
    var raw = payload.image;
    if (raw === undefined || raw === null || raw === '') raw = payload.src;
    if (raw === undefined || raw === null || raw === '') raw = payload.frame;
    var image = parse.imageData(typeof raw === 'string' ? raw : '');
    if (!image) return;
    // Frames are never dropped by timestamp: firmwares use Unix time, uptime
    // counters, or omit it altogether.
    hadFrames = true;
    state.frame = image;
    state.frameAt = Number(payload.timestamp) || Date.now();
    state.receivedAt = Date.now();
    state.mapStatus = 'live';
    state.reconnectFailures = 0;
    emit();
  }

  function applyHud(data) {
    var parsed = navData.parseHud(data);
    if (!parsed) return;

    // A radar alert must not wipe the route: it only carries a fresh limit.
    if (parsed.type === 'ARAD') {
      if (parsed.patch.speedLimit === null) return;
      state.speedLimit = parsed.patch.speedLimit;
      emit();
      return;
    }

    var patch = parsed.patch;
    state.routeKnown = true;
    state.naviOn = patch.naviOn;
    state.turnType = patch.naviOn ? patch.turnType : null;
    state.turnDist = patch.naviOn ? patch.turnDist : null;
    state.remainDist = patch.naviOn ? patch.remainDist : null;
    state.nextRoad = patch.naviOn ? patch.nextRoad : '';
    state.speedLimit = patch.speedLimit;
    emit();
  }

  function applyGps(data) {
    var quality = navData.parseGps(data);
    if (quality === state.gps) return;
    state.gps = quality;
    emit();
  }

  function currentApp() {
    var apps = App.services.apps ? App.services.apps.state().apps : [];
    return navData.findNavApp(apps);
  }

  function launch() {
    var app = currentApp();
    if (!app) {
      bus.emit('nav:launch', { ok: false, error: 'not_found' });
      return false;
    }
    var record = bridge.runApp(app.package);
    var result = {
      ok: !!record.ok,
      package: app.package,
      name: app.name,
      error: record.ok ? null : (record.error || 'failed')
    };
    bus.emit('nav:launch', result);
    return result.ok;
  }

  /* A hidden WebView must not keep the subscription and the watchdog alive:
     the panel is one of several apps on the head unit. Demand is untouched, so
     a re-show restores the stream without the widget doing anything. */
  function pause() {
    if (paused) return;
    paused = true;
    stopWatchdog();
    hadFrames = false;
    if (state.subscribed) {
      unsubscribe();
      return;
    }
    if (demandCount > 0 && state.mapStatus !== 'blocked' && state.mapStatus !== 'no-method') {
      state.mapStatus = 'waiting';
      clearMapFrame();
      emit();
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (demandCount <= 0 || state.mapStatus === 'blocked' || state.mapStatus === 'no-method') return;
    if (!state.subscribed) subscribe();
    startWatchdog();
  }

  function init() {
    bus.on('android:hud', applyHud);
    bus.on('android:miniMapFrame', applyFrame);
    bus.on('android:GPSSignalQuality', applyGps);
    bus.on('settings:change', function () {
      // Retries normally run on their own timer; a settings change is one more
      // chance to subscribe, still inside the same failure budget.
      if (!paused && demandCount > 0 && !state.subscribed &&
        !reconnectTimer && state.mapStatus !== 'blocked' && state.mapStatus !== 'no-method') {
        subscribe();
      } else {
        applyMapTheme(false);
      }
    });
    bus.on('theme:change', function () { applyMapTheme(false); });
    bus.on('apps:change', emit);

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pause();
        else resume();
      });
    }

    var query = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null;
    if (query) {
      // With theme "auto" the map has to follow the OS like the rest of the UI.
      var onScheme = function () { applyMapTheme(false); };
      if (query.addEventListener) query.addEventListener('change', onScheme);
      else if (query.addListener) query.addListener(onScheme);
    }
  }

  App.services.nav = {
    init: init,
    state: function () { return state; },
    demand: demand,
    launch: launch,
    resubscribe: resubscribe,
    currentApp: currentApp,
    applyMapTheme: function (force) { applyMapTheme(force); }
  };
})(window.App);
