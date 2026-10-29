/* Widget registry. Declarative contracts only; no DOM, no globals besides App. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.registry = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

  function isSize(value) {
    return !!value && isFinite(value.w) && isFinite(value.h) && value.w >= 1 && value.h >= 1;
  }

  function sizeFor(value, orientation, fallback) {
    if (!value) return fallback;
    if (isSize(value)) return { w: Math.round(value.w), h: Math.round(value.h) };
    if (isSize(value[orientation])) return { w: Math.round(value[orientation].w), h: Math.round(value[orientation].h) };
    return fallback;
  }

  function validate(def) {
    if (!def || typeof def !== 'object') throw new Error('widget definition must be an object');
    if (typeof def.id !== 'string' || !ID_PATTERN.test(def.id)) throw new Error('widget id must be kebab-case');
    if (!def.title) throw new Error('widget ' + def.id + ' needs a title');
    if (typeof def.create !== 'function') throw new Error('widget ' + def.id + ' needs create()');
    var landscape = sizeFor(def.defaultSize, 'landscape', null);
    var portrait = sizeFor(def.defaultSize, 'portrait', landscape);
    if (!landscape || !portrait) throw new Error('widget ' + def.id + ' needs defaultSize');
    var min = {
      landscape: sizeFor(def.minSize, 'landscape', { w: 1, h: 1 }),
      portrait: sizeFor(def.minSize, 'portrait', null) || { w: 1, h: 1 }
    };
    if (min.landscape.w > landscape.w || min.landscape.h > landscape.h) {
      throw new Error('widget ' + def.id + ' minSize exceeds defaultSize');
    }
    return {
      id: def.id,
      title: String(def.title),
      description: def.description ? String(def.description) : '',
      order: isFinite(def.order) ? def.order : 100,
      defaultEnabled: def.defaultEnabled !== false,
      defaultSize: { landscape: landscape, portrait: portrait },
      minSize: min,
      settingsDefaults: def.settingsDefaults && typeof def.settingsDefaults === 'object'
        ? JSON.parse(JSON.stringify(def.settingsDefaults))
        : {},
      create: def.create
    };
  }

  function create() {
    var defs = {};
    var sequence = 0;

    function register(def) {
      var clean = validate(def);
      if (defs[clean.id]) throw new Error('widget ' + clean.id + ' is already registered');
      clean.sequence = sequence += 1;
      defs[clean.id] = clean;
      return clean;
    }

    function get(id) {
      return defs[id] || null;
    }

    function all() {
      return Object.keys(defs)
        .map(function (id) { return defs[id]; })
        .sort(function (a, b) {
          if (a.order !== b.order) return a.order - b.order;
          return a.sequence - b.sequence;
        });
    }

    function ids() {
      return all().map(function (def) { return def.id; });
    }

    return { register: register, get: get, all: all, ids: ids };
  }

  return { create: create, validate: validate };
});
