'use strict';

/* Contract fixtures for the seven standard widgets. create() is unused in core tests. */

function def(id, landscape, portrait, minLandscape, minPortrait) {
  return {
    id: id,
    title: id,
    defaultSize: { landscape: { w: landscape[0], h: landscape[1] }, portrait: { w: portrait[0], h: portrait[1] } },
    minSize: {
      landscape: { w: minLandscape[0], h: minLandscape[1] },
      portrait: { w: minPortrait[0], h: minPortrait[1] }
    },
    settingsDefaults: {},
    create: function () { return {}; }
  };
}

module.exports = [
  def('clock', [2, 1], [2, 1], [1, 1], [1, 1]),
  def('weather', [2, 1], [2, 1], [2, 1], [2, 1]),
  def('media', [4, 1], [2, 2], [3, 1], [2, 1]),
  def('climate', [3, 2], [2, 2], [2, 2], [2, 2]),
  def('seats', [2, 2], [2, 2], [2, 1], [2, 1]),
  def('cardata', [2, 1], [2, 2], [1, 1], [1, 1]),
  def('apps', [2, 2], [2, 2], [2, 1], [2, 1])
];
