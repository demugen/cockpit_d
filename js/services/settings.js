/* Owns the single settings object and every layout mutation.
   UI never writes localStorage; it calls this service and listens to the bus. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var grid = App.core.grid;
  var schema = App.core.settingsSchema;
  var storage = App.core.storage;
  var utils = App.core.utils;

  var KEY = 'ckp:settings';
  var defs = [];
  var env = null;
  var state = null;
  var ready = false;

  function gridsFor() {
    return {
      landscape: env.grid('landscape'),
      portrait: env.grid('portrait')
    };
  }

  function persist() {
    storage.write(KEY, state);
  }

  function emit(patch, reason) {
    bus.emit('settings:change', { state: state, patch: patch || {}, reason: reason || 'patch' });
  }

  function init(registryDefs, environment) {
    defs = registryDefs;
    env = environment;
    var raw = storage.read(KEY, null);
    var normalized = schema.normalize(raw, defs);
    state = schema.ensureLayouts(normalized, defs, gridsFor());
    persist();
    ready = true;
    return state;
  }

  function isReady() {
    return ready;
  }

  function get() {
    return state;
  }

  function patch(partial, reason) {
    var next = schema.normalize(utils.deepMerge(state, partial), defs);
    next = schema.ensureLayouts(next, defs, gridsFor());
    state = next;
    persist();
    emit(partial, reason || 'patch');
    return state;
  }

  function syncGrids() {
    if (!ready) return false;
    var grids = gridsFor();
    var changed = ['landscape', 'portrait'].some(function (axis) {
      var stored = state.layouts[axis].grid;
      return stored.cols !== grids[axis].cols || stored.rows !== grids[axis].rows;
    });
    if (!changed) return false;
    state = schema.ensureLayouts(state, defs, grids);
    persist();
    emit({ layouts: state.layouts }, 'viewport');
    return true;
  }

  function setLayout(axis, layout, reason) {
    var next = utils.clone(state);
    next.layouts[axis] = layout;
    patch(next, reason || 'layout');
    return state.layouts[axis];
  }

  // A widget that shipped off has no cell yet: on the first enable it takes
  // its default size in the first free hole instead of borrowing a saved one.
  function placeFresh(next, axis, id) {
    var def = defs.filter(function (item) { return item.id === id; })[0];
    if (!def) return false;
    var layout = next.layouts[axis];
    var raw = grid.defaultSizeFor(def, axis);
    var min = grid.minSizeFor(def, axis);
    var requested = {
      w: utils.clamp(raw.w, Math.min(min.w, layout.grid.cols), layout.grid.cols),
      h: utils.clamp(raw.h, Math.min(min.h, layout.grid.rows), layout.grid.rows)
    };
    var rect = grid.placeBest(layout.grid, layout.items, requested, min, {
      activeIds: schema.activeIds(next, axis)
    });
    if (!rect) return false;
    layout.items[id] = rect;
    return true;
  }

  function setEnabled(id, enabled) {
    var next = utils.clone(state);
    next.widgets.enabled[id] = !!enabled;
    if (enabled) {
      var failed = ['landscape', 'portrait'].filter(function (axis) {
        var layout = next.layouts[axis];
        if (!layout.items[id]) return !placeFresh(next, axis, id);
        var active = schema.activeIds(next, axis);
        var placed = grid.ensurePlacement({
          grid: layout.grid,
          items: layout.items,
          activeIds: active
        }, id);
        if (!placed.ok) return true;
        layout.items = placed.items;
        return false;
      });
      if (failed.length) return { ok: false, reason: 'full', axis: failed[0] };
    }
    patch(next, 'widgets');
    return { ok: true };
  }

  function setWidgetSettings(id, partial) {
    var next = utils.clone(state);
    if (!next.widgets.settings[id]) next.widgets.settings[id] = {};
    next.widgets.settings[id] = utils.deepMerge(next.widgets.settings[id], partial);
    patch(next, 'widget');
    return next.widgets.settings[id];
  }

  function widgetSettings(id) {
    return state.widgets.settings[id] || {};
  }

  function resizeWidget(axis, id, size) {
    var layout = state.layouts[axis];
    var def = defs.filter(function (item) { return item.id === id; })[0];
    if (!def) return { ok: false, reason: 'unknown' };
    var result = grid.resize({
      grid: layout.grid,
      items: layout.items,
      minSize: schema.minSizeFor(def, axis),
      activeIds: schema.activeIds(state, axis)
    }, id, size);
    if (!result.ok) return result;
    setLayout(axis, { grid: layout.grid, items: result.items }, 'resize');
    return result;
  }

  function moveWidget(axis, id, target) {
    var layout = state.layouts[axis];
    var result = grid.move({
      grid: layout.grid,
      items: layout.items,
      activeIds: schema.activeIds(state, axis)
    }, id, target);
    if (!result.ok) return result;
    setLayout(axis, { grid: layout.grid, items: result.items }, 'move');
    return result;
  }

  function reset() {
    state = schema.ensureLayouts(schema.normalize(null, defs), defs, gridsFor());
    persist();
    emit({ reset: true }, 'reset');
    return state;
  }

  App.services.settings = {
    init: init,
    isReady: isReady,
    get: get,
    patch: patch,
    syncGrids: syncGrids,
    setLayout: setLayout,
    setEnabled: setEnabled,
    setWidgetSettings: setWidgetSettings,
    widgetSettings: widgetSettings,
    resizeWidget: resizeWidget,
    moveWidget: moveWidget,
    reset: reset
  };
})(window.App);
