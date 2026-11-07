/* Mini-map lifecycle: subscription budget, background pause, frame shapes.
   The bridge and the bus are the real modules; only the head unit is faked. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DATA = 'data:image/jpeg;base64,/9j/AAAA';
const LICENSE = { success: false, error: 'license_required' };

function stand(options) {
  const opts = options || {};
  const sandbox = {
    console, setTimeout, clearInterval, clearTimeout,
    Date, Math, JSON, parseInt, parseFloat, isFinite, String, Number, Array, Object, RegExp, Error
  };
  // The watchdog runs for the whole session; unreffed, it does not keep
  // `node --test` alive once the assertions are done.
  sandbox.setInterval = function (fn, ms) {
    const timer = setInterval(fn, ms);
    timer.unref();
    return timer;
  };
  sandbox.window = sandbox;
  sandbox.ANDROID_TOKEN = 'test-token';
  const doc = {
    hidden: false,
    listeners: [],
    documentElement: { theme: '', getAttribute: function (name) { return name === 'data-theme' ? this.theme : null; } }
  };
  doc.addEventListener = function (name, fn) {
    if (name === 'visibilitychange') doc.listeners.push(fn);
  };
  sandbox.document = doc;
  sandbox.matchMedia = function () {
    return { matches: false, addEventListener: function () {}, addListener: function () {} };
  };
  vm.createContext(sandbox);
  for (const file of [
    'js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js',
    'js/core/bridge-parse.js', 'js/core/bridge.js', 'js/core/nav-data.js',
    'js/services/nav.js'
  ]) {
    vm.runInContext(readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }

  const settingsState = { theme: opts.theme || 'dark' };
  sandbox.App.services.settings = {
    get: () => settingsState,
    isReady: () => true
  };
  sandbox.App.services.apps = {
    state: () => ({ apps: opts.apps || [] })
  };

  const host = { subscribes: 0, unsubscribes: 0, themes: [], apps: [] };
  const api = { __stub: true };
  if (opts.subscribe !== false) {
    api.subscribeMiniMap = function () {
      host.subscribes += 1;
      if (typeof opts.subscribeReply === 'function') return opts.subscribeReply(host.subscribes);
      return undefined;
    };
  }
  api.unsubscribeMiniMap = function () {
    host.unsubscribes += 1;
    return undefined;
  };
  api.setMiniMapTheme = function (token, mode) {
    host.themes.push(mode);
    return undefined;
  };
  if (opts.runApp) {
    api.runApp = function () { return opts.runApp; };
  }
  sandbox.androidApi = api;

  const nav = sandbox.App.services.nav;
  nav.init();
  return {
    nav,
    host,
    doc,
    bus: sandbox.App.core.bus,
    settings: settingsState,
    state: () => nav.state(),
    hide: function (hidden) {
      doc.hidden = hidden;
      doc.listeners.forEach((fn) => fn());
    }
  };
}

test('a rejected subscription stops after the retry budget', async () => {
  const s = stand({ subscribeReply: () => LICENSE });
  s.nav.demand(true);
  assert.equal(s.state().mapStatus, 'rejected');
  await wait(1400);
  assert.equal(s.state().mapStatus, 'blocked');
  // the first attempt plus MAX_RECONNECTS retries
  assert.equal(s.host.subscribes, 5, `subscribe calls: ${s.host.subscribes}`);
  await wait(700);
  assert.equal(s.host.subscribes, 5, 'a blocked map is not retried by the watchdog');
  s.nav.demand(false);
  assert.equal(s.state().mapStatus, 'idle');
});

test('a manual retry resets the budget burnt by rejections', async () => {
  let reply = () => LICENSE;
  const s = stand({ subscribeReply: () => reply() });
  s.nav.demand(true);
  await wait(1400);
  assert.equal(s.state().mapStatus, 'blocked');
  reply = () => undefined;
  s.nav.resubscribe();
  assert.equal(s.state().subscribed, true);
  assert.equal(s.state().mapStatus, 'waiting');
  s.bus.emit('android:miniMapFrame', { image: DATA });
  assert.equal(s.state().mapStatus, 'live');
  assert.equal(s.state().frame, DATA);
  s.nav.demand(false);
});

test('a hidden panel unsubscribes and a re-show subscribes again', async () => {
  const s = stand({});
  s.nav.demand(true);
  assert.equal(s.host.subscribes, 1);
  s.hide(true);
  assert.equal(s.host.unsubscribes, 1);
  assert.equal(s.state().subscribed, false);
  await wait(300);
  assert.equal(s.host.subscribes, 1, 'nothing is subscribed while hidden');
  s.hide(false);
  assert.equal(s.host.subscribes, 2);
  assert.equal(s.state().subscribed, true);
  s.nav.demand(false);
});

test('frames arrive as an object, a JSON string or a bare data URL', () => {
  const s = stand({});
  s.nav.demand(true);
  const shapes = [
    { image: DATA },
    { src: DATA },
    { frame: DATA },
    { image: DATA, timestamp: 123 },
    JSON.stringify({ image: DATA }),
    DATA
  ];
  shapes.forEach((shape) => {
    s.bus.emit('android:miniMapFrame', shape);
    assert.equal(s.state().frame, DATA);
    assert.equal(s.state().mapStatus, 'live');
  });
  s.nav.demand(false);
});

test('a stalled stream reconnects once and then waits for the retry', async () => {
  const s = stand({});
  s.nav.demand(true);
  s.bus.emit('android:miniMapFrame', { image: DATA });
  // Pretend the last frame is older than STALL_MS; the next watchdog tick
  // has to treat the stream as lost.
  s.state().receivedAt = Date.now() - 11000;
  await wait(2800);
  assert.equal(s.state().reconnectFailures, 1);
  assert.ok(s.host.unsubscribes >= 1);
  await wait(400);
  assert.ok(s.host.subscribes >= 2, `subscribe calls: ${s.host.subscribes}`);
  s.nav.demand(false);
});

test('HUD flags the route when the host sends 1 or "true"', () => {
  const s = stand({});
  s.bus.emit('android:hud', {
    hudSenderType: 'NAVI', naviOn: 1, turnType: 2,
    turnDist: 120, remainDist: 900, nextRoad: 'Ленина'
  });
  assert.equal(s.state().naviOn, true);
  assert.equal(s.state().turnType, 2);
  s.bus.emit('android:hud', { hudSenderType: 'NAVI', naviOn: 'true', nextRoad: 'Мира' });
  assert.equal(s.state().naviOn, true);
  s.bus.emit('android:hud', { hudSenderType: 'NAVI', naviOn: 'false' });
  assert.equal(s.state().naviOn, false);
});

test('the mini-map follows the applied theme in auto mode', () => {
  const s = stand({ theme: 'auto' });
  s.doc.documentElement.theme = 'light';
  s.nav.demand(true);
  // themeName reads the resolved data-theme for "auto", so the host's light
  // theme reaches setMiniMapTheme as "day".
  assert.deepEqual(s.host.themes, ['day']);
  s.doc.documentElement.theme = 'dark';
  s.bus.emit('theme:change', { theme: 'dark', source: 'host' });
  assert.deepEqual(s.host.themes, ['day', 'night']);
  s.nav.demand(false);
});
