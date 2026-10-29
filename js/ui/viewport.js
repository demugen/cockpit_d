/* Single source of truth for the viewport -> grid mapping. */

(function (App) {
  'use strict';

  var grid = App.core.grid;

  function orientation() {
    return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  }

  function width() {
    return Math.max(320, window.innerWidth || 1280);
  }

  function height() {
    return Math.max(320, window.innerHeight || 720);
  }

  function gridFor(axis) {
    return grid.gridFor(axis || orientation(), width(), height());
  }

  App.ui.viewport = {
    orientation: orientation,
    width: width,
    height: height,
    grid: gridFor
  };
})(window.App);
