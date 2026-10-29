/* Tiny event bus. One failing subscriber must not silence the rest. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.bus = api.create();
    root.App.core.createBus = api.create;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function create() {
    var handlers = {};

    function on(type, handler) {
      if (typeof handler !== 'function') return function () {};
      if (!handlers[type]) handlers[type] = [];
      handlers[type].push(handler);
      return function off() {
        offEvent(type, handler);
      };
    }

    function offEvent(type, handler) {
      var list = handlers[type];
      if (!list) return;
      var index = list.indexOf(handler);
      if (index !== -1) list.splice(index, 1);
    }

    function once(type, handler) {
      var off = on(type, function (payload) {
        off();
        handler(payload);
      });
      return off;
    }

    function emit(type, payload) {
      var list = handlers[type];
      if (!list || !list.length) return;
      list.slice().forEach(function (handler) {
        try {
          handler(payload);
        } catch (error) {
          console.error('[bus] ' + type + ' handler failed', error);
        }
      });
    }

    function clear(type) {
      if (type === undefined) handlers = {};
      else delete handlers[type];
    }

    return { on: on, once: once, off: offEvent, emit: emit, clear: clear };
  }

  return { create: create };
});
