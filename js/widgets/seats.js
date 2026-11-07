/* Seats: user-picked heat, ventilation and driver memory controls, plus
   glass/rear-window/steering-wheel heater toggles. */

(function (root) {
  'use strict';

  var def = {
    id: 'seats',
    title: 'Сиденья и обогрев',
    description: 'Подогрев, вентиляция сидений, обогрев стёкол и руля',
    order: 45,
    defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: { slots: [], rearMaxLevel: 3 },
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var catalog = App.core.seatCatalog;
      var slots = App.core.slots;
      var tiles = App.core.tiles;
      var climate = ctx.services.climate;
      var car = ctx.services.car;
      var bridge = App.core.bridge;
      var node = ctx.root;

      node.classList.add('w-seats');
      ctx.demand('climate', true);
      ctx.demand('car', true);

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
          '|' + catalog.getRearMaxLevel(ctx.settings) +
          '|' + ctx.size.w + 'x' + ctx.size.h;
      }

      var lastKey = settingsKey();

      function pendingKey(item) {
        if (item.heater) return item.key;
        if (item.seat && item.seat.source === 'climate') {
          return item.seat.state + (item.kind === 'vent' ? 'SeatVent' : 'SeatHeat');
        }
        return item.id;
      }

      // Rear seats have no optimistic state in the host, so a tap shows the
      // requested level until the next car read confirms it or the TTL ends.
      function levelFor(item) {
        if (item.kind === 'memory') return null;
        var actual = catalog.level(item, climate.state(), car.state());
        if (item.heater || (item.seat && item.seat.source === 'climate')) return actual;
        var entry = pending[item.id];
        if (!entry) return actual;
        if (actual === entry.level || Date.now() - entry.at > PENDING_TTL) {
          delete pending[item.id];
          return actual;
        }
        return entry.level;
      }

      function isPending(item, climateState) {
        if (item.heater) return !!climateState.pending[item.key];
        if (item.seat && item.seat.source === 'climate') return !!climateState.pending[pendingKey(item)];
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

      function getLevelsFor(item) {
        if (item.heater) return 1; // heater is on/off, single indicator
        if (item.seat && item.seat.source === 'enum') {
          return catalog.getRearMaxLevel(ctx.settings);
        }
        return 3; // front seats always 3 levels
      }

      function meter(item, level) {
        var wrap = dom.create('span', 'seat-btn-levels');
        wrap.setAttribute('aria-hidden', 'true');
        var value = typeof level === 'number' ? level : 0;
        var levels = getLevelsFor(item);
        // The gauge fills from the bottom, so the first child is the top segment
        // and the lit steps stack upward from the last one.
        for (var step = levels; step >= 1; step -= 1) {
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
        var levels = getLevelsFor(item);
        if (item.kind === 'memory') {
          button.classList.add('seat-btn--memory');
          button.setAttribute('aria-label', item.title + ', применить');
        } else {
          var value = typeof level === 'number' ? level : 0;
          button.setAttribute('aria-pressed', value > 0 ? 'true' : 'false');
          if (item.heater) {
            button.setAttribute('aria-label', item.title + ': ' +
              (value > 0 ? 'включён, выключить' : 'выключен, включить'));
          } else {
            button.setAttribute('aria-label', item.title + ': уровень ' + value +
              (value >= levels ? ', выключить' : ', повысить'));
          }
        }

        if (item.kind === 'memory') {
          var glyph = dom.create('span', 'seat-btn-glyph');
          glyph.appendChild(dom.icon('user', 22));
          button.appendChild(glyph);
        } else {
          var icon = dom.create('span',
            'seat-btn-icon seat-btn-icon--' + item.kind +
            (item.heater ? ' seat-btn-icon--heater seat-btn-icon--' + item.icon : ' seat-btn-icon--' + item.seat.side));
          icon.setAttribute('aria-hidden', 'true');
          button.appendChild(icon);
        }

        var text = dom.create('span', 'seat-btn-text');
        text.appendChild(dom.create('span', 'seat-btn-label', item.seat ? item.seat.title : item.title));
        if (!item.heater) {
          text.appendChild(dom.create('span', 'seat-btn-kind', item.kindTitle));
        }
        button.appendChild(text);
        if (item.kind !== 'memory') {
          var meterEl = meter(item, level);
          // Set the CSS variable for dynamic levels
          meterEl.style.setProperty('--seat-levels', String(levels));
          button.appendChild(meterEl);
        }
        return button;
      }

      // Poll events arrive every few seconds while driving, and a dom.clear()
      // between pointerdown and pointerup swallows the tap — the button dies
      // before the click fires. The card is only rebuilt when something it
      // shows has actually changed.
      var shownKey = '';

      function build() {
        var size = ctx.size;
        var climateState = climate.state();
        var carState = car.state();
        var items = chosen().map(function (id) { return catalog.get(id); })
          .filter(function (item) { return !!item; });
        var capacity = Math.max(1, tiles.capacity(size, slots.MAX, 2));
        var visible = items.slice(0, Math.max(1, capacity));

        var rows = visible.map(function (item) {
          return { item: item, level: levelFor(item), pending: isPending(item, climateState) };
        });
        var key = [settingsKey(), climateState.available, carState.available]
          .concat(rows.map(function (row) {
            return row.item.id + ':' + (row.level === null ? 'x' : row.level) +
              (row.pending ? 'p' : '');
          }))
          .join('|');
        if (key === shownKey) return;
        shownKey = key;

        dom.clear(node);
        node.classList.toggle('is-unavailable', !climateState.available && !carState.available);

        if (!visible.length) {
          node.appendChild(dom.create('div', 'seat-note', 'Нет выбранных функций'));
          return;
        }

        var gridSpec = matrix(visible.length, size);
        node.style.setProperty('--seat-cols', String(gridSpec.cols));
        node.style.setProperty('--seat-rows', String(gridSpec.rows));
        // A cell's share of the card is 1/cols. The inline row of a one-row tile
        // has to fit its caption inside that share, so the type guard is written
        // as a factor rather than dividing by a variable, which older WebViews
        // resolve to an invalid declaration.
        node.style.setProperty('--seat-cell', String(1 / gridSpec.cols));

        var grid = dom.create('div', 'seats-grid');
        rows.forEach(function (row) {
          var item = row.item;
          var disabled = item.heater
            ? !climateState.available
            : (item.seat && item.seat.source === 'climate')
              ? !climateState.available
              : !carState.available;
          grid.appendChild(control(item, row.level, disabled, row.pending));
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
          var applied = car.runEnum(catalog.enumName(item, 0, ctx.settings));
          if (applied.ok) ctx.toast(item.kindTitle + ': команда отправлена');
          else ctx.toast('Автомобиль не принял команду', 'warn');
          return;
        }

        if (item.heater) {
          // Heater toggle (glass, rear window, steering wheel) — on/off via climate
          climate.toggle(item.key);
          return;
        }

        var current = levelFor(item);
        var levels = item.seat && item.seat.source === 'enum' ? catalog.getRearMaxLevel(ctx.settings) : 3;
        var next = typeof current === 'number' && current >= levels ? 0 : (current || 0) + 1;
        if (item.seat && item.seat.source === 'climate') {
          var sent = item.kind === 'heat'
            ? climate.setSeatHeat(item.seat.seat, next)
            : climate.setSeatVent(item.seat.seat, next);
          if (!sent) ctx.toast('Сиденья недоступны', 'warn');
          return;
        }

        // Use async enum for rear seats with proper error handling. Firmwares
        // without requestRunEnumAsync fall back to the synchronous runEnum —
        // the same commands the driver-memory buttons use.
        var requestId = 'seat-enum-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        var enumNameStr = catalog.enumName(item, next, ctx.settings);
        var acceptPending = function () {
          pending[item.id] = { level: next, at: Date.now() };
          // A quick re-read confirms the tap in under a second instead of
          // waiting for the next poll. A plain timer on purpose: the read is
          // the service's concern, a remount of the card must not cancel it —
          // same pattern as car.runEnum().
          setTimeout(function () { car.refresh(); }, 700);
          ctx.later(PENDING_TTL + 100, build);
          build();
        };
        bridge.runEnumAsyncPromise(requestId, enumNameStr).then(acceptPending).catch(function (err) {
          if (err && err.error === 'unavailable') {
            var sent = car.runEnum(enumNameStr);
            if (sent.ok) {
              acceptPending();
              return;
            }
            ctx.toast('Автомобиль не принял команду: ' + (sent.error || 'unknown'), 'warn');
            return;
          }
          ctx.toast('Автомобиль не принял команду: ' + (err.error || 'unknown'), 'warn');
        });
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
