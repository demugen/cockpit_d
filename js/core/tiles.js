/* Tile grids: how many tiles fit a card and which matrix gives the largest tile. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.tiles = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function dimension(value) {
    var number = Math.round(Number(value));
    return isFinite(number) && number >= 1 ? number : 1;
  }

  function capacity(size, max, perCell) {
    var cells = dimension(size && size.w) * dimension(size && size.h);
    var limit = Math.max(1, dimension(max));
    var rate = Math.max(1, Number(perCell) || 1);
    return Math.max(1, Math.min(limit, cells * rate));
  }

  // Pick the matrix with the largest tile: a short row of wide tiles beats a
  // single squeezed row, and one spare cell is tolerated. `heightWeight` below
  // 1 prefers wide tiles (data tiles, buttons that read as rows).
  function bestMatrix(count, w, h, heightWeight) {
    var total = Math.max(1, Math.round(Number(count)) || 1);
    var weight = Number(heightWeight);
    if (!isFinite(weight) || weight <= 0) weight = 1;
    var best = { cols: total, rows: 1, score: -1 };
    var maxRows = Math.min(total, 4);
    for (var rows = 1; rows <= maxRows; rows += 1) {
      var cols = Math.ceil(total / rows);
      var slots = cols * rows;
      if (slots - total > 1 && rows > 1) continue;
      var tile = Math.min(w / cols, (h / rows) * weight);
      var score = tile * Math.pow(total / slots, 0.35) * (1 + cols * 0.01);
      if (score > best.score) best = { cols: cols, rows: rows, score: score };
    }
    return best;
  }

  return { capacity: capacity, bestMatrix: bestMatrix };
});
