/* Clock widget: large time and date, repainted once per second. */

(function (root) {
  'use strict';

  var def = {
    id: 'clock',
    title: 'Часы',
    description: 'Время и дата',
    order: 10,
    defaultSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    minSize: { landscape: { w: 1, h: 1 }, portrait: { w: 1, h: 1 } },
    settingsDefaults: { seconds: false },
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var utils = App.core.utils;
      var node = ctx.root;
      var time = dom.create('div', 'clock-time');
      var date = dom.create('div', 'clock-date');

      node.classList.add('w-clock');
      node.appendChild(time);
      node.appendChild(date);

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function paint() {
        var now = new Date();
        node.classList.toggle('is-seconds', !!ctx.settings.seconds);
        dom.text(time, utils.formatTime(now, !!ctx.settings.seconds));
        dom.text(date, utils.formatDate(now));
      }

      ctx.every(1000, paint);
      applySize(ctx.size);
      paint();

      return {
        render: function () {
          applySize(ctx.size);
          paint();
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
