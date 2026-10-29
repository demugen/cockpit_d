'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../js/core/utils.js');

test('tank volume falls back and clamps to the offered range', () => {
  assert.equal(utils.tankVolume(undefined), 55);
  assert.equal(utils.tankVolume('70'), 70);
  assert.equal(utils.tankVolume(71.4), 71);
  assert.equal(utils.tankVolume(5), 20);
  assert.equal(utils.tankVolume(400), 150);
  assert.equal(utils.tankVolume('nope'), 55);
  assert.equal(utils.TANK_LITERS.step, 1);
});

test('fuel liters follow percent and tank volume', () => {
  assert.equal(utils.fuelLiters(62, 55), 34);
  assert.equal(utils.fuelLiters(50, 60), 30);
  assert.equal(utils.fuelLiters(0, 55), 0);
  assert.equal(utils.fuelLiters(120, 50), 50);
  assert.equal(utils.fuelLiters(null, 55), null);
  assert.equal(utils.fuelLiters('abc', 55), null);
});

test('route distances read as meters and kilometers', () => {
  assert.equal(utils.formatDistance(0), '0 м');
  assert.equal(utils.formatDistance(37), '37 м');
  assert.equal(utils.formatDistance(999), '999 м');
  assert.equal(utils.formatDistance(1000), '1 км');
  assert.equal(utils.formatDistance(1250), '1,3 км');
  assert.equal(utils.formatDistance(9999), '10 км');
  assert.equal(utils.formatDistance(12500), '13 км');
  assert.equal(utils.formatDistance(null), '—');
  assert.equal(utils.formatDistance(-5), '—');
  assert.equal(utils.formatDistance('abc'), '—');
  assert.equal(utils.formatDistance(null, ''), '');
});
