/* App launcher: user apps from getUserApps, tap to run through runApp. */

(function (root) {
  'use strict';

  var def = {
    id: 'apps',
    title: 'Приложения',
    description: 'Быстрый запуск установленных приложений',
    order: 60,
    defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: { count: 0, slots: [] },
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var service = ctx.services.apps;
      var node = ctx.root;
      var slots = App.core.slots;
      var tiles = App.core.tiles;

      var AUTO_MAX = slots.MAX;

      node.classList.add('w-apps');
      ctx.demand('apps', true);

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function chosenCount() {
        var value = Number(ctx.settings && ctx.settings.count);
        return value === 2 || value === 4 || value === 6 || value === 8 ? value : 0;
      }

      function slotPackages() {
        return slots.list(ctx.settings && ctx.settings.slots, AUTO_MAX);
      }

      function customSlots() {
        return slots.has(ctx.settings && ctx.settings.slots, AUTO_MAX);
      }

      function slotApps() {
        var byPackage = {};
        service.state().apps.forEach(function (app) { byPackage[app.package] = app; });
        return slotPackages().map(function (pkg) {
          return byPackage[pkg];
        }).filter(function (app) { return !!app; });
      }

      function visibleApps() {
        return customSlots() ? slotApps() : service.state().apps.slice();
      }

      function settingsKey() {
        return chosenCount() + '|' + slotPackages().join(',');
      }

      function gridFor(count, w, h) {
        return tiles.bestMatrix(count, w, h, 0.72);
      }

      function capacityFor(size) {
        return Math.max(2, tiles.capacity(size, AUTO_MAX, 2));
      }

      var lastKey = settingsKey();

      function tile(app) {
        var button = dom.create('button', 'app-tile');
        button.type = 'button';
        button.dataset.pkg = app.package;
        button.title = app.name;

        var glyph = dom.create('div', 'app-glyph');
        var letter = dom.create('span', 'app-letter', (app.name || '?').charAt(0).toUpperCase());
        glyph.appendChild(letter);
        if (app.icon) {
          var image = dom.create('img', 'app-image');
          image.alt = '';
          image.onload = function () {
            letter.hidden = true;
            image.hidden = false;
          };
          image.onerror = function () {
            image.hidden = true;
            letter.hidden = false;
          };
          image.hidden = true;
          glyph.appendChild(image);
          image.src = app.icon;
        }
        button.appendChild(glyph);
        button.appendChild(dom.create('span', 'app-name', app.name));
        return button;
      }

      function message(text, action) {
        var box = dom.create('div', 'apps-empty');
        box.appendChild(dom.create('div', 'apps-empty-text', text));
        if (action) {
          var button = dom.button('btn btn-ghost', action.label);
          button.dataset.act = action.act;
          box.appendChild(button);
        }
        return box;
      }

      function build() {
        var state = service.state();
        var size = ctx.size;
        var wanted = chosenCount();
        var capacity = wanted || capacityFor(size);
        var custom = customSlots();
        var apps = visibleApps();
        dom.clear(node);

        if (!apps.length) {
          node.style.removeProperty('--app-cols');
          node.style.removeProperty('--app-rows');
          if (state.loading) node.appendChild(message('Загрузка приложений…'));
          else if (custom) {
            node.appendChild(message('Выбранные приложения не найдены',
              { label: 'Сбросить слоты', act: 'reset-slots' }));
          } else {
            node.appendChild(message(state.error === 'empty' ? 'Список пуст' : 'Нет приложений',
              { label: 'Обновить', act: 'reload' }));
          }
          return;
        }

        var count = Math.min(apps.length, capacity);
        var layout = gridFor(count, size.w, size.h);
        node.style.setProperty('--app-cols', String(layout.cols));
        node.style.setProperty('--app-rows', String(layout.rows));

        var gridEl = dom.create('div', 'apps-grid');
        apps.slice(0, count).forEach(function (app) {
          gridEl.appendChild(tile(app));
        });
        node.appendChild(gridEl);
      }

      dom.delegate(node, '[data-pkg]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        service.launch(target.dataset.pkg);
      });
      dom.delegate(node, '[data-act="reload"]', 'click', function (event) {
        if (ctx.editing) return;
        event.stopPropagation();
        service.load(true);
      });
      dom.delegate(node, '[data-act="reset-slots"]', 'click', function (event) {
        if (ctx.editing) return;
        event.stopPropagation();
        ctx.services.settings.setWidgetSettings('apps', { slots: [] });
      });

      ctx.on('apps:change', build);
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
