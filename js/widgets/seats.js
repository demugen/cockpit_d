/* Seats: user-picked heat, ventilation and driver memory controls. */

(function (root) {
  'use strict';

  var def = {
    id: 'seats',
    title: 'Сиденья',
    description: 'Подогрев, вентиляция и память сидений',
    order: 45,
    defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: { slots: [] },
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var catalog = App.core.seatCatalog;
      var slots = App.core.slots;
      var tiles = App.core.tiles;
      var climate = ctx.services.climate;
      var car = ctx.services.car;
      var node = ctx.root;

      node.classList.add('w-seats');
      ctx.demand('climate', true);
      ctx.demand('car', true);

      var LEVELS = catalog.maxLevel;
      var PENDING_TTL = 5000;
      var pending = {};

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function chosen() {
        var stored = slots.list(ctx.settings && ctx.settings.slots);
        var known = stored.filter(function (id) { return !!catalog.get(id); });
        return known.length ? known : catalog.defaults();
      }

      function settingsKey() {
        return slots.list(ctx.settings && ctx.settings.slots).join('|') +
          '|' + ctx.size.w + 'x' + ctx.size.h;
      }

      var lastKey = settingsKey();

      function pendingKey(item) {
        if (item.seat.source === 'climate') {
          return item.seat.state + (item.kind === 'vent' ? 'SeatVent' : 'SeatHeat');
        }
        return item.id;
      }

      // Rear seats have no optimistic state in the host, so a tap shows the
      // requested level until the next car read confirms it or the TTL ends.
      function levelFor(item) {
        if (item.kind === 'memory') return null;
        var actual = catalog.level(item, climate.state(), car.state());
        if (item.seat.source === 'climate') return actual;
        var entry = pending[item.id];
        if (!entry) return actual;
        if (actual === entry.level || Date.now() - entry.at > PENDING_TTL) {
          delete pending[item.id];
          return actual;
        }
        return entry.level;
      }

      function isPending(item, climateState) {
        if (item.seat.source === 'climate') return !!climateState.pending[pendingKey(item)];
        return !!pending[item.id];
      }

      // Buttons pair up naturally: two per row keeps the labels readable and
      // never leaves a lone cell in the common 2×2 card.
      function matrix(count, size) {
        if (count <= 1) return { cols: 1, rows: 1 };
        if (count === 2) return { cols: 2, rows: 1 };
        if (count === 3 && size.w >= 3) return { cols: 3, rows: 1 };
        return { cols: count <= 4 ? 2 : Math.ceil(count / 2), rows: 2 };
      }

      function meter(level) {
        var wrap = dom.create('span', 'seat-btn-levels');
        wrap.setAttribute('aria-hidden', 'true');
        var value = typeof level === 'number' ? level : 0;
        for (var step = 1; step <= LEVELS; step += 1) {
          wrap.appendChild(dom.create('i', step <= value ? 'is-on' : ''));
        }
        return wrap;
      }

      // One tap cycles 0 → 1 → 2 → 3 → 0; the bars read the confirmed level.
      function control(item, level, disabled, pendingNow) {
        var button = dom.create('button',
          'seat-btn seat-btn--' + item.kind + (pendingNow ? ' is-pending' : ''));
        button.type = 'button';
        button.dataset.item = item.id;
        button.disabled = disabled;
        if (item.kind === 'memory') {
          button.classList.add('seat-btn--memory');
          button.setAttribute('aria-label', item.title + ', применить');
        } else {
          var value = typeof level === 'number' ? level : 0;
          button.setAttribute('aria-pressed', value > 0 ? 'true' : 'false');
          button.setAttribute('aria-label', item.title + ': уровень ' + value +
            (value >= LEVELS ? ', выключить' : ', повысить'));
        }

        if (item.kind === 'memory') {
          var glyph = dom.create('span', 'seat-btn-glyph');
          glyph.appendChild(dom.icon('user', 22));
          button.appendChild(glyph);
        } else {
          var icon = dom.create('span',
            'seat-btn-icon seat-btn-icon--' + item.kind + ' seat-btn-icon--' + item.seat.side);
          icon.setAttribute('aria-hidden', 'true');
          button.appendChild(icon);
        }

        var text = dom.create('span', 'seat-btn-text');
        text.appendChild(dom.create('span', 'seat-btn-label', item.seat.title));
        text.appendChild(dom.create('span', 'seat-btn-kind', item.kindTitle));
        button.appendChild(text);
        if (item.kind !== 'memory') button.appendChild(meter(level));
        return button;
      }

      function build() {
        var size = ctx.size;
        var climateState = climate.state();
        var carState = car.state();
        var items = chosen().map(function (id) { return catalog.get(id); })
          .filter(function (item) { return !!item; });
        var capacity = Math.max(1, tiles.capacity(size, slots.MAX, 2));
        var visible = items.slice(0, Math.max(1, capacity));

        dom.clear(node);
        node.classList.toggle('is-unavailable', !climateState.available && !carState.available);

        if (!visible.length) {
          node.appendChild(dom.create('div', 'seat-note', 'Нет выбранных функций'));
          return;
        }

        var gridSpec = matrix(visible.length, size);
        node.style.setProperty('--seat-cols', String(gridSpec.cols));
        node.style.setProperty('--seat-rows', String(gridSpec.rows));

        var grid = dom.create('div', 'seats-grid');
        visible.forEach(function (item) {
          var disabled = item.seat.source === 'climate'
            ? !climateState.available
            : !carState.available;
          grid.appendChild(control(item, levelFor(item), disabled, isPending(item, climateState)));
        });
        node.appendChild(grid);

        if (!climateState.available && !carState.available) {
          node.appendChild(dom.create('div', 'seat-note', 'Сиденья недоступны'));
        }
      }

      dom.delegate(node, '[data-item]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        var item = catalog.get(target.dataset.item);
        if (!item) return;

        if (item.kind === 'memory') {
          var applied = car.runEnum(catalog.enumName(item, 0));
          if (applied.ok) ctx.toast(item.kindTitle + ': команда отправлена');
          else ctx.toast('Автомобиль не принял команду', 'warn');
          return;
        }

        var current = levelFor(item);
        var next = typeof current === 'number' && current >= LEVELS ? 0 : (current || 0) + 1;
        if (item.seat.source === 'climate') {
          var sent = item.kind === 'heat'
            ? climate.setSeatHeat(item.seat.seat, next)
            : climate.setSeatVent(item.seat.seat, next);
          if (!sent) ctx.toast('Сиденья недоступны', 'warn');
          return;
        }

        var result = car.runEnum(catalog.enumName(item, next));
        if (!result.ok) {
          ctx.toast('Автомобиль не принял команду', 'warn');
          return;
        }
        pending[item.id] = { level: next, at: Date.now() };
        // The TTL is checked on render; without a repaint the pending look
        // would stay until the next car event, which may never come.
        ctx.later(PENDING_TTL + 100, build);
        build();
      });

      ctx.on('climate:change', build);
      ctx.on('car:change', build);
      ctx.on('settings:change', function () {
        var key = settingsKey();
        if (key !== lastKey) {
          lastKey = key;
          build();
        }
      });

      applySize(ctx.size);
      build();

      return {
        render: function () {
          applySize(ctx.size);
          build();
        },
        sizeChanged: function (size) {
          applySize(size);
          build();
        }
      };
    }
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = def;
    return;
  }
  root.App.widgetDefs.push(def);
})(typeof window !== 'undefined' ? window : globalThis);
