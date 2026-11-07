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
    settingsDefaults: { mapTheme: 'auto' },
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
      var mapRetry = dom.create('button', 'nav-map-retry');
      mapRetry.type = 'button';
      // The board must not read a press on this button as a drag handle.
      mapRetry.dataset.nodrag = 'true';
      mapRetry.appendChild(dom.create('span', '', 'Подключить снова'));
      var mapRetryHandler = function (event) {
        event.stopPropagation();
        if (ctx.editing) return;
        service.resubscribe();
      };
      mapRetry.addEventListener('click', mapRetryHandler);
      mapEmpty.appendChild(mapRetry);

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

      // The route footer shares one line with the distance: a short caption
      // keeps the button whole on a two-cell-wide card.
      var openButton = launchButton('nav-open', 'Навигатор');
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

      // A live map without a HUD does not need the full idle card, but the
      // driver still needs a way back to the navigator: a compact chip.
      var mapOpen = launchButton('nav-map-open');
      mapOpen.hidden = true;

      stage.appendChild(route);
      stage.appendChild(idle);
      stage.appendChild(mapOpen);
      node.appendChild(stage);

      function launchButton(className, label) {
        var button = dom.create('button', className);
        button.type = 'button';
        button.appendChild(dom.icon('compass', 18));
        button.appendChild(dom.create('span', 'nav-launch-label', label || 'Открыть навигатор'));
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          if (ctx.editing) return;
          service.launch();
        });
        return button;
      }

      // The mini-map is a passive JPEG stream from the host: the API offers
      // only subscribe/theme/unsubscribe (see core manifest), there is no way
      // to change the navigator's real zoom. A CSS scale() on the <img> only
      // enlarges or shrinks the picture, so the zoom buttons were removed
      // rather than faking a scale change.

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
      var countdown = false;

      function mapNoteText(state) {
        var tries = state.reconnectFailures;
        var quiet = state.receivedAt ? Math.max(1, Math.round((Date.now() - state.receivedAt) / 1000)) : 0;
        switch (state.mapStatus) {
          case 'no-method':
            return 'Мини-карта не поддерживается этим ГУ';
          case 'rejected':
            if (state.mapError === 'unauthorized') return 'ГУ не разрешило подписку на карту';
            if (state.mapError === 'license_required') return 'Мини-карта доступна по лицензии JCarTools';
            return 'ГУ не отдаёт мини-карту';
          case 'blocked':
            return 'Мини-карта молчит, переподключения не помогли';
          case 'stalled':
            return quiet > 0
              ? 'Кадров нет ' + quiet + ' с, переподключение (' + tries + ')'
              : 'Карта пропала, переподключение (' + tries + ')';
          case 'waiting':
            return tries > 0 ? 'Переподключение к карте (' + tries + ')…' : 'Ожидание кадров мини-карты…';
          case 'live':
            return 'Кадр мини-карты не отобразился';
          default:
            return 'Мини-карта не подключена';
        }
      }

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
        if (!hasFrame) {
          var note = mapNoteText(state);
          if (note !== shownNote) {
            shownNote = note;
            dom.text(mapNote, note);
          }
        }
        // The countdown in the note has to keep moving while the host is silent.
        countdown = state.mapStatus === 'stalled' ||
          (state.mapStatus === 'waiting' && !hasFrame && state.reconnectFailures > 0);
        // A frame that failed to decode is as broken as a refused stream and
        // needs the same manual retry.
        var retryable = mapFailed || state.mapStatus === 'blocked' || state.mapStatus === 'rejected' ||
          state.mapStatus === 'no-method';
        mapRetry.hidden = !retryable;
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
          dom.text(speedValue, String(limit) + ' км/ч');
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
        if (state.mapStatus === 'no-method') {
          title = 'Мини-карта недоступна';
          hint = 'Это ГУ не передаёт кадры карты';
        } else if (state.mapStatus === 'rejected' || state.mapStatus === 'blocked') {
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

        // The map stream and the HUD are independent: frames arrive as soon as
        // the navigator draws, while `hud` may never come (projection off, an
        // older app). A live frame means the navigator is running, so the
        // launch prompt must not cover it; the HUD only adds the route overlay.
        var mapBusy = hasFrame || !!state.frame;
        var routeActive = !!state.naviOn;
        route.hidden = !routeActive;
        idle.hidden = routeActive || mapBusy;
        mapOpen.hidden = !(mapBusy && !routeActive && !!app);
        node.classList.toggle('is-route', routeActive);
        node.classList.toggle('has-map', hasFrame);

        var appKey = app ? app.package + '\n' + app.name : '';
        if (appKey !== shownApp) {
          shownApp = appKey;
          openButton.hidden = !app;
          idleButton.hidden = !app;
          if (app) {
            var launchTitle = 'Открыть ' + app.name;
            openButton.title = launchTitle;
            idleButton.title = launchTitle;
            mapOpen.title = launchTitle;
            openButton.setAttribute('aria-label', launchTitle);
            idleButton.setAttribute('aria-label', launchTitle);
            mapOpen.setAttribute('aria-label', launchTitle);
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

        var idleKey = [state.mapStatus, state.mapError || '', state.routeKnown, mapBusy, appKey].join('\n');
        if (idleKey === shownIdle) return;
        shownIdle = idleKey;
        paintIdle(state, app);
      }

      ctx.on('nav:change', paint);
      var countdownTimer = ctx.every(1000, function () {
        if (countdown) paint();
      });
      ctx.on('nav:launch', function (result) {
        if (!result.ok) {
          ctx.toast(result.error === 'not_found'
            ? 'Навигатор не найден'
            : 'Не удалось открыть: ' + utils.errorText(result.error, 'навигатор не отвечает'), 'warn');
        }
      });

      // Reapply map theme when settings change
      ctx.on('settings:change', function () {
        if (service.state().subscribed) {
          service.applyMapTheme(true);
        }
      });

      applySize(ctx.size);
      paint();

      return {
        render: function () {
          applySize(ctx.size);
          paint();
        },
        sizeChanged: applySize,
        destroy: function () {
          if (countdownTimer) clearInterval(countdownTimer);
          mapRetry.removeEventListener('click', mapRetryHandler);
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
