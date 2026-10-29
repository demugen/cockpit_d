/* Development stand-in for the head unit. Loaded on every page but installs
   itself only when window.androidApi is missing. Not part of the product. */

(function () {
  'use strict';

  if (window.androidApi) return;

  function svgData(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function tile(bg, glyph, color) {
    return svgData(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
      '<rect width="96" height="96" rx="22" fill="' + bg + '"/>' +
      '<text x="48" y="60" font-family="Segoe UI, Roboto, sans-serif" font-size="44" ' +
      'font-weight="600" text-anchor="middle" fill="' + (color || '#fff') + '">' + glyph + '</text>' +
      '</svg>'
    );
  }

  var SUN = svgData(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="13" fill="#ffcf5c"/>' +
    '<g stroke="#ffcf5c" stroke-width="4" stroke-linecap="round">' +
    '<path d="M32 8v7M32 49v7M8 32h7M49 32h7M15 15l5 5M44 44l5 5M49 15l-5 5M20 44l-5 5"/></g></svg>'
  );
  var CLOUD = svgData(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<path d="M18 46a11 11 0 0 1 1-22 15 15 0 0 1 28 4 9 9 0 0 1-1 18z" fill="#c9d8e8"/></svg>'
  );

  var apps = [
    { name: 'Навигатор', package: 'ru.yandex.yandexnavi', icon: tile('#2f6fed', 'N') },
    { name: 'Музыка', package: 'com.example.music', icon: tile('#b447e0', 'M') },
    { name: 'Радио', package: 'com.example.radio', icon: tile('#e05a3f', 'R') },
    { name: 'Телефон', package: 'com.example.phone', icon: tile('#1fa36b', 'T') },
    { name: 'Камера', package: 'com.example.camera', icon: tile('#3b4252', 'C') },
    { name: 'Настройки', package: 'com.android.settings', icon: tile('#6b7280', 'S') },
    { name: 'Карты', package: 'com.example.maps', icon: tile('#f0a020', 'K') },
    { name: 'Плеер', package: 'com.example.player', icon: tile('#2874a6', 'P') }
  ];

  var tracks = [
    { title: 'Midnight Drive', artist: 'Neon Roads', album: 'Night Shift', duration: 214000 },
    { title: 'Утренний свет', artist: 'Полярный', album: 'Рассвет', duration: 187000 },
    { title: 'Coastline', artist: 'Low Tide', album: 'Salt', duration: 241000 },
    { title: 'Тихий город', artist: 'Кварц', album: 'Дома', duration: 198000 }
  ];

  var volume = 46;
  var trackIndex = 0;
  var trackPosition = 42000;
  var playing = true;

  var car = {
    speed: 0,
    rpm: 780,
    engine: true,
    outTemp: 7,
    batteryVoltage: 12.6,
    fuelPercent: 62,
    sun: false,
    park: true,
    driverTemp: 21.5,
    passengerTemp: 21.5,
    rulHeat: false,
    lobHeat: false,
    zadHeat: false,
    seats: {
      frontLeft: { seat: 1, heat: 0, vent: 0 },
      frontRight: { seat: 2, heat: 0, vent: 0 },
      rearLeft: { seat: 0, heat: 0, vent: 0 },
      rearRight: { seat: 1, heat: 0, vent: 0 }
    }
  };

  var climate = {
    available: true,
    power: true,
    ac: true,
    auto: false,
    sync: true,
    recirculation: false,
    frontDefrost: false,
    rearDefrost: false,
    frontGlassHeat: false,
    steeringWheelHeat: false,
    fanSpeed: 3,
    airMode: 1,
    driverTemperature: 21.5,
    passengerTemperature: 21.5,
    driverSeatHeat: 0,
    driverSeatVent: 0,
    passengerSeatHeat: 0,
    passengerSeatVent: 0
  };

  var weather = {
    city: 'Москва',
    temp: '7',
    condition: 'Переменная облачность',
    icon: SUN
  };

  var gps = { lat: 55.7558, lon: 37.6173 };

  var miniMap = { subscribed: false, theme: 'night', timer: null, tick: 0 };
  var nav = { turnType: 3, turnDist: 420, remainDist: 8500, road: 0, tick: 0, gps: 65 };
  var NAV_ROADS = ['Ленина', 'Садовая', 'Мира', 'Гагарина'];

  function emit(type, data) {
    if (typeof window.onAndroidEvent === 'function') {
      window.onAndroidEvent(type, data);
    }
  }

  function ok(command, extra) {
    var payload = { success: true, command: command };
    Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key]; });
    return JSON.stringify(payload);
  }

  function fail(command, error) {
    return JSON.stringify({ success: false, command: command, error: error || 'unsupported' });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function musicPayload() {
    var track = tracks[trackIndex];
    return {
      PlayStat: playing ? 1 : 0,
      SongName: track.title,
      SongArtist: track.artist,
      SongAlbum: track.album,
      SongAlbumPicture: tile('#1d2b4f', '♪'),
      Trpos: Math.round(trackPosition),
      Trdur: track.duration
    };
  }

  function emitMusic() {
    emit('musicInfo', musicPayload());
  }

  function emitCar() {
    emit('speed', { value: car.speed });
    emit('rpm', { value: car.rpm });
  }

  function tickMusic() {
    if (playing) {
      trackPosition += 1000;
      if (trackPosition >= tracks[trackIndex].duration) {
        trackIndex = (trackIndex + 1) % tracks.length;
        trackPosition = 0;
      }
      emitMusic();
    }
  }

  function tickCar() {
    var target = car.park ? 0 : 42 + Math.round(Math.sin(Date.now() / 9000) * 18);
    car.speed += Math.sign(target - car.speed) * (target > car.speed ? 3 : 2);
    car.speed = clamp(car.speed, 0, 180);
    car.rpm = car.speed === 0 ? 780 : 1100 + car.speed * 18;
    car.batteryVoltage = Math.round((12.5 + Math.sin(Date.now() / 30000) * 0.25) * 10) / 10;
    emitCar();
  }

  function climateState() {
    var state = {};
    Object.keys(climate).forEach(function (key) { state[key] = climate[key]; });
    state.driverTemperature = car.driverTemp;
    state.passengerTemperature = car.passengerTemp;
    state.driverSeatHeat = car.seats.frontLeft.heat;
    state.passengerSeatHeat = car.seats.frontRight.heat;
    state.driverSeatVent = car.seats.frontLeft.vent;
    state.passengerSeatVent = car.seats.frontRight.vent;
    state.steeringWheelHeat = car.rulHeat;
    state.rearDefrost = car.zadHeat;
    state.frontGlassHeat = car.lobHeat;
    return state;
  }

  function setClimateBoolean(key, value) {
    climate[key] = !!value;
  }

  function carData(name) {
    if (name === 'all' || name === 'state' || name === 'car' || name === 'carState' || name === 'car_state') {
      return JSON.stringify({
        name: 'all',
        vehicle: {
          name: 'vehicle',
          speed: car.speed,
          rpm: car.rpm,
          engine: car.engine,
          outTemp: car.outTemp,
          batteryVoltage: car.batteryVoltage,
          fuelPercent: car.fuelPercent,
          fuelPercentRaw: Math.round(car.fuelPercent * 10),
          vod: 1,
          sun: car.sun,
          park: car.park
        },
        heat: {
          name: 'heat',
          rulHeat: car.rulHeat,
          lobHeat: car.lobHeat,
          zadHeat: car.zadHeat,
          driverTemp: car.driverTemp,
          passengerTemp: car.passengerTemp
        },
        seats: {
          name: 'seats',
          front: { name: 'frontSeats', frontLeft: car.seats.frontLeft, frontRight: car.seats.frontRight },
          rear: { name: 'rearSeats', rearLeft: car.seats.rearLeft, rearRight: car.seats.rearRight }
        }
      });
    }
    var single = {
      speed: car.speed,
      getSpeed: car.speed,
      rpm: car.rpm,
      getRPM: car.rpm,
      engine: car.engine,
      engineState: car.engine,
      getstatengin: car.engine,
      outTemp: car.outTemp,
      out_temp: car.outTemp,
      getouttemp: car.outTemp,
      battery: car.batteryVoltage,
      batteryVoltage: car.batteryVoltage,
      akbvolt: car.batteryVoltage,
      fuel: car.fuelPercent,
      fuelPercent: car.fuelPercent,
      fuel_percent: car.fuelPercent,
      getFuelPercent: car.fuelPercent,
      sun: car.sun,
      getsun: car.sun,
      park: car.park,
      parkOnOff: car.park,
      getParkOnOff: car.park,
      vod: 1,
      getvod: 1,
      driverTemp: car.driverTemp,
      driver_temp: car.driverTemp,
      passengerTemp: car.passengerTemp,
      passenger_temp: car.passengerTemp,
      rulHeat: car.rulHeat,
      steeringHeat: car.rulHeat,
      getrulheat: car.rulHeat,
      lobHeat: car.lobHeat,
      windshieldHeat: car.lobHeat,
      getlobheat: car.lobHeat,
      zadHeat: car.zadHeat,
      rearHeat: car.zadHeat,
      getzadheat: car.zadHeat
    };
    if (Object.prototype.hasOwnProperty.call(single, name)) {
      return JSON.stringify({ name: name, value: single[name] });
    }
    if (name === 'cabinTemp') {
      return JSON.stringify({ name: 'cabinTemp', driverTemp: car.driverTemp, passengerTemp: car.passengerTemp });
    }
    return JSON.stringify({ error: 'unknown_data' });
  }

  function handleClimateCommand(cmd, payload) {
    var value = payload.value;
    switch (cmd) {
      case 'climate_get_state':
      case 'getClimateState':
      case 'getJ6ClimateState':
        return ok(cmd, climateState());
      case 'climate_set_power':
      case 'j6_climate_set_power': setClimateBoolean('power', value); return ok(cmd, { value: climate.power });
      case 'climate_set_ac':
      case 'j6_climate_set_ac': setClimateBoolean('ac', value); return ok(cmd, { value: climate.ac });
      case 'climate_set_auto':
      case 'j6_climate_set_auto': setClimateBoolean('auto', value); return ok(cmd, { value: climate.auto });
      case 'climate_set_sync':
      case 'j6_climate_set_sync': setClimateBoolean('sync', value); return ok(cmd, { value: climate.sync });
      case 'climate_set_recirculation':
      case 'j6_climate_set_recirculation': setClimateBoolean('recirculation', value); return ok(cmd, { value: climate.recirculation });
      case 'climate_set_fan_speed':
        climate.fanSpeed = clamp(Math.round(Number(value) || 1), 1, 10);
        return ok(cmd, { value: climate.fanSpeed });
      case 'climate_set_air_mode':
        climate.airMode = clamp(Math.round(Number(value)), 0, 6);
        return ok(cmd, { value: climate.airMode });
      case 'climate_set_front_defrost': setClimateBoolean('frontDefrost', value); return ok(cmd, { value: climate.frontDefrost });
      case 'climate_set_rear_defrost': setClimateBoolean('rearDefrost', value); car.zadHeat = climate.rearDefrost; return ok(cmd, { value: climate.rearDefrost });
      case 'climate_set_front_glass_heat': setClimateBoolean('frontGlassHeat', value); car.lobHeat = climate.frontGlassHeat; return ok(cmd, { value: climate.frontGlassHeat });
      case 'climate_set_steering_wheel_heat': setClimateBoolean('steeringWheelHeat', value); car.rulHeat = climate.steeringWheelHeat; return ok(cmd, { value: climate.steeringWheelHeat });
      case 'climate_set_temperature': {
        var zone = Number(payload.zone);
        var temp = clamp(Number(value), 16, 32);
        if (zone === 1) {
          car.driverTemp = temp;
          if (climate.sync) car.passengerTemp = temp;
        } else if (zone === 2) {
          car.passengerTemp = temp;
        } else {
          return fail(cmd, 'bad zone');
        }
        return ok(cmd, { zone: zone, value: temp });
      }
      case 'climate_set_seat_heat': {
        var seat = Number(payload.seat);
        var level = clamp(Math.round(Number(value)), 0, 3);
        if (seat === 1) car.seats.frontLeft.heat = level;
        else if (seat === 2) car.seats.frontRight.heat = level;
        else return fail(cmd, 'bad seat');
        return ok(cmd, { seat: seat, value: level });
      }
      case 'climate_set_seat_vent': {
        var ventSeat = Number(payload.seat);
        var vent = clamp(Math.round(Number(value)), 0, 3);
        if (ventSeat === 1) car.seats.frontLeft.vent = vent;
        else if (ventSeat === 2) car.seats.frontRight.vent = vent;
        else return fail(cmd, 'bad seat');
        return ok(cmd, { seat: ventSeat, value: vent });
      }
      default:
        return null;
    }
  }

  function handleModeCommand(cmd, payload) {
    var value = Number(payload.value);
    switch (cmd) {
      case 'get_drive_mode': return ok(cmd, { value: 1 });
      case 'set_drive_mode': return ok(cmd, { value: clamp(Math.round(value), 0, 2) });
      case 'get_power_mode': return ok(cmd, { value: 2 });
      case 'set_power_mode': return ok(cmd, { value: clamp(Math.round(value), 1, 2) });
      case 'get_energy_recycle': return ok(cmd, { value: 2 });
      case 'set_energy_recycle': return ok(cmd, { value: clamp(Math.round(value), 1, 3) });
      case 'get_battery_protection': return ok(cmd, { value: 2 });
      case 'set_battery_protection': return ok(cmd, { value: clamp(Math.round(value), 1, 4) });
      case 'get_fuel_percent':
        return ok(cmd, { value: car.fuelPercent, percent: car.fuelPercent, unit: '%', raw: Math.round(car.fuelPercent * 10) });
      case 'get_low_fuel_warning':
        return ok(cmd, { value: 0, active: false, lowFuelWarning: false, reserve: false });
      case 'get_turn_signals':
        return ok(cmd, { left: false, right: false, leftValue: 0, rightValue: 0 });
      case 'get_high_beam':
        return ok(cmd, { value: 0, active: false, highBeam: false });
      default:
        return null;
    }
  }

  var BODY_COMMANDS = [
    'open_trunk', 'close_trunk', 'open_windows_full', 'open_windows_10', 'open_windows_50',
    'close_windows', 'open_window_front_left_full', 'open_window_front_right_full',
    'open_window_rear_left_full', 'open_window_rear_right_full', 'open_window_front_left_10',
    'open_window_front_right_10', 'open_window_rear_left_10', 'open_window_rear_right_10',
    'parking_sensors_on', 'disable_qnx_vignette', 'enable_qnx_vignette'
  ];

  function carCommand(payload) {
    var data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    var cmd = data.cmd || data.command || data.action;
    if (!cmd) return fail('', 'empty command');
    var climateResult = handleClimateCommand(cmd, data);
    if (climateResult) return climateResult;
    var modeResult = handleModeCommand(cmd, data);
    if (modeResult) return modeResult;
    if (BODY_COMMANDS.indexOf(cmd) !== -1) return ok(cmd);
    return fail(cmd, 'Unknown command');
  }

  var REAR_SEAT = /^(heat|vent)_zad_seat_(l|r)_(off|[0-3])$/;

  function runEnum(name) {
    switch (name) {
      case 'MEDIA_PLAY':
        playing = true;
        emitMusic();
        return JSON.stringify({ status: 'ok' });
      case 'MEDIA_PAUSE':
        playing = false;
        emitMusic();
        return JSON.stringify({ status: 'ok' });
      case 'MEDIA_NEXT':
        trackIndex = (trackIndex + 1) % tracks.length;
        trackPosition = 0;
        emitMusic();
        return JSON.stringify({ status: 'ok' });
      case 'Volume_Up':
        volume = clamp(volume + 1, 0, 100);
        return JSON.stringify({ status: 'ok' });
      case 'Volume_Down':
        volume = clamp(volume - 1, 0, 100);
        return JSON.stringify({ status: 'ok' });
      case 'heat_wheel_on': car.rulHeat = true; climate.steeringWheelHeat = true; return JSON.stringify({ status: 'ok' });
      case 'heat_wheel_off': car.rulHeat = false; climate.steeringWheelHeat = false; return JSON.stringify({ status: 'ok' });
      case 'heat_windshield_on': car.lobHeat = true; return JSON.stringify({ status: 'ok' });
      case 'heat_windshield_off': car.lobHeat = false; return JSON.stringify({ status: 'ok' });
      case 'heat_rearwindow_on': car.zadHeat = true; return JSON.stringify({ status: 'ok' });
      case 'heat_rearwindow_off': car.zadHeat = false; return JSON.stringify({ status: 'ok' });
      default: {
        var rear = REAR_SEAT.exec(name);
        if (rear) {
          var target = rear[2] === 'l' ? car.seats.rearLeft : car.seats.rearRight;
          target[rear[1]] = rear[3] === 'off' ? 0 : Number(rear[3]);
        }
        return JSON.stringify({ status: 'ok' });
      }
    }
  }

  function appInfo(packageName) {
    var found = apps.filter(function (app) { return app.package === packageName; })[0];
    if (!found) return JSON.stringify({ error: 'app_not_found' });
    return JSON.stringify({ name: found.name, icon: found.icon });
  }

  var runEnumList = [
    ['MEDIA_PLAY', 'Медиа плей'], ['MEDIA_PAUSE', 'Медиа пауза'], ['MEDIA_NEXT', 'Следующий трек'],
    ['Volume_Up', 'Громче'], ['Volume_Down', 'Тише'], ['GO_TO_PP', 'Приборная панель'],
    ['GO_TO_GU', 'Головное устройство'], ['GLOBAL_HOME', 'Домой'], ['GLOBAL_BACK', 'Назад'],
    ['heat_wheel_on', 'Обогрев руля включить'], ['heat_wheel_off', 'Обогрев руля выключить'],
    ['heat_seat_l_0', 'Подогрев водителя 0'], ['heat_seat_l_1', 'Подогрев водителя 1'],
    ['heat_seat_l_2', 'Подогрев водителя 2'], ['heat_seat_l_3', 'Подогрев водителя 3'],
    ['RUN_SPICH_FOCUS', 'Голосовой помощник'], ['RUN_FUN_CAR', 'Функции авто']
  ].map(function (pair) {
    return { RunEnum: pair[0], RunEnumText: pair[1], RunEnumType: 'system' };
  });

  function launcherCatalog(requestId) {
    emit('launcherCatalog', { requestId: requestId, section: 'actions', items: runEnumList, append: false, complete: true });
    emit('launcherCatalog', { requestId: requestId, section: 'apps', items: apps.map(function (app) {
      return { name: app.name, package: app.package };
    }), append: false, complete: true });
    emit('launcherCatalog', { requestId: requestId, section: 'splits', items: [], append: false, complete: true });
    emit('launcherCatalog', {
      requestId: requestId,
      section: 'actionIcons',
      items: runEnumList.slice(0, 2).map(function (item) { return { RunEnum: item.RunEnum, icon: tile('#2c3444', '•') }; }),
      append: false,
      complete: true
    });
    emit('launcherCatalog', {
      requestId: requestId,
      section: 'appIcons',
      items: apps.map(function (app) { return { package: app.package, icon: app.icon }; }),
      append: false,
      complete: true
    });
    emit('launcherCatalog', { requestId: requestId, section: 'done', items: [], append: false, complete: true });
  }

  var ROUTE_POINTS = [[150, 330], [150, 250], [300, 250], [300, 140], [470, 140], [470, 60]];

  function routePoint(t) {
    var distances = [];
    var total = 0;
    var i;
    for (i = 1; i < ROUTE_POINTS.length; i += 1) {
      var dx = ROUTE_POINTS[i][0] - ROUTE_POINTS[i - 1][0];
      var dy = ROUTE_POINTS[i][1] - ROUTE_POINTS[i - 1][1];
      var length = Math.sqrt(dx * dx + dy * dy);
      distances.push(length);
      total += length;
    }
    var target = Math.max(0, Math.min(1, t)) * total;
    for (i = 0; i < distances.length; i += 1) {
      if (target <= distances[i]) {
        var share = distances[i] ? target / distances[i] : 0;
        return {
          x: ROUTE_POINTS[i][0] + (ROUTE_POINTS[i + 1][0] - ROUTE_POINTS[i][0]) * share,
          y: ROUTE_POINTS[i][1] + (ROUTE_POINTS[i + 1][1] - ROUTE_POINTS[i][1]) * share
        };
      }
      target -= distances[i];
    }
    return { x: ROUTE_POINTS[5][0], y: ROUTE_POINTS[5][1] };
  }

  function mapSvg() {
    miniMap.tick += 1;
    var night = miniMap.theme === 'night';
    var bg = night ? '#0d151d' : '#e8eef5';
    var block = night ? '#131d27' : '#f4f8fc';
    var road = night ? '#243241' : '#ffffff';
    var park = night ? '#14291f' : '#d9edd9';
    var mark = night ? '#33465a' : '#c3d0de';
    var point = routePoint((miniMap.tick % 90) / 90);
    var x = Math.round(point.x * 10) / 10;
    var y = Math.round(point.y * 10) / 10;
    return svgData(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">' +
      '<rect width="640" height="360" fill="' + bg + '"/>' +
      '<rect x="28" y="26" width="150" height="110" rx="10" fill="' + block + '"/>' +
      '<rect x="230" y="30" width="130" height="80" rx="10" fill="' + block + '"/>' +
      '<rect x="410" y="250" width="190" height="84" rx="10" fill="' + park + '"/>' +
      '<rect x="40" y="250" width="120" height="80" rx="10" fill="' + block + '"/>' +
      '<path d="M0 200H640M0 300H640M200 0V360M400 0V360M540 0V360" ' +
      'stroke="' + road + '" stroke-width="20"/>' +
      '<path d="M0 200H640M0 300H640M200 0V360M400 0V360M540 0V360" ' +
      'stroke="' + mark + '" stroke-width="1.5" stroke-dasharray="10 12"/>' +
      '<path d="M150 330V250H300V140H470V60" fill="none" stroke="#1c5fae" ' +
      'stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M150 330V250H300V140H470V60" fill="none" stroke="#3f9dff" ' +
      'stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="470" cy="60" r="10" fill="#ff5a5a" stroke="#ffffff" stroke-width="4"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="13" fill="#3f9dff" stroke="#ffffff" stroke-width="4"/>' +
      '</svg>'
    );
  }

  function emitMiniMap() {
    if (!miniMap.subscribed || !alive()) return;
    emit('miniMapFrame', { image: mapSvg(), timestamp: Date.now() });
  }

  function startMiniMap() {
    if (miniMap.timer) return;
    emitMiniMap();
    miniMap.timer = setInterval(emitMiniMap, 1000);
  }

  function stopMiniMap() {
    if (!miniMap.timer) return;
    clearInterval(miniMap.timer);
    miniMap.timer = null;
  }

  function emitHud() {
    if (!alive()) return;
    nav.tick += 1;
    nav.turnDist -= 35 + (nav.tick % 3) * 5;
    nav.remainDist = Math.max(160, nav.remainDist - 40);
    if (nav.turnDist <= 40) {
      nav.turnDist = 360 + (nav.tick % 5) * 45;
      nav.turnType = [3, 9, 2, 9, 5, 9][nav.tick % 6];
      nav.road = (nav.road + 1) % NAV_ROADS.length;
    }
    if (nav.remainDist <= 160) nav.remainDist = 8500;
    emit('hud', {
      hudSenderType: 'NAVI',
      aradarOn: false,
      naviOn: true,
      turnType: nav.turnType,
      turnDist: nav.turnDist,
      remainDist: nav.remainDist,
      nextRoad: NAV_ROADS[nav.road],
      speedLimit: 60
    });
  }

  function emitGps() {
    if (!alive()) return;
    nav.gps = 40 + Math.round(Math.random() * 50);
    emit('GPSSignalQuality', { updateSignalQuality: nav.gps });
  }

  window.androidApi = {
    __stub: true,
    onJsReady: function () { setTimeout(emitMusic, 300); },
    onClose: function () { console.info('[stub] onClose'); },
    onSettings: function () { console.info('[stub] onSettings'); },
    getUserApps: function () { return JSON.stringify(apps); },
    getRunEnum: function () { return JSON.stringify(runEnumList); },
    getRunEnumPic: function (token, name) { return name ? '' : ''; },
    getAppInfo: function (token, pkg) { return appInfo(pkg); },
    getCarData: function (token, name) { return carData(name); },
    carCommand: function (token, payload) { return carCommand(payload); },
    carCmd: function (token, payload) { return carCommand(payload); },
    getWeather: function () { return JSON.stringify(weather); },
    refreshWeather: function (token, lat, lon) {
      if (isFinite(lat) && isFinite(lon)) gps = { lat: Number(lat), lon: Number(lon) };
      setTimeout(function () {
        weather.temp = String(6 + Math.round(Math.random() * 3));
        weather.condition = Math.random() > 0.5 ? 'Переменная облачность' : 'Небольшой дождь';
        weather.icon = weather.condition.indexOf('дождь') !== -1 ? CLOUD : SUN;
        emit('weather', weather);
      }, 900);
      return JSON.stringify({ status: 'requested' });
    },
    runApp: function (token, pkg) {
      var known = apps.some(function (app) { return app.package === pkg; });
      if (!known) return JSON.stringify({ error: 'app_not_found' });
      console.info('[stub] runApp ' + pkg);
      return JSON.stringify({ status: 'ok' });
    },
    runEnum: function (token, name) { return runEnum(name); },
    getvol: function () { return volume; },
    setvol: function (token, value) { volume = clamp(Math.round(Number(value) || 0), 0, 100); },
    requestCarDataAsync: function (token, requestId, name) {
      setTimeout(function () {
        emit('carResponse', { requestId: requestId, requestType: 'data', response: JSON.parse(carData(name)) });
      }, 60);
      return true;
    },
    requestCarCommandAsync: function (token, requestId, payload) {
      setTimeout(function () {
        emit('carResponse', { requestId: requestId, requestType: 'command', response: JSON.parse(carCommand(payload)) });
      }, 60);
      return true;
    },
    requestRunAppAsync: function (token, requestId, pkg) {
      var result = JSON.parse(window.androidApi.runApp(token, pkg));
      setTimeout(function () {
        emit('carResponse', { requestId: requestId, requestType: 'runApp', response: result });
      }, 60);
      return true;
    },
    requestRunEnumAsync: function (token, requestId, name) {
      var result = JSON.parse(runEnum(name));
      setTimeout(function () {
        emit('carResponse', { requestId: requestId, requestType: 'runEnum', response: result });
      }, 60);
      return true;
    },
    requestLauncherCatalogAsync: function (token, requestId) {
      setTimeout(function () { launcherCatalog(requestId); }, 80);
      return true;
    },
    getSavedSplitActions: function () { return JSON.stringify([]); },
    runSavedSplit: function () { return JSON.stringify({ error: 'split_not_found' }); },
    subscribeMiniMap: function () {
      miniMap.subscribed = true;
      startMiniMap();
      return JSON.stringify({ status: 'subscribed' });
    },
    setMiniMapTheme: function (token, mode) {
      miniMap.theme = String(mode).toLowerCase() === 'night' ? 'night' : 'day';
      emitMiniMap();
      return JSON.stringify({ status: 'ok' });
    },
    unsubscribeMiniMap: function () {
      miniMap.subscribed = false;
      stopMiniMap();
      return JSON.stringify({ status: 'unsubscribed' });
    },
    getFileList: function () { return JSON.stringify([]); },
    getFile: function () { return ''; },
    setLogFilter: function () {},
    pingEvent: function () { setTimeout(function () { emit('ping', { ok: true }); }, 10); },
    setBright: function () {}
  };

  // If the host injects its real interface late, the demo stops instead of
  // running fake telemetry beside the car.
  function alive() {
    return !!window.androidApi && window.androidApi.__stub === true;
  }

  setInterval(function () { if (alive()) tickMusic(); }, 1000);
  setInterval(function () { if (alive()) tickCar(); }, 2500);
  setInterval(function () { if (alive()) emit('gps', gps); }, 15000);
  setInterval(function () { if (alive()) emitHud(); }, 4000);
  setInterval(function () { if (alive()) emitGps(); }, 15000);
  setTimeout(function () { if (alive()) emitMusic(); }, 200);
  setTimeout(function () { if (alive()) emitHud(); }, 1200);
  setTimeout(function () { if (alive()) emitGps(); }, 2500);
})();
