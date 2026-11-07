/* Windows: all glass at once and each corner. A command only says the request
   was sent; the position comes from the host state read, so a number on a button
   is always the car's answer, never the value the user asked for. */

(function (root) {
  'use strict';

  var def = {
    id: 'windows',
    title: 'Окна',
    description: 'Все окна и каждое отдельно, с положением стекла',
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
      ctx.demand('body', true);

      var ARMED_MS = 4000;
      var HOLD_MS = 550;
      var RESULT_MS = 6000;
      var ICONS = {
        'win-close': 'windowClose',
        'win-vent': 'fan',
        'win-all': 'window',
        'win-fl': 'windowLeft',
        'win-fr': 'windowRight',
        'win-rl': 'windowLeft',
        'win-rr': 'windowRight'
      };
      var SHORT = { 'win-fl': 'ЛП', 'win-fr': 'ПП', 'win-rl': 'ЛЗ', 'win-rr': 'ПЗ' };

      var armed = null;
      var armTimer = 0;
      var press = null;
      var pressTimer = 0;
      var resultTimer = 0;
      // The service may have read the glass before this card subscribed, so the
      // mount pulls the last answer instead of waiting for the next push.
      var readout = service.snapshot();

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      function statusNode() {
        return node.querySelector('.win-status');
      }

      function summaryText() {
        if (!readout.reported) return 'Автомобиль не сообщает положение окон';
        var named = [];
        Object.keys(SHORT).forEach(function (id) {
          var action = service.get(id);
          var percent = readout.positions[action.window];
          if (!percent) return;
          named.push(SHORT[id] + ' ' + percent + '%');
        });
        if (named.length) return named.join(' · ');
        var knownPercents = readout.positions.filter(function (value) { return value !== null; }).length;
        var knownStates = readout.windows.filter(function (value) { return value !== null; }).length;
        if (knownPercents === 4 || knownStates === 4) return 'Все окна закрыты';
        return 'Положение окон неизвестно';
      }

      function setStatus(text, kind) {
        var el = statusNode();
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-sent', kind === 'sent');
      }

      function showSummary() {
        setStatus(summaryText());
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

      function fire(action, open) {
        disarm();
        service.run(action.id, open);
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
            showSummary();
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

      // A corner is one button with two gestures: a tap closes that window, a
      // hold opens it fully. The host has no per-window percentage.
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
            stopMove();
            stopUp();
            stopCancel();
          }
          // Through ctx.listen so an unmount during the hold cannot leave
          // document listeners behind; finish() removes them early, the
          // unmount cleanup of the same listeners is a harmless no-op.
          var stopMove = ctx.listen(document, 'pointermove', move, { passive: true });
          var stopUp = ctx.listen(document, 'pointerup', finish);
          var stopCancel = ctx.listen(document, 'pointercancel', finish);

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

      function percentText(id) {
        var action = service.get(id);
        if (!action) return '';
        var percent = readout.positions[action.window];
        if (percent === null) return readout.reported ? '—' : '';
        return percent + '%';
      }

      function button(action, extraClass) {
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
        icon.appendChild(dom.icon(ICONS[action.id] || 'window', 20));
        nodeButton.appendChild(icon);
        nodeButton.appendChild(dom.create('span', 'win-btn-label', action.label));
        if (action.full) nodeButton.appendChild(dom.create('span', 'win-btn-percent', percentText(action.id)));
        return nodeButton;
      }

      function group(spec, extraClass) {
        var box = dom.create('div', 'win-group');
        var head = dom.create('div', 'win-head');
        head.appendChild(dom.create('span', 'win-title', spec.label));
        if (spec.hint) head.appendChild(dom.create('span', 'win-hint', spec.hint));
        box.appendChild(head);

        var row = dom.create('div', 'win-row' + (extraClass ? ' ' + extraClass : ''));
        spec.actions.forEach(function (action) {
          row.appendChild(button(action));
        });
        box.appendChild(row);
        return box;
      }

      function paintPercents() {
        Object.keys(SHORT).forEach(function (id) {
          var buttonEl = node.querySelector('[data-act="' + id + '"] .win-btn-percent');
          if (buttonEl) buttonEl.textContent = percentText(id);
        });
      }

      function build() {
        disarm();
        cancelPress();
        dom.clear(node);

        var specs = service.groups('windows');
        specs.forEach(function (spec) {
          node.appendChild(group(spec, spec.id === 'corners' ? 'win-row--corners' : 'win-row--all'));
        });

        var status = dom.create('div', 'win-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        node.appendChild(status);
        showSummary();
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

      ctx.on('body:windows', function (event) {
        if (!event) return;
        readout.windows = event.windows;
        readout.positions = event.positions;
        readout.reported = !!event.reported;
        paintPercents();
        showSummary();
      });

      ctx.on('body:result', function (event) {
        if (!event) return;
        disarm();
        setStatus(event.text, event.ok ? 'sent' : 'error');
        ctx.toast(event.text, event.ok ? '' : 'warn');
        // The position read lands a moment later; until then the status keeps
        // saying what was sent rather than pretending to know the glass.
        if (resultTimer) clearTimeout(resultTimer);
        resultTimer = setTimeout(function () {
          resultTimer = 0;
          showSummary();
        }, RESULT_MS);
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
          if (resultTimer) {
            clearTimeout(resultTimer);
            resultTimer = 0;
          }
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
