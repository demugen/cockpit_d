/* Remaining heaters: windshield, rear window and steering wheel. */

(function (root) {
  'use strict';

  var def = {
    id: 'heaters',
    title: 'Обогревы',
    description: 'Лобовое и заднее стекло, руль',
    order: 42,
    defaultEnabled: false,
    defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var service = ctx.services.climate;
      var node = ctx.root;

      node.classList.add('w-heaters');
      ctx.demand('climate', true);

      var ITEMS = [
        { key: 'frontGlassHeat', icon: 'glass', label: 'Лобовое', title: 'Обогрев лобового стекла' },
        { key: 'rearDefrost', icon: 'rear', label: 'Заднее', title: 'Обогрев заднего стекла' },
        { key: 'steeringWheelHeat', icon: 'wheel', label: 'Руль', title: 'Обогрев руля' }
      ];

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function button(item, state) {
        var on = !!state[item.key];
        var pending = !!(state.pending && state.pending[item.key]);
        var nodeButton = dom.create('button',
          'heat-btn heat-btn--' + item.icon + (pending ? ' is-pending' : ''));
        nodeButton.type = 'button';
        nodeButton.dataset.heat = item.key;
        nodeButton.disabled = !state.available;
        nodeButton.setAttribute('aria-pressed', on ? 'true' : 'false');
        nodeButton.setAttribute('aria-label', item.title + ': ' + (on ? 'включён' : 'выключен'));
        nodeButton.title = item.title;

        var icon = dom.create('span', 'heat-btn-icon heat-btn-icon--' + item.icon);
        icon.setAttribute('aria-hidden', 'true');
        var meter = dom.create('span', 'heat-btn-meter' + (on ? ' is-on' : ''));
        meter.setAttribute('aria-hidden', 'true');

        nodeButton.appendChild(icon);
        nodeButton.appendChild(dom.create('span', 'heat-btn-label', item.label));
        nodeButton.appendChild(meter);
        return nodeButton;
      }

      function build() {
        var state = service.state();
        dom.clear(node);
        node.classList.toggle('is-unavailable', !state.available);

        var grid = dom.create('div', 'heat-grid');
        ITEMS.forEach(function (item) {
          grid.appendChild(button(item, state));
        });
        node.appendChild(grid);

        if (!state.available) node.appendChild(dom.create('div', 'heat-note', 'Обогревы недоступны'));
      }

      dom.delegate(node, '[data-heat]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        service.toggle(target.dataset.heat);
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
