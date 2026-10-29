/* Windows: all glass at once and each corner. The host sends no position back,
   so the widget shows what was sent, never a fake "open" state. */

(function (root) {
  'use strict';

  var def = {
    id: 'windows',
    title: 'Окна',
    description: 'Все окна и каждое отдельно',
    order: 44,
    defaultEnabled: false,
    defaultSize: { landscape: { w: 2, h: 2 }, portrait: { w: 2, h: 2 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var service = ctx.services.body;
      var node = ctx.root;

      node.classList.add('w-windows');

      var ARMED_MS = 4000;
      var HOLD_MS = 550;
      var IDLE_STATUS = 'Автомобиль не сообщает положение окон';
      var STOPS = [0, 10, 50, 100];
      var STOP_ACTIONS = { 0: 'win-close', 10: 'win-10', 50: 'win-50', 100: 'win-all' };

      var armed = null;
      var armTimer = 0;
      var press = null;
      var pressTimer = 0;
      var sliderValue = 0;
      var sliderArmed = false;
      var sliderTimer = 0;

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function statusNode() {
        return node.querySelector('.win-status');
      }

      function setStatus(text, kind) {
        var el = statusNode();
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-sent', kind === 'sent');
      }

      function disarm() {
        if (armTimer) {
          clearTimeout(armTimer);
          armTimer = 0;
        }
        if (!armed) return;
        var button = node.querySelector('[data-act="' + armed.id + '"]');
        if (button) {
          var label = button.querySelector('.win-btn-label');
          if (label) label.textContent = armed.text;
          button.classList.remove('is-armed');
        }
        armed = null;
      }

      function disarmSlider() {
        if (sliderTimer) {
          clearTimeout(sliderTimer);
          sliderTimer = 0;
        }
        if (!sliderArmed) return;
        sliderArmed = false;
        var input = node.querySelector('.win-slider');
        if (input) input.value = String(sliderValue);
        paintSlider();
        setStatus(IDLE_STATUS);
      }

      function sliderLabel(value) {
        if (value === 0) return 'Закрыто';
        if (value === 100) return 'Открыто';
        return value + ' %';
      }

      function paintSlider() {
        var input = node.querySelector('.win-slider');
        if (!input) return;
        var value = Number(input.value) || 0;
        input.style.setProperty('--fill', value + '%');
        var label = node.querySelector('.win-slider-value');
        if (label) label.textContent = sliderLabel(value);
      }

      function fire(action, full) {
        disarm();
        service.run(action.id, full);
      }

      function onAction(action, target) {
        if (ctx.editing) return;
        if (action.confirm && (!armed || armed.id !== action.id)) {
          disarm();
          var label = target.querySelector('.win-btn-label');
          armed = { id: action.id, text: label ? label.textContent : action.label };
          target.classList.add('is-armed');
          if (label) label.textContent = 'Ещё раз';
          armTimer = setTimeout(function () {
            disarm();
            setStatus(IDLE_STATUS);
          }, ARMED_MS);
          setStatus('Нажмите ещё раз: ' + String(action.title || action.label).toLowerCase(), 'confirm');
          return;
        }
        fire(action, false);
      }

      function cancelPress() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = 0;
        }
        press = null;
      }

      function bindHold() {
        node.addEventListener('pointerdown', function (event) {
          if (ctx.editing) return;
          if (event.button !== undefined && event.button !== 0) return;
          var target = event.target.closest ? event.target.closest('[data-full]') : null;
          if (!target || !node.contains(target)) return;
          var action = service.get(target.dataset.act);
          if (!action) return;
          cancelPress();
          var startX = event.clientX;
          var startY = event.clientY;
          var pointerId = event.pointerId;
          press = { id: action.id };

          function move(moveEvent) {
            if (moveEvent.pointerId !== pointerId) return;
            var dx = moveEvent.clientX - startX;
            var dy = moveEvent.clientY - startY;
            if (dx * dx + dy * dy > 100) finish();
          }
          function finish() {
            cancelPress();
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', finish);
            document.removeEventListener('pointercancel', finish);
          }
          document.addEventListener('pointermove', move, { passive: true });
          document.addEventListener('pointerup', finish);
          document.addEventListener('pointercancel', finish);

          pressTimer = setTimeout(function () {
            pressTimer = 0;
            finish();
            press = { id: action.id, opened: true, at: Date.now() };
            fire(action, true);
            // The tap that follows a hold must be swallowed, but a later tap
            // on the same corner is a new command.
            setTimeout(function () {
              if (press && press.opened) press = null;
            }, 700);
          }, HOLD_MS);
        });
      }

      function button(action, iconName, extraClass) {
        var nodeButton = dom.create('button', 'win-btn' + (extraClass ? ' ' + extraClass : ''));
        nodeButton.type = 'button';
        nodeButton.dataset.act = action.id;
        nodeButton.setAttribute('aria-label', action.title);
        nodeButton.title = action.title;
        if (action.full) {
          nodeButton.dataset.full = 'true';
          // Holding a corner is a window command, not the board's edit mode.
          nodeButton.dataset.nodrag = 'true';
        }

        var icon = dom.create('span', 'win-btn-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(dom.icon(iconName, 20));
        nodeButton.appendChild(icon);
        nodeButton.appendChild(dom.create('span', 'win-btn-label', action.label));
        return nodeButton;
      }

      function group(id, actions, iconFor, extraClass) {
        var spec = service.groups('windows').filter(function (item) { return item.id === id; })[0];
        var box = dom.create('div', 'win-group');
        var head = dom.create('div', 'win-head');
        head.appendChild(dom.create('span', 'win-title', spec ? spec.label : id));
        if (spec && spec.hint) head.appendChild(dom.create('span', 'win-hint', spec.hint));
        box.appendChild(head);

        var row = dom.create('div', 'win-row' + (extraClass ? ' ' + extraClass : ''));
        actions.forEach(function (action) {
          row.appendChild(button(action, iconFor(action)));
        });
        box.appendChild(row);
        return box;
      }

      function nearestStop(value) {
        var best = STOPS[0];
        var distance = Math.abs(value - best);
        STOPS.forEach(function (stop) {
          var delta = Math.abs(value - stop);
          if (delta < distance) {
            distance = delta;
            best = stop;
          }
        });
        return best;
      }

      function commitSlider(input) {
        var stop = nearestStop(Number(input.value) || 0);
        input.value = String(stop);
        if (stop === sliderValue) {
          paintSlider();
          return;
        }
        if (stop === 100 && !sliderArmed) {
          sliderArmed = true;
          if (sliderTimer) clearTimeout(sliderTimer);
          sliderTimer = setTimeout(function () {
            sliderTimer = 0;
            disarmSlider();
          }, ARMED_MS);
          setStatus('Ещё раз — открыть все окна полностью', 'confirm');
          input.value = String(sliderValue);
          paintSlider();
          return;
        }
        disarmSlider();
        sliderValue = stop;
        input.value = String(stop);
        paintSlider();
        var action = service.get(STOP_ACTIONS[stop]);
        if (action) fire(action, false);
      }

      function sliderGroup() {
        var spec = service.groups('windows').filter(function (item) { return item.id === 'windows'; })[0];
        var box = dom.create('div', 'win-group win-group--slider');
        var head = dom.create('div', 'win-head');
        head.appendChild(dom.create('span', 'win-title', spec ? spec.label : 'Все окна'));
        head.appendChild(dom.create('span', 'win-hint', '0 · 10 · 50 · 100 %'));
        box.appendChild(head);

        var row = dom.create('div', 'win-slider-row');
        // Pulling the slider must not arm the board's edit mode.
        row.dataset.nodrag = 'true';
        var icon = dom.create('span', 'win-slider-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(dom.icon('window', 20));

        var input = dom.create('input', 'win-slider range-input');
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.step = '1';
        input.value = String(sliderValue);
        input.setAttribute('aria-label', 'Все окна');

        var value = dom.create('span', 'win-slider-value', sliderLabel(sliderValue));
        row.appendChild(icon);
        row.appendChild(input);
        row.appendChild(value);
        box.appendChild(row);

        input.addEventListener('input', paintSlider);
        input.addEventListener('change', function () { commitSlider(input); });
        return box;
      }

      function build() {
        disarm();
        disarmSlider();
        dom.clear(node);
        cancelPress();

        var corners = service.groups('windows').filter(function (item) { return item.id === 'corners'; })[0];

        node.appendChild(sliderGroup());

        node.appendChild(group('corners', corners ? corners.actions : [], function (action) {
          return action.id === 'win-fr' || action.id === 'win-rr' ? 'windowRight' : 'windowLeft';
        }, 'win-row--corners'));

        var status = dom.create('div', 'win-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.textContent = IDLE_STATUS;
        node.appendChild(status);
      }

      dom.delegate(node, '[data-act]', 'click', function (event, target) {
        if (ctx.editing) return;
        event.stopPropagation();
        if (press && press.opened && press.id === target.dataset.act) {
          press = null;
          return;
        }
        var action = service.get(target.dataset.act);
        if (action) onAction(action, target);
      });

      ctx.on('body:result', function (event) {
        if (!event) return;
        disarm();
        disarmSlider();
        setStatus(event.text, event.ok ? 'sent' : 'error');
        ctx.toast(event.text, event.ok ? '' : 'warn');
      });

      bindHold();
      applySize(ctx.size);
      build();

      return {
        render: function () {
          applySize(ctx.size);
          build();
        },
        sizeChanged: applySize,
        destroy: function () {
          cancelPress();
          disarm();
          disarmSlider();
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
