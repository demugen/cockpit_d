/* Front seats: heating and ventilation levels for driver and passenger. */

(function (root) {
  'use strict';

  var def = {
    id: 'seats',
    title: 'Сиденья',
    description: 'Подогрев и вентиляция передних сидений',
    order: 45,
    defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var service = ctx.services.climate;
      var node = ctx.root;

      node.classList.add('w-seats');
      ctx.demand('climate', true);

      var LEVELS = 3;

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function pendingKey(seat, kind) {
        return (seat === 2 ? 'passenger' : 'driver') + (kind === 'vent' ? 'SeatVent' : 'SeatHeat');
      }

      // One button per function, like the car UI: a tap cycles 0 → 1 → 2 → 3 → 0,
      // and the three bars read the level the host has confirmed.
      function control(seat, kind, label, value, disabled, pending) {
        var side = seat === 2 ? 'right' : 'left';
        var button = dom.create('button',
          'seat-btn seat-btn--' + kind + (pending ? ' is-pending' : ''));
        button.type = 'button';
        button.dataset.act = kind;
        button.dataset.seat = String(seat);
        button.disabled = disabled;
        button.setAttribute('aria-pressed', value > 0 ? 'true' : 'false');
        button.setAttribute('aria-label', label + ': уровень ' + value +
          (value >= LEVELS ? ', выключить' : ', повысить'));

        var icon = dom.create('span',
          'seat-btn-icon seat-btn-icon--' + kind + ' seat-btn-icon--' + side);
        icon.setAttribute('aria-hidden', 'true');
        var meter = dom.create('span', 'seat-btn-levels');
        meter.setAttribute('aria-hidden', 'true');
        for (var level = 1; level <= LEVELS; level += 1) {
          meter.appendChild(dom.create('i', level <= value ? 'is-on' : ''));
        }

        button.appendChild(icon);
        button.appendChild(dom.create('span', 'seat-btn-label', label));
        button.appendChild(meter);
        return button;
      }

      function panel(seat, title, heat, vent, state) {
        var box = dom.create('div', 'seat-panel');
        var head = dom.create('div', 'seat-head');
        head.appendChild(dom.create('span', 'seat-name', title));
        box.appendChild(head);

        var disabled = !state.available;
        box.appendChild(control(seat, 'heat', 'Подогрев', heat, disabled, state.pending[pendingKey(seat, 'heat')]));
        box.appendChild(control(seat, 'vent', 'Вентиляция', vent, disabled, state.pending[pendingKey(seat, 'vent')]));
        return box;
      }

      function build() {
        var state = service.state();
        dom.clear(node);
        node.classList.toggle('is-unavailable', !state.available);

        var grid = dom.create('div', 'seats-grid');
        grid.appendChild(panel(1, 'Водитель', state.driverSeatHeat, state.driverSeatVent, state));
        grid.appendChild(panel(2, 'Пассажир', state.passengerSeatHeat, state.passengerSeatVent, state));
        node.appendChild(grid);

        if (!state.available) node.appendChild(dom.create('div', 'seat-note', 'Сиденья недоступны'));
      }

      dom.delegate(node, '[data-act]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        var state = service.state();
        var seat = Number(target.dataset.seat) === 2 ? 2 : 1;
        var heat = target.dataset.act === 'heat';
        var current = heat
          ? (seat === 2 ? state.passengerSeatHeat : state.driverSeatHeat)
          : (seat === 2 ? state.passengerSeatVent : state.driverSeatVent);
        var next = current >= LEVELS ? 0 : current + 1;
        if (heat) service.setSeatHeat(seat, next);
        else service.setSeatVent(seat, next);
      });

      ctx.on('climate:change', build);

      applySize(ctx.size);
      build();

      return {
        render: function () {
          applySize(ctx.size);
          build();
        },
        sizeChanged: applySize
      };
    }
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = def;
    return;
  }
  root.App.widgetDefs.push(def);
})(typeof window !== 'undefined' ? window : globalThis);
