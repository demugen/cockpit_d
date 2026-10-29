/* Local SVG icon set. Shapes are constants, so no untrusted markup is involved. */

(function (App) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var ICONS = {
    close: [{ d: 'M6 6l12 12' }, { d: 'M18 6L6 18' }],
    settings: [
      { circle: [12, 12, 3] },
      { d: 'M12 2v3' }, { d: 'M12 19v3' }, { d: 'M2 12h3' }, { d: 'M19 12h3' },
      { d: 'M4.9 4.9L7 7' }, { d: 'M17 17l2.1 2.1' }, { d: 'M19.1 4.9L17 7' }, { d: 'M7 17l-2.1 2.1' }
    ],
    edit: [{ d: 'M4 20h4L19 9l-4-4L4 16z' }, { d: 'M14 6l4 4' }],
    play: [{ d: 'M8 5v14l11-7z', fill: true }],
    pause: [{ d: 'M7 5h4v14H7z', fill: true }, { d: 'M13 5h4v14h-4z', fill: true }],
    next: [{ d: 'M6 5v14l9-7z', fill: true }, { d: 'M17 5h2v14h-2z', fill: true }],
    power: [{ d: 'M12 3v9' }, { d: 'M6.5 6.5a8 8 0 1011 0' }],
    ac: [{ d: 'M12 3v18' }, { d: 'M4.2 7.5l15.6 9' }, { d: 'M19.8 7.5l-15.6 9' }],
    fan: [
      { d: 'M12 12c0-4 2-6 5-6 2 0 3 2 2 4-1 2-4 2-7 2z' },
      { d: 'M12 12c4 0 6 2 6 5 0 2-2 3-4 2-2-1-2-4-2-7z' },
      { d: 'M12 12c0 4-2 6-5 6-2 0-3-2-2-4 1-2 4-2 7-2z' }
    ],
    plus: [{ d: 'M12 5v14' }, { d: 'M5 12h14' }],
    minus: [{ d: 'M5 12h14' }],
    fuel: [
      { d: 'M6 21V5a2 2 0 012-2h5a2 2 0 012 2v16' },
      { d: 'M4 21h13' },
      { d: 'M15 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2' },
      { d: 'M8 9h5' }
    ],
    battery: [{ d: 'M4 8h14a2 2 0 012 2v4a2 2 0 01-2 2H4z' }, { d: 'M20 11v2' }, { d: 'M8 10v4' }, { d: 'M12 10v4' }],
    speed: [{ d: 'M4 17a8 8 0 1116 0' }, { d: 'M12 17l4-6' }, { circle: [12, 17, 1.4] }],
    rpm: [{ circle: [12, 12, 8] }, { d: 'M12 12l3-4' }, { circle: [12, 12, 1.2] }],
    thermostat: [{ d: 'M10 13V5a2 2 0 114 0v8a4 4 0 11-4 0z' }],
    apps: [{ d: 'M4 4h6v6H4z' }, { d: 'M14 4h6v6h-6z' }, { d: 'M4 14h6v6H4z' }, { d: 'M14 14h6v6h-6z' }],
    car: [{ d: 'M5 15l1.6-5h10.8L19 15' }, { d: 'M4 15h17v3H4z' }, { d: 'M7 18v2' }, { d: 'M17 18v2' }],
    refresh: [{ d: 'M20 12a8 8 0 10-2.3 5.7' }, { d: 'M20 5v5h-5' }],
    clock: [{ circle: [12, 12, 9] }, { d: 'M12 7v5l3 2' }],
    grip: [{ circle: [9, 7, 1] }, { circle: [15, 7, 1] }, { circle: [9, 12, 1] }, { circle: [15, 12, 1] }, { circle: [9, 17, 1] }, { circle: [15, 17, 1] }],
    resize: [{ d: 'M9 21H3v-6' }, { d: 'M3 21l7-7' }],
    check: [{ d: 'M5 13l4 4L19 7' }],
    sun: [{ circle: [12, 12, 4] }, { d: 'M12 2v2' }, { d: 'M12 20v2' }, { d: 'M2 12h2' }, { d: 'M20 12h2' }, { d: 'M4.9 4.9l1.4 1.4' }, { d: 'M17.7 17.7l1.4 1.4' }, { d: 'M19.1 4.9l-1.4 1.4' }, { d: 'M6.3 17.7l-1.4 1.4' }],
    cloud: [{ d: 'M7 18a4 4 0 010-8 6 6 0 0111.5 1.5A3.5 3.5 0 0118 18z' }],
    rain: [{ d: 'M7 15a4 4 0 010-8 6 6 0 0111.5 1.5A3.5 3.5 0 0118 15z' }, { d: 'M8 19l-1 2' }, { d: 'M13 19l-1 2' }, { d: 'M18 19l-1 2' }],
    snow: [{ d: 'M7 15a4 4 0 010-8 6 6 0 0111.5 1.5A3.5 3.5 0 0118 15z' }, { d: 'M8 19v2' }, { d: 'M7 20h2' }, { d: 'M13 19v2' }, { d: 'M12 20h2' }, { d: 'M18 19v2' }, { d: 'M17 20h2' }],
    fog: [{ d: 'M7 14a4 4 0 010-8 6 6 0 0111.5 1.5A3.5 3.5 0 0118 14z' }, { d: 'M5 18h14' }, { d: 'M7 21h10' }],
    storm: [{ d: 'M7 14a4 4 0 010-8 6 6 0 0111.5 1.5A3.5 3.5 0 0118 14z' }, { d: 'M12 15l-2 3h3l-2 4' }],
    moon: [{ d: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z' }],
    chevron: [{ d: 'M9 6l6 6-6 6' }],
    volume: [{ d: 'M5 10h3l4-4v12l-4-4H5z' }, { d: 'M16 9a4 4 0 010 6' }],
    music: [{ d: 'M9 18V6l9-2v12' }, { circle: [6, 18, 3] }, { circle: [15, 16, 3] }],
    recirc: [{ d: 'M17 3l3 3-3 3' }, { d: 'M4 11V9a3 3 0 013-3h13' }, { d: 'M7 21l-3-3 3-3' }, { d: 'M20 13v2a3 3 0 01-3 3H4' }],
    window: [{ d: 'M5 6h14v12H5z' }, { d: 'M5 12h14' }],
    windowClose: [{ d: 'M5 6h14v12H5z' }, { d: 'M12 6v12' }],
    windowLeft: [{ d: 'M4 6h16v12H4z' }, { d: 'M4 6l7 12' }],
    windowRight: [{ d: 'M4 6h16v12H4z' }, { d: 'M20 6l-7 12' }],
    compass: [{ circle: [12, 12, 9] }, { d: 'M15.5 8.5l-2 5-5 2 2-5z' }],
    'nav-straight': [{ d: 'M12 20V5' }, { d: 'M7 10l5-5 5 5' }],
    'nav-left': [{ d: 'M16 20v-6a4 4 0 00-4-4H5' }, { d: 'M9 6L5 10l4 4' }],
    'nav-right': [{ d: 'M8 20v-6a4 4 0 014-4h7' }, { d: 'M15 6l4 4-4 4' }],
    'nav-uturn': [{ d: 'M8 20V9a4 4 0 018 0v11' }, { d: 'M12 17l4 4 4-4' }],
    'nav-roundabout': [{ circle: [12, 12, 7] }, { d: 'M15.5 6.2l3.2 1.2-1.2 3.2' }],
    'nav-finish': [{ d: 'M6 21V4' }, { d: 'M6 4h12l-2.5 4 2.5 4H6' }],
    'nav-ferry': [{ d: 'M4 15h16l-2 5H6z' }, { d: 'M6 15V9h9v6' }, { d: 'M12 3v3' }, { d: 'M9 6h6' }],
    'nav-camera': [{ d: 'M4 8h4l2-3h4l2 3h4v11H4z' }, { circle: [12, 13, 3] }]
  };

  function create(name, size) {
    var spec = ICONS[name] || ICONS.chevron;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'icon icon-' + name);
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var pixels = size === undefined ? 20 : size;
    svg.setAttribute('width', pixels);
    svg.setAttribute('height', pixels);

    spec.forEach(function (part) {
      var node;
      if (part.circle) {
        node = document.createElementNS(NS, 'circle');
        node.setAttribute('cx', part.circle[0]);
        node.setAttribute('cy', part.circle[1]);
        node.setAttribute('r', part.circle[2]);
        node.setAttribute('fill', 'currentColor');
        node.setAttribute('stroke', 'none');
      } else {
        node = document.createElementNS(NS, 'path');
        node.setAttribute('d', part.d);
        if (part.fill) {
          node.setAttribute('fill', 'currentColor');
          node.setAttribute('stroke', 'none');
        } else {
          node.setAttribute('fill', 'none');
          node.setAttribute('stroke', 'currentColor');
        }
      }
      svg.appendChild(node);
    });
    return svg;
  }

  App.ui.icons = { create: create, names: Object.keys(ICONS) };
})(window.App);
