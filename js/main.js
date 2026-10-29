/* Bootstrap: registry, settings, services, shell, board, settings, ready. */

(function (App) {
  'use strict';

  var bridge = App.core.bridge;

  function run(name, fn) {
    try {
      fn();
    } catch (error) {
      console.error('[boot] ' + name + ' failed', error);
    }
  }

  function reveal() {
    var preloader = document.getElementById('preloader');
    var app = document.getElementById('app');
    if (preloader) {
      preloader.classList.add('is-done');
      // The spinner keeps animating while invisible; drop the node after fade.
      setTimeout(function () { preloader.remove(); }, 600);
    }
    if (app) {
      app.setAttribute('aria-busy', 'false');
      app.classList.add('is-ready');
    }
  }

  function buildRegistry() {
    var registry = App.core.registry.create();
    App.widgetDefs.forEach(function (def) {
      try {
        registry.register(def);
      } catch (error) {
        console.error('[widget] registration failed: ' + (def && def.id), error);
      }
    });
    App.registry = registry;
    return registry;
  }

  function start() {
    var registry = buildRegistry();

    run('settings', function () {
      App.services.settings.init(registry.all(), {
        grid: function (axis) {
          return App.ui.viewport.grid(axis);
        }
      });
    });

    run('wallpaper', function () { App.services.wallpaper.init(); });
    run('car', function () { App.services.car.init(); });
    run('climate', function () { App.services.climate.init(); });
    run('media', function () { App.services.media.init(); });
    run('weather', function () { App.services.weather.init(); });
    run('apps', function () { App.services.apps.init(); });
    run('nav', function () { App.services.nav.init(); });

    // The host starts sending events after onJsReady, and mounting a widget may
    // already call into the host (the nav card subscribes to the mini-map).
    run('onJsReady', function () { bridge.onJsReady(); });

    run('shell', function () { App.ui.shell.init(); });
    run('board', function () { App.ui.board.init(); });
    run('settings ui', function () { App.ui.settingsUi.init(); });

    setTimeout(reveal, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window.App);
