'use strict';

/* Boot smoke test: every referenced asset must exist and the script order
   must respect load-time dependencies. This cannot prove the UI renders,
   but it catches the classic file:// white screen. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function attrValues(source, attribute, tag) {
  const pattern = new RegExp('<' + tag + '[^>]*' + attribute + '="([^"]+)"', 'g');
  const values = [];
  let match;
  while ((match = pattern.exec(source)) !== null) values.push(match[1]);
  return values;
}

const scripts = attrValues(html, 'src', 'script');
const styles = attrValues(html, 'href', 'link');

test('every script and stylesheet referenced by index.html exists', () => {
  assert.ok(scripts.length >= 25, 'expected the full script set');
  scripts.concat(styles.filter((href) => !href.startsWith('data:'))).forEach((href) => {
    assert.ok(fs.existsSync(path.join(root, href)), 'missing asset: ' + href);
  });
});

test('stylesheets load in cascade order', () => {
  const local = styles.filter((href) => href.startsWith('css/'));
  assert.deepEqual(local, [
    'css/tokens.css',
    'css/base.css',
    'css/board.css',
    'css/widgets.css',
    'css/settings.css'
  ]);
});

test('scripts load in dependency order', () => {
  const at = (href) => {
    const index = scripts.indexOf(href);
    assert.notEqual(index, -1, 'not referenced: ' + href);
    return index;
  };
  assert.equal(scripts[0], 'js/core/namespace.js');
  assert.equal(scripts[scripts.length - 1], 'js/main.js');
  assert.ok(at('js/core/slots.js') > at('js/core/utils.js'));
  assert.ok(at('js/core/tiles.js') > at('js/core/utils.js'));
  assert.ok(at('js/core/seat-catalog.js') > at('js/core/utils.js'));
  assert.ok(at('js/core/car-metrics.js') > at('js/core/utils.js'));
  assert.ok(at('js/core/settings-schema.js') > at('js/core/grid.js'));
  assert.ok(at('js/core/bridge.js') > at('js/core/bridge-parse.js'));
  assert.ok(at('js/services/settings.js') > at('js/core/bridge.js'));
  assert.ok(at('js/services/wallpaper.js') > at('js/services/settings.js'));
  assert.ok(at('js/services/car.js') > at('js/services/settings.js'));
  assert.ok(at('js/ui/shell.js') > at('js/services/settings.js'));
  assert.ok(at('js/ui/board.js') > at('js/ui/shell.js'));
  assert.ok(at('js/ui/settings-ui.js') > at('js/ui/board.js'));
  assert.ok(at('js/services/body.js') > at('js/core/bridge.js'));
  assert.ok(at('js/services/apps.js') > at('js/core/bridge.js'));
  assert.ok(at('js/core/nav-data.js') > at('js/core/bridge-parse.js'));
  assert.ok(at('js/services/nav.js') > at('js/core/nav-data.js'));
  assert.ok(at('js/widgets/nav.js') > at('js/services/nav.js'));
  ['clock', 'weather', 'nav', 'media', 'climate', 'heaters', 'windows', 'seats', 'cardata', 'apps'].forEach((id) => {
    const index = at('js/widgets/' + id + '.js');
    assert.ok(index > at('js/ui/settings-ui.js'), id + ' must load after the UI layer');
    assert.ok(index < at('js/main.js'), id + ' must load before bootstrap');
  });
});

test('the host is told JS is ready before widgets mount', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const ready = main.indexOf("run('onJsReady'");
  const board = main.indexOf("run('board'");
  assert.notEqual(ready, -1, 'main.js must call onJsReady');
  assert.notEqual(board, -1, 'main.js must mount the board');
  assert.ok(ready < board, 'a widget may call into the host while mounting');
});

test('page ships the DOM hooks the app expects', () => {
  ['preloader', 'app', 'header', 'board', 'toast', 'editbar', 'modal-root'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  });
  assert.ok(html.includes('aria-busy="true"'), '#app must start busy');
});

test('page does not reference remote scripts, styles or fonts', () => {
  scripts.concat(styles).forEach((href) => {
    assert.equal(/^(https?:)?\/\//.test(href), false, 'remote asset: ' + href);
  });
  assert.equal(/type="module"/.test(html), false, 'classic scripts only');
});

test('manifest matches the requested add-on identity', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.id, 'cockpit_d');
  assert.equal(manifest.name, 'Cockpit D');
  assert.equal(manifest.version, '2.0.0');
  assert.equal(manifest.entry, 'index.html');
});

test('CSS stays inside the fixed kiosk viewport', () => {
  const base = fs.readFileSync(path.join(root, 'css/base.css'), 'utf8');
  assert.ok(/overflow:\s*hidden/.test(base), 'html/body must not scroll');
  const board = fs.readFileSync(path.join(root, 'css/board.css'), 'utf8');
  assert.ok(/grid-template-columns:\s*repeat\(var\(--cols\)/.test(board), 'board must be a real grid');
});
