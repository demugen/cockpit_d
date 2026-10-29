/* Settings modal: theme, font, widget visibility, reset and about. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var storage = App.core.storage;
  var utils = App.core.utils;
  var settings = App.services.settings;
  var wallpaper = App.services.wallpaper;
  var viewport = App.ui.viewport;
  var shell = App.ui.shell;
  var dom = App.ui.dom;

  var overlay = null;
  var panelBody = null;
  var picker = null;
  var pickerBody = null;
  var pickerTitle = null;
  var pickerIndex = -1;
  var open = false;
  var rendering = false;
  var lastFocus = null;
  var resetTimer = null;
  var resetArmed = false;

  var THEME_LABELS = { dark: 'Тёмная', light: 'Светлая', auto: 'Авто' };
  var FONT_LABELS = [[0.9, 'Мелкий'], [1, 'Обычный'], [1.15, 'Крупный'], [1.3, 'Максимум']];
  var AXIS_LABELS = { landscape: 'горизонтальный', portrait: 'вертикальный' };
  var SLOT_LABELS = [['left', 'Слева'], ['center', 'Центр'], ['right', 'Справа']];
  var ROTATE_LABELS = [[0, 'Выкл'], [10, '10 мин'], [30, '30 мин'], [60, '1 ч'], [180, '3 ч']];
  var APP_COUNTS = [[0, 'Авто'], [2, '2'], [4, '4'], [6, '6'], [8, '8']];

  function section(title) {
    var node = dom.create('section', 'settings-section');
    node.appendChild(dom.create('h3', 'settings-heading', title));
    return node;
  }

  function settingRow(label, hint, control, className) {
    var row = dom.create('div', 'setting-row' + (className ? ' ' + className : ''));
    var text = dom.create('div', 'setting-text');
    text.appendChild(dom.create('div', 'setting-label', label));
    if (hint) text.appendChild(dom.create('div', 'setting-hint', hint));
    row.appendChild(text);
    if (control) row.appendChild(control);
    return row;
  }

  function chips(options, current, onPick) {
    var wrap = dom.create('div', 'setting-chips');
    options.forEach(function (option) {
      var value = Array.isArray(option) ? option[0] : option.value;
      var label = Array.isArray(option) ? option[1] : option.label;
      var button = dom.create('button', 'setting-chip' + (value === current ? ' is-current' : ''), label);
      button.type = 'button';
      button.setAttribute('aria-pressed', value === current ? 'true' : 'false');
      button.addEventListener('click', function () { onPick(value); });
      wrap.appendChild(button);
    });
    return wrap;
  }

  function toggle(on, label, onPick) {
    var button = dom.create('button', 'switch' + (on ? ' is-on' : ''));
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', on ? 'true' : 'false');
    button.setAttribute('aria-label', label);
    button.appendChild(dom.create('span', 'switch-knob'));
    button.addEventListener('click', function () { onPick(!on); });
    return button;
  }

  function stepper(value, unit, onPick) {
    var limits = utils.TANK_LITERS;
    var wrap = dom.create('div', 'setting-stepper');
    var minus = dom.create('button', 'setting-step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Меньше на ' + limits.step + ' л');
    var plus = dom.create('button', 'setting-step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Больше на ' + limits.step + ' л');
    var input = dom.create('input', 'setting-number');
    input.type = 'number';
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = String(limits.step);
    input.value = String(value);
    input.setAttribute('aria-label', 'Объём бака, литры');

    function commit(raw) {
      var next = utils.clamp(Math.round(utils.toNumber(raw, value)), limits.min, limits.max);
      input.value = String(next);
      if (next !== value) onPick(next);
    }

    minus.addEventListener('click', function () {
      commit(utils.toNumber(input.value, value) - limits.step);
    });
    plus.addEventListener('click', function () {
      commit(utils.toNumber(input.value, value) + limits.step);
    });
    input.addEventListener('change', function () { commit(input.value); });

    wrap.appendChild(minus);
    wrap.appendChild(input);
    wrap.appendChild(dom.create('span', 'setting-unit', unit));
    wrap.appendChild(plus);
    return wrap;
  }

  var APP_SLOT_COUNT = 8;

  function storedSlots(state) {
    var appSettings = (state.widgets.settings && state.widgets.settings.apps) || {};
    return Array.isArray(appSettings.slots) ? appSettings.slots.slice(0, APP_SLOT_COUNT) : [];
  }

  function hasSlots(slots) {
    return slots.some(function (pkg) { return typeof pkg === 'string' && pkg; });
  }

  function installedApps() {
    return App.services.apps.state().apps;
  }

  function appByPackage(pkg) {
    var list = installedApps();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].package === pkg) return list[i];
    }
    return null;
  }

  function effectiveSlots(state) {
    var slots = storedSlots(state);
    if (hasSlots(slots)) return slots;
    var list = installedApps().map(function (app) { return app.package; }).slice(0, APP_SLOT_COUNT);
    while (list.length < APP_SLOT_COUNT) list.push('');
    return list;
  }

  function writeSlot(index, pkg) {
    var list = effectiveSlots(settings.get()).slice();
    while (list.length < APP_SLOT_COUNT) list.push('');
    // One app owns one slot: choosing an app that sits elsewhere swaps the
    // two slots instead of duplicating the tile.
    var existing = pkg ? list.indexOf(pkg) : -1;
    if (existing !== -1 && existing !== index) list[existing] = list[index] || '';
    list[index] = pkg || '';
    settings.setWidgetSettings('apps', { slots: list });
  }

  function slotControl(index, app, pkg) {
    var control = dom.create('div', 'slot-control');
    var choose = dom.button('btn btn-ghost btn-sm', app ? 'Заменить' : 'Выбрать');
    choose.addEventListener('click', function () { openAppPicker(index); });
    control.appendChild(choose);
    if (pkg) {
      var clear = dom.button('btn btn-ghost btn-sm btn-x', '×');
      clear.setAttribute('aria-label', 'Очистить слот ' + (index + 1));
      clear.addEventListener('click', function () { writeSlot(index, ''); });
      control.appendChild(clear);
    }
    return control;
  }

  function buildAppList(block, state) {
    var appsService = App.services.apps;
    var apps = appsService.state();
    var auto = !hasSlots(storedSlots(state));
    var effective = effectiveSlots(state);

    var refresh = dom.button('btn btn-ghost', 'Обновить');
    refresh.addEventListener('click', function () { appsService.load(true); });
    block.appendChild(settingRow(
      'Слоты приложений',
      auto ? 'Пока слоты не заданы — все приложения по порядку' : 'Выбранные приложения; пустые слоты пропускаются',
      refresh
    ));

    if (apps.loading) {
      block.appendChild(settingRow('Загрузка…', '', null));
      return;
    }
    if (!apps.apps.length) {
      block.appendChild(settingRow('Список пуст',
        apps.error === 'no_bridge' ? 'Нет связи с ГУ' : 'ГУ не вернуло приложения', null));
      return;
    }

    for (var i = 0; i < APP_SLOT_COUNT; i += 1) {
      var pkg = effective[i] || '';
      var app = pkg ? appByPackage(pkg) : null;
      var hint = app ? app.name + (auto ? ' · авто' : '') : (pkg ? 'Не найдено: ' + pkg : 'Не выбрано');
      block.appendChild(settingRow('Слот ' + (i + 1), hint, slotControl(i, app, pkg), 'slot-row'));
    }

    if (!auto) {
      var reset = dom.button('btn btn-ghost', 'Сбросить');
      reset.addEventListener('click', function () {
        settings.setWidgetSettings('apps', { slots: [] });
      });
      block.appendChild(settingRow('Вернуть автоматический список',
        'Все приложения по порядку', reset));
    }
  }

  function pickerItem(app, selected, onPick) {
    var button = dom.create('button', 'picker-item' + (selected ? ' is-selected' : ''));
    button.type = 'button';
    var glyph = dom.create('div', 'picker-icon');
    if (app.icon) {
      var image = dom.create('img');
      image.alt = '';
      image.src = app.icon;
      glyph.appendChild(image);
    } else {
      dom.text(glyph, (app.name || '?').charAt(0).toUpperCase());
    }
    var text = dom.create('div', 'picker-text');
    text.appendChild(dom.create('div', 'picker-name', app.name));
    text.appendChild(dom.create('div', 'picker-meta', app.package));
    button.appendChild(glyph);
    button.appendChild(text);
    button.addEventListener('click', function () { onPick(app); });
    return button;
  }

  function renderPicker() {
    if (!picker || pickerIndex < 0) return;
    dom.clear(pickerBody);
    dom.text(pickerTitle, 'Слот ' + (pickerIndex + 1));
    var apps = App.services.apps.state();
    var current = effectiveSlots(settings.get())[pickerIndex] || '';

    var clear = dom.create('button', 'picker-item picker-clear');
    clear.type = 'button';
    var clearIcon = dom.create('div', 'picker-icon', '×');
    var clearText = dom.create('div', 'picker-text');
    clearText.appendChild(dom.create('div', 'picker-name', 'Убрать из слота'));
    clearText.appendChild(dom.create('div', 'picker-meta', 'Слот станет пустым'));
    clear.appendChild(clearIcon);
    clear.appendChild(clearText);
    clear.addEventListener('click', function () { chooseApp(null); });
    pickerBody.appendChild(clear);

    if (apps.loading) {
      pickerBody.appendChild(dom.create('p', 'picker-empty', 'Загрузка приложений…'));
      return;
    }
    if (!apps.apps.length) {
      pickerBody.appendChild(dom.create('p', 'picker-empty',
        apps.error === 'no_bridge' ? 'Нет связи с ГУ' : 'Список приложений пуст'));
      return;
    }
    apps.apps.forEach(function (app) {
      pickerBody.appendChild(pickerItem(app, app.package === current, chooseApp));
    });
  }

  function openAppPicker(index) {
    if (!picker) return;
    pickerIndex = index;
    renderPicker();
    App.services.apps.load(false);
    picker.hidden = false;
    var closeButton = picker.querySelector('.modal-head .icon-btn');
    if (closeButton) closeButton.focus();
  }

  function closeAppPicker() {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    pickerIndex = -1;
  }

  function chooseApp(app) {
    var index = pickerIndex;
    closeAppPicker();
    if (index < 0) return;
    writeSlot(index, app ? app.package : '');
  }

  function buildPicker() {
    picker = dom.create('div', 'modal-overlay picker-overlay');
    picker.hidden = true;

    var panel = dom.create('div', 'modal-panel picker-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'picker-title');

    var head = dom.create('div', 'modal-head');
    pickerTitle = dom.create('h2', 'modal-title', 'Приложение');
    pickerTitle.id = 'picker-title';
    var closeButton = dom.button('icon-btn', '', 'close');
    closeButton.setAttribute('aria-label', 'Закрыть выбор приложения');
    head.appendChild(pickerTitle);
    head.appendChild(closeButton);

    pickerBody = dom.create('div', 'picker-body');
    panel.appendChild(head);
    panel.appendChild(pickerBody);
    picker.appendChild(panel);

    closeButton.addEventListener('click', closeAppPicker);
    picker.addEventListener('click', function (event) {
      if (event.target === picker) closeAppPicker();
    });
    document.getElementById('modal-root').appendChild(picker);
  }

  function buildAppearance() {
    var state = settings.get();
    var block = section('Вид');

    block.appendChild(settingRow(
      'Тема',
      'Тёмная, светлая или по схеме системы',
      chips(['dark', 'light', 'auto'].map(function (value) {
        return [value, THEME_LABELS[value]];
      }), state.theme, function (value) {
        settings.patch({ theme: value });
      })
    ));

    block.appendChild(settingRow(
      'Размер шрифта',
      'Подписи и значения во всех виджетах',
      chips(FONT_LABELS, state.fontScale, function (value) {
        settings.patch({ fontScale: value });
      })
    ));

    return block;
  }

  function buildHeader() {
    var state = settings.get();
    var block = section('Шапка');

    block.appendChild(settingRow(
      'Плитки авто',
      'Топливо, напряжение АКБ и температура за бортом',
      toggle(state.header.carChips, 'Плитки авто', function (next) {
        settings.patch({ header: { carChips: next } });
      })
    ));

    block.appendChild(settingRow(
      'Часы',
      'В каком слоте шапки показывать время',
      chips(SLOT_LABELS, state.header.clockSlot, function (value) {
        settings.patch({ header: { clockSlot: value } });
      })
    ));

    block.appendChild(settingRow(
      'Плитки авто: место',
      'Слот для топлива, АКБ и температуры',
      chips(SLOT_LABELS, state.header.chipsSlot, function (value) {
        settings.patch({ header: { chipsSlot: value } });
      })
    ));

    return block;
  }

  function buildBackground() {
    var state = settings.get();
    var block = section('Обои');
    var grid = dom.create('div', 'settings-wallpapers');

    function tile(path, label) {
      var active = state.background.image === path;
      var button = dom.create('button', 'wallpaper-thumb' + (active ? ' is-active' : ''));
      button.type = 'button';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.title = label;
      if (path) {
        var image = dom.create('img', 'wallpaper-image');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.src = wallpaper.thumb(path);
        button.appendChild(image);
      } else {
        button.classList.add('is-blank');
        button.appendChild(dom.create('span', 'wallpaper-blank', 'Без обоев'));
      }
      button.addEventListener('click', function () { wallpaper.apply(path); });
      grid.appendChild(button);
    }

    tile('', 'Без обоев');
    wallpaper.locals().forEach(function (path) {
      tile(path, path.split('/').pop());
    });
    block.appendChild(grid);

    block.appendChild(settingRow(
      'Автосмена',
      'Листает выбранные обои по кругу, пока экран включён',
      chips(ROTATE_LABELS, state.background.rotateMinutes, function (value) {
        settings.patch({ background: { rotateMinutes: value } });
      })
    ));

    return block;
  }

  function buildWidgets() {
    var registry = App.registry;
    var state = settings.get();
    var block = section('Виджеты');

    var actions = dom.create('div', 'settings-actions');
    var edit = dom.button('btn btn-primary', 'Править раскладку', 'edit');
    edit.addEventListener('click', function () {
      close();
      if (App.ui.board) App.ui.board.setEdit(true);
    });
    var reset = dom.button('btn btn-ghost', resetArmed ? 'Нажмите ещё раз' : 'Сбросить всё');
    if (resetArmed) reset.classList.add('is-danger');
    reset.addEventListener('click', function () {
      if (!resetArmed) {
        resetArmed = true;
        reset.textContent = 'Нажмите ещё раз';
        reset.classList.add('is-danger');
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(function () {
          resetArmed = false;
          if (open) renderBody();
        }, 4000);
        return;
      }
      resetArmed = false;
      if (resetTimer) clearTimeout(resetTimer);
      settings.reset();
      shell.toast('Настройки сброшены');
    });
    actions.appendChild(edit);
    actions.appendChild(reset);
    block.appendChild(actions);

    registry.all().forEach(function (def) {
      var enabled = state.widgets.enabled[def.id] !== false;
      var item = state.layouts[viewport.orientation()].items[def.id];
      var hint = def.description || '';
      if (!enabled) hint = hint ? hint + ' · выключен' : 'Выключен';
      else if (!item) hint = hint ? hint + ' · не помещён' : 'Не помещён на сетку';
      block.appendChild(settingRow(
        def.title,
        hint,
        toggle(enabled, def.title, function (next) {
          var result = settings.setEnabled(def.id, next);
          if (!result.ok) {
            shell.toast('Нет места на сетке для этого виджета', 'warn');
            renderBody();
          }
        }),
        'widget-row' + (enabled ? '' : ' is-off')
      ));

      if (def.id === 'apps') {
        var widget = state.widgets.settings.apps || {};
        var count = Number(widget.count) || 0;
        block.appendChild(settingRow(
          'Плитки приложений',
          'Авто — сколько влезает в текущий размер карточки',
          chips(APP_COUNTS, count, function (value) {
            settings.setWidgetSettings('apps', { count: value });
          })
        ));
        buildAppList(block, state);
      }

      if (def.id === 'cardata') {
        var tank = utils.tankVolume((state.widgets.settings.cardata || {}).tankLiters);
        block.appendChild(settingRow(
          'Объём бака',
          'Литры топлива считаются из процента; шаг 1 л, число можно ввести вручную',
          stepper(tank, 'л', function (value) {
            settings.setWidgetSettings('cardata', { tankLiters: value });
          })
        ));
      }
    });

    return block;
  }

  function buildAbout() {
    var registry = App.registry;
    var state = settings.get();
    var axis = viewport.orientation();
    var board = state.layouts[axis].grid;
    var mode = bridge.isStub() ? 'Демо-стенд' : (bridge.isNative() ? 'Головное устройство' : 'Нет связи');
    var enabledCount = registry.all().filter(function (def) {
      return state.widgets.enabled[def.id] !== false;
    }).length;
    var block = section('О панели');

    [
      ['Версия', App.version],
      ['Связь', mode],
      ['Хранилище', storage.isPersistent() ? 'Локальное' : 'В памяти'],
      ['Сетка', AXIS_LABELS[axis] + ', ' + board.cols + ' × ' + board.rows],
      ['Виджеты', enabledCount + ' из ' + registry.all().length]
    ].forEach(function (row) {
      var node = dom.create('div', 'about-row');
      node.appendChild(dom.create('span', 'about-key', row[0]));
      node.appendChild(dom.create('span', 'about-value', String(row[1])));
      block.appendChild(node);
    });

    block.appendChild(dom.create('p', 'about-note',
      'Cockpit D собирается без зависимостей и работает внутри JCarTools. ' +
      'Раскладка хранится отдельно для горизонтального и вертикального экрана.'));
    return block;
  }

  function renderBody() {
    if (!panelBody || rendering) return;
    rendering = true;
    try {
      var scroll = panelBody.scrollTop;
      dom.clear(panelBody);
      panelBody.appendChild(buildAppearance());
      panelBody.appendChild(buildBackground());
      panelBody.appendChild(buildHeader());
      panelBody.appendChild(buildWidgets());
      panelBody.appendChild(buildAbout());
      panelBody.scrollTop = scroll;
    } finally {
      rendering = false;
    }
  }

  function buildOverlay() {
    overlay = dom.create('div', 'modal-overlay');
    overlay.id = 'settings-modal';
    overlay.hidden = true;

    var panel = dom.create('div', 'modal-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'settings-title');

    var head = dom.create('div', 'modal-head');
    var title = dom.create('h2', 'modal-title', 'Настройки');
    title.id = 'settings-title';
    var closeButton = dom.button('icon-btn', '', 'close');
    closeButton.setAttribute('aria-label', 'Закрыть настройки');
    head.appendChild(title);
    head.appendChild(closeButton);

    panelBody = dom.create('div', 'modal-body');
    panel.appendChild(head);
    panel.appendChild(panelBody);
    overlay.appendChild(panel);

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });

    document.getElementById('modal-root').appendChild(overlay);
  }

  function openModal() {
    if (open) return;
    // The app list is editable here, so make sure it is loaded even when the
    // apps widget itself is switched off.
    App.services.apps.load(false);
    open = true;
    lastFocus = document.activeElement;
    renderBody();
    overlay.hidden = false;
    document.body.classList.add('modal-open');
    var closeButton = overlay.querySelector('.modal-head .icon-btn');
    if (closeButton) closeButton.focus();
  }

  function close() {
    if (!open) return;
    closeAppPicker();
    open = false;
    overlay.hidden = true;
    document.body.classList.remove('modal-open');
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
    resetArmed = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function init() {
    buildOverlay();
    buildPicker();
    var button = shell.settingsButton();
    if (button) button.addEventListener('click', openModal);

    bus.on('settings:change', function () {
      if (open) renderBody();
    });
    bus.on('apps:change', function () {
      if (open) renderBody();
      if (picker && !picker.hidden) renderPicker();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (picker && !picker.hidden) {
        event.preventDefault();
        closeAppPicker();
        return;
      }
      if (open) {
        event.preventDefault();
        close();
      }
    });
  }

  App.ui.settingsUi = {
    init: init,
    open: openModal,
    close: close,
    isOpen: function () { return open; }
  };
})(window.App);
