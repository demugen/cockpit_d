/* Media service: track from musicInfo, local progress tick, transport commands. */

(function (App) {
  'use strict';

  var bus = App.core.bus;
  var bridge = App.core.bridge;
  var parse = App.core.bridgeParse;
  var utils = App.core.utils;

  var state = {
    title: '',
    artist: '',
    album: '',
    art: '',
    position: 0,
    duration: 0,
    playing: false,
    known: false,
    volume: null,
    eventAt: 0,
    error: null
  };

  var demandCount = 0;
  var ticker = null;

  function emit() {
    bus.emit('media:change', state);
  }

  function applyInfo(data) {
    var patch = parse.parseMusic(data);
    if (patch.title !== null) state.title = patch.title;
    if (patch.artist !== null) state.artist = patch.artist;
    if (patch.album !== null) state.album = patch.album;
    if (patch.art !== null) state.art = patch.art;
    if (patch.duration !== null) state.duration = patch.duration;
    if (patch.position !== null) state.position = patch.position;
    state.playing = patch.playing;
    state.known = !!(state.title || state.artist);
    state.eventAt = Date.now();
    state.error = null;
    emit();
  }

  function tick() {
    if (demandCount <= 0 || !state.playing || !state.duration) return;
    state.position = Math.min(state.duration, state.position + 1000);
    bus.emit('media:tick', { position: state.position, duration: state.duration });
  }

  function refreshVolume() {
    var volume = bridge.getVolume();
    if (volume === null) return;
    if (volume === state.volume) return;
    state.volume = volume;
    emit();
  }

  function playPause() {
    var next = !state.playing;
    state.playing = next;
    emit();
    var record = bridge.runEnum(next ? 'MEDIA_PLAY' : 'MEDIA_PAUSE');
    if (!record.ok) {
      state.playing = !next;
      state.error = record.error || 'failed';
      emit();
      bus.emit('media:command', { ok: false, error: state.error });
      return false;
    }
    bus.emit('media:command', { ok: true });
    return true;
  }

  function nextTrack() {
    var record = bridge.runEnum('MEDIA_NEXT');
    if (!record.ok) {
      state.error = record.error || 'failed';
      emit();
      bus.emit('media:command', { ok: false, error: state.error });
      return false;
    }
    bus.emit('media:command', { ok: true });
    return true;
  }

  function setVolume(value) {
    var next = utils.clamp(Math.round(utils.toNumber(value, state.volume === null ? 50 : state.volume)), 0, 100);
    var record = bridge.setVolume(next);
    if (!record.ok) {
      bus.emit('media:command', { ok: false, error: record.error || 'failed' });
      return false;
    }
    state.volume = next;
    emit();
    return true;
  }

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount > 0) refreshVolume();
  }

  function init() {
    bus.on('android:musicInfo', applyInfo);
    ticker = setInterval(tick, 1000);
  }

  App.services.media = {
    init: init,
    state: function () { return state; },
    demand: demand,
    playPause: playPause,
    nextTrack: nextTrack,
    setVolume: setVolume,
    refreshVolume: refreshVolume
  };
})(window.App);
