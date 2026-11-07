/* Now playing: artwork, title, progress, transport and volume. */

(function (root) {
  'use strict';

  var def = {
    id: 'media',
    title: 'Музыка',
    description: 'Трек, обложка, переключение и громкость',
    order: 30,
    defaultSize: { landscape: { w: 4, h: 1 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 3, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var utils = App.core.utils;
      var service = ctx.services.media;
      var node = ctx.root;

      node.classList.add('w-media');
      ctx.demand('media', true);

      var art = dom.create('div', 'media-art');
      var image = dom.create('img', 'media-image');
      image.alt = '';
      // An <img> with no picture yet paints the WebView's broken-image outline
      // inside the cover square, so it starts hidden and only shows on load.
      image.hidden = true;
      var placeholder = dom.create('div', 'media-placeholder');
      placeholder.appendChild(dom.icon('music', 30));
      art.appendChild(image);
      art.appendChild(placeholder);

      var artSrc = '';
      image.addEventListener('load', function () {
        if (image.getAttribute('src') !== artSrc) return;
        image.hidden = false;
        placeholder.hidden = true;
      });
      image.addEventListener('error', function () {
        if (image.getAttribute('src') !== artSrc) return;
        image.hidden = true;
        placeholder.hidden = false;
      });


      var info = dom.create('div', 'media-info');
      var title = dom.create('div', 'media-title');
      var artist = dom.create('div', 'media-artist');
      var meta = dom.create('div', 'media-meta');
      var progress = dom.create('div', 'media-progress');
      var bar = dom.create('div', 'media-bar');
      progress.appendChild(bar);
      var times = dom.create('div', 'media-times');
      var position = dom.create('span', 'media-pos', '0:00');
      var duration = dom.create('span', 'media-dur', '0:00');
      times.appendChild(position);
      times.appendChild(duration);
      info.appendChild(title);
      info.appendChild(artist);
      info.appendChild(meta);
      info.appendChild(progress);
      info.appendChild(times);

      var controls = dom.create('div', 'media-controls');
      var playButton = dom.button('media-btn media-play', '', 'play');
      playButton.dataset.act = 'play';
      playButton.setAttribute('aria-label', 'Воспроизведение');
      var nextButton = dom.button('media-btn media-next', '', 'next');
      nextButton.dataset.act = 'next';
      nextButton.setAttribute('aria-label', 'Следующий трек');

      var volumeBox = dom.create('div', 'media-volume');
      // A press on the slider must not arm the board's edit mode.
      volumeBox.dataset.nodrag = 'true';
      var volumeIcon = dom.create('span', 'media-volume-icon');
      volumeIcon.appendChild(dom.icon('volume', 18));
      var downButton = dom.button('media-btn media-vol-step', '', 'minus');
      downButton.dataset.act = 'vol-down';
      downButton.setAttribute('aria-label', 'Тише');
      var volumeSlider = dom.create('input', 'media-slider range-input');
      volumeSlider.type = 'range';
      volumeSlider.min = '0';
      volumeSlider.max = '100';
      volumeSlider.step = '1';
      volumeSlider.value = '50';
      volumeSlider.setAttribute('aria-label', 'Громкость');
      var upButton = dom.button('media-btn media-vol-step', '', 'plus');
      upButton.dataset.act = 'vol-up';
      upButton.setAttribute('aria-label', 'Громче');
      var volumeValue = dom.create('span', 'media-vol-value', '—');
      volumeBox.appendChild(volumeIcon);
      volumeBox.appendChild(downButton);
      volumeBox.appendChild(volumeSlider);
      volumeBox.appendChild(upButton);
      volumeBox.appendChild(volumeValue);

      controls.appendChild(playButton);
      controls.appendChild(nextButton);

      node.appendChild(art);
      node.appendChild(info);
      node.appendChild(controls);
      node.appendChild(volumeBox);

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function updateProgress(pos, dur) {
        var total = dur > 0 ? dur : 0;
        var current = Math.max(0, Math.min(pos || 0, total || (pos || 0)));
        var percent = total > 0 ? (current / total) * 100 : 0;
        bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
        dom.text(position, utils.formatDuration(current / 1000));
        dom.text(duration, utils.formatDuration(total / 1000));
      }

      // While the finger is on the slider its own value is the truth: paint()
      // must not write the host level back into the middle of a drag.
      var dragging = false;
      var stepsExplained = false;

      function shownVolume() {
        var state = service.state();
        return dragging ? Number(volumeSlider.value) : state.volume;
      }

      function paintVolume(volume) {
        var known = typeof volume === 'number' && isFinite(volume);
        var shown = known ? Math.round(volume) : Number(volumeSlider.value || 50);
        if (!dragging && document.activeElement !== volumeSlider) {
          volumeSlider.value = String(known ? shown : 50);
        }
        var current = Number(volumeSlider.value);
        volumeSlider.style.setProperty('--fill', current + '%');
        dom.text(volumeValue, known || dragging || document.activeElement === volumeSlider ? current + '%' : '—');
        volumeSlider.setAttribute('aria-valuetext', current + '%');
        var mode = service.state().volumeMode;
        volumeSlider.disabled = mode === 'none';
        downButton.disabled = mode === 'none';
        upButton.disabled = mode === 'none';
        var hint = mode === 'exact' ? 'Громкость ГУ'
          : mode === 'steps' ? 'Громкость: шаг 1 %, ГУ не принимает точное значение'
            : 'ГУ не разрешает управлять громкостью';
        volumeBox.title = hint;
      }

      function paint() {
        var state = service.state();
        var known = !!state.known;
        var trackTitle = known ? (state.title || 'Без названия') : 'Нет трека';
        var trackArtist = known ? (state.artist || '') : 'Запустите музыку на ГУ';

        dom.text(title, trackTitle);
        dom.text(artist, trackArtist);
        dom.text(meta, state.album || '');

        if (state.art && state.art !== artSrc) {
          artSrc = state.art;
          image.hidden = true;
          placeholder.hidden = false;
          image.src = artSrc;
        } else if (!state.art && artSrc) {
          artSrc = '';
          image.hidden = true;
          image.removeAttribute('src');
          placeholder.hidden = false;
        }

        dom.clear(playButton);
        playButton.appendChild(dom.icon(state.playing ? 'pause' : 'play', 22));
        dom.setPressed(playButton, state.playing);
        playButton.setAttribute('aria-label', state.playing ? 'Пауза' : 'Играть');

        var canControl = known;
        [playButton, nextButton].forEach(function (button) {
          button.disabled = !canControl && !state.playing;
        });

        paintVolume(state.volume);
        updateProgress(state.position, state.duration);
      }

      volumeSlider.addEventListener('pointerdown', function () { dragging = true; });
      volumeSlider.addEventListener('input', function () {
        dragging = true;
        paintVolume(shownVolume());
      });
      // "change" also fires for the keyboard, where no pointerdown ran: force
      // covers it, while pointerup only commits a drag that actually started.
      function commit(force) {
        if (!dragging && !force) return;
        dragging = false;
        if (!service.setVolume(Number(volumeSlider.value))) paint();
      }
      volumeSlider.addEventListener('change', function () { commit(true); });
      ctx.listen(window, 'pointerup', function () { commit(false); });
      ctx.listen(window, 'pointercancel', function () {
        dragging = false;
        paint();
      });

      dom.delegate(node, '[data-act]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        var action = target.dataset.act;
        if (action === 'play') service.playPause();
        else if (action === 'next') service.nextTrack();
        else if (action === 'vol-up') service.nudgeVolume(5);
        else if (action === 'vol-down') service.nudgeVolume(-5);
      });

      ctx.on('media:change', paint);
      ctx.on('media:tick', function (tick) {
        updateProgress(tick.position, tick.duration);
      });
      ctx.on('media:command', function (result) {
        if (result.ok) {
          // Explaining the 1 % steps once is useful; repeating it on every
          // drag buries the rest of the toasts.
          if (result.mode === 'steps' && !stepsExplained) {
            stepsExplained = true;
            ctx.toast('Громкость меняется шагами по 1 %', '');
          }
          return;
        }
        var reasons = {
          unavailable: 'ГУ не умеет менять громкость',
          unknown_level: 'ГУ не отдаёт текущую громкость',
          unauthorized: 'ГУ не разрешил менять громкость',
          license_required: 'Громкость доступна по лицензии JCarTools'
        };
        ctx.toast(reasons[result.error] || utils.errorText(result.error, 'Плеер не принял команду'), 'warn');
      });

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
