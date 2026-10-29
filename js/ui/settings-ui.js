/* Settings modal: theme, font, widget visibility, reset and about. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var storage = App.core.storage;
  var utils = App.core.utils;
  var slots = App.core.slots;
  var metrics = App.core.carMetrics;
  var seatCatalog = App.core.seatCatalog;
  var settings = App.services.settings;
  var wallpaper = App.services.wallpaper;
  var viewport = App.ui.viewport;
  var shell = App.ui.shell;
  var dom = App.ui.dom;

  var overlay = null;
  var panelBody = null;
  var tabsBar = null;
  var activeTab = 'view';
  var picker = null;
  var pickerBody = null;
  var pickerTitle = null;
  var pickerConfig = null;
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
  var TABS = [
    { id: 'view', label: 'Вид' },
    { id: 'wallpaper', label: 'Обои' },
    { id: 'widgets', label: 'Виджеты' },
    { id: 'about', label: 'О панели' }
  ];

  function section(title) {
    var node = dom.create('section', 'settings-section');
    if (title) node.appendChild(dom.create('h3', 'settings-heading', title));
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

  function storedSlots(state, widgetId) {
    var widget = (state.widgets.settings && state.widgets.settings[widgetId]) || {};
    return slots.list(widget.slots);
  }

  function autoSlots(config, state) {
    var ids = typeof config.auto === 'function' ? config.auto(state) : (config.auto || []);
    return slots.padded(ids, slots.MAX);
  }

  function effectiveSlots(config, state) {
    var stored = storedSlots(state, config.widgetId);
    return slots.has(stored) ? slots.padded(stored, slots.MAX) : autoSlots(config, state);
  }

  function writeSlot(config, index, id) {
    var state = settings.get();
    var stored = storedSlots(state, config.widgetId);
    var base = slots.has(stored) ? stored : effectiveSlots(config, state);
    settings.setWidgetSettings(config.widgetId, {
      slots: slots.write(base, index, id, slots.MAX)
    });
  }

  function slotIcon(entry) {
    var icon = dom.create('span', 'slot-tile-icon');
    if (entry.image) {
      var image = dom.create('img');
      image.alt = '';
      image.src = entry.image;
      icon.appendChild(image);
    } else if (entry.mask) {
      var mask = dom.create('span', 'brand-mask brand-mask--' + entry.mask);
      mask.setAttribute('aria-hidden', 'true');
      icon.appendChild(mask);
    } else if (entry.iconName) {
      icon.appendChild(dom.icon(entry.iconName, 18));
    } else {
      dom.text(icon, entry.glyph || (entry.title || '?').charAt(0).toUpperCase());
    }
    return icon;
  }

  function slotTile(config, index, id) {
    var wrap = dom.create('div', 'slot-tile-wrap');
    var button = dom.create('button', 'slot-tile' + (id ? '' : ' slot-tile--empty'));
    button.type = 'button';
    if (id) {
      var entry = config.tile(id) || { title: 'Не найдено', glyph: '?' };
      button.setAttribute('aria-label', 'Слот ' + (index + 1) + ': ' + entry.title + ', заменить');
      button.title = entry.title;
      button.appendChild(slotIcon(entry));
      button.appendChild(dom.create('span', 'slot-tile-name', entry.title));
    } else {
      button.setAttribute('aria-label', 'Слот ' + (index + 1) + ': пусто, выбрать');
      button.appendChild(dom.create('span', 'slot-tile-plus', '+'));
      button.appendChild(dom.create('span', 'slot-tile-index', String(index + 1)));
    }
    button.addEventListener('click', function () { openSlotPicker(config, index); });
    wrap.appendChild(button);

    if (id) {
      var clear = dom.create('button', 'slot-tile-clear', '×');
      clear.type = 'button';
      clear.setAttribute('aria-label', 'Очистить слот ' + (index + 1));
      clear.addEventListener('click', function () { writeSlot(config, index, ''); });
      wrap.appendChild(clear);
    }
    return wrap;
  }

  // One grid for every widget that stores picked items: apps, seat functions
  // and car-data metrics share the same eight slots and the same clear/reset.
  function buildSlotSection(block, config) {
    var state = settings.get();
    var custom = slots.has(storedSlots(state, config.widgetId));
    block.appendChild(settingRow(
      config.title,
      custom ? config.customHint : config.autoHint,
      config.header ? config.header(state) : null
    ));

    if (config.message) {
      var message = config.message(state);
      if (message) {
        block.appendChild(settingRow(message.title, message.hint || '', null));
        return;
      }
    }

    var effective = effectiveSlots(config, state);
    var grid = dom.create('div', 'slot-grid');
    for (var i = 0; i < slots.MAX; i += 1) {
      grid.appendChild(slotTile(config, i, effective[i] || ''));
    }
    block.appendChild(grid);

    if (!custom) return;
    var reset = dom.button('btn btn-ghost', 'Сбросить');
    reset.addEventListener('click', function () {
      settings.setWidgetSettings(config.widgetId, { slots: [] });
    });
    block.appendChild(settingRow(config.resetHint || 'Вернуть автоматический список',
      config.resetNote || '', reset));
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

  function appPickerEntry(app) {
    return { id: app.package, title: app.name, meta: app.package, image: app.icon };
  }

  function appSlotConfig() {
    return {
      widgetId: 'apps',
      title: 'Слоты приложений',
      autoHint: 'Пока слоты не заданы — все приложения по порядку',
      customHint: 'Выбранные приложения; пустые слоты пропускаются',
      auto: function () {
        return installedApps().map(function (app) { return app.package; });
      },
      tile: function (pkg) {
        var app = appByPackage(pkg);
        return app ? { title: app.name, image: app.icon } : { title: 'Не найдено', glyph: '?' };
      },
      header: function () {
        var refresh = dom.button('btn btn-ghost', 'Обновить');
        refresh.addEventListener('click', function () { App.services.apps.load(true); });
        return refresh;
      },
      message: function () {
        var apps = App.services.apps.state();
        if (apps.loading) return { title: 'Загрузка…' };
        if (!apps.apps.length) {
          return {
            title: 'Список пуст',
            hint: apps.error === 'no_bridge' ? 'Нет связи с ГУ' : 'ГУ не вернуло приложения'
          };
        }
        return null;
      },
      items: function () { return installedApps().map(appPickerEntry); },
      emptyText: 'Список приложений пуст',
      onOpen: function () { App.services.apps.load(false); },
      pickerTitle: 'Приложение',
      resetHint: 'Вернуть автоматический список',
      resetNote: 'Все приложения по порядку'
    };
  }

  function seatSlotConfig() {
    return {
      widgetId: 'seats',
      title: 'Функции сидений',
      autoHint: 'Пока слоты не заданы — обогрев и вентиляция передних сидений',
      customHint: 'Выбранные функции; пустые слоты пропускаются',
      auto: seatCatalog.defaults,
      tile: function (id) {
        var item = seatCatalog.get(id);
        if (!item) return { title: 'Не найдено', glyph: '?' };
        return { title: item.title, mask: item.mask, iconName: item.icon };
      },
      items: function () {
        return seatCatalog.list().map(function (item) {
          return {
            id: item.id,
            title: item.title,
            meta: item.subtitle,
            iconName: item.icon,
            mask: item.mask
          };
        });
      },
      pickerTitle: 'Функция сиденья',
      resetHint: 'Вернуть стандартный набор',
      resetNote: 'Обогрев и вентиляция водителя и пассажира'
    };
  }

  function carSlotConfig() {
    return {
      widgetId: 'cardata',
      title: 'Показатели',
      autoHint: 'Пока слоты не заданы — скорость, топливо, АКБ и температура',
      customHint: 'Выбранные показатели; пустые слоты пропускаются',
      auto: metrics.defaults,
      tile: function (id) {
        if (metrics.isCustom(id)) return { title: metrics.customKey(id), iconName: 'car' };
        var metric = metrics.get(id);
        return metric ? { title: metric.title, iconName: metric.icon } : { title: 'Не найдено', glyph: '?' };
      },
      items: metrics.list,
      search: true,
      pickerTitle: 'Показатель',
      resetHint: 'Вернуть стандартный набор',
      resetNote: 'Скорость, топливо, АКБ и температура'
    };
  }

  function pickerItem(entry, selected, onPick) {
    var button = dom.create('button', 'picker-item' + (selected ? ' is-selected' : ''));
    button.type = 'button';
    var glyph = dom.create('div', 'picker-icon');
    if (entry.image) {
      var image = dom.create('img');
      image.alt = '';
      image.src = entry.image;
      glyph.appendChild(image);
    } else if (entry.mask) {
      var mask = dom.create('span', 'brand-mask brand-mask--' + entry.mask);
      mask.setAttribute('aria-hidden', 'true');
      glyph.appendChild(mask);
    } else if (entry.iconName) {
      glyph.appendChild(dom.icon(entry.iconName, 20));
    } else {
      dom.text(glyph, entry.glyph || (entry.title || '?').charAt(0).toUpperCase());
    }
    var text = dom.create('div', 'picker-text');
    text.appendChild(dom.create('div', 'picker-name', entry.title));
    if (entry.meta) text.appendChild(dom.create('div', 'picker-meta', entry.meta));
    button.appendChild(glyph);
    button.appendChild(text);
    button.addEventListener('click', function () { onPick(entry); });
    return button;
  }

  function renderPicker() {
    if (!picker || !pickerConfig) return;
    dom.clear(pickerBody);
    dom.text(pickerTitle, pickerConfig.title);
    pickerConfig.render(pickerBody);
  }

  function openPicker(config) {
    if (!picker) return;
    pickerConfig = config;
    renderPicker();
    picker.hidden = false;
    var closeButton = picker.querySelector('.modal-head .icon-btn');
    if (closeButton) closeButton.focus();
  }

  function closePicker() {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    pickerConfig = null;
  }

  function choosePickerItem(id) {
    var config = pickerConfig;
    closePicker();
    if (config && config.onPick) config.onPick(id);
  }

  function openSlotPicker(config, index) {
    if (!picker) return;
    var current = effectiveSlots(config, settings.get())[index] || '';
    openPicker({
      title: config.pickerTitle + ' · слот ' + (index + 1),
      onPick: function (id) { writeSlot(config, index, id || ''); },
      render: function (body) {
        var clear = pickerItem({ title: 'Убрать из слота', meta: 'Слот станет пустым', glyph: '×' },
          false, function () { choosePickerItem(''); });
        clear.classList.add('picker-clear');
        body.appendChild(clear);
        var entries = config.items();
        entries.forEach(function (entry) {
          body.appendChild(pickerItem(entry, entry.id === current, function () {
            choosePickerItem(entry.id);
          }));
        });
        if (!entries.length) {
          body.appendChild(dom.create('p', 'picker-empty', config.emptyText || 'Список пуст'));
        }
        if (config.search) buildKeySearch(body, choosePickerItem);
      }
    });
    if (config.onOpen) config.onOpen();
  }

  function buildKeySearch(body, choose) {
    var box = dom.create('div', 'picker-search');
    box.appendChild(dom.create('div', 'picker-search-label', 'Свободный ключ getCarData'));
    var row = dom.create('div', 'picker-search-row');
    var input = dom.create('input', 'picker-input');
    input.type = 'text';
    input.placeholder = 'например batteryVoltage';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    var check = dom.button('btn btn-primary btn-sm', 'Проверить');
    var status = dom.create('div', 'picker-status');

    function submit() {
      var key = input.value.trim();
      if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) {
        dom.text(status, 'Только латиница, цифры и подчёркивание');
        return;
      }
      var data = bridge.getCarData(key);
      if (!data) {
        dom.text(status, 'Метод не вернул значение для «' + key + '»');
        return;
      }
      dom.text(status, 'Найдено: ' + metrics.readCustom(data));
      shell.toast('Добавлено: ' + key);
      choose(metrics.customId(key));
    }

    check.addEventListener('click', submit);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    row.appendChild(input);
    row.appendChild(check);
    box.appendChild(row);
    box.appendChild(status);
    body.appendChild(box);
  }

  function buildPicker() {
    picker = dom.create('div', 'modal-overlay picker-overlay');
    picker.hidden = true;

    var panel = dom.create('div', 'modal-panel picker-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'picker-title');

    var head = dom.create('div', 'modal-head');
    pickerTitle = dom.create('h2', 'modal-title', 'Выбор');
    pickerTitle.id = 'picker-title';
    var closeButton = dom.button('icon-btn', '', 'close');
    closeButton.setAttribute('aria-label', 'Закрыть выбор');
    head.appendChild(pickerTitle);
    head.appendChild(closeButton);

    pickerBody = dom.create('div', 'picker-body');
    panel.appendChild(head);
    panel.appendChild(pickerBody);
    picker.appendChild(panel);

    closeButton.addEventListener('click', closePicker);
    picker.addEventListener('click', function (event) {
      if (event.target === picker) closePicker();
    });
    document.getElementById('modal-root').appendChild(picker);
  }

  function buildAppearance() {
    var state = settings.get();
    var block = section('Экран');

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
    var block = section();
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
    var block = section();

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
        buildSlotSection(block, appSlotConfig());
      }

      if (def.id === 'seats') {
        buildSlotSection(block, seatSlotConfig());
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
        buildSlotSection(block, carSlotConfig());
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
    var block = section();

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

  // Each tab builds its own sections; the tab bar itself never scrolls.
  function tabBlocks() {
    if (activeTab === 'wallpaper') return [buildBackground()];
    if (activeTab === 'widgets') return [buildWidgets()];
    if (activeTab === 'about') return [buildAbout()];
    return [buildAppearance(), buildHeader()];
  }

  function syncTabs() {
    if (!tabsBar) return;
    Array.prototype.forEach.call(tabsBar.children, function (button) {
      var current = button.dataset.tab === activeTab;
      button.classList.toggle('is-current', current);
      button.setAttribute('aria-selected', current ? 'true' : 'false');
      button.tabIndex = current ? 0 : -1;
    });
  }

  function selectTab(id) {
    if (!TABS.some(function (tab) { return tab.id === id; })) return;
    if (id === activeTab) return;
    activeTab = id;
    syncTabs();
    renderBody(true);
  }

  function onTabKey(event) {
    var index = -1;
    TABS.forEach(function (tab, position) {
      if (tab.id === activeTab) index = position;
    });
    var next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].id);
    var button = tabsBar.querySelector('[data-tab="' + TABS[next].id + '"]');
    if (button) button.focus();
  }

  function buildTabs() {
    tabsBar = dom.create('div', 'settings-tabs');
    tabsBar.setAttribute('role', 'tablist');
    tabsBar.setAttribute('aria-label', 'Разделы настроек');
    TABS.forEach(function (tab) {
      var button = dom.create('button', 'settings-tab', tab.label);
      button.type = 'button';
      button.id = 'settings-tab-' + tab.id;
      button.dataset.tab = tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'settings-panel');
      button.addEventListener('click', function () { selectTab(tab.id); });
      tabsBar.appendChild(button);
    });
    tabsBar.addEventListener('keydown', onTabKey);
    syncTabs();
    return tabsBar;
  }

  function renderBody(resetScroll) {
    if (!panelBody || rendering) return;
    rendering = true;
    try {
      var scroll = resetScroll ? 0 : panelBody.scrollTop;
      dom.clear(panelBody);
      panelBody.setAttribute('aria-labelledby', 'settings-tab-' + activeTab);
      tabBlocks().forEach(function (block) { panelBody.appendChild(block); });
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
    panelBody.id = 'settings-panel';
    panelBody.setAttribute('role', 'tabpanel');
    panel.appendChild(head);
    panel.appendChild(buildTabs());
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
    closePicker();
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
        closePicker();
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
