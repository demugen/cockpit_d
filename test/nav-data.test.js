'use strict';

/* HUD and GPS payloads come straight from Android and may be numbers, strings
   or half-filled objects. These helpers are the only place that trusts them. */

const test = require('node:test');
const assert = require('node:assert/strict');
const navData = require('../js/core/nav-data.js');

test('maneuver codes map to the documented arrows', () => {
  assert.equal(navData.maneuver(2).icon, 'nav-left');
  assert.equal(navData.maneuver(3).icon, 'nav-right');
  assert.equal(navData.maneuver(4).icon, 'nav-left');
  assert.equal(navData.maneuver(5).icon, 'nav-right');
  assert.equal(navData.maneuver(6).icon, 'nav-left');
  assert.equal(navData.maneuver(7).icon, 'nav-right');
  assert.equal(navData.maneuver(8).icon, 'nav-uturn');
  assert.equal(navData.maneuver(19).icon, 'nav-uturn');
  assert.equal(navData.maneuver(9).icon, 'nav-straight');
  assert.equal(navData.maneuver(24).icon, 'nav-roundabout');
  assert.equal(navData.maneuver(55).icon, 'nav-roundabout');
  assert.equal(navData.maneuver(15).icon, 'nav-finish');
  assert.equal(navData.maneuver(49).icon, 'nav-ferry');
  assert.equal(navData.maneuver(14).icon, 'nav-camera');
  assert.equal(navData.maneuver(6).label, 'Резкий поворот налево');
  assert.equal(navData.maneuver(55).label, 'Выезд с кругового движения');
});

test('unknown and malformed maneuvers fall back to a straight arrow', () => {
  [42, null, undefined, 'abc', -1, 1000, {}].forEach((code) => {
    const maneuver = navData.maneuver(code);
    assert.equal(maneuver.icon, 'nav-straight');
    assert.equal(maneuver.label, 'Манёвр');
  });
  assert.equal(navData.maneuver('3').icon, 'nav-right');
  assert.equal(navData.maneuver(2.4).icon, 'nav-left');
});

test('GPS quality follows the documented levels', () => {
  assert.equal(navData.gpsLevel(null), null);
  assert.equal(navData.gpsLevel(undefined), null);
  assert.equal(navData.gpsLevel('abc'), null);
  assert.equal(navData.gpsLevel(0), 0);
  assert.equal(navData.gpsLevel(13), 0);
  assert.equal(navData.gpsLevel(14), 1);
  assert.equal(navData.gpsLevel(29), 1);
  assert.equal(navData.gpsLevel(30), 2);
  assert.equal(navData.gpsLevel(49), 2);
  assert.equal(navData.gpsLevel(50), 3);
  assert.equal(navData.gpsLevel(69), 3);
  assert.equal(navData.gpsLevel(70), 4);
  assert.equal(navData.gpsLevel(79), 4);
  assert.equal(navData.gpsLevel(80), 5);
  assert.equal(navData.gpsLevel(100), 5);
  assert.equal(navData.gpsLevel('62'), 3);
});

test('GPS payloads accept the wrapped form and clamp to percent', () => {
  assert.equal(navData.parseGps({ updateSignalQuality: '62' }), 62);
  assert.equal(navData.parseGps(55), 55);
  assert.equal(navData.parseGps(1000), 100);
  assert.equal(navData.parseGps(-5), 0);
  assert.equal(navData.parseGps(null), null);
  assert.equal(navData.parseGps({}), null);
});

test('NAVI HUD patches are sanitized field by field', () => {
  const parsed = navData.parseHud({
    hudSenderType: 'navi',
    naviOn: true,
    turnType: '3',
    turnDist: 650.4,
    remainDist: 12400,
    nextRoad: '  Ленинградский   проспект ',
    speedLimit: 60
  });
  assert.equal(parsed.type, 'NAVI');
  assert.deepEqual(parsed.patch, {
    speedLimit: 60,
    naviOn: true,
    turnType: 3,
    turnDist: 650,
    remainDist: 12400,
    nextRoad: 'Ленинградский проспект'
  });
});

test('NAVI HUD drops impossible values instead of inventing them', () => {
  const parsed = navData.parseHud({
    hudSenderType: 'NAVI',
    naviOn: 'true',
    turnType: 1200,
    turnDist: -20,
    remainDist: 'nope',
    nextRoad: '   ',
    speedLimit: 0
  });
  assert.equal(parsed.patch.naviOn, false, 'only a real boolean turns the route on');
  assert.equal(parsed.patch.turnType, null);
  assert.equal(parsed.patch.turnDist, null);
  assert.equal(parsed.patch.remainDist, null);
  assert.equal(parsed.patch.nextRoad, '');
  assert.equal(parsed.patch.speedLimit, null);
});

test('road names stop at eighty characters', () => {
  const parsed = navData.parseHud({ hudSenderType: 'NAVI', naviOn: true, nextRoad: 'А'.repeat(120) });
  assert.equal(parsed.patch.nextRoad.length, 80);
});

test('ARAD alerts carry only the speed limit', () => {
  const parsed = navData.parseHud({ hudSenderType: 'ARAD', speedLimit: '40', turnType: 3, nextRoad: 'МКАД' });
  assert.deepEqual(parsed, { type: 'ARAD', patch: { speedLimit: 40 } });
  assert.equal(navData.parseHud({ hudSenderType: 'ARAD', turnType: 3 }).patch.speedLimit, null);
});

test('unknown senders and empty payloads are ignored', () => {
  assert.equal(navData.parseHud(null), null);
  assert.equal(navData.parseHud('NAVI'), null);
  assert.equal(navData.parseHud({ hudSenderType: 'MEDIA', turnType: 3 }), null);
  assert.equal(navData.parseHud({ turnType: 3 }), null);
});

test('the navigator is found by package first, then by name', () => {
  const apps = [
    { package: 'com.example.radio', name: 'Радио' },
    { package: 'ru.2gis', name: '2ГИС' },
    { package: 'ru.yandex.yandexnavi', name: 'Яндекс Навигатор' }
  ];
  assert.equal(navData.findNavApp(apps).package, 'ru.yandex.yandexnavi');
  assert.equal(navData.findNavApp(apps.slice(0, 2)).package, 'ru.2gis');
  assert.equal(navData.findNavApp([{ package: 'com.custom.maps', name: 'Мои Карты' }]).package, 'com.custom.maps');
  assert.equal(navData.findNavApp([{ package: 'com.example.radio', name: 'Радио' }]), null);
  assert.equal(navData.findNavApp([]), null);
  assert.equal(navData.findNavApp(null), null);
  assert.equal(navData.findNavApp([null, { name: 'Навигатор без пакета' }]), null);
});
