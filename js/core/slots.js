/* Slot lists for widgets whose items the user picks: read, dedupe, write with swap. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.slots = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MAX = 8;

  function list(value, max) {
    var limit = max || MAX;
    if (!Array.isArray(value)) return [];
    return value.reduce(function (result, item) {
      if (typeof item !== 'string' || result.length >= limit) return result;
      var id = item.trim();
      if (!id || result.indexOf(id) !== -1) return result;
      return result.concat(id);
    }, []);
  }

  function has(value, max) {
    return list(value, max).length > 0;
  }

  function padded(value, max) {
    var limit = max || MAX;
    var result = list(value, limit);
    while (result.length < limit) result.push('');
    return result;
  }

  // One item owns one slot: picking an item that sits elsewhere swaps the two
  // slots instead of duplicating it.
  function write(value, index, id, max) {
    var limit = max || MAX;
    var next = padded(value, limit);
    var slot = Math.round(Number(index));
    if (!isFinite(slot) || slot < 0 || slot >= limit) return next;
    var target = typeof id === 'string' ? id.trim() : '';
    var existing = target ? next.indexOf(target) : -1;
    if (existing !== -1 && existing !== slot) next[existing] = next[slot] || '';
    next[slot] = target;
    return next;
  }

  return { MAX: MAX, list: list, has: has, padded: padded, write: write };
});
