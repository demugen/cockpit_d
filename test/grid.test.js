'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../js/core/grid.js');
const defs = require('./defs-fixture.js');

function assertValid(gridObj, items) {
  const ids = Object.keys(items);
  ids.forEach((id) => {
    const item = items[id];
    assert.ok(grid.inside(gridObj, item), id + ' outside grid: ' + JSON.stringify(item));
  });
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      assert.equal(
        grid.overlaps(items[ids[i]], items[ids[j]]),
        false,
        ids[i] + ' overlaps ' + ids[j]
      );
    }
  }
}

test('gridFor derives the grid from the screen, one per orientation', () => {
  const cases = [
    ['landscape', 1920, 720, { cols: 9, rows: 3 }],
    ['landscape', 2560, 1440, { cols: 12, rows: 6 }],
    ['landscape', 1280, 720, { cols: 6, rows: 3 }],
    ['landscape', 1024, 600, { cols: 6, rows: 3 }],
    ['portrait', 1080, 1920, { cols: 5, rows: 9 }],
    ['portrait', 1200, 1920, { cols: 6, rows: 9 }],
    ['portrait', 720, 1280, { cols: 4, rows: 7 }]
  ];
  cases.forEach(([axis, width, height, expected]) => {
    assert.deepEqual(grid.gridFor(axis, width, height), expected, axis + ' ' + width + 'x' + height);
  });
});

test('gridFor answers for the other orientation by swapping the screen', () => {
  assert.deepEqual(
    grid.gridFor('portrait', 1920, 1440),
    grid.gridFor('portrait', 1440, 1920)
  );
  assert.deepEqual(
    grid.gridFor('landscape', 1080, 1920),
    grid.gridFor('landscape', 1920, 1080)
  );
});

test('a target cell stays close to square across the supported screens', () => {
  const screens = [
    [1920, 720], [2560, 1440], [1080, 1920], [1200, 1920]
  ];
  screens.forEach(([width, height]) => {
    const axis = width >= height ? 'landscape' : 'portrait';
    const board = grid.gridFor(axis, width, height);
    // Mirror the css gap: 1.1vmin clamped to 8..14 px.
    const vmin = Math.min(width, height);
    const gap = Math.min(14, Math.max(8, vmin * 0.011));
    const cellW = (width - gap * 2 - (board.cols - 1) * gap) / board.cols;
    const cellH = (height - (Math.min(78, Math.max(52, vmin * 0.084))) - gap - (board.rows - 1) * gap) / board.rows;
    const ratio = cellW / cellH;
    assert.ok(ratio > 0.8 && ratio < 1.25, axis + ' ' + width + 'x' + height + ' cells ' + ratio.toFixed(2));
  });
});

test('packLayout fits all seven widgets on every supported screen', () => {
  const cases = {
    landscape: [[1920, 720], [2560, 1440], [2560, 720]],
    portrait: [[1080, 1920], [1200, 1920], [720, 1280], [1280, 1600], [1600, 2048]]
  };
  ['landscape', 'portrait'].forEach((orientation) => {
    cases[orientation].forEach(([width, height]) => {
      const board = grid.gridFor(orientation, width, height);
      const packed = grid.packLayout(board, defs, orientation);
      const label = orientation + ' ' + width + 'x' + height;
      assert.deepEqual(packed.overflow, [], 'overflow at ' + label);
      assert.equal(Object.keys(packed.items).length, defs.length, 'missing widgets at ' + label);
      assertValid(board, packed.items);
    });
  });
});

test('packLayout leaves an optional card out before it loses a core one', () => {
  const optional = [
    { id: 'heaters', defaultEnabled: false, defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } }, minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } } },
    { id: 'windows', defaultEnabled: false, defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } }, minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } } }
  ];
  const all = defs.concat(optional);
  const board = grid.gridFor('landscape', 1920, 720);
  const packed = grid.packLayout(board, all, 'landscape');
  assert.deepEqual(packed.overflow, ['windows']);
  assert.ok(packed.items.apps, 'apps keeps its cell');
  assert.deepEqual(packed.items.clock, { x: 0, y: 0, w: 2, h: 1 });
  assertValid(board, packed.items);
});

test('default J7 portrait layout keeps every card at its natural size', () => {
  const board = grid.gridFor('portrait', 1080, 1920);
  const packed = grid.packLayout(board, defs, 'portrait');
  assert.deepEqual(packed.overflow, []);
  assert.deepEqual(packed.items.clock, { x: 0, y: 0, w: 2, h: 1 });
  assert.deepEqual(packed.items.weather, { x: 2, y: 0, w: 2, h: 1 });
  assert.deepEqual(packed.items.media, { x: 0, y: 1, w: 2, h: 2 });
  assert.deepEqual(packed.items.climate, { x: 2, y: 1, w: 2, h: 2 });
  assert.deepEqual(packed.items.seats, { x: 0, y: 3, w: 2, h: 2 });
  assert.deepEqual(packed.items.cardata, { x: 2, y: 3, w: 2, h: 2 });
  assert.deepEqual(packed.items.apps, { x: 0, y: 5, w: 2, h: 2 });
});

test('move to an empty cell keeps every other card pinned', () => {
  const board = { cols: 4, rows: 2 };
  const items = {
    a: { x: 0, y: 0, w: 1, h: 1 },
    b: { x: 1, y: 0, w: 1, h: 1 }
  };
  const result = grid.move({ grid: board, items }, 'a', { x: 3, y: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.a, { x: 3, y: 1, w: 1, h: 1 });
  assert.deepEqual(result.items.b, items.b);
});

test('equal-size drop swaps two cards', () => {
  const board = { cols: 2, rows: 1 };
  const items = { a: { x: 0, y: 0, w: 1, h: 1 }, b: { x: 1, y: 0, w: 1, h: 1 } };
  const result = grid.move({ grid: board, items }, 'a', { x: 1, y: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.a, { x: 1, y: 0, w: 1, h: 1 });
  assert.deepEqual(result.items.b, { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(result.swapped, ['b']);
});

test('a bigger card pushes smaller neighbours to free cells', () => {
  const board = { cols: 4, rows: 2 };
  const items = {
    mover: { x: 0, y: 1, w: 2, h: 1 },
    a: { x: 0, y: 0, w: 1, h: 1 },
    b: { x: 1, y: 0, w: 1, h: 1 }
  };
  const result = grid.move({ grid: board, items }, 'mover', { x: 0, y: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.mover, { x: 0, y: 0, w: 2, h: 1 });
  assertValid(board, result.items);
  assert.deepEqual(result.displaced.sort(), ['a', 'b']);
});

test('refuses a drop when the displaced card has nowhere to go', () => {
  const board = { cols: 2, rows: 1 };
  const items = { a: { x: 0, y: 0, w: 2, h: 1 }, b: { x: 1, y: 0, w: 1, h: 1 } };
  const result = grid.move({ grid: board, items }, 'b', { x: 0, y: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'full');
  assert.equal(result.items, null);
});

test('move clamps to the board instead of leaving it', () => {
  const board = { cols: 4, rows: 2 };
  const items = { a: { x: 0, y: 0, w: 2, h: 1 } };
  const result = grid.move({ grid: board, items }, 'a', { x: 99, y: 99 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.a, { x: 2, y: 1, w: 2, h: 1 });
});

test('resize grows from the pinned corner and pushes neighbours', () => {
  const board = { cols: 4, rows: 2 };
  const items = {
    a: { x: 0, y: 0, w: 1, h: 1 },
    b: { x: 1, y: 0, w: 1, h: 1 }
  };
  const result = grid.resize({ grid: board, items, minSize: { w: 1, h: 1 } }, 'a', { w: 2, h: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.a, { x: 0, y: 0, w: 2, h: 1 });
  assertValid(board, result.items);
});

test('resize respects min size and board bounds', () => {
  const board = { cols: 3, rows: 2 };
  const items = { a: { x: 1, y: 0, w: 2, h: 1 } };
  const result = grid.resize({ grid: board, items, minSize: { w: 2, h: 1 } }, 'a', { w: 1, h: 9 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.a, { x: 1, y: 0, w: 2, h: 2 });
});

test('resize refuses when a displaced card cannot be placed', () => {
  const board = { cols: 2, rows: 1 };
  const items = { a: { x: 0, y: 0, w: 1, h: 1 }, b: { x: 1, y: 0, w: 1, h: 1 } };
  const result = grid.resize({ grid: board, items, minSize: { w: 1, h: 1 } }, 'a', { w: 2, h: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'full');
});

test('empty cells stay empty after a move', () => {
  const board = { cols: 3, rows: 1 };
  const items = {
    a: { x: 0, y: 0, w: 1, h: 1 },
    b: { x: 1, y: 0, w: 1, h: 1 },
    c: { x: 2, y: 0, w: 1, h: 1 }
  };
  const first = grid.move({ grid: board, items }, 'a', { x: 2, y: 0 });
  assert.equal(first.ok, true);
  assert.deepEqual(first.items.a, { x: 2, y: 0, w: 1, h: 1 });
  const second = grid.move({ grid: board, items: first.items }, 'b', { x: 0, y: 0 });
  assert.equal(second.ok, true);
  assert.deepEqual(second.items.b, { x: 0, y: 0, w: 1, h: 1 });
});

test('ensurePlacement relocates a returning widget only when its cell was taken', () => {
  const board = { cols: 2, rows: 2 };
  const items = {
    hidden: { x: 0, y: 0, w: 1, h: 1 },
    other: { x: 0, y: 0, w: 1, h: 1 },
    free: { x: 1, y: 1, w: 1, h: 1 }
  };
  const result = grid.ensurePlacement({ grid: board, items, activeIds: ['other', 'hidden'] }, 'hidden');
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.hidden, { x: 1, y: 0, w: 1, h: 1 });
});

test('remap keeps card sizes and positions when the screen changes', () => {
  const startGrid = grid.gridFor('portrait', 1080, 1920);
  const packed = grid.packLayout(startGrid, defs, 'portrait');
  const targets = [
    grid.gridFor('portrait', 1200, 1920),
    grid.gridFor('portrait', 720, 1280),
    grid.gridFor('portrait', 1280, 1600)
  ];
  targets.forEach((target) => {
    const result = grid.remap(
      { grid: startGrid, items: packed.items },
      target,
      { order: defs.map((d) => d.id), minSizes: Object.fromEntries(defs.map((d) => [d.id, grid.minSizeFor(d, 'portrait')])) }
    );
    assert.equal(result.ok, true, 'remap to ' + target.cols + 'x' + target.rows);
    assertValid(target, result.items);
    assert.equal(Object.keys(result.items).length, defs.length);
    assert.deepEqual(result.items.media.w, packed.items.media.w, 'media keeps its width');
    assert.deepEqual(result.items.media.h, packed.items.media.h, 'media keeps its height');
  });
});

test('remap fails honestly when the new board cannot hold the cards', () => {
  const oldGrid = { cols: 8, rows: 3 };
  const target = { cols: 2, rows: 2 };
  const minSizes = { a: { w: 4, h: 2 }, b: { w: 4, h: 2 }, c: { w: 4, h: 2 } };
  const items = {
    a: { x: 0, y: 0, w: 4, h: 2 },
    b: { x: 4, y: 0, w: 4, h: 2 },
    c: { x: 0, y: 2, w: 4, h: 2 }
  };
  const result = grid.remap({ grid: oldGrid, items }, target, { minSizes });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'full');
});
