'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parse = require('../js/core/bridge-parse.js');

test('payloadError distinguishes rejection, errors and valid payloads', () => {
  assert.equal(parse.payloadError(false), 'rejected');
  assert.equal(parse.payloadError('{"error":"unauthorized"}'), 'unauthorized');
  assert.equal(parse.payloadError('{"success":false}'), 'failed');
  assert.equal(parse.payloadError({ available: false }), 'unavailable');
  assert.equal(parse.payloadError({ ok: false }), 'failed');
  assert.equal(parse.payloadError('{"name":"speed","value":42}'), null);
  assert.equal(parse.payloadError('[1,2]'), null);
  assert.equal(parse.payloadError('iVBORw0KGgo='), null);
  assert.equal(parse.payloadError('{"broken":'), 'invalid_json');
  assert.equal(parse.payloadError(undefined), null);
});

test('parseApps accepts packages, alternate keys and bare base64 icons', () => {
  const apps = parse.parseApps(JSON.stringify([
    { name: 'Навигатор', package: 'ru.yandex.yandexnavi', icon: 'AAAA' },
    { label: 'Музыка', packageName: 'com.example.music' },
    { appName: 'Без пакета' },
    'junk'
  ]));
  assert.deepEqual(apps, [
    { package: 'ru.yandex.yandexnavi', name: 'Навигатор', icon: 'data:image/png;base64,AAAA' },
    { package: 'com.example.music', name: 'Музыка', icon: '' }
  ]);
  assert.deepEqual(parse.parseApps(false), []);
  assert.deepEqual(parse.parseApps('{"error":"unauthorized"}'), []);
});

test('parseEnum keeps name and human text', () => {
  const actions = parse.parseEnum(JSON.stringify([
    { RunEnum: 'MEDIA_PLAY', RunEnumText: 'Медиа плей' },
    { runEnum: 'GO_TO_PP' },
    'GLOBAL_HOME'
  ]));
  assert.deepEqual(actions, [
    { name: 'MEDIA_PLAY', text: 'Медиа плей' },
    { name: 'GO_TO_PP', text: 'GO_TO_PP' },
    { name: 'GLOBAL_HOME', text: 'GLOBAL_HOME' }
  ]);
});

test('parseMusic normalizes milliseconds and legacy seconds', () => {
  const modern = parse.parseMusic({
    PlayStat: 1,
    SongName: 'Track',
    SongArtist: 'Artist',
    SongAlbumPicture: 'BBBB',
    Trpos: 61000,
    Trdur: 180000
  });
  assert.equal(modern.playing, true);
  assert.equal(modern.title, 'Track');
  assert.equal(modern.position, 61000);
  assert.equal(modern.duration, 180000);
  assert.equal(modern.art, 'data:image/png;base64,BBBB');

  const legacy = parse.parseMusic({ PlayStat: 'pause', Trpos: 10, Trdur: 200 });
  assert.equal(legacy.playing, false);
  assert.equal(legacy.position, 10000);
  assert.equal(legacy.duration, 200000);
});

test('parseWeather tolerates string temperatures and errors', () => {
  assert.deepEqual(parse.parseWeather('{"city":"Москва","temp":"-3","condition":"Ясно","icon":"x.png"}'), {
    city: 'Москва', temp: '-3', condition: 'Ясно', icon: 'x.png'
  });
  assert.deepEqual(parse.parseWeather('{"error":"unavailable"}'), { error: 'unavailable' });
  assert.equal(parse.parseWeather('{}').temp, '');
});

test('parseCarData rejects error objects but keeps snapshots', () => {
  assert.equal(parse.parseCarData('{"error":"car_cmd_proxy_null"}'), null);
  assert.equal(parse.parseCarData('{"success":false}'), null);
  assert.deepEqual(parse.parseCarData('{"name":"speed","value":42}'), { name: 'speed', value: 42 });
});

test('imageData does not double-wrap full URLs', () => {
  assert.equal(parse.imageData('data:image/png;base64,AA'), 'data:image/png;base64,AA');
  assert.equal(parse.imageData('http://host/a.png'), 'http://host/a.png');
  assert.equal(parse.imageData('/assets/a.png'), '/assets/a.png');
  assert.equal(parse.imageData(''), '');
});

test('imageData drops script and non-image data URLs', () => {
  assert.equal(parse.imageData('javascript:alert(1)'), '');
  assert.equal(parse.imageData('vbscript:msgbox(1)'), '');
  assert.equal(parse.imageData('data:text/html,<b>x</b>'), '');
  assert.equal(parse.imageData('data:image/svg+xml,<svg/>'), 'data:image/svg+xml,<svg/>');
  assert.equal(parse.parseWeather('{"icon":"javascript:alert(1)"}').icon, '');
});

test('imageData wraps base64 that happens to start with a slash', () => {
  const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD';
  assert.equal(parse.imageData(jpeg), 'data:image/jpeg;base64,' + jpeg);
  assert.equal(parse.imageData('  iVBORw0KGgo=  '), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(parse.imageData('file:///sdcard/icon.png'), 'file:///sdcard/icon.png');
  assert.equal(parse.imageData('/storage/emulated/0/pic.jpg'), '/storage/emulated/0/pic.jpg');
});

test('imageData survives wrapped base64 and keeps the real image type', () => {
  const wrapped = '/9j/4AAQ\nSkZJRgABAQ\nAAAQABAAD';
  assert.equal(parse.imageData(wrapped), 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD');
  assert.equal(parse.imageData('R0lGODlh\nAQAB'), 'data:image/gif;base64,R0lGODlhAQAB');
  assert.equal(parse.imageData('UklGRg=='), 'data:image/webp;base64,UklGRg==');
  assert.equal(parse.imageData('-_-_'), 'data:image/png;base64,+/+/');
  assert.equal(parse.imageData('data:image/jpeg;base64,/9j/4A\nAAQ'),
    'data:image/jpeg;base64,/9j/4AAAQ');
  assert.equal(parse.imageData('data:image/jpeg;base64,@@@'), '');
  assert.equal(parse.imageData('data:image/jpeg;base64,'), '');
});
