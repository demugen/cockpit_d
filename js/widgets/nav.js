/* Navigation: live mini-map, next maneuver, remaining route and speed limit. */

(function (root) {
  'use strict';

  var def = {
    id: 'nav',
    title: 'Навигация',
    description: 'Мини-карта, манёвр и остаток маршрута',
    order: 25,
    defaultEnabled: false,
    defaultSize: { landscape: { w: 4, h: 2 }, portrait: { w: 2, h: 4 } },
    minSize: { landscape: { w: 2, h: 1 }, portrait: { w: 2, h: 1 } },
    settingsDefaults: {},
    create: function (ctx) {
      var App = root.App;
      var dom = App.ui.dom;
      var utils = App.core.utils;
      var navData = App.core.navData;
      var service = ctx.services.nav;
      var node = ctx.root;

      node.classList.add('w-nav');
      ctx.demand('nav', true);
      ctx.demand('apps', true);

      var stage = dom.create('div', 'nav-stage');

      var mapEmpty = dom.create('div', 'nav-map-empty');
      mapEmpty.appendChild(dom.icon('compass', 34));
      var mapNote = dom.create('span', 'nav-map-note', 'Ожидание мини-карты');
      mapEmpty.appendChild(mapNote);

      var map = dom.create('img', 'nav-map');
      map.alt = '';
      map.hidden = true;
      var mapFailed = false;
      var mapReady = false;
      map.addEventListener('load', function () {
        mapFailed = false;
        mapReady = true;
        map.hidden = false;
        mapEmpty.hidden = true;
      });
      map.addEventListener('error', function () {
        mapFailed = true;
        mapReady = false;
        map.hidden = true;
        mapEmpty.hidden = false;
      });

      stage.appendChild(mapEmpty);
      stage.appendChild(map);
      stage.appendChild(dom.create('div', 'nav-shade'));

      var route = dom.create('div', 'nav-route');
      var turn = dom.create('div', 'nav-turn');
      var turnIcon = dom.create('span', 'nav-turn-icon');
      var turnDist = dom.create('span', 'nav-turn-dist', '—');
      turn.appendChild(turnIcon);
      turn.appendChild(turnDist);

      var speed = dom.create('div', 'nav-speed');
      var speedValue = dom.create('span', 'nav-speed-value', '');
      speed.appendChild(speedValue);

      var gps = dom.create('div', 'nav-gps');
      var gpsBars = [];
      var barIndex;
      for (barIndex = 0; barIndex < 5; barIndex += 1) {
        gpsBars.push(gps.appendChild(dom.create('i')));
      }

      var side = dom.create('div', 'nav-side');
      side.appendChild(speed);
      side.appendChild(gps);

      var top = dom.create('div', 'nav-top');
      top.appendChild(turn);
      top.appendChild(side);
      route.appendChild(top);

      var road = dom.create('div', 'nav-road');
      var roadName = dom.create('span', 'nav-road-name', '');
      road.appendChild(roadName);

      var remain = dom.create('div', 'nav-remain');
      remain.appendChild(dom.create('span', 'nav-remain-label', 'до финиша'));
      var remainValue = dom.create('span', 'nav-remain-value', '');
      remain.appendChild(remainValue);

      var openButton = launchButton('nav-open');
      var bottom = dom.create('div', 'nav-bottom');
      bottom.appendChild(road);
      bottom.appendChild(remain);
      bottom.appendChild(openButton);
      route.appendChild(bottom);

      var idle = dom.create('div', 'nav-idle');
      var idleIcon = dom.create('div', 'nav-idle-icon');
      idleIcon.appendChild(dom.icon('compass', 36));
      var idleTitle = dom.create('div', 'nav-idle-title', 'Нет данных навигации');
      var idleHint = dom.create('div', 'nav-idle-hint', 'Запустите навигатор на ГУ');
      var idleButton = launchButton('nav-launch');
      idle.appendChild(idleIcon);
      idle.appendChild(idleTitle);
      idle.appendChild(idleHint);
      idle.appendChild(idleButton);

      stage.appendChild(route);
      stage.appendChild(idle);
      node.appendChild(stage);

      function launchButton(className) {
        var button = dom.create('button', className);
        button.type = 'button';
        button.appendChild(dom.icon('compass', 18));
        button.appendChild(dom.create('span', 'nav-launch-label', 'Открыть навигатор'));
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          if (ctx.editing) return;
          service.launch();
        });
        return button;
      }

      function applySize(size) {
        node.dataset.w = String(size.w);
        node.dataset.h = String(size.h);
      }

      var shownFrame = '';
      var shownIcon = '';
      var shownNote = '';
      var shownRoute = '';
      var shownIdle = '';
      var shownApp = '';

      function paintMap(state) {
        // Keep the previous frame on screen while the next one decodes: a
        // blinking map every second would be worse than a second of delay.
        if (state.frame && state.frame !== shownFrame) {
          shownFrame = state.frame;
          mapFailed = false;
          map.src = state.frame;
        } else if (!state.frame) {
          shownFrame = '';
          mapReady = false;
          map.hidden = true;
          map.removeAttribute('src');
        }
        var hasFrame = !!state.frame && mapReady && !mapFailed;
        mapEmpty.hidden = hasFrame;
        var note = state.subscribed
          ? 'Ожидание мини-карты'
          : (state.mapError ? 'Мини-карта недоступна' : 'Мини-карта не подключена');
        if (note !== shownNote) {
          shownNote = note;
          dom.text(mapNote, note);
        }
        return hasFrame;
      }

      function paintRoute(state) {
        var maneuver = navData.maneuver(state.turnType);
        if (maneuver.icon !== shownIcon) {
          shownIcon = maneuver.icon;
          dom.clear(turnIcon);
          turnIcon.appendChild(dom.icon(maneuver.icon, 34));
        }
        var distance = state.turnDist === null ? '—' : utils.formatDistance(state.turnDist);
        dom.text(turnDist, distance);
        turn.title = maneuver.label;
        turn.setAttribute('aria-label', maneuver.label + (state.turnDist === null ? '' : ', через ' + distance));

        var limit = state.speedLimit;
        speed.hidden = limit === null;
        if (limit !== null) {
          dom.text(speedValue, String(limit));
          speed.title = 'Ограничение ' + limit + ' км/ч';
          speed.setAttribute('aria-label', speed.title);
        }

        var level = navData.gpsLevel(state.gps);
        gps.hidden = level === null;
        if (level !== null) {
          gpsBars.forEach(function (bar, index) {
            bar.classList.toggle('is-on', index < level);
          });
          gps.classList.toggle('is-weak', level === 0);
          gps.title = level === 0 ? 'Слабый сигнал GPS' : 'Сигнал GPS: ' + level + ' из 5';
        }

        dom.text(roadName, state.nextRoad || '');
        road.hidden = !state.nextRoad;

        remain.hidden = state.remainDist === null;
        if (state.remainDist !== null) dom.text(remainValue, utils.formatDistance(state.remainDist));
      }

      function paintIdle(state, app) {
        var title;
        var hint;
        if (state.mapError) {
          title = 'Мини-карта недоступна';
          hint = state.mapError === 'unauthorized'
            ? 'ГУ не разрешило подписку на карту'
            : 'Не удалось подключиться к источнику карты';
        } else if (!state.routeKnown) {
          title = 'Нет данных навигации';
          hint = app ? 'Запустите ' + app.name + ' и постройте маршрут' : 'Навигатор не найден на ГУ';
        } else {
          title = 'Маршрут не проложен';
          hint = app ? 'Постройте маршрут в ' + app.name : 'Навигатор не найден на ГУ';
        }
        dom.text(idleTitle, title);
        dom.text(idleHint, hint);
      }

      function paint() {
        var state = service.state();
        var app = service.currentApp();
        var hasFrame = paintMap(state);

        var routeActive = !!state.naviOn;
        route.hidden = !routeActive;
        idle.hidden = routeActive;
        node.classList.toggle('is-route', routeActive);
        node.classList.toggle('has-map', hasFrame);

        var appKey = app ? app.package + '\n' + app.name : '';
        if (appKey !== shownApp) {
          shownApp = appKey;
          openButton.hidden = !app;
          idleButton.hidden = !app;
          if (app) {
            openButton.title = 'Открыть ' + app.name;
            idleButton.title = 'Открыть ' + app.name;
          }
        }

        // The map ticks every second while the route changes much slower:
        // rewrite the route text only when one of its fields actually moved.
        if (routeActive) {
          var routeKey = [state.turnType, state.turnDist, state.remainDist,
            state.nextRoad, state.speedLimit, state.gps].join('\n');
          if (routeKey === shownRoute) return;
          shownRoute = routeKey;
          paintRoute(state);
          return;
        }

        var idleKey = [state.mapError || '', state.routeKnown, appKey].join('\n');
        if (idleKey === shownIdle) return;
        shownIdle = idleKey;
        paintIdle(state, app);
      }

      ctx.on('nav:change', paint);
      ctx.on('nav:launch', function (result) {
        if (!result.ok) ctx.toast(result.error === 'not_found' ? 'Навигатор не найден' : 'Не удалось открыть навигатор', 'warn');
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
