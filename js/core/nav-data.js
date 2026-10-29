/* Pure navigation helpers: HUD maneuver codes, GPS levels, navigator lookup.
   Android payloads are untrusted and may be numbers, strings or empty. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.navData = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Codes from the JCT HUD table. Fork and sharp turns share the arrow
  // direction; the label still tells them apart for screen readers.
  var MANEUVERS = {
    2: { icon: 'nav-left', label: 'Поворот налево' },
    3: { icon: 'nav-right', label: 'Поворот направо' },
    4: { icon: 'nav-left', label: 'Съезд налево' },
    5: { icon: 'nav-right', label: 'Съезд направо' },
    6: { icon: 'nav-left', label: 'Резкий поворот налево' },
    7: { icon: 'nav-right', label: 'Резкий поворот направо' },
    8: { icon: 'nav-uturn', label: 'Разворот налево' },
    19: { icon: 'nav-uturn', label: 'Разворот направо' },
    9: { icon: 'nav-straight', label: 'Движение прямо' },
    24: { icon: 'nav-roundabout', label: 'Въезд на круговое движение' },
    55: { icon: 'nav-roundabout', label: 'Выезд с кругового движения' },
    15: { icon: 'nav-finish', label: 'Финиш маршрута' },
    49: { icon: 'nav-ferry', label: 'Паром' },
    14: { icon: 'nav-camera', label: 'Камера' }
  };

  var NAV_PACKAGES = [
    'ru.yandex.yandexnavi',
    'ru.yandex.yandexmaps',
    'ru.yandex.maps',
    'ru.2gis',
    'com.navitel',
    'com.google.android.apps.maps'
  ];

  var NAME_PATTERN = /навиг|navi|карт|maps|2гис|2gis/i;

  function toNumber(value) {
    var number = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(number) ? number : null;
  }

  function distance(value) {
    var number = toNumber(value);
    if (number === null || number < 0) return null;
    return Math.round(number);
  }

  function integer(value, min, max) {
    var number = toNumber(value);
    if (number === null) return null;
    number = Math.round(number);
    return number < min || number > max ? null : number;
  }

  function text(value, limit) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, limit || 120);
  }

  function maneuver(code) {
    var key = integer(code, 0, 999);
    return MANEUVERS[key] || { icon: 'nav-straight', label: 'Манёвр' };
  }

  // Levels exactly as documented: 0 is a visible weak signal, null hides
  // the indicator entirely.
  function gpsLevel(value) {
    var number = toNumber(value);
    if (number === null) return null;
    if (number < 14) return 0;
    if (number < 30) return 1;
    if (number < 50) return 2;
    if (number < 70) return 3;
    if (number < 80) return 4;
    return 5;
  }

  function parseGps(data) {
    var source = data && typeof data === 'object' ? data.updateSignalQuality : data;
    var number = toNumber(source);
    if (number === null) return null;
    return Math.round(Math.min(100, Math.max(0, number)));
  }

  function parseHud(data) {
    if (!data || typeof data !== 'object') return null;
    var sender = String(data.hudSenderType || '').toUpperCase();
    if (sender !== 'NAVI' && sender !== 'ARAD') return null;

    var patch = { speedLimit: integer(data.speedLimit, 1, 300) };
    if (sender === 'ARAD') return { type: 'ARAD', patch: patch };

    patch.naviOn = data.naviOn === true;
    patch.turnType = integer(data.turnType, 0, 999);
    patch.turnDist = distance(data.turnDist);
    patch.remainDist = distance(data.remainDist);
    patch.nextRoad = text(data.nextRoad, 80);
    return { type: 'NAVI', patch: patch };
  }

  function findNavApp(apps) {
    if (!Array.isArray(apps) || !apps.length) return null;
    var byPackage = {};
    apps.forEach(function (app) {
      if (app && app.package) byPackage[app.package] = app;
    });
    for (var i = 0; i < NAV_PACKAGES.length; i += 1) {
      if (byPackage[NAV_PACKAGES[i]]) return byPackage[NAV_PACKAGES[i]];
    }
    for (var j = 0; j < apps.length; j += 1) {
      if (apps[j] && apps[j].package && NAME_PATTERN.test(String(apps[j].name || ''))) return apps[j];
    }
    return null;
  }

  return {
    MANEUVERS: MANEUVERS,
    NAV_PACKAGES: NAV_PACKAGES,
    maneuver: maneuver,
    gpsLevel: gpsLevel,
    parseGps: parseGps,
    parseHud: parseHud,
    findNavApp: findNavApp
  };
});
