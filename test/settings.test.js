'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../js/core/grid.js');
const schema = require('../js/core/settings-schema.js');
const defs = require('./defs-fixture.js');

function gridsFor(width, height) {
  return {
    landscape: grid.gridFor('landscape', width, height),
    portrait: grid.gridFor('portrait', width, height)
  };
}

function assertNoOverlap(layout) {
  const ids = Object.keys(layout.items);
  ids.forEach((id) => assert.ok(grid.inside(layout.grid, layout.items[id]), id + ' outside'));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      assert.equal(grid.overlaps(layout.items[ids[i]], layout.items[ids[j]]), false, ids[i] + '/' + ids[j]);
    }
  }
}

test('defaults enable every registered widget in registration order', () => {
  const value = schema.defaults(defs);
  assert.deepEqual(value.widgets.order, defs.map((d) => d.id));
  defs.forEach((def) => assert.equal(value.widgets.enabled[def.id], true));
  assert.equal(value.version, schema.VERSION);
});

test('normalize rejects garbage and clamps ranges', () => {
  const value = schema.normalize({
    theme: 'neon',
    fontScale: 99,
    car: { pollSeconds: 999 },
    weather: { refreshMinutes: -4 },
    widgets: { enabled: { clock: false, ghost: true }, order: ['ghost', 'media'], settings: { apps: { slots: [1] } } },
    layouts: { landscape: { grid: { cols: 999, rows: 0 }, items: { clock: { x: -5, y: 0, w: 0, h: 1 } } } }
  }, defs);

  assert.equal(value.theme, 'dark');
  assert.equal(value.fontScale, 1.3);
  assert.equal(value.car.pollSeconds, 60);
  assert.equal(value.weather.refreshMinutes, 5);
  assert.equal(value.widgets.enabled.clock, false);
  assert.equal(value.widgets.enabled.ghost, undefined);
  assert.deepEqual(value.widgets.order.slice(0, 2), ['media', 'clock']);
  assert.deepEqual(value.widgets.settings.apps.slots, [1]);
  assert.equal(value.layouts.landscape.grid.cols, 16);
  assert.equal(value.layouts.landscape.grid.rows, 1);
  assert.deepEqual(value.layouts.landscape.items.clock, { x: 0, y: 0, w: 1, h: 1 });
});

test('header slots and background fall back to safe defaults', () => {
  const value = schema.normalize({
    header: { carChips: 'yes', clockSlot: 'top', chipsSlot: 'right' },
    background: { image: 'a'.repeat(400), rotateMinutes: 7 }
  }, defs);
  assert.equal(value.header.clockSlot, 'center');
  assert.equal(value.header.chipsSlot, 'right');
  assert.equal(value.header.carChips, true);
  assert.equal(value.background.image.length, 200);
  assert.equal(value.background.rotateMinutes, 0);

  const defaults = schema.defaults(defs);
  assert.equal(defaults.version, 3);
  assert.equal(defaults.background.image, '');
  assert.equal(defaults.background.rotateMinutes, 0);
  assert.equal(defaults.header.clockSlot, 'center');
  assert.equal(defaults.header.chipsSlot, 'left');
});

test('rotation keeps only the offered intervals', () => {
  [0, 10, 30, 60, 180].forEach((minutes) => {
    assert.equal(schema.normalize({ background: { rotateMinutes: minutes } }, defs).background.rotateMinutes, minutes);
  });
  [5, 45, -10, 'abc'].forEach((minutes) => {
    assert.equal(schema.normalize({ background: { rotateMinutes: minutes } }, defs).background.rotateMinutes, 0);
  });
});

test('ensureLayouts fills both orientations on every supported screen', () => {
  const cases = [[1920, 720], [2560, 1440], [1080, 1920], [1200, 1920], [720, 1280], [1280, 1600]];
  cases.forEach(([width, height]) => {
    const settings = schema.ensureLayouts(schema.defaults(defs), defs, gridsFor(width, height));
    ['landscape', 'portrait'].forEach((orientation) => {
      const layout = settings.layouts[orientation];
      assert.deepEqual(layout.grid, gridsFor(width, height)[orientation]);
      assert.equal(Object.keys(layout.items).length, defs.length, orientation + ' ' + width + 'x' + height);
      assertNoOverlap(layout);
    });
  });
});

test('ensureLayouts keeps cells and gaps when the grid is unchanged', () => {
  const settings = schema.ensureLayouts(schema.defaults(defs), defs, gridsFor(1080, 1920));
  assert.deepEqual(settings.layouts.portrait.items.clock, { x: 0, y: 0, w: 2, h: 1 });
  settings.layouts.portrait.items.media = { x: 0, y: 5, w: 2, h: 2 };
  settings.layouts.portrait.items.climate = { x: 2, y: 5, w: 2, h: 2 };

  const next = schema.ensureLayouts(settings, defs, gridsFor(1080, 1920));
  assert.deepEqual(next.layouts.portrait.items.media, { x: 0, y: 5, w: 2, h: 2 });
  assert.deepEqual(next.layouts.portrait.items.clock, { x: 0, y: 0, w: 2, h: 1 });
  assertNoOverlap(next.layouts.portrait);
});

test('ensureLayouts places a widget registered in a later version', () => {
  const extra = {
    id: 'notes',
    title: 'notes',
    defaultSize: { landscape: { w: 1, h: 1 }, portrait: { w: 1, h: 1 } },
    minSize: { landscape: { w: 1, h: 1 }, portrait: { w: 1, h: 1 } },
    settingsDefaults: {},
    create: function () { return {}; }
  };
  const all = defs.concat([extra]);
  const settings = schema.ensureLayouts(schema.defaults(defs), defs, gridsFor(1080, 1920));
  const next = schema.ensureLayouts(settings, all, gridsFor(1080, 1920));
  assert.ok(next.layouts.landscape.items.notes, 'notes must get a cell');
  assert.equal(next.widgets.enabled.notes, true);
  assertNoOverlap(next.layouts.landscape);
});

test('ensureLayouts remaps a saved layout onto another screen', () => {
  const j7 = schema.ensureLayouts(schema.defaults(defs), defs, gridsFor(1080, 1920));
  const wide = schema.ensureLayouts(j7, defs, gridsFor(1200, 1920));
  ['landscape', 'portrait'].forEach((orientation) => {
    assert.equal(Object.keys(wide.layouts[orientation].items).length, defs.length);
    assertNoOverlap(wide.layouts[orientation]);
  });
  // The user's card sizes survive the screen change.
  assert.equal(wide.layouts.portrait.items.media.w, 2);
  assert.equal(wide.layouts.portrait.items.media.h, 2);
});

test('enabled and active id lists stay consistent', () => {
  const settings = schema.ensureLayouts(schema.defaults(defs), defs, gridsFor(1080, 1920));
  settings.widgets.enabled.media = false;
  assert.deepEqual(schema.enabledIds(settings).indexOf('media'), -1);
  assert.deepEqual(schema.activeIds(settings, 'portrait').indexOf('media'), -1);
  assert.equal(schema.activeIds(settings, 'portrait').length, defs.length - 1);
});
