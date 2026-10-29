/* Board: mounts widgets, owns long-press, drag, resize and the edit bar.
   Pixels are only used for the gesture preview; the stored layout is in cells. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var grid = App.core.grid;
  var schema = App.core.settingsSchema;
  var settings = App.services.settings;
  var viewport = App.ui.viewport;
  var dom = App.ui.dom;
  var presets = App.ui.presets;
  var shell = App.ui.shell;

  var boardEl = null;
  var editbar = null;
  var cards = {};
  var edit = false;
  var selected = null;
  var gesture = null;
  var ghost = null;
  var longPressTimer = null;
  var suppressClick = false;
  var suppressTimer = null;
  var observer = null;

  function suppressNextClick() {
    suppressClick = true;
    if (suppressTimer) clearTimeout(suppressTimer);
    suppressTimer = setTimeout(function () {
      suppressClick = false;
      suppressTimer = null;
    }, 600);
  }

  function axisName() {
    return viewport.orientation();
  }

  function layoutNow() {
    return settings.get().layouts[axisName()];
  }

  function createCtx(id, def, body, itemRef) {
    var cleanups = [];
    var demanded = {};

    function cleanup() {
      cleanups.forEach(function (fn) {
        try { fn(); } catch (error) { console.warn('[widget] cleanup failed', error); }
      });
      cleanups = [];
      Object.keys(demanded).forEach(function (name) {
        if (!demanded[name]) return;
        var service = App.services[name];
        if (service && service.demand) service.demand(false);
        demanded[name] = false;
      });
    }

    var ctx = {
      id: id,
      root: body,
      services: App.services,
      get settings() { return settings.widgetSettings(id); },
      get size() { return { w: itemRef.w, h: itemRef.h }; },
      get editing() { return edit; },
      on: function (type, handler) {
        var off = bus.on(type, handler);
        cleanups.push(off);
        return off;
      },
      every: function (ms, handler) {
        var timer = setInterval(handler, ms);
        cleanups.push(function () { clearInterval(timer); });
        return timer;
      },
      later: function (ms, handler) {
        var timer = setTimeout(handler, ms);
        cleanups.push(function () { clearTimeout(timer); });
        return timer;
      },
      demand: function (name, on) {
        var service = App.services[name];
        if (!service || !service.demand) {
          console.warn('[widget] unknown demand service: ' + name);
          return;
        }
        var wanted = !!on;
        if (demanded[name] === wanted) return;
        demanded[name] = wanted;
        service.demand(wanted);
      },
      toast: shell.toast,
      icon: dom.icon
    };

    return { ctx: ctx, cleanup: cleanup };
  }

  function fallback(entry, error) {
    console.error('[widget] ' + entry.id + ' failed', error);
    entry.broken = true;
    dom.clear(entry.body);
    entry.body.appendChild(dom.create('div', 'widget-fallback', 'Виджет не запустился'));
  }

  function ensureCard(def, item) {
    var id = def.id;
    var existing = cards[id];
    if (existing) return existing;

    var card = dom.create('div', 'card widget-' + id);
    card.dataset.widget = id;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', def.title);
    var body = dom.create('div', 'card-body');
    var handle = dom.create('div', 'card-handle');
    handle.dataset.resize = 'true';
    handle.setAttribute('aria-hidden', 'true');
    handle.appendChild(dom.icon('resize', 18));
    card.appendChild(body);
    card.appendChild(handle);

    var itemRef = { w: item.w, h: item.h };
    var made = createCtx(id, def, body, itemRef);
    var entry = {
      id: id,
      def: def,
      card: card,
      body: body,
      item: itemRef,
      ctx: made.ctx,
      cleanup: made.cleanup,
      instance: null,
      broken: false
    };

    try {
      entry.instance = def.create(entry.ctx) || {};
    } catch (error) {
      fallback(entry, error);
    }

    cards[id] = entry;
    boardEl.appendChild(card);
    if (observer) observer.observe(card);

    if (!entry.broken && entry.instance) {
      try {
        if (entry.instance.render) entry.instance.render();
        if (entry.instance.editChanged) entry.instance.editChanged(edit);
      } catch (error) {
        fallback(entry, error);
      }
    }
    return entry;
  }

  function place(entry, item) {
    var changed = entry.item.w !== item.w || entry.item.h !== item.h;
    entry.item.w = item.w;
    entry.item.h = item.h;
    entry.card.style.gridColumn = (item.x + 1) + ' / span ' + item.w;
    entry.card.style.gridRow = (item.y + 1) + ' / span ' + item.h;
    entry.card.dataset.w = String(item.w);
    entry.card.dataset.h = String(item.h);
    entry.card.classList.toggle('is-selected', selected === entry.id);
    if (changed && entry.instance && entry.instance.sizeChanged) {
      try {
        entry.instance.sizeChanged({ w: item.w, h: item.h });
      } catch (error) {
        fallback(entry, error);
      }
    }
  }

  function unmount(id) {
    var entry = cards[id];
    if (!entry) return;
    try {
      if (entry.instance && entry.instance.destroy) entry.instance.destroy();
    } catch (error) {
      console.warn('[widget] ' + id + ' destroy failed', error);
    }
    entry.cleanup();
    if (observer) observer.unobserve(entry.card);
    if (entry.card.parentNode) entry.card.parentNode.removeChild(entry.card);
    delete cards[id];
    if (selected === id) selected = null;
  }

  function render() {
    if (!boardEl || !settings.isReady()) return;
    var state = settings.get();
    var axis = axisName();
    var layout = state.layouts[axis];
    if (!layout) return;

    boardEl.style.setProperty('--cols', String(layout.grid.cols));
    boardEl.style.setProperty('--rows', String(layout.grid.rows));
    boardEl.dataset.orientation = axis;

    var active = schema.activeIds(state, axis);
    var activeMap = {};
    active.forEach(function (id) { activeMap[id] = true; });

    Object.keys(cards).forEach(function (id) {
      if (!activeMap[id]) unmount(id);
    });

    state.widgets.order.forEach(function (id) {
      if (!activeMap[id]) return;
      var def = App.registry && App.registry.get(id);
      var item = layout.items[id];
      if (!def || !item) return;
      var entry = ensureCard(def, item);
      place(entry, item);
    });

    if (selected && !cards[selected]) selected = null;
    boardEl.classList.toggle('is-editing', edit);
    boardEl.classList.toggle('is-empty', active.length === 0);
    shell.setEditing(edit);
    updateToolbar();
  }

  function setEditClasses() {
    Object.keys(cards).forEach(function (id) {
      cards[id].card.classList.toggle('is-selected', selected === id);
      if (cards[id].instance && cards[id].instance.editChanged) {
        try {
          cards[id].instance.editChanged(edit);
        } catch (error) {
          fallback(cards[id], error);
        }
      }
    });
  }

  function enterEdit(id) {
    if (!edit) {
      edit = true;
      boardEl.classList.add('is-editing');
      shell.setEditing(true);
    }
    if (id) selected = id;
    setEditClasses();
    updateToolbar();
  }

  function setEdit(value, id) {
    edit = !!value;
    if (!edit) selected = null;
    if (id) selected = id;
    boardEl.classList.toggle('is-editing', edit);
    shell.setEditing(edit);
    setEditClasses();
    updateToolbar();
  }

  function toggleEdit() {
    setEdit(!edit);
  }

  function deselect() {
    if (!selected) return;
    selected = null;
    setEditClasses();
    updateToolbar();
  }

  function metrics() {
    var layout = layoutNow();
    var rect = boardEl.getBoundingClientRect();
    var style = window.getComputedStyle(boardEl);
    var padLeft = parseFloat(style.paddingLeft) || 0;
    var padTop = parseFloat(style.paddingTop) || 0;
    var padRight = parseFloat(style.paddingRight) || 0;
    var padBottom = parseFloat(style.paddingBottom) || 0;
    var gapX = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
    var gapY = parseFloat(style.rowGap) || parseFloat(style.gap) || 0;
    var contentWidth = rect.width - padLeft - padRight;
    var contentHeight = rect.height - padTop - padBottom;
    return {
      axis: axisName(),
      grid: layout.grid,
      rect: rect,
      padLeft: padLeft,
      padTop: padTop,
      gapX: gapX,
      gapY: gapY,
      cellW: (contentWidth - gapX * (layout.grid.cols - 1)) / layout.grid.cols,
      cellH: (contentHeight - gapY * (layout.grid.rows - 1)) / layout.grid.rows
    };
  }

  function pixelLeft(measure, x) {
    return measure.padLeft + x * (measure.cellW + measure.gapX);
  }

  function pixelTop(measure, y) {
    return measure.padTop + y * (measure.cellH + measure.gapY);
  }

  function pixelWidth(measure, w) {
    return w * measure.cellW + (w - 1) * measure.gapX;
  }

  function pixelHeight(measure, h) {
    return h * measure.cellH + (h - 1) * measure.gapY;
  }

  function makeGhost(measure, x, y, w, h) {
    removeGhost();
    ghost = dom.create('div', 'drop-ghost');
    boardEl.appendChild(ghost);
    moveGhost(measure, x, y, w, h);
    return ghost;
  }

  function moveGhost(measure, x, y, w, h) {
    if (!ghost) return;
    ghost.style.left = pixelLeft(measure, x) + 'px';
    ghost.style.top = pixelTop(measure, y) + 'px';
    ghost.style.width = pixelWidth(measure, w) + 'px';
    ghost.style.height = pixelHeight(measure, h) + 'px';
  }

  function removeGhost() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function armLongPress(cardEl, event) {
    var id = cardEl.dataset.widget;
    var startX = event.clientX;
    var startY = event.clientY;
    var pointerId = event.pointerId;

    function cancel() {
      clearLongPress();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    }
    function onMove(moveEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      var dx = moveEvent.clientX - startX;
      var dy = moveEvent.clientY - startY;
      if (dx * dx + dy * dy > 100) cancel();
    }
    function onUp() {
      cancel();
    }

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);

    clearLongPress();
    longPressTimer = setTimeout(function () {
      longPressTimer = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      enterEdit(id);
      startDrag(cardEl, { clientX: startX, clientY: startY, pointerId: pointerId });
    }, 550);
  }

  function bindGesture() {
    document.addEventListener('pointermove', onGestureMove, { passive: false });
    document.addEventListener('pointerup', onGestureEnd);
    document.addEventListener('pointercancel', onGestureCancel);
  }

  function unbindGesture() {
    document.removeEventListener('pointermove', onGestureMove);
    document.removeEventListener('pointerup', onGestureEnd);
    document.removeEventListener('pointercancel', onGestureCancel);
  }

  function startDrag(cardEl, point) {
    var id = cardEl.dataset.widget;
    var entry = cards[id];
    if (!entry) return;
    selected = id;
    setEditClasses();
    updateToolbar();
    suppressNextClick();

    var measure = metrics();
    // entry.item only mirrors w/h for ctx.size; the committed cell position
    // lives in the layout.
    var item = layoutNow().items[id];
    if (!item) return;
    gesture = {
      mode: 'drag',
      id: id,
      pointerId: point.pointerId,
      startX: point.clientX,
      startY: point.clientY,
      measure: measure,
      origin: { x: item.x, y: item.y, w: item.w, h: item.h },
      target: { x: item.x, y: item.y, w: item.w, h: item.h },
      card: cardEl,
      moved: false
    };
    makeGhost(measure, item.x, item.y, item.w, item.h);
    cardEl.classList.add('is-dragging');
    bindGesture();
  }

  function startResize(cardEl, point) {
    var id = cardEl.dataset.widget;
    var entry = cards[id];
    if (!entry) return;
    selected = id;
    setEditClasses();
    updateToolbar();
    suppressNextClick();

    var measure = metrics();
    var item = layoutNow().items[id];
    if (!item) return;
    var def = entry.def;
    var min = schema.minSizeFor(def, measure.axis);
    gesture = {
      mode: 'resize',
      id: id,
      pointerId: point.pointerId,
      startX: point.clientX,
      startY: point.clientY,
      measure: measure,
      origin: { x: item.x, y: item.y, w: item.w, h: item.h },
      min: min,
      target: { x: item.x, y: item.y, w: item.w, h: item.h },
      card: cardEl,
      moved: false
    };
    makeGhost(measure, item.x, item.y, item.w, item.h);
    cardEl.classList.add('is-dragging');
    bindGesture();
  }

  function onGestureMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    var measure = gesture.measure;
    var dx = event.clientX - gesture.startX;
    var dy = event.clientY - gesture.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) gesture.moved = true;

    if (gesture.mode === 'drag') {
      var stepX = measure.cellW + measure.gapX;
      var stepY = measure.cellH + measure.gapY;
      var x = Math.round((gesture.origin.x * stepX + dx) / stepX);
      var y = Math.round((gesture.origin.y * stepY + dy) / stepY);
      gesture.target.x = utilsClamp(x, 0, measure.grid.cols - gesture.origin.w);
      gesture.target.y = utilsClamp(y, 0, measure.grid.rows - gesture.origin.h);
      gesture.card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      moveGhost(measure, gesture.target.x, gesture.target.y, gesture.origin.w, gesture.origin.h);
    } else {
      var stepWidth = measure.cellW + measure.gapX;
      var stepHeight = measure.cellH + measure.gapY;
      var width = Math.round((gesture.origin.w * stepWidth + dx) / stepWidth);
      var height = Math.round((gesture.origin.h * stepHeight + dy) / stepHeight);
      width = utilsClamp(width, gesture.min.w, measure.grid.cols - gesture.origin.x);
      height = utilsClamp(height, gesture.min.h, measure.grid.rows - gesture.origin.y);
      gesture.target.w = width;
      gesture.target.h = height;
      moveGhost(measure, gesture.origin.x, gesture.origin.y, width, height);
    }
  }

  function utilsClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finish(cancelled) {
    if (!gesture) return;
    var current = gesture;
    gesture = null;
    unbindGesture();
    removeGhost();
    current.card.classList.remove('is-dragging');
    current.card.style.transform = '';
    var axis = current.measure.axis;

    if (!cancelled && current.moved) {
      if (current.mode === 'drag') {
        if (current.target.x !== current.origin.x || current.target.y !== current.origin.y) {
          var moved = settings.moveWidget(axis, current.id, { x: current.target.x, y: current.target.y });
          if (!moved.ok) shell.toast('Нет свободных клеток: сначала уменьшите виджет', 'warn');
        }
      } else if (current.target.w !== current.origin.w || current.target.h !== current.origin.h) {
        var resized = settings.resizeWidget(axis, current.id, { w: current.target.w, h: current.target.h });
        if (!resized.ok) shell.toast('Не помещается: не хватает свободных клеток', 'warn');
      }
    }
    render();
  }

  function onGestureEnd(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    finish(false);
  }

  function onGestureCancel(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    finish(true);
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (shell.isModalOpen()) return;
    if (gesture) return;
    var cardEl = event.target.closest ? event.target.closest('.card') : null;
    if (!edit) {
      if (!cardEl) return;
      if (event.target.closest('[data-nodrag]')) return;
      armLongPress(cardEl, event);
      return;
    }
    if (!cardEl) {
      deselect();
      return;
    }
    if (event.target.closest('[data-resize]')) {
      event.preventDefault();
      startResize(cardEl, event);
      return;
    }
    event.preventDefault();
    startDrag(cardEl, event);
  }

  function buildToolbar() {
    editbar = document.getElementById('editbar');
    dom.clear(editbar);
    var main = dom.create('div', 'editbar-main');
    var title = dom.create('div', 'editbar-title', 'Правка раскладки');
    var sizes = dom.create('div', 'editbar-presets');
    main.appendChild(title);
    main.appendChild(sizes);
    var actions = dom.create('div', 'editbar-actions');
    var hide = dom.button('btn btn-ghost', 'Скрыть');
    hide.dataset.action = 'hide';
    var done = dom.button('btn btn-primary', 'Готово');
    done.dataset.action = 'done';
    var close = dom.button('icon-btn', '', 'close');
    close.dataset.action = 'done';
    close.setAttribute('aria-label', 'Выйти из правки');
    actions.appendChild(hide);
    actions.appendChild(done);
    actions.appendChild(close);
    editbar.appendChild(main);
    editbar.appendChild(actions);

    dom.delegate(editbar, '[data-action]', 'click', function (event, target) {
      var action = target.dataset.action;
      if (action === 'done') {
        setEdit(false);
        return;
      }
      if (action === 'hide' && selected) {
        // setEnabled emits settings:change synchronously and that unmounts
        // the card, which clears `selected`. Remember the id first.
        var hiddenId = selected;
        var result = settings.setEnabled(hiddenId, false);
        if (!result.ok) shell.toast('Нет свободной клетки для возврата', 'warn');
        else {
          selected = null;
          shell.toast('Виджет скрыт', '');
          render();
        }
        return;
      }
      if (action === 'size' && selected) {
        var w = parseInt(target.dataset.w, 10);
        var h = parseInt(target.dataset.h, 10);
        var resized = settings.resizeWidget(axisName(), selected, { w: w, h: h });
        if (!resized.ok) shell.toast('Не помещается: не хватает свободных клеток', 'warn');
      }
    });
  }

  function updateToolbar() {
    if (!editbar) return;
    editbar.classList.toggle('is-visible', edit);
    if (!edit) return;
    var title = editbar.querySelector('.editbar-title');
    var sizes = editbar.querySelector('.editbar-presets');
    var hide = editbar.querySelector('[data-action="hide"]');
    dom.clear(sizes);

    if (!selected || !cards[selected]) {
      dom.text(title, 'Выберите виджет');
      if (hide) hide.disabled = true;
      return;
    }
    var entry = cards[selected];
    var layout = layoutNow();
    var item = layout.items[selected];
    dom.text(title, entry.def.title);
    if (hide) hide.disabled = false;
    if (!item) return;

    presets.forWidget(entry.def, axisName(), item, layout.grid).forEach(function (preset) {
      var buttonEl = dom.create('button', 'size-chip' + (preset.current ? ' is-current' : ''), preset.label);
      buttonEl.type = 'button';
      buttonEl.dataset.action = 'size';
      buttonEl.dataset.w = String(preset.w);
      buttonEl.dataset.h = String(preset.h);
      sizes.appendChild(buttonEl);
    });
  }

  function onResize() {
    if (gesture) finish(true);
    if (settings.syncGrids()) return;
    render();
  }

  function init() {
    boardEl = document.getElementById('board');
    buildToolbar();
    if (window.ResizeObserver) {
      observer = new window.ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          var rect = entry.contentRect;
          entry.target.style.setProperty('--cw', rect.width.toFixed(1) + 'px');
          entry.target.style.setProperty('--ch', rect.height.toFixed(1) + 'px');
        });
      });
    }
    boardEl.addEventListener('pointerdown', onPointerDown);
    boardEl.addEventListener('click', function (event) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    boardEl.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    shell.editButton().addEventListener('click', toggleEdit);

    bus.on('settings:change', function () { render(); });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || shell.isModalOpen()) return;
      // A live gesture owns Escape first: exiting edit mode must not leave a
      // drag pointer armed.
      if (gesture) finish(true);
      else if (edit) setEdit(false);
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 140);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(onResize, 220);
    });

    render();
  }

  App.ui.board = {
    init: init,
    render: render,
    axis: axisName,
    setEdit: setEdit,
    toggleEdit: toggleEdit,
    isEditing: function () { return edit; },
    selected: function () { return selected; }
  };
})(window.App);
