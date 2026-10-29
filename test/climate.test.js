'use strict';

/* The host opens its own climate dialog per command, so adjustments are
   buffered. These tests pin the batching contract without waiting 10 s. */

const test = require('node:test');
const assert = require('node:assert/strict');

function harness() {
  const utils = require('../js/core/utils.js');
  const commands = [];
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
  return { service, commands, events, read };
}

function tempCommands(commands) {
  return commands.filter((entry) => entry.cmd === 'climate_set_temperature');
}

test('temperature taps wait in the buffer and leave as one final command', () => {
  const h = harness();
  assert.equal(h.service.setTemperature(1, 1), true);
  assert.equal(h.service.setTemperature(1, 1), true);
  assert.equal(h.service.setTemperature(1, 1), true);

  assert.deepEqual(h.commands, [], 'nothing may reach the host before the pause');
  assert.equal(h.service.state().queueCount, 1);
  assert.equal(h.service.state().driverTemperature, 25);
  assert.equal(h.service.state().pending.driverTemperature.queued, true);

  const queueEvents = h.events.filter((event) => event.name === 'climate:queue');
  assert.equal(queueEvents.length, 3, 'every tap refreshes the countdown');
  assert.equal(queueEvents[0].payload.fresh, true);
  assert.equal(queueEvents[2].payload.fresh, false);
  assert.equal(queueEvents[2].payload.count, 1);
  assert.equal(queueEvents[2].payload.delay, 10);

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

test('mode toggles go out immediately and stay out of the buffer', () => {
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
