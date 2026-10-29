/* Weather widget: saved device weather, tap to refresh. */

(function (root) {
  'use strict';

  function iconFor(condition) {
    var text = String(condition || '').toLowerCase();
    if (text.indexOf('гроз') !== -1) return 'storm';
    if (text.indexOf('снег') !== -1) return 'snow';
    if (text.indexOf('дожд') !== -1) return 'rain';
    if (text.indexOf('туман') !== -1 || text.indexOf('мгла') !== -1) return 'fog';
    if (text.indexOf('облач') !== -1 || text.indexOf('пасмур') !== -1) return 'cloud';
    if (text.indexOf('ноч') !== -1) return 'moon';
    if (text.indexOf('ясн') !== -1 || text.indexOf('солн') !== -1) return 'sun';
    return 'cloud';
  }

  var def = {
    id: 'weather',
    title: 'Погода',
    description: 'Температура за окном и состояние',
    order: 20,
    defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var utils = App.core.utils;
      var service = ctx.services.weather;
      var node = ctx.root;

      node.classList.add('w-weather');
      ctx.demand('weather', true);

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function refresh(event) {
        if (event) event.stopPropagation();
        if (ctx.editing) return;
        service.refresh(true);
      }

      function build() {
        var state = service.state();
        dom.clear(node);

        var head = dom.create('div', 'weather-head');
        head.appendChild(dom.create('div', 'weather-city', state.city || 'Погода'));
        var refreshButton = dom.button('weather-refresh', '', 'refresh');
        refreshButton.setAttribute('aria-label', 'Обновить погоду');
        refreshButton.title = 'Обновить погоду';
        refreshButton.dataset.act = 'refresh';
        if (state.loading) refreshButton.classList.add('is-busy');
        head.appendChild(refreshButton);

        var body = dom.create('div', 'weather-body');
        var iconWrap = dom.create('div', 'weather-icon');
        var fallback = dom.icon(iconFor(state.condition), 48);
        fallback.classList.add('weather-glyph');
        iconWrap.appendChild(fallback);

        if (state.icon) {
          var image = dom.create('img', 'weather-image');
          image.alt = '';
          // SVG elements do not implement the hidden IDL property, so the
          // fallback is toggled by attribute explicitly.
          image.onload = function () {
            fallback.setAttribute('hidden', '');
            image.removeAttribute('hidden');
          };
          image.onerror = function () {
            image.setAttribute('hidden', '');
            fallback.removeAttribute('hidden');
          };
          image.setAttribute('hidden', '');
          iconWrap.appendChild(image);
          image.src = state.icon;
        }

        var text = dom.create('div', 'weather-text');
        var temp = state.temp === '' || state.temp === undefined ? '—' : utils.formatTemperature(state.temp);
        text.appendChild(dom.create('div', 'weather-temp', temp));
        var condition = state.condition || (state.error ? 'Нет данных' : '—');
        text.appendChild(dom.create('div', 'weather-cond', condition));

        body.appendChild(iconWrap);
        body.appendChild(text);
        node.appendChild(head);
        node.appendChild(body);
        node.classList.toggle('is-empty', !state.city && !state.temp && !!state.error);
      }

      dom.delegate(node, '[data-act="refresh"]', 'click', refresh);
      node.addEventListener('click', function (event) {
        if (event.target.closest('[data-act="refresh"]')) return;
        refresh();
      });
      ctx.on('weather:change', build);

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
