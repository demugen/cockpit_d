/* Seat controls the widget can show: heat and ventilation for four seats and
   the driver's memory positions. Front seats go through climate commands; rear
   seats and memory presets exist only as runEnum tokens. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.seatCatalog = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SEATS = [
    { id: 'driver', title: 'Водитель', source: 'climate', seat: 1, side: 'left', state: 'driver' },
    { id: 'passenger', title: 'Пассажир', source: 'climate', seat: 2, side: 'right', state: 'passenger' },
    { id: 'rear-left', title: 'Заднее левое', source: 'enum', side: 'left', key: 'rearLeft', code: 'l' },
    { id: 'rear-right', title: 'Заднее правое', source: 'enum', side: 'right', key: 'rearRight', code: 'r' }
  ];

  var KINDS = [
    { id: 'heat', title: 'Обогрев' },
    { id: 'vent', title: 'Вентиляция' }
  ];

  var ITEMS = [];

  SEATS.forEach(function (seat) {
    KINDS.forEach(function (kind) {
      ITEMS.push({
        id: seat.id + '-' + kind.id,
        seat: seat,
        kind: kind.id,
        kindTitle: kind.title,
        mask: 'seat-' + kind.id + '-' + seat.side,
        title: seat.title + ' · ' + kind.title.toLowerCase(),
        subtitle: seat.title + ', ' + kind.title.toLowerCase(),
        memory: 0
      });
    });
  });

  [1, 2, 3].forEach(function (preset) {
    ITEMS.push({
      id: 'driver-memory-' + preset,
      seat: SEATS[0],
      kind: 'memory',
      kindTitle: 'Положение ' + preset,
      icon: 'user',
      title: 'Водитель · положение ' + preset,
      subtitle: 'Память сиденья водителя, ' + preset,
      memory: preset
    });
  });

  var DEFAULTS = ['driver-heat', 'driver-vent', 'passenger-heat', 'passenger-vent'];

  function list() {
    return ITEMS.slice();
  }

  function get(id) {
    for (var i = 0; i < ITEMS.length; i += 1) {
      if (ITEMS[i].id === id) return ITEMS[i];
    }
    return null;
  }

  function defaults() {
    return DEFAULTS.slice();
  }

  function clampLevel(level) {
    var number = Math.round(Number(level));
    return isFinite(number) ? Math.min(3, Math.max(0, number)) : 0;
  }

  // The host reads front seats through climate state and rear seats through
  // car data; memory presets are momentary and have no readable state.
  function level(item, climate, car) {
    if (!item || item.kind === 'memory') return null;
    if (item.seat.source === 'climate') {
      var key = item.seat.state + (item.kind === 'vent' ? 'SeatVent' : 'SeatHeat');
      var value = climate ? climate[key] : null;
      return typeof value === 'number' ? value : null;
    }
    var record = car && car.seats ? car.seats[item.seat.key] : null;
    var rear = record ? record[item.kind] : null;
    return typeof rear === 'number' ? rear : null;
  }

  function enumName(item, levelValue) {
    if (!item) return '';
    if (item.kind === 'memory') return 'voditel_seat_' + item.memory;
    if (!item.seat.code) return '';
    var value = clampLevel(levelValue);
    var prefix = (item.kind === 'heat' ? 'heat_zad_seat_' : 'vent_zad_seat_') + item.seat.code;
    // The right rear seat spells zero as `_off`; the left one uses `_0`.
    if (value === 0 && item.seat.code === 'r') return prefix + '_off';
    return prefix + '_' + value;
  }

  return {
    list: list,
    get: get,
    defaults: defaults,
    level: level,
    enumName: enumName,
    maxLevel: 3
  };
});
