'use strict';

/* The nav service keeps one route state, follows widget demand for the map
   subscription and never lets a radar alert erase the maneuver. */

const test = require('node:test');
const assert = require('node:assert/strict');

function harness() {
  global.window = global;
  delete require.cache[require.resolve('../js/core/bridge-parse.js')];
  delete require.cache[require.resolve('../js/core/nav-data.js')];
  const parse = require('../js/core/bridge-parse.js');
  const navData = require('../js/core/nav-data.js');

  const handlers = {};
  const events = [];
  const calls = { subscribe: 0, unsubscribe: 0, themes: [], run: [] };
  const bridge = {
    subscribeResult: { ok: true },
    runResult: { ok: true },
    subscribeMiniMap() {
      calls.subscribe += 1;
      return bridge.subscribeResult;
    },
    unsubscribeMiniMap() {
      calls.unsubscribe += 1;
      return { ok: true };
    },
    setMiniMapTheme(mode) {
      calls.themes.push(mode);
      return { ok: true };
    },
    runApp(pkg) {
      calls.run.push(pkg);
      return bridge.runResult;
    }
  };
  const bus = {
    on(name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
    }
  };
  const appList = { list: [] };
  const apps = {
    state() {
      return { apps: appList.list };
    }
  };

  global.App = {
    core: { bus, bridge, bridgeParse: parse, navData },
    services: { apps },
    widgets: {},
    ui: {}
  };
  delete require.cache[require.resolve('../js/services/nav.js')];
  require('../js/services/nav.js');
  const service = global.App.services.nav;
  service.init();

  function send(name, payload) {
    (handlers[name] || []).forEach((fn) => fn(payload));
  }

  return { service, bridge, calls, events, send, appList, services: global.App.services };
}

test('the map subscription follows demand and starts in the night theme', () => {
  const h = harness();
  h.service.demand(true);
  h.service.demand(true);
  assert.equal(h.calls.subscribe, 1, 'two widgets share one subscription');
  assert.deepEqual(h.calls.themes, ['night']);
  assert.equal(h.service.state().subscribed, true);

  h.service.demand(false);
  assert.equal(h.calls.unsubscribe, 0, 'still on demand');
  h.service.demand(false);
  assert.equal(h.calls.unsubscribe, 1);
  assert.equal(h.service.state().subscribed, false);
  assert.equal(h.service.state().frame, '');
});

test('a rejected subscription is reported instead of pretended', () => {
  const h = harness();
  h.bridge.subscribeResult = { ok: false, error: 'unauthorized' };
  h.service.demand(true);
  assert.equal(h.service.state().subscribed, false);
  assert.equal(h.service.state().mapError, 'unauthorized');
  assert.equal(h.calls.unsubscribe, 0);

  h.bridge.subscribeResult = { ok: true };
  h.service.demand(true);
  assert.equal(h.service.state().subscribed, true);
  assert.equal(h.service.state().mapError, null);
});

test('a rejected subscription is retried on a settings change', () => {
  const h = harness();
  h.bridge.subscribeResult = { ok: false, error: 'unavailable' };
  h.service.demand(true);
  assert.equal(h.calls.subscribe, 1);

  h.bridge.subscribeResult = { ok: true };
  h.send('settings:change');
  assert.equal(h.calls.subscribe, 2, 'the user action gives the host another chance');
  assert.equal(h.service.state().subscribed, true);
});

test('the map theme follows the app theme while subscribed', () => {
  const h = harness();
  h.service.demand(true);
  global.document = { documentElement: { getAttribute: () => 'light' } };
  try {
    h.send('settings:change');
    assert.deepEqual(h.calls.themes, ['night', 'day']);
    h.send('settings:change');
    assert.equal(h.calls.themes.length, 2, 'the same theme is not re-sent');
  } finally {
    delete global.document;
  }
});

test('the map reads the chosen theme even before the DOM is updated', () => {
  const h = harness();
  // The shell applies data-theme in its own listener, which may run after this
  // one; the settings state is already current at that point.
  global.document = { documentElement: { getAttribute: () => 'dark' } };
  const settings = { theme: 'light' };
  settings.get = () => ({ theme: settings.theme });
  settings.isReady = () => true;
  h.services.settings = settings;
  try {
    h.service.demand(true);
    assert.deepEqual(h.calls.themes, ['day']);
    settings.theme = 'dark';
    h.send('settings:change');
    assert.deepEqual(h.calls.themes, ['day', 'night']);
  } finally {
    delete global.document;
    delete h.services.settings;
  }
});

test('NAVI HUD drives the whole route card', () => {
  const h = harness();
  h.send('android:hud', {
    hudSenderType: 'NAVI',
    naviOn: true,
    turnType: 3,
    turnDist: 650,
    remainDist: 12400,
    nextRoad: 'Ленинградский проспект',
    speedLimit: 60
  });
  const state = h.service.state();
  assert.equal(state.routeKnown, true);
  assert.equal(state.naviOn, true);
  assert.equal(state.turnType, 3);
  assert.equal(state.turnDist, 650);
  assert.equal(state.remainDist, 12400);
  assert.equal(state.nextRoad, 'Ленинградский проспект');
  assert.equal(state.speedLimit, 60);
  assert.equal(h.events.filter((event) => event.name === 'nav:change').length, 1);
});

test('an ARAD alert refreshes the limit without touching the route', () => {
  const h = harness();
  h.send('android:hud', { hudSenderType: 'NAVI', naviOn: true, turnType: 2, turnDist: 300, remainDist: 8000, nextRoad: 'МКАД' });
  h.send('android:hud', { hudSenderType: 'ARAD', speedLimit: 40 });
  const state = h.service.state();
  assert.equal(state.speedLimit, 40);
  assert.equal(state.turnType, 2, 'the maneuver survives a radar alert');
  assert.equal(state.turnDist, 300);
  assert.equal(state.remainDist, 8000);
  assert.equal(state.naviOn, true);
});

test('an ARAD alert without a usable limit changes nothing', () => {
  const h = harness();
  h.send('android:hud', { hudSenderType: 'NAVI', naviOn: true, speedLimit: 60, turnType: 2 });
  const before = h.events.length;
  h.send('android:hud', { hudSenderType: 'ARAD', speedLimit: 0 });
  assert.equal(h.service.state().speedLimit, 60);
  assert.equal(h.events.length, before, 'no change, no repaint');
});

test('switching naviOn off clears the maneuver fields', () => {
  const h = harness();
  h.send('android:hud', { hudSenderType: 'NAVI', naviOn: true, turnType: 5, turnDist: 200, remainDist: 500, nextRoad: 'Тверская' });
  h.send('android:hud', { hudSenderType: 'NAVI', naviOn: false, turnType: 3, turnDist: 100, remainDist: 50, nextRoad: 'Арбат' });
  const state = h.service.state();
  assert.equal(state.routeKnown, true);
  assert.equal(state.naviOn, false);
  assert.equal(state.turnType, null, 'a stale turn must not stay on screen');
  assert.equal(state.turnDist, null);
  assert.equal(state.remainDist, null);
  assert.equal(state.nextRoad, '');
});

test('map frames are normalized and unsafe images are dropped', () => {
  const h = harness();
  h.service.demand(true);
  h.send('android:miniMapFrame', { image: 'iVBORw0KGgoAAAANSUhEUg', timestamp: '1700000000000' });
  assert.equal(h.service.state().frame, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg');
  assert.equal(h.service.state().frameAt, 1700000000000);

  const kept = h.service.state().frame;
  h.send('android:miniMapFrame', { image: 'javascript:alert(1)' });
  assert.equal(h.service.state().frame, kept, 'javascript: must never reach the img');
  h.send('android:miniMapFrame', { image: 'data:text/html;base64,AAAA' });
  assert.equal(h.service.state().frame, kept);
  h.send('android:miniMapFrame', null);
  assert.equal(h.service.state().frame, kept);
});

test('frames left in the host queue after unsubscribe are dropped', () => {
  const h = harness();
  h.service.demand(true);
  h.service.demand(false);
  const before = h.events.length;
  h.send('android:miniMapFrame', { image: 'iVBORw0KGgoAAAANSUhEUg' });
  assert.equal(h.service.state().frame, '');
  assert.equal(h.events.length, before, 'nothing to repaint while unsubscribed');
});

test('GPS quality changes repaint only when the value changes', () => {
  const h = harness();
  h.send('android:GPSSignalQuality', 20);
  assert.equal(h.service.state().gps, 20);
  const before = h.events.length;
  h.send('android:GPSSignalQuality', { updateSignalQuality: 20 });
  assert.equal(h.events.length, before);
  h.send('android:GPSSignalQuality', { updateSignalQuality: 74 });
  assert.equal(h.service.state().gps, 74);
});

test('launching uses the found navigator package', () => {
  const h = harness();
  h.appList.list = [
    { package: 'com.example.radio', name: 'Радио' },
    { package: 'ru.2gis', name: '2ГИС' }
  ];
  assert.equal(h.service.currentApp().package, 'ru.2gis');
  assert.equal(h.service.launch(), true);
  assert.deepEqual(h.calls.run, ['ru.2gis']);
  const launch = h.events.filter((event) => event.name === 'nav:launch');
  assert.deepEqual(launch[0].payload, { ok: true, package: 'ru.2gis', name: '2ГИС', error: null });
});

test('launch reports a missing navigator and a host refusal', () => {
  const h = harness();
  assert.equal(h.service.launch(), false);
  assert.deepEqual(h.calls.run, []);
  assert.deepEqual(h.events.filter((event) => event.name === 'nav:launch')[0].payload, { ok: false, error: 'not_found' });

  h.appList.list = [{ package: 'ru.2gis', name: '2ГИС' }];
  h.bridge.runResult = { ok: false, error: 'denied' };
  assert.equal(h.service.launch(), false);
  assert.deepEqual(h.events.filter((event) => event.name === 'nav:launch')[1].payload, {
    ok: false,
    package: 'ru.2gis',
    name: '2ГИС',
    error: 'denied'
  });
});
