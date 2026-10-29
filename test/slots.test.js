'use strict';

/* Slot lists and tile matrices are shared by the apps, seats and car-data
   widgets, so their edge cases are pinned once here. */

const test = require('node:test');
const assert = require('node:assert/strict');
const slots = require('../js/core/slots.js');
const tiles = require('../js/core/tiles.js');

test('slot lists drop garbage, trim and dedupe', () => {
  assert.deepEqual(slots.list(null), []);
  assert.deepEqual(slots.list('nope'), []);
  assert.deepEqual(slots.list([' a ', 'b', '', 'a', 3, null, 'c']), ['a', 'b', 'c']);
  assert.deepEqual(slots.list(['a', 'b', 'c'], 2), ['a', 'b']);
  assert.equal(slots.has(['  ', ''], 8), false);
  assert.equal(slots.has(['a'], 8), true);
});

test('padded always returns the full slot store', () => {
  const full = slots.padded(['a'], 3);
  assert.deepEqual(full, ['a', '', '']);
  assert.equal(slots.padded(null).length, slots.MAX);
});

test('writing a slot keeps one item per slot and swaps duplicates', () => {
  assert.deepEqual(slots.write([], 0, 'a', 3), ['a', '', '']);
  assert.deepEqual(slots.write(['a', 'b'], 1, 'a', 3), ['b', 'a', '']);
  assert.deepEqual(slots.write(['a', 'b'], 1, '', 3), ['a', '', '']);
  assert.deepEqual(slots.write(['a'], 9, 'b', 3), ['a', '', '']);
  assert.deepEqual(slots.write(['a'], '1', ' b ', 3), ['a', 'b', '']);
});

test('capacity grows with cells and respects the per-cell rate', () => {
  assert.equal(tiles.capacity({ w: 1, h: 1 }, 8, 2), 2);
  assert.equal(tiles.capacity({ w: 2, h: 1 }, 8, 2), 4);
  assert.equal(tiles.capacity({ w: 2, h: 2 }, 8, 2), 8);
  assert.equal(tiles.capacity({ w: 4, h: 2 }, 6, 1), 6);
  assert.equal(tiles.capacity(null, 8, 2), 2);
});

test('bestMatrix picks the largest tile instead of one squeezed row', () => {
  assert.deepEqual(pick(tiles.bestMatrix(1, 2, 2, 0.72)), { cols: 1, rows: 1 });
  assert.deepEqual(pick(tiles.bestMatrix(2, 2, 1, 0.72)), { cols: 2, rows: 1 });
  assert.deepEqual(pick(tiles.bestMatrix(4, 2, 2, 0.72)), { cols: 2, rows: 2 });
  assert.deepEqual(pick(tiles.bestMatrix(3, 2, 1, 0.75)), { cols: 3, rows: 1 });
  // A tall card prefers a column, and one spare cell is tolerated.
  assert.deepEqual(pick(tiles.bestMatrix(3, 2, 3, 0.72)), { cols: 2, rows: 2 });
});

test('bestMatrix never returns an empty matrix for odd counts', () => {
  for (let count = 1; count <= slots.MAX; count += 1) {
    const matrix = tiles.bestMatrix(count, 2, 2, 0.75);
    assert.ok(matrix.cols * matrix.rows >= count, 'count ' + count);
    assert.ok(matrix.cols * matrix.rows - count <= 1, 'count ' + count + ' wasted a tile');
  }
});

function pick(matrix) {
  return { cols: matrix.cols, rows: matrix.rows };
}
