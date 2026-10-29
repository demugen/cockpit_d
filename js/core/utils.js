/* Pure helpers. No DOM, no storage: safe to require from node:test. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.utils = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var TANK_LITERS = { min: 20, max: 150, step: 1, fallback: 55 };

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function toNumber(value, fallback) {
    var number = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function firstDefined() {
    for (var i = 0; i < arguments.length; i += 1) {
      if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
    }
    return undefined;
  }

  function safeJson(raw, fallback) {
    if (typeof raw === 'string') {
      var trimmed = raw.trim();
      if (!trimmed) return fallback;
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        return fallback;
      }
    }
    return raw === undefined || raw === null ? fallback : raw;
  }

  function clone(value) {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(target, patch) {
    var result = isPlainObject(target) ? clone(target) : {};
    if (!isPlainObject(patch)) return result;
    Object.keys(patch).forEach(function (key) {
      var value = patch[key];
      if (value === undefined) return;
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = clone(value);
      }
    });
    return result;
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function formatTime(date, withSeconds) {
    var text = pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    if (withSeconds) text += ':' + pad2(date.getSeconds());
    return text;
  }

  function formatDate(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ', ' + WEEKDAYS[date.getDay()];
  }

  function formatWeekday(date) {
    return WEEKDAYS[date.getDay()];
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Math.round(toNumber(seconds, 0)));
    var minutes = Math.floor(total / 60);
    return minutes + ':' + pad2(total % 60);
  }

  function formatTemperature(value, fallback) {
    var number = toNumber(value, NaN);
    if (!isFiniteNumber(number)) return fallback === undefined ? '—' : fallback;
    return (Math.round(number * 10) / 10).toFixed(number % 1 === 0 ? 0 : 1) + '°';
  }

  // HUD distances are meters: below a kilometer they stay whole meters, above
  // they shrink to one decimal with a Russian comma.
  function formatDistance(value, fallback) {
    var number = toNumber(value, null);
    if (number === null || number < 0) return fallback === undefined ? '—' : fallback;
    if (number < 1000) return Math.round(number) + ' м';
    var km = number / 1000;
    var text = km >= 10
      ? String(Math.round(km))
      : (Math.round(km * 10) / 10).toFixed(1).replace('.', ',');
    if (text.length > 2 && text.slice(-2) === ',0') text = text.slice(0, -2);
    return text + ' км';
  }

  function tankVolume(value) {
    return clamp(Math.round(toNumber(value, TANK_LITERS.fallback)), TANK_LITERS.min, TANK_LITERS.max);
  }

  function fuelLiters(percent, tank) {
    var share = toNumber(percent, null);
    if (share === null) return null;
    return Math.round(clamp(share, 0, 100) / 100 * tankVolume(tank));
  }

  return {
    MONTHS: MONTHS,
    WEEKDAYS: WEEKDAYS,
    TANK_LITERS: TANK_LITERS,
    isFiniteNumber: isFiniteNumber,
    isPlainObject: isPlainObject,
    toNumber: toNumber,
    clamp: clamp,
    firstDefined: firstDefined,
    safeJson: safeJson,
    clone: clone,
    deepMerge: deepMerge,
    pad2: pad2,
    formatTime: formatTime,
    formatDate: formatDate,
    formatWeekday: formatWeekday,
    formatDuration: formatDuration,
    formatTemperature: formatTemperature,
    formatDistance: formatDistance,
    tankVolume: tankVolume,
    fuelLiters: fuelLiters
  };
});
