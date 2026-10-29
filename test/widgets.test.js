'use strict';

/* The ten product widgets, loaded exactly as Node modules. Their defs carry
   the real sizes, so geometry is checked against what ships. */

const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../js/core/grid.js');
const schema = require('../js/core/settings-schema.js');
const registryApi = require('../js/core/registry.js');

const defs = [
  require('../js/widgets/clock.js'),
  require('../js/widgets/weather.js'),
  require('../js/widgets/nav.js'),
  require('../js/widgets/media.js'),
  require('../js/widgets/climate.js'),
  require('../js/widgets/heaters.js'),
  require('../js/widgets/windows.js'),
  require('../js/widgets/seats.js'),
  require('../js/widgets/cardata.js'),
  require('../js/widgets/apps.js')
];

const enabledDefs = defs.filter((def) => def.defaultEnabled !== false);
const optionalDefs = defs.filter((def) => def.defaultEnabled === false);

function boards(width, height) {
  return {
    landscape: grid.gridFor('landscape', width, height),
    portrait: grid.gridFor('portrait', width, height)
  };
}

function assertValid(board, items) {
  const ids = Object.keys(items);
  ids.forEach((id) => {
    assert.ok(grid.inside(board, items[id]), id + ' outside ' + JSON.stringify(board) + ': ' + JSON.stringify(items[id]));
  });
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      assert.equal(grid.overlaps(items[ids[i]], items[ids[j]]), false, ids[i] + ' overlaps ' + ids[j]);
    }
  }
}

test('the ten product widgets satisfy the registry contract', () => {
  const registry = registryApi.create();
  defs.forEach((def) => registry.register(def));
  assert.deepEqual(registry.ids(), ['clock', 'weather', 'nav', 'media', 'climate', 'heaters', 'windows', 'seats', 'cardata', 'apps']);
  defs.forEach((def) => {
    const clean = registryApi.validate(def);
    ['landscape', 'portrait'].forEach((axis) => {
      const min = clean.minSize[axis];
      const size = clean.defaultSize[axis];
      assert.ok(min.w <= size.w && min.h <= size.h, def.id + '/' + axis + ' min exceeds default');
    });
  });
  assert.equal(registry.get('heaters').defaultEnabled, false);
  assert.equal(registry.get('windows').defaultEnabled, false);
  assert.equal(registry.get('nav').defaultEnabled, false);
  assert.equal(registry.get('seats').defaultEnabled, true);
  // The map is the reason the widget exists, so it opens large by default.
  assert.deepEqual(registry.get('nav').defaultSize, { landscape: { w: 4, h: 2 }, portrait: { w: 2, h: 4 } });
});

test('widgets can be shrunk to their compact minimums', () => {
  const byId = Object.fromEntries(defs.map((def) => [def.id, def]));
  assert.deepEqual(byId.clock.minSize.portrait, { w: 1, h: 1 });
  assert.deepEqual(byId.media.minSize.portrait, { w: 2, h: 1 });
  assert.deepEqual(byId.apps.minSize.portrait, { w: 2, h: 1 });
  assert.deepEqual(byId.cardata.minSize.landscape, { w: 1, h: 1 });
  assert.deepEqual(byId.seats.minSize.portrait, { w: 2, h: 1 });
  assert.deepEqual(byId.heaters.minSize.portrait, { w: 2, h: 1 });
  assert.deepEqual(byId.windows.minSize.portrait, { w: 2, h: 1 });
  assert.deepEqual(byId.nav.minSize.portrait, { w: 2, h: 1 });
  assert.deepEqual(byId.nav.minSize.landscape, { w: 2, h: 1 });
  // Six climate controls cannot fit a single column, so that minimum stays.
  assert.deepEqual(byId.climate.minSize.portrait, { w: 2, h: 2 });
});

test('the new controls ship off and take no cells until enabled', () => {
  const defaults = schema.defaults(defs);
  optionalDefs.forEach((def) => {
    assert.equal(defaults.widgets.enabled[def.id], false, def.id + ' must ship off');
    assert.equal(defaults.widgets.order.indexOf(def.id) !== -1, true, def.id + ' must be registered');
  });
  const settings = schema.ensureLayouts(defaults, defs, boards(1080, 1920));
  ['landscape', 'portrait'].forEach((axis) => {
    optionalDefs.forEach((def) => {
      assert.equal(settings.layouts[axis].items[def.id], undefined, def.id + ' reserved a cell in ' + axis);
    });
    assertValid(settings.layouts[axis].grid, settings.layouts[axis].items);
  });
  // Enabled later, each finds room without moving the seven default widgets.
  const before = Object.fromEntries(enabledDefs.map((def) => [def.id, settings.layouts.portrait.items[def.id]]));
  optionalDefs.forEach((def) => {
    settings.widgets.enabled[def.id] = true;
  });
  const next = schema.ensureLayouts(settings, defs, boards(1080, 1920));
  optionalDefs.forEach((def) => {
    assert.ok(next.layouts.portrait.items[def.id], def.id + ' must get a cell when enabled');
  });
  enabledDefs.forEach((def) => {
    assert.deepEqual(next.layouts.portrait.items[def.id], before[def.id], def.id + ' moved for an optional widget');
  });
  assertValid(next.layouts.portrait.grid, next.layouts.portrait.items);
});

test('default settings place every default widget in both orientations', () => {
  const grids = boards(1080, 1920);
  const settings = schema.ensureLayouts(schema.defaults(defs), defs, grids);
  ['landscape', 'portrait'].forEach((axis) => {
    const layout = settings.layouts[axis];
    assert.deepEqual(layout.grid, grids[axis]);
    assert.deepEqual(Object.keys(layout.items).sort(), enabledDefs.map((def) => def.id).sort());
    assertValid(layout.grid, layout.items);
  });
  assert.equal(schema.activeIds(settings, 'portrait').length, enabledDefs.length);
  assert.equal(schema.activeIds(settings, 'landscape').length, enabledDefs.length);
});

test('real widget defaults land as expected on the J7 portrait screen', () => {
  const board = grid.gridFor('portrait', 1080, 1920);
  const packed = grid.packLayout(board, enabledDefs, 'portrait');
  assert.deepEqual(packed.overflow, []);
  assert.deepEqual(packed.items.clock, { x: 0, y: 0, w: 2, h: 1 });
  assert.deepEqual(packed.items.weather, { x: 2, y: 0, w: 2, h: 1 });
  assert.deepEqual(packed.items.media, { x: 0, y: 1, w: 2, h: 2 });
  assert.deepEqual(packed.items.climate, { x: 2, y: 1, w: 2, h: 2 });
  assert.deepEqual(packed.items.seats, { x: 0, y: 3, w: 2, h: 2 });
  assert.deepEqual(packed.items.cardata, { x: 2, y: 3, w: 2, h: 2 });
  assert.deepEqual(packed.items.apps, { x: 0, y: 5, w: 2, h: 2 });
});

test('real widgets pack without overflow on every supported screen', () => {
  const cases = {
    landscape: [[1920, 720], [2560, 1440], [2560, 720]],
    portrait: [[1080, 1920], [1200, 1920], [720, 1280], [1280, 1600], [1600, 2048]]
  };
  ['landscape', 'portrait'].forEach((axis) => {
    cases[axis].forEach(([width, height]) => {
      const board = grid.gridFor(axis, width, height);
      const packed = grid.packLayout(board, enabledDefs, axis);
      const label = axis + ' ' + width + 'x' + height;
      assert.deepEqual(packed.overflow, [], 'overflow at ' + label);
      assert.equal(Object.keys(packed.items).length, enabledDefs.length, 'missing at ' + label);
      assertValid(board, packed.items);
    });
  });
});

test('each optional widget fits next to the default board on every supported screen', () => {
  const cases = {
    landscape: [[1920, 720], [2560, 1440], [2560, 720]],
    portrait: [[1080, 1920], [1200, 1920], [720, 1280], [1280, 1600], [1600, 2048]]
  };
  optionalDefs.forEach((optional) => {
    ['landscape', 'portrait'].forEach((axis) => {
      cases[axis].forEach(([width, height]) => {
        const board = grid.gridFor(axis, width, height);
        const packed = grid.packLayout(board, enabledDefs.concat([optional]), axis);
        const label = optional.id + ' ' + axis + ' ' + width + 'x' + height;
        assert.deepEqual(packed.overflow, [], 'overflow at ' + label);
        assert.ok(packed.items[optional.id], 'missing ' + label);
        assertValid(board, packed.items);
      });
    });
  });
});

function switchScreen(layout, axis, width, height) {
  const board = grid.gridFor(axis, width, height);
  const order = enabledDefs.map((def) => def.id);
  return { board, fitted: schema.fitLayout(layout, axis, board, enabledDefs, order) };
}

test('a saved layout survives a switch between the supported screens', () => {
  const screens = {
    landscape: [[1920, 720], [2560, 1440], [2560, 720]],
    portrait: [[1080, 1920], [1200, 1920], [720, 1280], [1280, 1600]]
  };
  ['landscape', 'portrait'].forEach((axis) => {
    const start = schema.ensureLayouts(schema.defaults(defs), defs, boards(1080, 1920)).layouts[axis];
    screens[axis].forEach(([width, height]) => {
      const label = axis + ' ' + width + 'x' + height + ' ';
      const away = switchScreen(start, axis, width, height);
      assert.deepEqual(away.fitted.overflow, [], label + 'overflow');
      assert.equal(Object.keys(away.fitted.items).length, enabledDefs.length, label + 'lost a widget');
      assertValid(away.board, away.fitted.items);
    });
  });
});

test('switching screens round-trips back to the original board', () => {
  const startScreen = { landscape: [1920, 720], portrait: [1080, 1920] };
  const screens = {
    landscape: [[1920, 720], [2560, 1440], [2560, 720]],
    portrait: [[1080, 1920], [1200, 1920], [720, 1280]]
  };
  ['landscape', 'portrait'].forEach((axis) => {
    const [startW, startH] = startScreen[axis];
    const start = schema.ensureLayouts(schema.defaults(defs), defs, boards(startW, startH)).layouts[axis];
    screens[axis].forEach(([width, height]) => {
      const away = switchScreen(start, axis, width, height);
      const back = switchScreen(away.fitted, axis, startW, startH);
      const label = axis + ' ' + width + 'x' + height + ' ';
      assert.deepEqual(back.fitted.overflow, [], label + 'return overflow');
      assert.equal(Object.keys(back.fitted.items).length, enabledDefs.length, label + 'lost a widget on return');
      assertValid(back.board, back.fitted.items);
    });
  });
});
