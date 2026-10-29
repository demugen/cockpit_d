/* Grid math for the cell-pinned board.
   The grid is derived from the board box instead of a density preset: a cell
   targets roughly 200 CSS px, so a big screen gets more cells, not bigger
   cards, and portrait/landscape keep separate layouts.
   Rules: cells are integers, empty cells stay empty, a refused drop changes
   nothing. No DOM. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.grid = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ORIENTATIONS = ['landscape', 'portrait'];
  var TARGET_CELL = 200;
  var GAP = { min: 8, max: 14, ratio: 0.011 };
  var HEADER = { min: 52, max: 78, ratio: 0.084 };
  var MIN_COLS = { landscape: 6, portrait: 4 };
  var MIN_ROWS = { landscape: 3, portrait: 4 };
  var MAX_COLS = 16;
  var MAX_ROWS = 14;
  var FALLBACK_GRID = { cols: 6, rows: 4 };

  function normalizeOrientation(value) {
    return ORIENTATIONS.indexOf(value) === -1 ? 'landscape' : value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sanitizeGrid(grid, fallback) {
    var base = fallback || FALLBACK_GRID;
    var cols = grid && isFinite(grid.cols) ? Math.round(grid.cols) : base.cols;
    var rows = grid && isFinite(grid.rows) ? Math.round(grid.rows) : base.rows;
    return {
      cols: Math.max(2, Math.min(MAX_COLS, cols)),
      rows: Math.max(1, Math.min(MAX_ROWS, rows))
    };
  }

  /* Mirrors --gap and --header-h in css/tokens.css. The axis is the screen
     being described, so asking for the portrait grid on a landscape screen
     swaps the dimensions instead of answering with the current one. */
  function gridFor(orientation, width, height) {
    var axis = normalizeOrientation(orientation);
    var w = isFinite(width) && width > 0 ? width : 1280;
    var h = isFinite(height) && height > 0 ? height : 720;
    var current = w >= h ? 'landscape' : 'portrait';
    if (current !== axis) {
      var swap = w;
      w = h;
      h = swap;
    }
    var vmin = Math.min(w, h);
    var gap = clamp(vmin * GAP.ratio, GAP.min, GAP.max);
    var header = clamp(vmin * HEADER.ratio, HEADER.min, HEADER.max);
    var boardW = Math.max(1, w - gap * 2);
    var boardH = Math.max(1, h - header - gap);
    var cols = clamp(Math.round((boardW + gap) / (TARGET_CELL + gap)), MIN_COLS[axis], MAX_COLS);
    var cell = (boardW - (cols - 1) * gap) / cols;
    var rows = clamp(Math.round((boardH + gap) / (cell + gap)), MIN_ROWS[axis], MAX_ROWS);
    return { cols: cols, rows: rows };
  }

  function sizeOn(def, orientation, key, fallback) {
    var value = def[key];
    if (!value) return fallback;
    if (isFinite(value.w) && isFinite(value.h)) {
      return { w: Math.round(value.w), h: Math.round(value.h) };
    }
    var axisValue = value[orientation];
    if (axisValue && isFinite(axisValue.w) && isFinite(axisValue.h)) {
      return { w: Math.round(axisValue.w), h: Math.round(axisValue.h) };
    }
    return fallback;
  }

  function defaultSizeFor(def, orientation) {
    return sizeOn(def, orientation, 'defaultSize', { w: 1, h: 1 });
  }

  function minSizeFor(def, orientation) {
    var min = sizeOn(def, orientation, 'minSize', { w: 1, h: 1 });
    return { w: Math.max(1, min.w), h: Math.max(1, min.h) };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function inside(grid, rect) {
    return rect.x >= 0 && rect.y >= 0 && rect.w >= 1 && rect.h >= 1 &&
      rect.x + rect.w <= grid.cols && rect.y + rect.h <= grid.rows;
  }

  function area(rect) {
    return rect.w * rect.h;
  }

  function toList(items) {
    return Object.keys(items).map(function (id) {
      var item = items[id];
      return { id: id, x: item.x, y: item.y, w: item.w, h: item.h };
    });
  }

  function isActive(id, activeIds) {
    return !activeIds || activeIds.indexOf(id) !== -1;
  }

  function canPlace(grid, items, rect, options) {
    var opts = options || {};
    if (!inside(grid, rect)) return false;
    var ids = Object.keys(items);
    for (var i = 0; i < ids.length; i += 1) {
      var id = ids[i];
      if (id === opts.ignoreId) continue;
      if (!isActive(id, opts.activeIds)) continue;
      if (overlaps(rect, items[id])) return false;
    }
    return true;
  }

  function findFree(grid, size, items, options) {
    var width = Math.min(size.w, grid.cols);
    var height = Math.min(size.h, grid.rows);
    for (var y = 0; y <= grid.rows - height; y += 1) {
      for (var x = 0; x <= grid.cols - width; x += 1) {
        var rect = { x: x, y: y, w: width, h: height };
        if (canPlace(grid, items, rect, options)) return rect;
      }
    }
    return null;
  }

  function conflictsFor(grid, items, rect, options) {
    var opts = options || {};
    return toList(items).filter(function (item) {
      if (item.id === opts.ignoreId) return false;
      if (!isActive(item.id, opts.activeIds)) return false;
      return overlaps(rect, item);
    });
  }

  function failure(reason) {
    return { ok: false, reason: reason, items: null };
  }

  function sortedByArea(list) {
    return list.slice().sort(function (a, b) {
      if (area(b) !== area(a)) return area(b) - area(a);
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  }

  function placeDisplaced(grid, work, conflicts, activeIds) {
    var displaced = [];
    var queue = sortedByArea(conflicts);
    for (var i = 0; i < queue.length; i += 1) {
      var conflict = queue[i];
      var size = { w: conflict.w, h: conflict.h };
      delete work[conflict.id];
      var target = findFree(grid, size, work, { activeIds: activeIds });
      if (!target) return null;
      work[conflict.id] = target;
      displaced.push(conflict.id);
    }
    return displaced;
  }

  function move(state, id, target) {
    var grid = state.grid;
    var items = state.items;
    var item = items[id];
    if (!item) return failure('unknown');
    if (!target || !isFinite(target.x) || !isFinite(target.y)) return failure('invalid');

    var rect = {
      x: clamp(Math.round(target.x), 0, grid.cols - item.w),
      y: clamp(Math.round(target.y), 0, grid.rows - item.h),
      w: item.w,
      h: item.h
    };
    if (rect.x === item.x && rect.y === item.y) {
      return { ok: true, items: items, moved: [], displaced: [], swapped: [] };
    }

    var work = JSON.parse(JSON.stringify(items));
    var options = { ignoreId: id, activeIds: state.activeIds };
    var conflicts = conflictsFor(grid, work, rect, options);

    if (!conflicts.length) {
      work[id] = rect;
      return { ok: true, items: work, moved: [id], displaced: [], swapped: [] };
    }

    if (conflicts.length === 1) {
      var other = conflicts[0];
      if (other.w === item.w && other.h === item.h) {
        var otherRect = work[other.id];
        work[other.id] = { x: item.x, y: item.y, w: other.w, h: other.h };
        work[id] = { x: otherRect.x, y: otherRect.y, w: item.w, h: item.h };
        return { ok: true, items: work, moved: [id], displaced: [other.id], swapped: [other.id] };
      }
    }

    work[id] = rect;
    var displaced = placeDisplaced(grid, work, conflicts, state.activeIds);
    if (!displaced) return failure('full');
    return { ok: true, items: work, moved: [id], displaced: displaced, swapped: [] };
  }

  function resize(state, id, size) {
    var grid = state.grid;
    var item = state.items[id];
    if (!item) return failure('unknown');
    if (!size || !isFinite(size.w) || !isFinite(size.h)) return failure('invalid');

    var min = state.minSize || { w: 1, h: 1 };
    var rect = {
      x: item.x,
      y: item.y,
      w: clamp(Math.round(size.w), min.w, grid.cols - item.x),
      h: clamp(Math.round(size.h), min.h, grid.rows - item.y)
    };
    if (rect.w === item.w && rect.h === item.h) {
      return { ok: true, items: state.items, size: { w: rect.w, h: rect.h }, displaced: [] };
    }

    var work = JSON.parse(JSON.stringify(itemsOrEmpty(state.items)));
    var options = { ignoreId: id, activeIds: state.activeIds };
    var conflicts = conflictsFor(grid, work, rect, options);
    work[id] = rect;

    var displaced = [];
    if (conflicts.length) {
      displaced = placeDisplaced(grid, work, conflicts, state.activeIds);
      if (!displaced) return failure('full');
    }
    return { ok: true, items: work, size: { w: rect.w, h: rect.h }, displaced: displaced };
  }

  function itemsOrEmpty(items) {
    return items || {};
  }

  function ensurePlacement(state, id) {
    var grid = state.grid;
    var item = state.items[id];
    if (!item) return failure('unknown');
    if (canPlace(grid, state.items, item, { ignoreId: id, activeIds: state.activeIds })) {
      return { ok: true, items: state.items, moved: false };
    }
    var target = findFree(grid, { w: item.w, h: item.h }, state.items, { ignoreId: id, activeIds: state.activeIds });
    if (!target) return failure('full');
    var work = JSON.parse(JSON.stringify(state.items));
    work[id] = target;
    return { ok: true, items: work, moved: true };
  }

  function packOnce(grid, defs, axis, compact) {
    var work = {};
    var overflow = [];
    var order = [];

    defs.forEach(function (def) {
      var raw = compact ? minSizeFor(def, axis) : defaultSizeFor(def, axis);
      var min = minSizeFor(def, axis);
      var requested = {
        w: clamp(raw.w, Math.min(min.w, grid.cols), grid.cols),
        h: clamp(raw.h, Math.min(min.h, grid.rows), grid.rows)
      };
      var rect = placeBest(grid, work, requested, min);
      if (!rect) {
        overflow.push(def.id);
        return;
      }
      work[def.id] = rect;
      order.push(def.id);
    });

    return { grid: { cols: grid.cols, rows: grid.rows }, items: work, overflow: overflow, order: order };
  }

  function requiredOverflow(packed, defs) {
    var byId = {};
    defs.forEach(function (def) { byId[def.id] = def; });
    return packed.overflow.filter(function (id) {
      return !byId[id] || byId[id].defaultEnabled !== false;
    });
  }

  /* Packing runs only when a screen change cannot keep the saved cells (for
     example nine widgets on a 9x3 board). An optional widget that does not
     fit stays unplaced and returns when a bigger screen gives it room; only
     when a core widget overflows do all cards fall back to their minimums. */
  function packLayout(grid, defs, orientation) {
    var axis = normalizeOrientation(orientation);
    var packed = packOnce(grid, defs, axis, false);
    if (!requiredOverflow(packed, defs).length) return packed;
    var compact = packOnce(grid, defs, axis, true);
    return requiredOverflow(compact, defs).length < requiredOverflow(packed, defs).length
      ? compact
      : packed;
  }

  function placeBest(grid, items, requested, minSize, options) {
    var variants = [];
    for (var w = Math.min(requested.w, grid.cols); w >= minSize.w; w -= 1) {
      for (var h = Math.min(requested.h, grid.rows); h >= minSize.h; h -= 1) {
        variants.push({ w: w, h: h });
      }
    }
    variants.sort(function (a, b) {
      if (area(b) !== area(a)) return area(b) - area(a);
      if (b.w !== a.w) return b.w - a.w;
      return b.h - a.h;
    });
    // Try the full size anywhere before shrinking: a scan that shrinks at the
    // first narrow slot would turn a 2x2 card into a 1x2 strip even though a
    // proper 2x2 hole exists further down the board.
    for (var i = 0; i < variants.length; i += 1) {
      for (var y = 0; y < grid.rows; y += 1) {
        for (var x = 0; x < grid.cols; x += 1) {
          var rect = { x: x, y: y, w: variants[i].w, h: variants[i].h };
          if (canPlace(grid, items, rect, options)) return rect;
        }
      }
    }
    return null;
  }

  function remap(layout, newGrid, options) {
    var opts = options || {};
    var oldGrid = sanitizeGrid(layout.grid, newGrid);
    var grid = sanitizeGrid(newGrid, oldGrid);
    var items = layout.items || {};
    var ids = Object.keys(items);
    var order = opts.order && opts.order.length
      ? opts.order.filter(function (id) { return ids.indexOf(id) !== -1; })
      : sortedByArea(toList(items)).reverse().map(function (item) { return item.id; });
    ids.forEach(function (id) {
      if (order.indexOf(id) === -1) order.push(id);
    });

    var mapped = {};
    var failed = [];

    order.forEach(function (id) {
      var item = items[id];
      var min = (opts.minSizes && opts.minSizes[id]) || { w: 1, h: 1 };
      // A viewport change must not resize the cards the user sized: the
      // stored width and height win, only the position is clamped into the
      // new board. Oversized cards are cut to the new edge.
      var width = clamp(Math.round(item.w), Math.min(min.w, grid.cols), grid.cols);
      var height = clamp(Math.round(item.h), Math.min(min.h, grid.rows), grid.rows);
      var x = clamp(Math.round(item.x), 0, grid.cols - width);
      var y = clamp(Math.round(item.y), 0, grid.rows - height);
      var rect = { x: x, y: y, w: width, h: height };
      if (!canPlace(grid, mapped, rect)) {
        var target = findFree(grid, { w: width, h: height }, mapped);
        if (!target) {
          failed.push(id);
          return;
        }
        rect = target;
      }
      mapped[id] = rect;
    });

    if (failed.length) return { ok: false, reason: 'full', items: null, failed: failed };
    return { ok: true, grid: grid, items: mapped, order: order };
  }

  return {
    ORIENTATIONS: ORIENTATIONS,
    normalizeOrientation: normalizeOrientation,
    sanitizeGrid: sanitizeGrid,
    gridFor: gridFor,
    defaultSizeFor: defaultSizeFor,
    minSizeFor: minSizeFor,
    overlaps: overlaps,
    inside: inside,
    canPlace: canPlace,
    findFree: findFree,
    conflictsFor: conflictsFor,
    move: move,
    resize: resize,
    ensurePlacement: ensurePlacement,
    packLayout: packLayout,
    placeBest: placeBest,
    remap: remap,
    toList: toList
  };
});
