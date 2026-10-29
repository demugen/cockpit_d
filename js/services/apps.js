/* Apps and launcher actions. Icons are accepted both as base64 and as URLs. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;

  var state = {
    apps: [],
    loadedAt: 0,
    loading: false,
    error: null
  };

  var demandCount = 0;

  function emit() {
    bus.emit('apps:change', state);
  }

  function load(force) {
    if (state.loading) return;
    if (!force && state.loadedAt) return;
    state.loading = true;
    state.error = null;
    emit();

    var apps = bridge.getUserApps();
    state.apps = apps;
    state.loadedAt = Date.now();
    state.loading = false;
    if (!apps.length) state.error = bridge.isNative() ? 'empty' : 'no_bridge';
    emit();
  }

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0) load(false);
  }

  function launch(pkg) {
    var record = bridge.runApp(pkg);
    var result = { package: String(pkg || ''), ok: record.ok, error: record.ok ? null : record.error };
    bus.emit('apps:launch', result);
    return result;
  }

  function init() {
    // Apps load on the first demand: a disabled widget should not touch the bridge.
  }

  App.services.apps = {
    init: init,
    state: function () { return state; },
    demand: demand,
    load: load,
    launch: launch
  };
})(window.App);
