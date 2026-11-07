/* A switched-off widget keeps its saved cell so that switching it back on puts
   it where the user left it. That memory must not act like a card that is on the
   board: move and resize ignore it, so the re-fit has to ignore it too, or every
   growth into a hidden footprint is reported as success and then undone. */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const grid = require('../js/core/grid.js');
const schema = require('../js/core/settings-schema.js');

const GRIDS = { landscape: { cols: 6, rows: 5 }, portrait: { cols: 4, rows: 4 } };

const DEFS = [
  { id: 'a', defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 1 } }, minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } } },
  { id: 'b', defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 1 } }, minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } } },
  { id: 'c', defaultEnabled: false, defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } }, minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } } }
];

function board(items, enabled) {
  const settings = schema.normalize({
    widgets: {
      order: ['a', 'b', 'c'],
      enabled: { a: enabled.a, b: enabled.b, c: enabled.c },
      settings: {}
    },
    layouts: { portrait: { grid: GRIDS.portrait, items: items }, landscape: null }
  }, DEFS);
  return schema.ensureLayouts(settings, DEFS, GRIDS).layouts.portrait.items;
}

const BASE = {
  a: { x: 0, y: 0, w: 2, h: 1 },
  b: { x: 0, y: 1, w: 2, h: 1 },
  c: { x: 0, y: 2, w: 2, h: 2 }
};

test('a card grown over a hidden card keeps the size the user chose', () => {
  const items = JSON.parse(JSON.stringify(BASE));
  items.a = { x: 0, y: 2, w: 2, h: 2 };
  const fitted = board(items, { a: true, b: true, c: false });
  assert.deepEqual(fitted.a, { x: 0, y: 2, w: 2, h: 2 });
  assert.deepEqual(fitted.b, BASE.b);
});

test('the hidden card keeps its own cell as the memory it is re-enabled to', () => {
  const items = JSON.parse(JSON.stringify(BASE));
  items.a = { x: 0, y: 2, w: 2, h: 2 };
  const fitted = board(items, { a: true, b: true, c: false });
  assert.deepEqual(fitted.c, BASE.c);
});

test('two visible cards are never allowed to share a cell', () => {
  const items = JSON.parse(JSON.stringify(BASE));
  items.b = { x: 0, y: 0, w: 2, h: 1 };
  const fitted = board(items, { a: true, b: true, c: false });
  assert.deepEqual(fitted.a, BASE.a);
  assert.equal(grid.overlaps(fitted.a, fitted.b), false);
});

test('without an active list every saved cell still blocks, as before', () => {
  const result = grid.remap(
    { grid: GRIDS.portrait, items: { a: { x: 0, y: 0, w: 4, h: 1 }, b: { x: 0, y: 0, w: 1, h: 1 } } },
    GRIDS.portrait,
    { order: ['a', 'b'], minSizes: {} }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.b, { x: 0, y: 1, w: 1, h: 1 });
});

test('re-enabling moves the card coming back, not the cards already shown', () => {
  const items = JSON.parse(JSON.stringify(BASE));
  items.a = { x: 0, y: 2, w: 2, h: 2 };
  const placed = grid.ensurePlacement({
    grid: GRIDS.portrait,
    items: items,
    activeIds: ['a', 'b', 'c']
  }, 'c');
  assert.equal(placed.ok, true);
  assert.deepEqual(placed.items.a, { x: 0, y: 2, w: 2, h: 2 });
  assert.deepEqual(placed.items.b, BASE.b);
  assert.equal(grid.overlaps(placed.items.c, placed.items.a), false);
});

/* Four cards that keep the sizes the user chose, for the paths that only run when
   the board itself changes. */
const WIDE = [
  { id: 'a', defaultSize: { portrait: { w: 2, h: 1 } }, minSize: { portrait: { w: 2, h: 1 } } },
  { id: 'b', defaultSize: { portrait: { w: 2, h: 1 } }, minSize: { portrait: { w: 2, h: 1 } } },
  { id: 'c', defaultEnabled: false, defaultSize: { portrait: { w: 2, h: 2 } }, minSize: { portrait: { w: 2, h: 1 } } },
  { id: 'd', defaultSize: { portrait: { w: 2, h: 1 } }, minSize: { portrait: { w: 2, h: 1 } } }
];
const WIDE_ITEMS = {
  a: { x: 0, y: 0, w: 3, h: 1 },
  b: { x: 2, y: 0, w: 2, h: 2 },
  c: { x: 2, y: 0, w: 2, h: 2 },
  d: { x: 0, y: 1, w: 2, h: 1 }
};

function wideBoard(enabled, grids) {
  const settings = schema.normalize({
    widgets: {
      order: ['a', 'b', 'c', 'd'],
      enabled: { a: enabled.a, b: enabled.b, c: enabled.c, d: enabled.d },
      settings: {}
    },
    layouts: { portrait: { grid: { cols: 4, rows: 4 }, items: JSON.parse(JSON.stringify(WIDE_ITEMS)) }, landscape: null }
  }, WIDE);
  return schema.ensureLayouts(settings, WIDE, grids).layouts.portrait.items;
}

// b and c share a cell by design once c is switched off, so a re-fit that treats an
// empty enabled list as "everything is visible" refuses and packs the board down to
// minimums — destroying the sizes of cards nobody can see.
test('switching the last card off leaves every saved size where it was', () => {
  const items = wideBoard({ a: false, b: false, c: false, d: false }, { portrait: { cols: 4, rows: 4 }, landscape: null });
  Object.keys(WIDE_ITEMS).forEach((id) => {
    assert.deepEqual(items[id], WIDE_ITEMS[id], id);
  });
});

test('an unrelated setting does not resize the cards the user sized', () => {
  const settings = schema.normalize({
    widgets: {
      order: ['a', 'b', 'c', 'd'],
      enabled: { a: false, b: false, c: false, d: false },
      settings: {}
    },
    layouts: { portrait: { grid: { cols: 4, rows: 4 }, items: JSON.parse(JSON.stringify(WIDE_ITEMS)) }, landscape: null }
  }, WIDE);
  const patched = schema.normalize(Object.assign({}, settings, { theme: 'light' }), WIDE);
  const items = schema.ensureLayouts(patched, WIDE, { portrait: { cols: 4, rows: 4 }, landscape: null }).layouts.portrait.items;
  Object.keys(WIDE_ITEMS).forEach((id) => {
    assert.deepEqual(items[id], WIDE_ITEMS[id], id);
  });
});

// The pack branch runs when the board shrinks so far that cells cannot be kept.
// There the cards that are on the board are re-packed by definition, while a
// switched-off one must still keep its own memory cell, at its saved size.
test('packing after a shrink keeps the hidden memory and the visible cards', () => {
  const items = wideBoard({ a: true, b: true, c: false, d: true }, { portrait: { cols: 4, rows: 2 }, landscape: null });
  const shown = ['a', 'b', 'd'];
  shown.forEach((id) => assert.ok(items[id], id + ' lost its cell'));
  for (let i = 0; i < shown.length; i += 1) {
    for (let j = i + 1; j < shown.length; j += 1) {
      assert.equal(grid.overlaps(items[shown[i]], items[shown[j]]), false, shown[i] + '/' + shown[j]);
    }
  }
  assert.deepEqual(items.c, { x: 2, y: 0, w: 2, h: 2 });
});

test('a hidden card comes back no smaller than the widget minimum', () => {
  const result = grid.remap(
    { grid: { cols: 4, rows: 4 }, items: { c: { x: 0, y: 0, w: 2, h: 2 } } },
    { cols: 4, rows: 1 },
    { order: ['c'], minSizes: { c: { w: 2, h: 1 } }, activeIds: [] }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.c, { x: 0, y: 0, w: 2, h: 1 });
});

// The two "find a cell for a widget that has none" entry points have to use the
// same rule as move, resize and remap: enableWidget already passes the active list.
test('a widget placed for the first time is not blocked by a hidden footprint', () => {
  const settings = schema.normalize({
    widgets: { order: ['a', 'b', 'c', 'd'], enabled: { a: true, b: false, c: false, d: false }, settings: {} },
    layouts: { portrait: { grid: { cols: 2, rows: 1 }, items: { c: { x: 0, y: 0, w: 2, h: 1 } } }, landscape: null }
  }, WIDE);
  const items = schema.ensureLayouts(settings, WIDE, { portrait: { cols: 2, rows: 1 }, landscape: null }).layouts.portrait.items;
  assert.deepEqual(items.a, { x: 0, y: 0, w: 2, h: 1 });
});
