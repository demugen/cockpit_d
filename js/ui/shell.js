/* Top bar, theme, header clock, car chips and toasts. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var settings = App.services.settings;
  var car = App.services.car;
  var utils = App.core.utils;
  var dom = App.ui.dom;

  var header = null;
  var slots = {};
  var titleNode = null;
  var clockNode = null;
  var actionsNode = null;
  var timeNode = null;
  var dateNode = null;
  var chipsNode = null;
  var editButton = null;
  var toastNode = null;
  var toastTimer = null;
  var chipsWanted = false;
  var chipsOn = false;

  function applyTheme(state) {
    var theme = state.theme;
    if (theme === 'auto') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--font-scale', String(state.fontScale));
  }

  function tickClock() {
    var now = new Date();
    if (timeNode) timeNode.textContent = utils.formatTime(now, false);
    if (dateNode) dateNode.textContent = utils.formatDate(now);
  }

  function chip(iconName, label, value, tone) {
    var node = dom.create('div', 'chip' + (tone ? ' chip-' + tone : ''));
    node.appendChild(dom.icon(iconName, 16));
    node.appendChild(dom.create('span', 'chip-value', value));
    if (label) node.appendChild(dom.create('span', 'chip-label', label));
    return node;
  }

  function renderChips() {
    if (!chipsNode) return;
    dom.clear(chipsNode);
    if (!chipsWanted) {
      chipsNode.hidden = true;
      return;
    }
    var state = car.state();
    var vehicle = state.vehicle;
    var items = 0;
    if (vehicle.fuelPercent !== null) {
      var low = vehicle.fuelPercent < 15;
      var settingsState = settings.get();
      var tank = (settingsState.widgets.settings.cardata || {}).tankLiters;
      var liters = utils.fuelLiters(vehicle.fuelPercent, tank);
      chipsNode.appendChild(chip('fuel', liters === null ? '' : liters + ' л',
        Math.round(vehicle.fuelPercent) + '%', low ? 'warn' : ''));
      items += 1;
    }
    if (vehicle.batteryVoltage !== null) {
      var weak = vehicle.batteryVoltage < 11.8;
      chipsNode.appendChild(chip('battery', '', vehicle.batteryVoltage.toFixed(1) + ' В', weak ? 'danger' : ''));
      items += 1;
    }
    if (vehicle.outTemp !== null) {
      chipsNode.appendChild(chip('thermostat', '', utils.formatTemperature(vehicle.outTemp), ''));
      items += 1;
    }
    chipsNode.hidden = items === 0;
  }

  function syncChipsDemand(state) {
    var wanted = !!(state && state.header && state.header.carChips);
    if (wanted === chipsWanted) return;
    chipsWanted = wanted;
    if (wanted && !chipsOn) {
      car.demand(true);
      chipsOn = true;
      renderChips();
    } else if (!wanted && chipsOn) {
      car.demand(false);
      chipsOn = false;
      renderChips();
    }
  }

  function toast(message, kind) {
    if (!toastNode) return;
    dom.text(toastNode, message);
    toastNode.className = 'toast is-visible' + (kind ? ' toast-' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastNode.classList.remove('is-visible');
    }, 2800);
  }

  function setEditing(value) {
    if (!editButton) return;
    dom.setPressed(editButton, value);
    editButton.setAttribute('aria-label', value ? 'Выйти из правки' : 'Править раскладку');
  }

  function closePanel() {
    var record = bridge.onClose();
    if (!record.ok) toast('Закрытие недоступно', 'warn');
  }

  /* Header layout is three slots: logo on the left and the action buttons on
     the right are fixed, the clock and the car chips can live in any slot. */
  function layoutHeader(state) {
    if (!header) return;
    var headerSettings = state.header || {};
    var clockSlot = headerSettings.clockSlot || 'center';
    var chipsSlot = headerSettings.chipsSlot || 'left';

    ['left', 'center', 'right'].forEach(function (name) {
      var slot = slots[name];
      dom.clear(slot);
      if (name === 'left') slot.appendChild(titleNode);
      if (chipsSlot === name) slot.appendChild(chipsNode);
      if (clockSlot === name) slot.appendChild(clockNode);
      if (name === 'right') slot.appendChild(actionsNode);
    });
  }

  function build() {
    header = document.getElementById('header');
    dom.clear(header);

    slots = {
      left: dom.create('div', 'topbar-slot topbar-slot--left'),
      center: dom.create('div', 'topbar-slot topbar-slot--center'),
      right: dom.create('div', 'topbar-slot topbar-slot--right')
    };
    header.appendChild(slots.left);
    header.appendChild(slots.center);
    header.appendChild(slots.right);

    titleNode = dom.create('div', 'topbar-title');
    titleNode.appendChild(dom.create('span', 'brand-dot'));
    titleNode.appendChild(dom.create('span', 'brand-name', 'Cockpit D'));
    chipsNode = dom.create('div', 'chips');

    clockNode = dom.create('div', 'topbar-clock');
    timeNode = dom.create('span', 'topbar-time');
    dateNode = dom.create('span', 'topbar-date');
    clockNode.appendChild(timeNode);
    clockNode.appendChild(dateNode);

    actionsNode = dom.create('div', 'topbar-actions');
    editButton = dom.button('icon-btn', '', 'edit');
    editButton.id = 'btn-edit';
    editButton.setAttribute('aria-label', 'Править раскладку');
    var settingsButton = dom.button('icon-btn', '', 'settings');
    settingsButton.id = 'btn-settings';
    settingsButton.setAttribute('aria-label', 'Настройки');
    var closeButton = dom.button('icon-btn', '', 'close');
    closeButton.id = 'btn-close';
    closeButton.setAttribute('aria-label', 'Закрыть');
    actionsNode.appendChild(editButton);
    actionsNode.appendChild(settingsButton);
    actionsNode.appendChild(closeButton);

    layoutHeader(settings.get());

    toastNode = document.getElementById('toast');
    closeButton.addEventListener('click', closePanel);
    tickClock();
    setInterval(tickClock, 1000);
  }

  function init() {
    build();
    applyTheme(settings.get());
    syncChipsDemand(settings.get());
    renderChips();

    bus.on('settings:change', function (event) {
      applyTheme(event.state);
      layoutHeader(event.state);
      syncChipsDemand(event.state);
      renderChips();
    });
    bus.on('car:change', renderChips);
    bus.on('apps:launch', function (result) {
      if (!result.ok) toast('Не удалось запустить: ' + (result.error || 'ошибка'), 'warn');
    });
    bus.on('apps:action', function (result) {
      if (!result.ok) toast('Действие недоступно: ' + (result.error || 'ошибка'), 'warn');
    });
    bus.on('climate:command', function (result) {
      if (!result.ok) toast('Климат не принял команду', 'warn');
    });
    bus.on('media:command', function (result) {
      if (!result.ok) toast('Плеер не принял команду', 'warn');
    });

    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: light)');
      var listener = function () {
        if (settings.get().theme === 'auto') applyTheme(settings.get());
      };
      if (query.addEventListener) query.addEventListener('change', listener);
      else if (query.addListener) query.addListener(listener);
    }

    if (bridge.isStub()) toast('Демо-стенд без ГУ', 'warn');
    else if (!bridge.isNative()) toast('Нет связи с ГУ', 'warn');
  }

  App.ui.shell = {
    init: init,
    toast: toast,
    setEditing: setEditing,
    editButton: function () { return editButton; },
    settingsButton: function () { return document.getElementById('btn-settings'); },
    isModalOpen: function () { return document.body.classList.contains('modal-open'); }
  };
})(window.App);
