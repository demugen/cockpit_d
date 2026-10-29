/* Data the car widget can show. Prebuilt metrics read the polled snapshot;
   custom slots hold a raw getCarData key and show whatever it returns. */

(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports
    ? require('./utils.js')
    : root.App.core.utils);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.carMetrics = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (utils) {
  'use strict';

  var CUSTOM = 'custom:';

  function vehicleOf(state) {
    return state && state.vehicle ? state.vehicle : {};
  }

  function heatOf(state) {
    return state && state.heat ? state.heat : {};
  }

  function primitive(value) {
    if (value === true) return 'Да';
    if (value === false) return 'Нет';
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return '—';
    if (typeof value === 'number') return String(Math.round(value * 10) / 10);
    return String(value);
  }

  function fuelTone(percent) {
    if (percent === null || percent === undefined) return '';
    return percent < 15 ? 'danger' : (percent < 30 ? 'warn' : '');
  }

  function temperature(value) {
    return value === null || value === undefined ? '—' : utils.formatTemperature(value);
  }

  function toggle(value, on, off) {
    if (value === true) return on;
    if (value === false) return off;
    return '—';
  }

  var METRICS = [
    {
      id: 'speed',
      title: 'Скорость',
      icon: 'speed',
      read: function (state) {
        var speed = vehicleOf(state).speed;
        return {
          icon: 'speed',
          label: 'Скорость',
          value: speed === null || speed === undefined ? '—' : String(Math.round(speed)),
          unit: 'км/ч'
        };
      }
    },
    {
      id: 'rpm',
      title: 'Обороты',
      icon: 'rpm',
      read: function (state) {
        var rpm = vehicleOf(state).rpm;
        return {
          icon: 'rpm',
          label: 'Обороты',
          value: rpm === null || rpm === undefined ? '—' : String(Math.round(rpm)),
          unit: 'об/мин'
        };
      }
    },
    {
      id: 'fuel',
      title: 'Топливо, % и литры',
      icon: 'fuel',
      read: function (state, options) {
        var percent = vehicleOf(state).fuelPercent;
        var liters = utils.fuelLiters(percent, options && options.tankLiters);
        return {
          icon: 'fuel',
          label: 'Топливо',
          value: percent === null || percent === undefined ? '—' : String(Math.round(percent)),
          unit: '%',
          sub: liters === null ? null : String(liters),
          subUnit: 'л',
          tone: fuelTone(percent)
        };
      }
    },
    {
      id: 'fuelPercent',
      title: 'Топливо, только %',
      icon: 'fuel',
      read: function (state) {
        var percent = vehicleOf(state).fuelPercent;
        return {
          icon: 'fuel',
          label: 'Топливо',
          value: percent === null || percent === undefined ? '—' : String(Math.round(percent)),
          unit: '%',
          tone: fuelTone(percent)
        };
      }
    },
    {
      id: 'fuelLiters',
      title: 'Топливо, только литры',
      icon: 'fuel',
      read: function (state, options) {
        var percent = vehicleOf(state).fuelPercent;
        var liters = utils.fuelLiters(percent, options && options.tankLiters);
        return {
          icon: 'fuel',
          label: 'Топливо',
          value: liters === null ? '—' : String(liters),
          unit: 'л',
          tone: fuelTone(percent)
        };
      }
    },
    {
      id: 'battery',
      title: 'Напряжение АКБ',
      icon: 'battery',
      read: function (state) {
        var voltage = vehicleOf(state).batteryVoltage;
        var tone = '';
        if (voltage !== null && voltage !== undefined) {
          tone = voltage < 11.8 ? 'danger' : (voltage < 12.2 ? 'warn' : '');
        }
        return {
          icon: 'battery',
          label: 'АКБ',
          value: voltage === null || voltage === undefined ? '—' : voltage.toFixed(1),
          unit: 'В',
          tone: tone
        };
      }
    },
    {
      id: 'outTemp',
      title: 'Температура за бортом',
      icon: 'thermostat',
      read: function (state) {
        return {
          icon: 'thermostat',
          label: 'За бортом',
          value: temperature(vehicleOf(state).outTemp),
          unit: ''
        };
      }
    },
    {
      id: 'engine',
      title: 'Двигатель',
      icon: 'power',
      read: function (state) {
        return {
          icon: 'power',
          label: 'Двигатель',
          value: toggle(vehicleOf(state).engine, 'Вкл', 'Выкл'),
          unit: ''
        };
      }
    },
    {
      id: 'sun',
      title: 'Люк',
      icon: 'sun',
      read: function (state) {
        return {
          icon: 'sun',
          label: 'Люк',
          value: toggle(vehicleOf(state).sun, 'Открыт', 'Закрыт'),
          unit: ''
        };
      }
    },
    {
      id: 'park',
      title: 'Стоянка',
      icon: 'car',
      read: function (state) {
        return {
          icon: 'car',
          label: 'Стоянка',
          value: toggle(vehicleOf(state).park, 'Вкл', 'Выкл'),
          unit: ''
        };
      }
    },
    {
      id: 'driverTemp',
      title: 'Климат: водитель',
      icon: 'thermostat',
      read: function (state) {
        return {
          icon: 'thermostat',
          label: 'Климат: водитель',
          value: temperature(heatOf(state).driverTemp),
          unit: ''
        };
      }
    },
    {
      id: 'passengerTemp',
      title: 'Климат: пассажир',
      icon: 'thermostat',
      read: function (state) {
        return {
          icon: 'thermostat',
          label: 'Климат: пассажир',
          value: temperature(heatOf(state).passengerTemp),
          unit: ''
        };
      }
    }
  ];

  var DEFAULTS = ['speed', 'fuel', 'battery', 'outTemp'];

  function list() {
    return METRICS.map(function (metric) {
      return { id: metric.id, title: metric.title, icon: metric.icon, meta: 'getCarData: ' + metric.id };
    });
  }

  function get(id) {
    for (var i = 0; i < METRICS.length; i += 1) {
      if (METRICS[i].id === id) return METRICS[i];
    }
    return null;
  }

  function defaults() {
    return DEFAULTS.slice();
  }

  function isCustom(id) {
    return typeof id === 'string' && id.indexOf(CUSTOM) === 0 && id.length > CUSTOM.length;
  }

  function customKey(id) {
    return isCustom(id) ? id.slice(CUSTOM.length) : '';
  }

  function customId(key) {
    return CUSTOM + String(key || '');
  }

  // A custom read returns {name, value} for single keys, a cabin pair, or a
  // whole section. Show the first usable scalar instead of raw JSON.
  function readCustom(data) {
    if (!data || typeof data !== 'object') return '—';
    if (data.value !== undefined && data.value !== null) return primitive(data.value);
    if (data.driverTemp !== undefined || data.passengerTemp !== undefined) {
      return temperature(data.driverTemp) + ' / ' + temperature(data.passengerTemp);
    }
    var keys = Object.keys(data).filter(function (key) {
      return key !== 'name' && key !== 'error' && key !== 'success' &&
        ['boolean', 'number', 'string'].indexOf(typeof data[key]) !== -1;
    });
    if (!keys.length) return '—';
    return primitive(data[keys[0]]);
  }

  function resolve(id, state, options) {
    if (isCustom(id)) {
      var key = customKey(id);
      var extra = state && state.extra ? state.extra[key] : null;
      return { icon: 'car', label: key, value: readCustom(extra), unit: '' };
    }
    var metric = get(id);
    return metric ? metric.read(state || {}, options || {}) : null;
  }

  return {
    list: list,
    get: get,
    defaults: defaults,
    isCustom: isCustom,
    customKey: customKey,
    customId: customId,
    readCustom: readCustom,
    resolve: resolve
  };
});
