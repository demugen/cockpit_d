'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registryModule = require('../js/core/registry.js');

function def(id, overrides) {
  return Object.assign({
    id: id,
    title: id,
    defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    minSize: { w: 1, h: 1 },
    create: function () { return {}; }
  }, overrides || {});
}

test('registry keeps unique widgets and sorts by order', () => {
  const registry = registryModule.create();
  registry.register(def('clock', { order: 20 }));
  registry.register(def('weather', { order: 10 }));
  assert.deepEqual(registry.ids(), ['weather', 'clock']);
  assert.equal(registry.get('clock').title, 'clock');
  assert.equal(registry.get('missing'), null);
});

test('registry rejects duplicates and malformed definitions', () => {
  const registry = registryModule.create();
  registry.register(def('clock'));
  assert.throws(() => registry.register(def('clock')), /already registered/);
  assert.throws(() => registry.register(def('Bad Id')), /kebab-case/);
  assert.throws(() => registryModule.validate(def('no-create', { create: undefined })), /create/);
  assert.throws(() => registryModule.validate(def('tiny', { minSize: { w: 3, h: 1 } })), /minSize/);
  assert.throws(() => registryModule.validate({ id: 'x', title: 'x', defaultSize: { w: 1, h: 1 }, create() {} }), /id/);
});

test('registry deep-copies settings defaults', () => {
  const registry = registryModule.create();
  const source = { slots: [1, 2] };
  registry.register(def('apps', { settingsDefaults: { apps: source } }));
  const copy = registry.get('apps').settingsDefaults;
  copy.apps.slots.push(3);
  assert.deepEqual(source.slots, [1, 2]);
});
