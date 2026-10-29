/* Car data: user-picked metrics, including free getCarData keys. */

(function (root) {
  'use strict';

  var def = {
    id: 'cardata',
    title: 'Данные авто',
    description: 'Выбранные показатели автомобиля',
    order: 50,
    defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 1, h: 1 }, portrait: { w: 1, h: 1 } },
    settingsDefaults: { tankLiters: 55, slots: [] },
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var metrics = App.core.carMetrics;
      var slots = App.core.slots;
      var tiles = App.core.tiles;
      var service = ctx.services.car;
      var node = ctx.root;

      node.classList.add('w-cardata');
      ctx.demand('car', true);

      var lastKey = '';

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function chosen() {
        var stored = slots.list(ctx.settings && ctx.settings.slots);
        var known = stored.filter(function (id) {
          return !!metrics.get(id) || metrics.isCustom(id);
        });
        return known.length ? known : metrics.defaults();
      }

      function settingsKey() {
        return slots.list(ctx.settings && ctx.settings.slots).join('|') +
          '|' + (ctx.settings && ctx.settings.tankLiters) +
          '|' + ctx.size.w + 'x' + ctx.size.h;
      }

      function watchKeys(ids) {
        return ids.reduce(function (result, id) {
          var key = metrics.customKey(id);
          if (key && result.indexOf(key) === -1) result.push(key);
          return result;
        }, []);
      }

      function metricFor(id, state) {
        return metrics.resolve(id, state, { tankLiters: ctx.settings && ctx.settings.tankLiters });
      }

      function tileOf(metric) {
        var tile = dom.create('div', 'car-tile' + (metric.tone ? ' is-' + metric.tone : ''));
        var head = dom.create('div', 'car-tile-head');
        head.appendChild(dom.icon(metric.icon, 16));
        head.appendChild(dom.create('span', 'car-label', metric.label));
        var row = dom.create('div', 'car-value-row');
        row.appendChild(dom.create('span', 'car-value', metric.value));
        if (metric.unit) row.appendChild(dom.create('span', 'car-unit', metric.unit));
        if (metric.sub) {
          var sub = dom.create('span', 'car-sub');
          sub.appendChild(dom.create('span', 'car-sub-value', metric.sub));
          sub.appendChild(dom.create('span', 'car-sub-unit', metric.subUnit));
          row.appendChild(sub);
        }
        tile.appendChild(head);
        tile.appendChild(row);
        return tile;
      }

      function build() {
        var state = service.state();
        var size = ctx.size;
        var ids = chosen();
        var capacity = Math.max(1, tiles.capacity(size, slots.MAX, 1));
        var visible = ids.slice(0, Math.max(1, capacity));

        service.setWatched(watchKeys(visible));
        dom.clear(node);
        node.classList.toggle('is-empty', !state.available);

        if (!state.available) {
          node.appendChild(dom.create('div', 'car-note', 'Нет данных автомобиля'));
          return;
        }

        var matrix = tiles.bestMatrix(visible.length, size.w, size.h, 0.75);
        node.style.setProperty('--car-cols', String(matrix.cols));
        node.style.setProperty('--car-rows', String(matrix.rows));

        var grid = dom.create('div', 'car-grid');
        visible.forEach(function (id) {
          var metric = metricFor(id, state);
          if (metric) grid.appendChild(tileOf(metric));
        });
        node.appendChild(grid);
      }

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
        },
        destroy: function () {
          service.setWatched([]);
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
