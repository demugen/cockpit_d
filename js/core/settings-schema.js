/* Settings schema and layout migration. Pure: caller supplies grids. */

(function (root, factory) {
  'use strict';
  var api;
  if (typeof module === 'object' && module.exports) {
    api = factory(require('./grid.js'), require('./utils.js'));
    module.exports = api;
  } else {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    api = factory(root.App.core.grid, root.App.core.utils);
    root.App.core.settingsSchema = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (grid, utils) {
  'use strict';

  var VERSION = 3;
  var THEMES = ['dark', 'light', 'auto'];
  var FONT_SCALES = [0.9, 1, 1.15, 1.3];
  var HEADER_SLOTS = ['left', 'center', 'right'];
  var ROTATE_MINUTES = [0, 10, 30, 60, 180];

  function widgetDefaults(defs) {
    var enabled = {};
    var settings = {};
    var order = [];
    defs.forEach(function (def) {
      enabled[def.id] = def.defaultEnabled !== false;
      settings[def.id] = utils.clone(def.settingsDefaults || {});
      order.push(def.id);
    });
    return { enabled: enabled, order: order, settings: settings };
  }

  function defaults(defs) {
    var widgets = widgetDefaults(defs);
    return {
      version: VERSION,
      theme: 'dark',
      fontScale: 1,
      header: { carChips: true, clockSlot: 'center', chipsSlot: 'left' },
      background: { image: '', rotateMinutes: 0 },
      car: { pollSeconds: 5 },
      weather: { refreshMinutes: 30 },
      widgets: widgets,
      layouts: { landscape: null, portrait: null }
    };
  }

  function pickTheme(value) {
    return THEMES.indexOf(value) === -1 ? 'dark' : value;
  }

  function pickHeaderSlot(value, fallback) {
    return HEADER_SLOTS.indexOf(value) === -1 ? fallback : value;
  }

  function pickFontScale(value) {
    var number = utils.toNumber(value, 1);
    var best = 1;
    var distance = Infinity;
    FONT_SCALES.forEach(function (scale) {
      var delta = Math.abs(scale - number);
      if (delta < distance) {
        distance = delta;
        best = scale;
      }
    });
    return best;
  }

  function sanitizeLayout(layout, axis) {
    if (!layout || typeof layout !== 'object' || !layout.items || typeof layout.items !== 'object') return null;
    var clean = grid.sanitizeGrid(layout.grid, null);
    var items = {};
    Object.keys(layout.items).forEach(function (id) {
      var item = layout.items[id];
      if (!item || !isFinite(item.x) || !isFinite(item.y) || !isFinite(item.w) || !isFinite(item.h)) return;
      var width = utils.clamp(Math.round(item.w), 1, clean.cols);
      var height = utils.clamp(Math.round(item.h), 1, clean.rows);
      var x = utils.clamp(Math.round(item.x), 0, clean.cols - width);
      var y = utils.clamp(Math.round(item.y), 0, clean.rows - height);
      items[id] = { x: x, y: y, w: width, h: height };
    });
    return { grid: clean, items: items };
  }

  function normalize(raw, defs) {
    var base = defaults(defs);
    var source = utils.isPlainObject(raw) ? raw : {};
    var known = defs.map(function (def) { return def.id; });

    base.theme = pickTheme(source.theme);
    base.fontScale = pickFontScale(source.fontScale);

    var header = utils.isPlainObject(source.header) ? source.header : {};
    base.header.carChips = header.carChips !== false;
    base.header.clockSlot = pickHeaderSlot(header.clockSlot, 'center');
    base.header.chipsSlot = pickHeaderSlot(header.chipsSlot, 'left');

    var background = utils.isPlainObject(source.background) ? source.background : {};
    base.background.image = typeof background.image === 'string' ? background.image.slice(0, 200) : '';
    var rotation = Math.round(utils.toNumber(background.rotateMinutes, 0));
    base.background.rotateMinutes = ROTATE_MINUTES.indexOf(rotation) === -1 ? 0 : rotation;

    var car = utils.isPlainObject(source.car) ? source.car : {};
    base.car.pollSeconds = utils.clamp(Math.round(utils.toNumber(car.pollSeconds, 5)), 2, 60);

    var weather = utils.isPlainObject(source.weather) ? source.weather : {};
    base.weather.refreshMinutes = utils.clamp(Math.round(utils.toNumber(weather.refreshMinutes, 30)), 5, 180);

    var widgets = utils.isPlainObject(source.widgets) ? source.widgets : {};
    var enabled = utils.isPlainObject(widgets.enabled) ? widgets.enabled : {};
    var storedSettings = utils.isPlainObject(widgets.settings) ? widgets.settings : {};
    base.widgets.order = [];
    if (Array.isArray(widgets.order)) {
      widgets.order.forEach(function (id) {
        if (known.indexOf(id) !== -1 && base.widgets.order.indexOf(id) === -1) base.widgets.order.push(id);
      });
    }
    defs.forEach(function (def) {
      if (base.widgets.order.indexOf(def.id) === -1) base.widgets.order.push(def.id);
      // A widget the user has never seen keeps its shipped default; only an
      // explicit stored choice overrides it.
      if (typeof enabled[def.id] === 'boolean') base.widgets.enabled[def.id] = enabled[def.id];
      if (utils.isPlainObject(storedSettings[def.id])) {
        base.widgets.settings[def.id] = utils.deepMerge(base.widgets.settings[def.id], storedSettings[def.id]);
      }
    });

    var layouts = utils.isPlainObject(source.layouts) ? source.layouts : {};
    base.layouts.landscape = sanitizeLayout(layouts.landscape, 'landscape');
    base.layouts.portrait = sanitizeLayout(layouts.portrait, 'portrait');
    return base;
  }

  function minSizes(defs, axis) {
    var result = {};
    defs.forEach(function (def) {
      result[def.id] = grid.minSizeFor(def, axis);
    });
    return result;
  }

  function defsInOrder(defs, order) {
    var byId = {};
    defs.forEach(function (def) { byId[def.id] = def; });
    var list = [];
    order.forEach(function (id) {
      if (byId[id]) list.push(byId[id]);
    });
    defs.forEach(function (def) {
      if (order.indexOf(def.id) === -1) list.push(def);
    });
    return list;
  }

  function placeMissing(settings, axis, defs, layout) {
    var order = settings.widgets.order;
    var result = { grid: layout.grid, items: layout.items };
    defsInOrder(defs, order).forEach(function (def) {
      if (result.items[def.id]) return;
      // Optional widgets are off by default: they must not reserve cells on a
      // board the user has already arranged. Enabling one places it explicitly.
      if (settings.widgets.enabled[def.id] === false) return;
      var raw = grid.defaultSizeFor(def, axis);
      var min = grid.minSizeFor(def, axis);
      var requested = {
        w: utils.clamp(raw.w, Math.min(min.w, result.grid.cols), result.grid.cols),
        h: utils.clamp(raw.h, Math.min(min.h, result.grid.rows), result.grid.rows)
      };
      var rect = grid.placeBest(result.grid, result.items, requested, min);
      if (rect) result.items[def.id] = rect;
    });
    return result;
  }

  function fitLayout(layout, axis, target, defs, order, packDefs) {
    if (layout) {
      var remapped = grid.remap(layout, target, {
        order: order,
        minSizes: minSizes(defs, axis)
      });
      if (remapped.ok) return { grid: target, items: remapped.items, overflow: [] };
    }
    // A viewport change re-flows the board by definition. When positions
    // cannot be kept, packing the cards in order beats refusing the switch
    // and leaving the user on a grid they cannot leave.
    var packed = grid.packLayout(target, packDefs || defsInOrder(defs, order), axis);
    return { grid: packed.grid, items: packed.items, overflow: packed.overflow };
  }

  function ensureLayouts(settings, defs, grids) {
    var next = utils.clone(settings);
    var known = defs.map(function (def) { return def.id; });
    defs.forEach(function (def) {
      if (next.widgets.order.indexOf(def.id) === -1) next.widgets.order.push(def.id);
      if (next.widgets.enabled[def.id] === undefined) {
        next.widgets.enabled[def.id] = def.defaultEnabled !== false;
      }
      if (!next.widgets.settings[def.id]) {
        next.widgets.settings[def.id] = utils.clone(def.settingsDefaults || {});
      }
    });
    ['landscape', 'portrait'].forEach(function (axis) {
      var target = grid.sanitizeGrid(grids[axis], null);
      var existing = next.layouts[axis];

      if (existing) {
        Object.keys(existing.items).forEach(function (id) {
          if (known.indexOf(id) === -1) delete existing.items[id];
        });
      }

      // A hidden widget that already has a saved cell keeps that cell, but a
      // widget shipped off may not claim one just because a layout is packed
      // from scratch.
      var packDefs = defsInOrder(defs, next.widgets.order).filter(function (def) {
        return next.widgets.enabled[def.id] !== false || (existing && existing.items[def.id]);
      });
      // Core widgets keep their natural size first; an optional card that no
      // longer fits is the one left out, not the last entry in the order.
      packDefs = packDefs.filter(function (def) { return def.defaultEnabled !== false; })
        .concat(packDefs.filter(function (def) { return def.defaultEnabled === false; }));
      var layout = fitLayout(existing, axis, target, defs, next.widgets.order, packDefs);
      next.layouts[axis] = placeMissing(next, axis, defs, { grid: layout.grid, items: layout.items });
      next.layouts[axis].grid = { cols: target.cols, rows: target.rows };
    });
    return next;
  }

  function enabledIds(settings) {
    return settings.widgets.order.filter(function (id) {
      return settings.widgets.enabled[id] !== false;
    });
  }

  function activeIds(settings, orientation) {
    var layout = settings.layouts[orientation];
    if (!layout) return [];
    return enabledIds(settings).filter(function (id) { return !!layout.items[id]; });
  }

  function minSizeFor(def, orientation) {
    return grid.minSizeFor(def, orientation);
  }

  return {
    VERSION: VERSION,
    THEMES: THEMES,
    FONT_SCALES: FONT_SCALES,
    defaults: defaults,
    normalize: normalize,
    sanitizeLayout: sanitizeLayout,
    fitLayout: fitLayout,
    ensureLayouts: ensureLayouts,
    defsInOrder: defsInOrder,
    enabledIds: enabledIds,
    activeIds: activeIds,
    minSizeFor: minSizeFor
  };
});
