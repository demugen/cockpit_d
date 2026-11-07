/* Volume control, tested against the real bridge and media modules: the head
   unit has four different ways to refuse a level change, and each of them has
   to end in a visible state instead of a slider that lies about the car. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const UNAUTHORIZED = '{"success":false,"error":"unauthorized"}';

function stand(options) {
  const opts = options || {};
  const sandbox = {
    console, setTimeout, clearInterval, clearTimeout,
    Date, Math, JSON, parseInt, parseFloat, isFinite, String, Number, Array, Object, RegExp, Error
  };
  // media.js keeps a one second ticker running; unreffed, it lets node --test
  // exit once the assertions are done instead of hanging on a live timer.
  sandbox.setInterval = function (fn, ms) {
    const timer = setInterval(fn, ms);
    timer.unref();
    return timer;
  };
  sandbox.window = sandbox;
  // media.js reads document.hidden and subscribes to visibilitychange: the panel
  // must be able to stop polling when it is not on screen.
  const doc = { hidden: false, listeners: [] };
  doc.addEventListener = function (name, fn) {
    if (name === 'visibilitychange') doc.listeners.push(fn);
  };
  sandbox.document = doc;
  vm.createContext(sandbox);
  for (const file of [
    'js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js',
    'js/core/bridge-parse.js', 'js/core/bridge.js', 'js/services/media.js'
  ]) {
    vm.runInContext(readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }

  const host = { level: opts.level === undefined ? 40 : opts.level, steps: [], setvolCalls: 0, getvolCalls: 0, stale: null, lagUntil: 0 };
  const api = { __stub: true };
  const bus = sandbox.App.core.bus;
  // The documented answer for an async request: the call says only whether the
  // request joined the queue, the outcome arrives later as carResponse.
  function answer(requestId, response) {
    setTimeout(() => bus.emit('android:carResponse', { requestId, requestType: 'runEnum', response }), 20);
  }
  if (opts.getvol !== false) {
    api.getvol = function () {
      host.getvolCalls += 1;
      return String(host.lagUntil && Date.now() < host.lagUntil ? host.stale : host.level);
    };
  }
  if (opts.setvol) {
    api.setvol = function (token, value) {
      host.setvolCalls += 1;
      if (!opts.refuseSetvol) host.level = value;
      return opts.refuseSetvol ? UNAUTHORIZED : '';
    };
  }
  if (opts.runEnum !== false) {
    api.requestRunEnumAsync = function (token, id, name) {
      host.steps.push(name);
      if (opts.refuseSteps && (opts.refuseAfter === undefined || host.steps.length > opts.refuseAfter)) {
        return UNAUTHORIZED;
      }
      if (opts.queueFull) return false;
      if (opts.asyncRefusal) {
        answer(id, { error: opts.asyncRefusal });
        return true;
      }
      host.level = Math.max(0, Math.min(100, host.level + (name === 'Volume_Up' ? 1 : -1)));
      if (opts.asyncAnswers) answer(id, { status: 'ok' });
      return true;
    };
    api.runEnum = () => '';
  }
  sandbox.androidApi = api;

  const media = sandbox.App.services.media;
  const events = [];
  sandbox.App.core.bus.on('media:command', (result) => events.push(result));
  media.init();
  media.demand(true);
  return {
    media,
    host,
    state: () => media.state(),
    events,
    hide: function (hidden) {
      doc.hidden = hidden;
      doc.listeners.forEach((fn) => fn());
    }
  };
}

test('exact mode writes the level once and keeps it', async () => {
  const s = stand({ setvol: true });
  assert.equal(s.media.setVolume(60), true);
  assert.equal(s.state().volume, 60);
  assert.equal(s.state().volumeMode, 'exact');
  assert.equal(s.host.setvolCalls, 1);
  assert.equal(s.state().error, null);
});

test('without setvol a drag becomes one command per percent', async () => {
  const s = stand({});
  assert.equal(s.media.setVolume(45), true);
  await wait(700);
  assert.deepEqual(s.host.steps, ['Volume_Up', 'Volume_Up', 'Volume_Up', 'Volume_Up', 'Volume_Up']);
  assert.equal(s.host.level, 45);
  assert.equal(s.state().volume, 45);
  assert.equal(s.state().error, null);
});

test('a step refused on the first command is not reported as success', async () => {
  const s = stand({ refuseSteps: true });
  assert.equal(s.media.setVolume(50), false);
  await wait(400);
  assert.equal(s.state().error, 'unauthorized');
  // the slider goes back to the level the head unit actually has
  assert.equal(s.state().volume, 40);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].ok, false);
  assert.equal(s.events[0].error, 'unauthorized');
});

test('a refusal in the middle of a walk falls back to the host level', async () => {
  const s = stand({ refuseSteps: true, refuseAfter: 12 });
  // the first batch of ten goes through, so the gesture looks accepted
  assert.equal(s.media.setVolume(60), true);
  await wait(600);
  assert.equal(s.host.steps.length, 13);
  assert.equal(s.state().error, 'unauthorized');
  assert.equal(s.state().volume, s.host.level);
  assert.equal(s.events.filter((e) => !e.ok).length, 1);
});

test('a refused setvol is not worked around with steps', async () => {
  const s = stand({ setvol: true, refuseSetvol: true });
  assert.equal(s.media.setVolume(44), false);
  assert.equal(s.state().error, 'unauthorized');
  assert.equal(s.host.steps.length, 0);
  assert.equal(s.state().volume, 40);
});

test('steps cannot be counted without a starting level', async () => {
  const s = stand({ getvol: false });
  assert.equal(s.media.setVolume(50), false);
  assert.equal(s.state().error, 'unknown_level');
  assert.equal(s.host.steps.length, 0);
});

test('no volume bridge at all leaves the control disabled', async () => {
  const s = stand({ runEnum: false, getvol: false });
  assert.equal(s.state().volumeMode, 'none');
  assert.equal(s.media.setVolume(50), false);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].ok, false);
  assert.equal(s.events[0].error, 'unavailable');
});

test('a getvol that lags behind the commit does not drag the slider back', async () => {
  const s = stand({ setvol: true });
  s.media.setVolume(70);
  // the head unit applies 70 but keeps answering with the old level for a while
  s.host.stale = 40;
  s.host.lagUntil = Date.now() + 2200;
  const seen = [];
  const sampler = setInterval(() => seen.push(s.state().volume), 500);
  await wait(4600);
  clearInterval(sampler);
  assert.equal(s.host.level, 70);
  assert.deepEqual([...new Set(seen)], [70]);
});

test('a change made on the head unit is picked up once the commit settles', async () => {
  const s = stand({ setvol: true });
  s.media.setVolume(70);
  await wait(1200);
  s.host.level = 63;
  await wait(3200);
  assert.equal(s.state().volume, 63);
});

/* The shape the published contract actually describes: the queue call answers
   `true`, and the outcome of each step only arrives on carResponse. */
test('a refusal that only arrives on carResponse still corrects the slider', async () => {
  const s = stand({ asyncRefusal: 'license_required' });
  assert.equal(s.media.setVolume(50), true);
  await wait(500);
  assert.equal(s.state().error, 'license_required');
  assert.equal(s.host.level, 40);
  assert.equal(s.state().volume, 40);
  assert.equal(s.events.filter((e) => !e.ok).length, 1);
});

test('an accepted walk that the head unit confirms is not reported as a failure', async () => {
  const s = stand({ asyncAnswers: true });
  assert.equal(s.media.setVolume(45), true);
  await wait(700);
  assert.equal(s.host.level, 45);
  assert.equal(s.state().volume, 45);
  assert.equal(s.state().error, null);
  assert.equal(s.events.filter((e) => !e.ok).length, 0);
});

// `false` from the queue call means the request was not taken at all, which is a
// different answer from a refusal and must not be shown as one.
test('a queue that refuses the request says so without naming a licence', async () => {
  const s = stand({ queueFull: true });
  assert.equal(s.media.setVolume(50), false);
  await wait(400);
  assert.equal(s.state().error, 'rejected');
  assert.equal(s.host.level, 40);
  assert.equal(s.events[0].error, 'rejected');
});

/* The panel is one of several apps on the head unit, so both timers have to be
   quiet when nothing can see them. */
test('unmounting the last media card stops the level poll', async () => {
  const s = stand({});
  await wait(2600);
  const whileMounted = s.host.getvolCalls;
  // one read comes from the mount itself, the rest from the ticker
  assert.ok(whileMounted > 1, `reads while mounted: ${whileMounted}`);
  s.media.demand(false);
  await wait(2600);
  assert.equal(s.host.getvolCalls, whileMounted);
});

test('a walk still in flight is dropped when the card unmounts', async () => {
  const s = stand({});
  assert.equal(s.media.setVolume(80), true);
  s.media.demand(false);
  await wait(700);
  // only the batch already handed to the pump runs, never the remaining 40 steps
  assert.ok(s.host.steps.length <= 10, `steps queued: ${s.host.steps.length}`);
});

test('hiding the panel stops polling and a re-show re-reads the level', async () => {
  const s = stand({});
  s.hide(true);
  await wait(2400);
  s.host.level = 71;
  assert.equal(s.state().volume, 40);
  s.hide(false);
  assert.equal(s.state().volume, 71);
});
