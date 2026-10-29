/* Climate: temperature zones, fan speed and the five main toggles. */

(function (root) {
  'use strict';

  var def = {
    id: 'climate',
    title: 'Климат',
    description: 'Температура, поток и режимы',
    order: 40,
    defaultSize: { landscape: { w: 3, h: 2 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var utils = App.core.utils;
      var service = ctx.services.climate;
      var node = ctx.root;

      node.classList.add('w-climate');
      ctx.demand('climate', true);

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function makeButton(className, iconName, label, dataset, disabled) {
        var button = dom.button(className, '', iconName);
        if (label) {
          dom.clear(button);
          button.appendChild(dom.icon(iconName, 18));
          button.appendChild(dom.create('span', 'cl-btn-label', label));
        }
        Object.keys(dataset || {}).forEach(function (key) {
          button.dataset[key] = dataset[key];
        });
        button.dataset.act = dataset && dataset.act ? dataset.act : '';
        if (disabled) button.disabled = true;
        return button;
      }

      // Climate steps by whole degrees: a half from the host rounds to the
      // nearest one so the displayed value and the next tap agree.
      function formatDegrees(value) {
        var number = utils.toNumber(value, null);
        return number === null ? '—' : utils.formatTemperature(Math.round(number));
      }

      function zone(label, value, zoneNumber, disabled) {
        var box = dom.create('div', 'cl-zone');
        box.appendChild(dom.create('div', 'cl-label', label));
        var row = dom.create('div', 'cl-zone-row');
        var minus = makeButton('cl-step', 'minus', '', { act: 'temp', zone: String(zoneNumber), delta: '-1' }, disabled);
        minus.setAttribute('aria-label', 'Холоднее');
        var valueNode = dom.create('div', 'cl-value', formatDegrees(value));
        var plus = makeButton('cl-step', 'plus', '', { act: 'temp', zone: String(zoneNumber), delta: '1' }, disabled);
        plus.setAttribute('aria-label', 'Теплее');
        row.appendChild(minus);
        row.appendChild(valueNode);
        row.appendChild(plus);
        box.appendChild(row);
        return box;
      }

      function fan(value, disabled) {
        var box = dom.create('div', 'cl-fan');
        box.appendChild(dom.create('div', 'cl-label', 'Поток'));
        var row = dom.create('div', 'cl-zone-row');
        var minus = makeButton('cl-step', 'minus', '', { act: 'fan', delta: '-1' }, disabled);
        minus.setAttribute('aria-label', 'Меньше поток');
        var valueNode = dom.create('div', 'cl-value cl-fan-value');
        valueNode.appendChild(dom.icon('fan', 20));
        valueNode.appendChild(dom.create('span', '', String(value)));
        var plus = makeButton('cl-step', 'plus', '', { act: 'fan', delta: '1' }, disabled);
        plus.setAttribute('aria-label', 'Больше поток');
        row.appendChild(minus);
        row.appendChild(valueNode);
        row.appendChild(plus);
        box.appendChild(row);
        return box;
      }

      function toggles(state) {
        var row = dom.create('div', 'cl-toggles');
        var items = [
          { key: 'power', icon: 'power', text: '', label: 'Питание' },
          { key: 'ac', icon: 'ac', text: '', label: 'Кондиционер' },
          { key: 'auto', icon: '', text: 'AUTO', label: 'Авто' },
          { key: 'recirculation', icon: 'recirc', text: '', label: 'Рециркуляция' },
          { key: 'sync', icon: '', text: 'SYNC', label: 'Синхронизация' }
        ];
        items.forEach(function (item) {
          var button = dom.button('cl-toggle', '', item.icon || null);
          if (item.text) {
            dom.clear(button);
            button.appendChild(dom.create('span', 'cl-toggle-text', item.text));
          }
          button.dataset.act = 'toggle';
          button.dataset.key = item.key;
          button.setAttribute('aria-label', item.label);
          button.title = item.label;
          if (!state.available) button.disabled = true;
          dom.setPressed(button, !!state[item.key]);
          if (state.pending && state.pending[item.key]) button.classList.add('is-pending');
          row.appendChild(button);
        });
        return row;
      }

      function build() {
        var state = service.state();
        dom.clear(node);
        node.classList.toggle('is-unavailable', !state.available);

        // Both zones are always visible; SYNC keeps their values linked.
        var head = dom.create('div', 'cl-head');
        head.appendChild(zone('Водитель', state.driverTemperature, 1, !state.available));
        head.appendChild(zone('Пассажир', state.passengerTemperature, 2, !state.available));
        head.appendChild(fan(state.fanSpeed, !state.available));
        node.appendChild(head);
        node.appendChild(toggles(state));

        if (!state.available) {
          node.appendChild(dom.create('div', 'cl-note', 'Климат недоступен'));
        }
      }

      dom.delegate(node, '[data-act]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        var action = target.dataset.act;
        if (action === 'temp') service.setTemperature(Number(target.dataset.zone), Number(target.dataset.delta));
        else if (action === 'fan') service.setFanSpeed(Number(target.dataset.delta));
        else if (action === 'toggle') service.toggle(target.dataset.key);
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
