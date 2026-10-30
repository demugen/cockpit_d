'use strict';

/* A burst of climate taps leaves as one command with the final value, and the
   panel never presses a system action of its own. These tests pin both
   contracts without waiting for the real timers. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

function harness() {
  const utils = require('../js/core/utils.js');
  const commands = [];
  const enums = [];
  const events = [];
  const read = {
    available: true,
    power: true,
    ac: false,
    auto: true,
    sync: false,
    recirculation: false,
    frontDefrost: false,
    rearDefrost: false,
    frontGlassHeat: false,
    steeringWheelHeat: false,
    fanSpeed: 3,
    airMode: 1,
    driverTemperature: 22,
    passengerTemperature: 22,
    driverSeatHeat: 0,
    driverSeatVent: 0,
    passengerSeatHeat: 0,
    passengerSeatVent: 0
  };
  const bridge = {
    command(message) {
      commands.push(Object.assign({}, message));
      if (message.cmd === 'climate_get_state') return Object.assign({ success: true }, read);
      return { success: true };
    },
    runEnum(name) {
      enums.push(name);
      return { ok: true, error: null };
    }
  };
  global.window = global;
  global.App = {
    core: {
      utils: utils,
      bridge: bridge,
      bus: { emit(name, payload) { events.push({ name, payload }); } }
    },
    services: {},
    widgets: {},
    ui: {}
  };
  delete require.cache[require.resolve('../js/services/climate.js')];
  require('../js/services/climate.js');
  const service = global.App.services.climate;
  service.refresh();
  commands.length = 0;
  return { service, commands, enums, events, read };
}

function tempCommands(commands) {
  return commands.filter((entry) => entry.cmd === 'climate_set_temperature');
}

test('temperature taps wait for a short pause and leave as one final command', () => {
  const h = harness();
  assert.equal(h.service.setTemperature(1, 1), true);
  assert.equal(h.service.setTemperature(1, 1), true);
  assert.equal(h.service.setTemperature(1, 1), true);

  assert.deepEqual(h.commands, [], 'nothing may reach the host before the pause');
  assert.equal(h.service.state().queueCount, 1);
  assert.equal(h.service.state().driverTemperature, 25);
  assert.equal(h.service.state().pending.driverTemperature.queued, true);

  h.service.flush();
  assert.deepEqual(tempCommands(h.commands), [
    { cmd: 'climate_set_temperature', zone: 1, value: 25 }
  ]);
  assert.equal(h.service.state().queueCount, 0);
  assert.equal(h.service.state().pending.driverTemperature.queued, false);
});

test('a half-degree host reading snaps to whole degrees on the next tap', () => {
  const h = harness();
  h.read.driverTemperature = 21.5;
  h.service.refresh();
  assert.equal(h.service.setTemperature(1, 1), true);
  assert.equal(h.service.state().driverTemperature, 23, 'displayed 22 + 1 step');
  h.service.flush();
  assert.deepEqual(tempCommands(h.commands), [
    { cmd: 'climate_set_temperature', zone: 1, value: 23 }
  ]);
});

test('sync moves both zones and sends two ordered commands in one batch', () => {
  const h = harness();
  assert.equal(h.service.toggle('sync'), true);
  h.commands.length = 0;

  assert.equal(h.service.setTemperature(1, 1), true);
  assert.equal(h.service.state().driverTemperature, 23);
  assert.equal(h.service.state().passengerTemperature, 23);
  assert.deepEqual(h.commands, []);
  assert.equal(h.service.state().queueCount, 1);

  h.service.flush();
  assert.deepEqual(tempCommands(h.commands), [
    { cmd: 'climate_set_temperature', zone: 1, value: 23 },
    { cmd: 'climate_set_temperature', zone: 2, value: 23 }
  ]);
});

test('mode toggles go out immediately and stay out of the batch', () => {
  const h = harness();
  assert.equal(h.service.toggle('auto'), true);
  assert.equal(h.service.state().queueCount, 0);
  assert.equal(h.commands.filter((entry) => entry.cmd === 'climate_set_auto').length, 1);
});

test('different controls keep their own batch and send in order', () => {
  const h = harness();
  assert.equal(h.service.setTemperature(2, -1), true);
  assert.equal(h.service.setFanSpeed(1), true);
  assert.deepEqual(h.commands, []);
  assert.equal(h.service.state().queueCount, 2);

  h.service.flush();
  const sent = h.commands.map((entry) => entry.cmd);
  assert.deepEqual(sent, ['climate_set_temperature', 'climate_set_fan_speed']);
  assert.deepEqual(h.commands[0], { cmd: 'climate_set_temperature', zone: 2, value: 21 });
  assert.deepEqual(h.commands[1], { cmd: 'climate_set_fan_speed', value: 4 });
});

test('the panel never presses a system action of its own', () => {
  const h = harness();
  assert.equal(h.service.setTemperature(1, 1), true);
  h.service.flush();
  assert.deepEqual(h.enums, [], 'the removed GLOBAL_BACK workaround stays removed');
});

/* Fake timers pin the batch window itself: 2 s of quiet, 4 s from the first
   tap. The harness drives the same setTimeout the service arms. */

function clock(t) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  return harness();
}

test('the batch waits two seconds after the last tap', (t) => {
  const h = clock(t);
  assert.equal(h.service.setTemperature(1, 1), true);
  mock.timers.tick(1999);
  assert.deepEqual(h.commands, [], 'one millisecond short of the pause sends nothing');

  assert.equal(h.service.setTemperature(1, 1), true);
  mock.timers.tick(1999);
  assert.deepEqual(h.commands, [], 'a new tap restarts the whole pause');

  mock.timers.tick(1);
  assert.deepEqual(tempCommands(h.commands), [
    { cmd: 'climate_set_temperature', zone: 1, value: 24 }
  ], 'both taps leave as one command with the final value');
});

test('a burst that never pauses stops at the four second cap', (t) => {
  const h = clock(t);
  assert.equal(h.service.setTemperature(1, 1), true);
  for (let tap = 0; tap < 3; tap += 1) {
    mock.timers.tick(1000);
    assert.equal(h.service.setTemperature(1, 1), true);
  }
  assert.deepEqual(h.commands, [], 'taps every second keep the batch waiting');

  mock.timers.tick(1000);
  assert.deepEqual(tempCommands(h.commands), [
    { cmd: 'climate_set_temperature', zone: 1, value: 26 }
  ], 'four seconds after the first tap the last value goes out');
});
