'use strict';

/* Seat controls and car metrics are catalogs, not DOM: their ids, state
   readers and host tokens are what the widgets and the settings picker rely on. */

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../js/core/seat-catalog.js');
const metrics = require('../js/core/car-metrics.js');

test('seat catalog lists heat and ventilation for four seats plus memory', () => {
  const ids = catalog.list().map((item) => item.id);
  assert.equal(ids.length, 11);
  ['driver-heat', 'driver-vent', 'passenger-heat', 'passenger-vent',
    'rear-left-heat', 'rear-left-vent', 'rear-right-heat', 'rear-right-vent',
    'driver-memory-1', 'driver-memory-2', 'driver-memory-3'].forEach((id) => {
    assert.ok(ids.indexOf(id) !== -1, 'missing ' + id);
  });
  assert.deepEqual(catalog.defaults(), ['driver-heat', 'driver-vent', 'passenger-heat', 'passenger-vent']);
  assert.equal(catalog.maxLevel, 3);
});

test('front seats read climate state, rear seats read car data', () => {
  const climate = { driverSeatHeat: 2, driverSeatVent: 1, passengerSeatHeat: 0, passengerSeatVent: 3 };
  const car = { seats: { rearLeft: { heat: 1, vent: 0 }, rearRight: { heat: 0, vent: 2 } } };
  assert.equal(catalog.level(catalog.get('driver-heat'), climate, car), 2);
  assert.equal(catalog.level(catalog.get('driver-vent'), climate, car), 1);
  assert.equal(catalog.level(catalog.get('passenger-vent'), climate, car), 3);
  assert.equal(catalog.level(catalog.get('rear-left-heat'), climate, car), 1);
  assert.equal(catalog.level(catalog.get('rear-right-vent'), climate, car), 2);
  assert.equal(catalog.level(catalog.get('driver-memory-1'), climate, car), null);
  assert.equal(catalog.level(catalog.get('rear-left-heat'), climate, null), null);
});

test('host tokens follow the per-seat naming the profile exposes', () => {
  assert.equal(catalog.enumName(catalog.get('rear-left-heat'), 0), 'heat_zad_seat_l_0');
  assert.equal(catalog.enumName(catalog.get('rear-left-heat'), 3), 'heat_zad_seat_l_3');
  assert.equal(catalog.enumName(catalog.get('rear-right-heat'), 0), 'heat_zad_seat_r_off');
  assert.equal(catalog.enumName(catalog.get('rear-right-heat'), 2), 'heat_zad_seat_r_2');
  assert.equal(catalog.enumName(catalog.get('rear-right-vent'), 0), 'vent_zad_seat_r_off');
  assert.equal(catalog.enumName(catalog.get('rear-left-vent'), 1), 'vent_zad_seat_l_1');
  assert.equal(catalog.enumName(catalog.get('driver-memory-2'), 0), 'voditel_seat_2');
  assert.equal(catalog.enumName(catalog.get('driver-heat'), 1), '');
  assert.equal(catalog.enumName(catalog.get('driver-memory-1'), 3), 'voditel_seat_1');
});

test('car metrics ship a short default set and a catalog to pick from', () => {
  assert.deepEqual(metrics.defaults(), ['speed', 'fuel', 'battery', 'outTemp']);
  assert.deepEqual(metrics.list().map((item) => item.id), [
    'speed', 'rpm', 'fuel', 'fuelPercent', 'fuelLiters', 'battery',
    'outTemp', 'engine', 'sun', 'park', 'driverTemp', 'passengerTemp'
  ]);
  assert.equal(metrics.get('nope'), null);
});

test('fuel resolves percent and liters for the chosen tank', () => {
  const state = { vehicle: { fuelPercent: 62 } };
  const both = metrics.resolve('fuel', state, { tankLiters: 60 });
  assert.equal(both.value, '62');
  assert.equal(both.unit, '%');
  assert.equal(both.sub, '37');
  assert.equal(both.subUnit, 'л');
  assert.equal(metrics.resolve('fuelLiters', state, { tankLiters: 60 }).value, '37');
  assert.equal(metrics.resolve('fuelPercent', state, { tankLiters: 60 }).sub, undefined);
});

test('fuel warns when the tank runs low', () => {
  assert.equal(metrics.resolve('fuel', { vehicle: { fuelPercent: 10 } }, {}).tone, 'danger');
  assert.equal(metrics.resolve('fuel', { vehicle: { fuelPercent: 25 } }, {}).tone, 'warn');
  assert.equal(metrics.resolve('fuel', { vehicle: { fuelPercent: 25 } }, {}).value, '25');
  assert.equal(metrics.resolve('battery', { vehicle: { batteryVoltage: 11.5 } }, {}).tone, 'danger');
  assert.equal(metrics.resolve('battery', { vehicle: { batteryVoltage: 12.0 } }, {}).tone, 'warn');
});

test('booleans and missing readings read as Russian words, not JSON', () => {
  assert.equal(metrics.resolve('engine', { vehicle: { engine: true } }, {}).value, 'Вкл');
  assert.equal(metrics.resolve('engine', { vehicle: { engine: false } }, {}).value, 'Выкл');
  assert.equal(metrics.resolve('sun', { vehicle: { sun: false } }, {}).value, 'Закрыт');
  assert.equal(metrics.resolve('park', { vehicle: { park: null } }, {}).value, '—');
  assert.equal(metrics.resolve('outTemp', { vehicle: { outTemp: 7.5 } }, {}).value, '7.5°');
});

test('custom slots keep the raw getCarData key and show its first scalar', () => {
  const id = metrics.customId('batteryVoltage');
  assert.equal(id, 'custom:batteryVoltage');
  assert.equal(metrics.isCustom(id), true);
  assert.equal(metrics.isCustom('speed'), false);
  assert.equal(metrics.customKey(id), 'batteryVoltage');
  assert.equal(metrics.customKey('speed'), '');

  const state = { extra: { batteryVoltage: { name: 'batteryVoltage', value: 12.1 } } };
  const tile = metrics.resolve(id, state, {});
  assert.equal(tile.label, 'batteryVoltage');
  assert.equal(tile.value, '12.1');

  assert.equal(metrics.readCustom({ name: 'park', value: true }), 'Да');
  assert.equal(metrics.readCustom({ driverTemp: 21.5, passengerTemp: 22 }), '21.5° / 22°');
  assert.equal(metrics.readCustom({ name: 'all', speed: 42, rpm: 900 }), '42');
  assert.equal(metrics.readCustom({ name: 'nested', value: { a: 1 } }), '—');
  assert.equal(metrics.readCustom({ error: 'unknown_data' }), '—');
  assert.equal(metrics.readCustom(null), '—');
  assert.equal(metrics.resolve(metrics.customId('missing'), { extra: {} }, {}).value, '—');
});
