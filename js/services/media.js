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
    volumeMode: 'none',
    eventAt: 0,
    error: null
  };

  var demandCount = 0;
  var ticker = null;
  // While a volume commit runs, getvol may still report the old level:
  // the requested value wins until the host catches up.
  var volumeCommit = false;
  var knownLevel = null;
  var pendingTarget = null;
  var pumpTimer = null;
  var settleUntil = 0;
  var pollTick = 0;

  function emit() {
    bus.emit('media:change', state);
  }

  function volumeMode() {
    if (bridge.canSetVolume()) return 'exact';
    if (bridge.canStepVolume()) return 'steps';
    return 'none';
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
    if (demandCount <= 0) return;
    // The head unit can change the level by itself (knob, steering wheel, another
    // app), so the panel re-reads it while a widget is watching.
    pollTick += 1;
    if (pollTick % 2 === 0) refreshVolume();
    if (!state.playing || !state.duration) return;
    state.position = Math.min(state.duration, state.position + 1000);
    bus.emit('media:tick', { position: state.position, duration: state.duration });
  }

  function refreshVolume() {
    if (volumeCommit || pendingTarget !== null) return;
    // Right after a stepped walk the host queue is still draining: reading too
    // early would pull the slider back to a level the head unit is leaving.
    if (Date.now() < settleUntil) return;
    var volume = bridge.getVolume();
    if (volume === null) return;
    if (volume === state.volume) return;
    knownLevel = volume;
    state.volume = volume;
    emit();
  }

  /* Stepped volume. Some firmwares have no setvol at all and Volume_Up or
     Volume_Down moves the level by exactly one percent, so a drag becomes a
     queue of steps. The queue is pumped a few steps at a time: dozens of
     synchronous bridge calls in one gesture freeze the WebView. */
  var STEPS_PER_TICK = 10;
  var STEP_TICK_MS = 140;
  // Must outlast one poll (tick() re-reads every 2 s), otherwise the read it is
  // meant to suppress still lands before the window closes.
  var SETTLE_MS = 2500;
  // A step rejected by the head unit can come back synchronously, before the
  // caller has finished. Reporting it there would let setVolume overwrite the
  // error with the level that was never accepted, so the first pump hands it
  // back instead.
  var syncRejection = null;
  // Every walk of the pump has a number. Answers that belong to a walk the user
  // has left behind must not abort the one now running.
  var walkId = 0;

  function finishSteps(error, handBack) {
    if (pumpTimer) {
      clearInterval(pumpTimer);
      pumpTimer = null;
    }
    pendingTarget = null;
    if (error) {
      // One refusal is enough to close the walk: a rejected batch answers once per
      // step, and each of them would otherwise report and correct the level again.
      walkId += 1;
      var failed = bridge.getVolume();
      if (typeof failed === 'number') {
        knownLevel = failed;
        state.volume = failed;
      }
      state.error = error;
      if (handBack) {
        syncRejection = error;
        return;
      }
      emit();
      bus.emit('media:command', { ok: false, error: error });
      return;
    }
    // The steps are queued on the host side and may still be running: trust the
    // walked level, the poll in tick() picks up the real one once it settles.
    state.error = null;
    settleUntil = Date.now() + SETTLE_MS;
    emit();
  }

  /* The host takes a step into its queue and answers `true` right away; when that
     step then fails — licence, token, unknown enum — the only place it says so is
     the carResponse that follows, and it can follow after the walk has counted all
     its steps. While the panel still trusts its own count the refusal has to
     correct the slider, otherwise a command the head unit never ran is shown as
     the volume it has. */
  function stepRefused(walk) {
    return function (error) {
      if (!error || walk !== walkId) return;
      if (pendingTarget === null && Date.now() >= settleUntil) return;
      finishSteps(error);
    };
  }

  function pumpSteps(fromStart) {
    if (pendingTarget === null) return;
    var delta = Math.round(pendingTarget) - Math.round(knownLevel);
    if (delta === 0) {
      finishSteps(null);
      return;
    }
    var name = delta > 0 ? 'Volume_Up' : 'Volume_Down';
    var count = Math.min(Math.abs(delta), STEPS_PER_TICK);
    var walk = walkId;
    for (var i = 0; i < count; i += 1) {
      var step = bridge.runEnumStep(name, stepRefused(walk));
      if (!step.ok) {
        finishSteps(step.error || 'failed', fromStart === true);
        return;
      }
    }
    knownLevel += delta > 0 ? count : -count;
    if (knownLevel === pendingTarget) finishSteps(null);
  }

  function startPump() {
    syncRejection = null;
    walkId += 1;
    if (pumpTimer) clearInterval(pumpTimer);
    pumpTimer = setInterval(function () { pumpSteps(); }, STEP_TICK_MS);
    pumpSteps(true);
    return syncRejection;
  }

  // Nobody is watching the slider once the card is gone or the panel is behind
  // another app, so a walk in flight is dropped rather than left queueing steps
  // for a widget that no longer paints. The host may still be draining the steps
  // it already took, so the settle window opens the same way it does for a walk
  // that finished on its own.
  function stopPump() {
    if (!pumpTimer && pendingTarget === null) return;
    walkId += 1;
    if (pumpTimer) {
      clearInterval(pumpTimer);
      pumpTimer = null;
    }
    pendingTarget = null;
    settleUntil = Date.now() + SETTLE_MS;
  }

  function applyVolume(target) {
    pendingTarget = target;
    if (state.volumeMode === 'exact') {
      var record = bridge.setVolume(target);
      if (record.ok) {
        knownLevel = target;
        pendingTarget = null;
        // The head unit applies setvol asynchronously: getvol can still report
        // the previous level right after the commit, and painting that back
        // drags the slider off the value the user just chose.
        settleUntil = Date.now() + SETTLE_MS;
        return null;
      }
      if (record.error !== 'unavailable' || !bridge.canStepVolume()) {
        return record.error || 'failed';
      }
      state.volumeMode = 'steps';
    }
    if (state.volumeMode !== 'steps') return 'unavailable';

    if (knownLevel === null) {
      var read = bridge.getVolume();
      if (typeof read === 'number') knownLevel = read;
      else if (typeof state.volume === 'number') knownLevel = state.volume;
    }
    // Without a starting point the steps cannot be counted.
    if (knownLevel === null) return 'unknown_level';
    return startPump();
  }

  function setVolume(value) {
    if (state.volumeMode === 'none') state.volumeMode = volumeMode();
    if (state.volumeMode === 'none') {
      bus.emit('media:command', { ok: false, error: 'unavailable' });
      return false;
    }
    var base = typeof state.volume === 'number' ? state.volume : 50;
    var next = utils.clamp(Math.round(utils.toNumber(value, base)), 0, 100);
    volumeCommit = true;
    var error = applyVolume(next);
    if (error) {
      pendingTarget = null;
      var readback = bridge.getVolume();
      state.volume = typeof readback === 'number' ? readback : state.volume;
      state.error = error;
      volumeCommit = false;
      emit();
      bus.emit('media:command', { ok: false, error: error });
      return false;
    }
    state.volume = next;
    state.error = null;
    volumeCommit = false;
    emit();
    bus.emit('media:command', { ok: true, volume: next, mode: state.volumeMode });
    return true;
  }

  function nudgeVolume(delta) {
    var base = typeof state.volume === 'number' ? state.volume : bridge.getVolume();
    if (typeof base !== 'number') base = 50;
    return setVolume(base + delta);
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

  function demand(on) {
    demandCount += on ? 1 : -1;
    if (demandCount < 0) demandCount = 0;
    if (demandCount === 0) {
      stopTicker();
      stopPump();
      return;
    }
    // The bridge methods appear when the host injects androidApi, which can be
    // after this service first looked: re-detect for every new consumer.
    if (state.volumeMode === 'none') {
      var mode = volumeMode();
      if (mode !== 'none') {
        state.volumeMode = mode;
        emit();
      }
    }
    startTicker();
    refreshVolume();
  }

  // One second is the progress clock, so it only runs while a card is mounted
  // and the panel is on screen; behind another app the WebView keeps ticking but
  // nothing reads the answer, and every poll costs the head unit a call.
  function stopTicker() {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function startTicker() {
    stopTicker();
    if (demandCount <= 0 || document.hidden) return;
    ticker = setInterval(tick, 1000);
  }

  function init() {
    state.volumeMode = volumeMode();
    bus.on('android:musicInfo', applyInfo);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopTicker();
        stopPump();
      } else {
        startTicker();
        refreshVolume();
      }
    });
  }

  App.services.media = {
    init: init,
    state: function () { return state; },
    demand: demand,
    playPause: playPause,
    nextTrack: nextTrack,
    setVolume: setVolume,
    nudgeVolume: nudgeVolume,
    refreshVolume: refreshVolume
  };
})(window.App);
