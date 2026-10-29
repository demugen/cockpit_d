/* Size presets built from the live grid, never from pixels. */

(function (App) {
  'use strict';

  var grid = App.core.grid;

  function forWidget(def, axis, item, board) {
    var min = grid.minSizeFor(def, axis);
    var natural = grid.defaultSizeFor(def, axis);
    var maxW = board.cols - item.x;
    var maxH = board.rows - item.y;
    var list = [];
    var seen = {};

    function add(w, h) {
      var width = Math.min(maxW, Math.max(min.w, Math.round(w)));
      var height = Math.min(maxH, Math.max(min.h, Math.round(h)));
      if (width < 1 || height < 1) return;
      var key = width + 'x' + height;
      if (seen[key]) return;
      seen[key] = true;
      list.push({ w: width, h: height, label: width + ' × ' + height, current: width === item.w && height === item.h });
    }

    add(item.w, item.h);
    add(min.w, min.h);
    add(natural.w, natural.h);
    // One-step shrink in each direction is what makes a free cell appear
    // without dragging the corner.
    add(item.w - 1, item.h);
    add(item.w, item.h - 1);
    add(item.w + 1, item.h);
    add(item.w, item.h + 1);
    add(maxW, item.h);
    add(item.w, maxH);
    add(min.w, maxH);
    add(maxW, min.h);
    return list;
  }

  App.ui.presets = { forWidget: forWidget };
})(window.App);
