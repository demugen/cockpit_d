/* Response normalization for the JCarTools bridge.
   Everything that comes from Android is untrusted and may be false,
   a JSON string, a plain string, an error object or a half-filled object. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.App = root.App || { core: {}, services: {}, widgets: {}, ui: {} };
    root.App.core = root.App.core || {};
    root.App.core.bridgeParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function parseJson(raw, fallback) {
    if (typeof raw === 'string') {
      var trimmed = raw.trim();
      if (!trimmed) return fallback;
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        return fallback;
      }
    }
    return raw === undefined || raw === null ? fallback : raw;
  }

  function objectError(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.error) return String(data.error);
    if (data.success === false) return 'failed';
    if (data.available === false) return 'unavailable';
    if (data.ok === false) return 'failed';
    return null;
  }

  function payloadError(value) {
    if (value === false) return 'rejected';
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') return null;
      var parsed = parseJson(trimmed, undefined);
      if (parsed === undefined) return 'invalid_json';
      if (Array.isArray(parsed)) return null;
      return objectError(parsed);
    }
    if (Array.isArray(value)) return null;
    return objectError(value);
  }

  var BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
  var SIGNATURES = [
    { head: '/9j/', type: 'image/jpeg' },
    { head: 'iVBORw0KGgo', type: 'image/png' },
    { head: 'R0lGOD', type: 'image/gif' },
    { head: 'UklGR', type: 'image/webp' },
    { head: 'Qk', type: 'image/bmp' }
  ];

  function base64Type(body) {
    for (var i = 0; i < SIGNATURES.length; i += 1) {
      if (body.indexOf(SIGNATURES[i].head) === 0) return SIGNATURES[i].type;
    }
    return 'image/png';
  }

  function imageData(value) {
    if (!value || typeof value !== 'string') return '';
    var trimmed = value.trim();
    if (!trimmed) return '';
    if (/^(javascript|vbscript):/i.test(trimmed)) return '';
    if (trimmed.indexOf('data:') === 0) {
      var comma = trimmed.indexOf(',');
      if (comma === -1) return '';
      var header = trimmed.slice(5, comma);
      if (!/^image\//i.test(header)) return '';
      if (!/;base64/i.test(header)) return trimmed;
      // Android's Base64.DEFAULT wraps the payload at 76 characters, and a
      // data URL with line breaks does not decode in the WebView.
      var body = trimmed.slice(comma + 1).replace(/\s+/g, '');
      if (!body || !BASE64.test(body)) return '';
      return trimmed.slice(0, comma + 1) + body;
    }
    if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0 ||
      trimmed.indexOf('file:') === 0 || trimmed.indexOf('blob:') === 0) {
      return trimmed;
    }
    // The host sends covers and icons as bare base64, often with newlines.
    // JPEG data starts with "/9j/", which also looks like a path, so base64
    // wins when the whole string is inside the alphabet; real paths carry
    // dots or spaces.
    var clean = trimmed.replace(/\s+/g, '');
    if (BASE64.test(clean)) {
      var normalized = clean.replace(/-/g, '+').replace(/_/g, '/');
      return 'data:' + base64Type(normalized) + ';base64,' + normalized;
    }
    return trimmed;
  }

  function parseApps(raw) {
    var data = parseJson(raw, null);
    if (data && !Array.isArray(data) && Array.isArray(data.apps)) data = data.apps;
    if (!Array.isArray(data)) return [];
    return data.reduce(function (result, item) {
      if (!item || typeof item !== 'object') return result;
      var pkg = item.package || item.packageName || item.pkg || item.id;
      if (!pkg) return result;
      var name = item.name || item.label || item.appName || String(pkg);
      result.push({
        package: String(pkg),
        name: String(name),
        icon: imageData(item.icon || item.iconBase64 || item.appIcon || '')
      });
      return result;
    }, []);
  }

  function parseEnum(raw) {
    var data = parseJson(raw, null);
    if (data && !Array.isArray(data) && Array.isArray(data.items)) data = data.items;
    if (!Array.isArray(data)) return [];
    return data.reduce(function (result, item) {
      var name = typeof item === 'string'
        ? item
        : (item && (item.RunEnum || item.runEnum || item.name || item.cmd));
      if (!name) return result;
      var text = typeof item === 'object' && item
        ? (item.RunEnumText || item.runEnumText || item.label || String(name))
        : String(name);
      result.push({ name: String(name), text: String(text) });
      return result;
    }, []);
  }

  function parseCarData(raw) {
    var data = parseJson(raw, null);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (objectError(data)) return null;
    return data;
  }

  function parseWeather(raw) {
    var data = parseJson(raw, null);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.error) return { error: String(data.error) };
    return {
      city: data.city === undefined || data.city === null ? '' : String(data.city),
      temp: data.temp === undefined || data.temp === null ? '' : String(data.temp),
      condition: data.condition === undefined || data.condition === null ? '' : String(data.condition),
      icon: imageData(data.icon === undefined || data.icon === null ? '' : String(data.icon))
    };
  }

  function parseBoolean(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (typeof value === 'string') {
      var normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'play' ||
        normalized === 'playing' || normalized === 'on') return true;
      if (normalized === 'false' || normalized === '0' || normalized === 'pause' ||
        normalized === 'paused' || normalized === 'stop' || normalized === 'off') return false;
    }
    return null;
  }

  function parseMusic(data) {
    var payload = data && typeof data === 'object' ? data : {};
    var hasDuration = payload.Trdur !== undefined && payload.Trdur !== null;
    var hasPosition = payload.Trpos !== undefined && payload.Trpos !== null;
    var duration = hasDuration ? Number(payload.Trdur) : null;
    var position = hasPosition ? Number(payload.Trpos) : null;
    if (duration !== null && !isFinite(duration)) duration = null;
    if (position !== null && !isFinite(position)) position = null;
    // The host reports milliseconds; a track shorter than a second is not real,
    // so treat smaller numbers as seconds from older firmwares.
    if (duration !== null && duration > 0 && duration < 1000) {
      duration *= 1000;
      if (position !== null) position *= 1000;
    }
    if (duration !== null && duration < 0) duration = 0;
    if (position !== null && position < 0) position = 0;
    if (duration && position !== null && position > duration) position = duration;
    return {
      title: payload.SongName === undefined ? null : String(payload.SongName || ''),
      artist: payload.SongArtist === undefined ? null : String(payload.SongArtist || ''),
      album: payload.SongAlbum === undefined ? null : String(payload.SongAlbum || ''),
      art: payload.SongAlbumPicture === undefined ? null : imageData(payload.SongAlbumPicture || ''),
      position: position,
      duration: duration,
      playing: parseBoolean(payload.PlayStat) === true
    };
  }

  return {
    parseJson: parseJson,
    payloadError: payloadError,
    objectError: objectError,
    imageData: imageData,
    parseApps: parseApps,
    parseEnum: parseEnum,
    parseCarData: parseCarData,
    parseWeather: parseWeather,
    parseBoolean: parseBoolean,
    parseMusic: parseMusic
  };
});
