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
    frame: '',
    frameAt: 0,
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

  function emit() {
    bus.emit('nav:change', state);
  }

  function themeName() {
    // The shell applies data-theme in its own settings listener, which may run
    // after this one: read the chosen theme from settings instead of the DOM.
    var settings = App.services.settings;
    if (settings && typeof settings.get === 'function' && (!settings.isReady || settings.isReady())) {
      var theme = settings.get().theme;
      if (theme === 'light') return 'day';
      if (theme === 'dark') return 'night';
      if (theme === 'auto') {
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
    var record = bridge.setMiniMapTheme(next);
    // A map that ignores the theme still works: only remember a real reply.
    if (record && record.ok) mapTheme = next;
  }

  function subscribe() {
    var record = bridge.subscribeMiniMap();
    if (!record || !record.ok) {
      state.subscribed = false;
      state.mapError = (record && record.error) || 'unavailable';
      state.frame = '';
      state.frameAt = 0;
      emit();
      return false;
    }
    state.subscribed = true;
    state.mapError = null;
    mapTheme = '';
    applyMapTheme(true);
    emit();
    return true;
  }

  function unsubscribe() {
    if (state.subscribed) bridge.unsubscribeMiniMap();
    state.subscribed = false;
    state.mapError = null;
    state.frame = '';
    state.frameAt = 0;
    mapTheme = '';
    emit();
  }

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0 && !state.subscribed) subscribe();
    else if (demandCount === 0 && state.subscribed) unsubscribe();
  }

  function applyFrame(data) {
    // A frame that arrives after unsubscribe is a leftover from the host queue.
    if (!state.subscribed) return;
    if (!data || typeof data !== 'object') return;
    var image = parse.imageData(data.image === undefined || data.image === null ? '' : String(data.image));
    if (!image) return;
    state.frame = image;
    state.frameAt = Number(data.timestamp) || Date.now();
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

  function init() {
    bus.on('android:hud', applyHud);
    bus.on('android:miniMapFrame', applyFrame);
    bus.on('android:GPSSignalQuality', applyGps);
    bus.on('settings:change', function () {
      // The widget dedupes its own demand, so a failed subscription can only
      // be retried from here, where the user just changed something.
      if (demandCount > 0 && !state.subscribed) subscribe();
      else applyMapTheme(false);
    });
    bus.on('apps:change', emit);

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
    currentApp: currentApp
  };
})(window.App);
