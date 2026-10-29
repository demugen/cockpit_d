/* localStorage wrapper with an in-memory fallback. Storage failure must not
   take the board down: the panel keeps working for the current session. */

(function (App) {
  'use strict';

  var memory = {};
  var usable = null;

  function probe() {
    if (usable !== null) return usable;
    try {
      var key = '__ckp_probe__';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      usable = true;
    } catch (error) {
      usable = false;
    }
    return usable;
  }

  function read(key, fallback) {
    try {
      var raw = probe() ? window.localStorage.getItem(key) : memory[key];
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    try {
      if (probe()) {
        window.localStorage.setItem(key, raw);
        return true;
      }
    } catch (error) {
      usable = false;
    }
    memory[key] = raw;
    return false;
  }

  function remove(key) {
    try {
      if (probe()) window.localStorage.removeItem(key);
    } catch (error) {
      usable = false;
    }
    delete memory[key];
  }

  App.core.storage = {
    read: read,
    write: write,
    remove: remove,
    isPersistent: function () { return probe(); }
  };
})(window.App);
