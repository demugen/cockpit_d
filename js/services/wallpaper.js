/* Wallpaper: bundled photos, a plain black background and timed rotation.
   Only the chosen image is stored in settings; rotation repaints the layer
   without touching the layout or the board. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var settings = App.services.settings;

  // A file:// WebView cannot list a folder, so the gallery is listed here.
  // To add a photo, copy it to assets/wallpapers, put a small copy in
  // assets/wallpapers/thumbs and add the path below.
  var LOCALS = [
    'assets/wallpapers/gradient-sunset-sky.jpg',
    'assets/wallpapers/abstract-lighthouse-at-sea.jpg',
    'assets/wallpapers/autumn-leaves-red-orange.jpg',
    'assets/wallpapers/Ave-calvar-cave.jpg',
    'assets/wallpapers/black-hole-field.jpg',
    'assets/wallpapers/black-hole-illustration.jpg',
    'assets/wallpapers/Blue-wave-abstract.jpg',
    'assets/wallpapers/fw-tower.jpg',
    'assets/wallpapers/gandalf-balrog-fire.jpg',
    'assets/wallpapers/golden-gate-bridge-fog.jpg',
    'assets/wallpapers/gruvbox-wave-crash-imagegonord.jpg',
    'assets/wallpapers/guillaume-auceps-unsplash.jpg',
    'assets/wallpapers/hanyijie.jpg',
    'assets/wallpapers/jonny-gios-unsplash.jpg',
    'assets/wallpapers/kace-rodriguez-unsplash.jpg',
    'assets/wallpapers/kriegs-2024-february.jpg',
    'assets/wallpapers/Lotr-inspired-landscape-tyron603.jpg',
    'assets/wallpapers/majestic-mountain-silhouette.jpg',
    'assets/wallpapers/max-suleimanov-winter-ruins.jpg',
    'assets/wallpapers/mountain-sunset-silhouette.jpg',
    'assets/wallpapers/nord-mountain-sunset.jpg',
    'assets/wallpapers/Tide-iswanto-arif.jpg',
    'assets/wallpapers/winding-mountain-road-sunset.jpg',
    'assets/wallpapers/Woods.jpg'
  ];

  var element = null;
  var chosen = '';
  var visible = '';
  var rotateTimer = null;

  function isKnown(path) {
    return LOCALS.indexOf(path) !== -1;
  }

  function cssUrl(value) {
    return 'url("' + String(value).replace(/["\\\r\n]/g, function (ch) {
      return '\\' + ch.charCodeAt(0).toString(16) + ' ';
    }) + '")';
  }

  function paint(path) {
    visible = path;
    if (!element) element = document.getElementById('wallpaper');
    if (!element) return;
    if (path) {
      element.style.backgroundImage = cssUrl(path);
      element.classList.remove('is-blank');
      document.body.dataset.wallpaper = 'image';
    } else {
      element.style.backgroundImage = 'none';
      element.classList.add('is-blank');
      document.body.dataset.wallpaper = 'off';
    }
    bus.emit('wallpaper:change', { image: visible, chosen: chosen });
  }

  function schedule(minutes) {
    if (rotateTimer) {
      clearInterval(rotateTimer);
      rotateTimer = null;
    }
    if (!minutes || !chosen) return;
    rotateTimer = setInterval(function () {
      if (document.hidden) return;
      next();
    }, minutes * 60000);
  }

  function next() {
    if (!chosen) return '';
    var index = LOCALS.indexOf(visible);
    var path = LOCALS[(index + 1) % LOCALS.length];
    paint(path);
    return path;
  }

  function apply(path) {
    var image = isKnown(path) ? path : '';
    settings.patch({ background: { image: image } });
    return image;
  }

  function init() {
    element = document.getElementById('wallpaper');
    var saved = settings.get().background.image;
    chosen = isKnown(saved) ? saved : '';
    paint(chosen);
    schedule(settings.get().background.rotateMinutes);

    bus.on('settings:change', function (event) {
      var state = event.state;
      var image = isKnown(state.background.image) ? state.background.image : '';
      if (image !== chosen) {
        chosen = image;
        paint(chosen);
      }
      schedule(state.background.rotateMinutes);
    });
  }

  App.services.wallpaper = {
    init: init,
    locals: function () { return LOCALS.slice(); },
    thumb: function (path) {
      return String(path).replace('assets/wallpapers/', 'assets/wallpapers/thumbs/');
    },
    current: function () { return visible; },
    chosen: function () { return chosen; },
    next: next,
    apply: apply
  };
})(window.App);
