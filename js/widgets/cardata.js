/* Car data: speed, fuel, battery and outside temperature tiles. */

(function (root) {
  'use strict';

  var def = {
    id: 'cardata',
    title: 'Данные авто',
    description: 'Скорость, топливо, АКБ и температура',
    order: 50,
    defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 1, h: 1 }, portrait: { w: 1, h: 1 } },
    settingsDefaults: { tankLiters: 55 },
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var utils = App.core.utils;
      var service = ctx.services.car;
      var node = ctx.root;

      node.classList.add('w-cardata');
      ctx.demand('car', true);

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function metricFor(key, vehicle) {
        if (key === 'speed') {
          return {
            icon: 'speed',
            label: 'Скорость',
            value: vehicle.speed === null ? '—' : String(Math.round(vehicle.speed)),
            unit: 'км/ч'
          };
        }
        if (key === 'fuel') {
          var fuel = vehicle.fuelPercent;
          var liters = utils.fuelLiters(fuel, ctx.settings.tankLiters);
          return {
            icon: 'fuel',
            label: 'Топливо',
            value: fuel === null ? '—' : String(Math.round(fuel)),
            unit: '%',
            sub: liters === null ? null : String(liters),
            subUnit: 'л',
            tone: fuel === null ? '' : (fuel < 15 ? 'danger' : (fuel < 30 ? 'warn' : ''))
          };
        }
        if (key === 'battery') {
          var battery = vehicle.batteryVoltage;
          return {
            icon: 'battery',
            label: 'АКБ',
            value: battery === null ? '—' : battery.toFixed(1),
            unit: 'В',
            tone: battery === null ? '' : (battery < 11.8 ? 'danger' : (battery < 12.2 ? 'warn' : ''))
          };
        }
        return {
          icon: 'thermostat',
          label: 'За бортом',
          value: vehicle.outTemp === null ? '—' : utils.formatTemperature(vehicle.outTemp),
          unit: ''
        };
      }

      function build() {
        var state = service.state();
        var size = ctx.size;
        var vehicle = state.vehicle;
        var count = Math.min(4, Math.max(1, size.w * size.h));
        var keys = ['speed', 'fuel', 'battery', 'outTemp'].slice(0, count);
        dom.clear(node);
        node.classList.toggle('is-empty', !state.available);

        if (!state.available) {
          node.appendChild(dom.create('div', 'car-note', 'Нет данных автомобиля'));
          return;
        }

        var gridEl = dom.create('div', 'car-grid');
        gridEl.dataset.count = String(count);
        keys.forEach(function (key) {
          var metric = metricFor(key, vehicle);
          var tileEl = dom.create('div', 'car-tile' + (metric.tone ? ' is-' + metric.tone : ''));
          var head = dom.create('div', 'car-tile-head');
          head.appendChild(dom.icon(metric.icon, 16));
          head.appendChild(dom.create('span', 'car-label', metric.label));
          var valueRow = dom.create('div', 'car-value-row');
          valueRow.appendChild(dom.create('span', 'car-value', metric.value));
          if (metric.unit) valueRow.appendChild(dom.create('span', 'car-unit', metric.unit));
          if (metric.sub) {
            var subEl = dom.create('span', 'car-sub');
            subEl.appendChild(dom.create('span', 'car-sub-value', metric.sub));
            subEl.appendChild(dom.create('span', 'car-sub-unit', metric.subUnit));
            valueRow.appendChild(subEl);
          }
          tileEl.appendChild(head);
          tileEl.appendChild(valueRow);
          gridEl.appendChild(tileEl);
        });
        node.appendChild(gridEl);
      }

      ctx.on('car:change', build);
      ctx.on('settings:change', build);

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
