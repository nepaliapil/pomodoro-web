(function () {
  'use strict';

  var KEY = 'pomodoro-v2', OLD_KEY = 'pomodoro-settings-v1', ROUNDS = 4;
  var LABELS = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  var DEFAULTS = { focus: 25, short: 5, long: 15, goal: 8, auto: false, alarm: 'chime', volume: 0.6, bg: 'none', bgVolume: 0.4, notify: false, musicSync: true,
    music: {
      lastMode: 'study', lastService: 'spotify',
      playlists: {
        study: { spotify: '', youtube: '' },
        work: { spotify: '', youtube: '' },
        gym: { spotify: '', youtube: '' }
      }
    } };
  function blankPlaylists() {
    return { study: { spotify: '', youtube: '' }, work: { spotify: '', youtube: '' }, gym: { spotify: '', youtube: '' } };
  }

  var $ = function (id) { return document.getElementById(id); };

  /* ================= storage ================= */
  function load() {
    var s = { settings: Object.assign({}, DEFAULTS), tasks: [], templates: [], projects: [], log: [], activeId: null };
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p.settings) {
          Object.keys(DEFAULTS).forEach(function (k) {
            if (typeof p.settings[k] === typeof DEFAULTS[k]) s.settings[k] = p.settings[k];
          });
          if (p.settings.music && typeof p.settings.music === 'object') {
            var m = p.settings.music, pl = blankPlaylists();
            if (m.playlists && typeof m.playlists === 'object') {
              ['study', 'work', 'gym'].forEach(function (mode) {
                var src = m.playlists[mode];
                if (src && typeof src === 'object') {
                  if (typeof src.spotify === 'string') pl[mode].spotify = src.spotify;
                  if (typeof src.youtube === 'string') pl[mode].youtube = src.youtube;
                }
              });
            } else {
              // migrate from the older flat {service, study, gym} shape (v1.2 and earlier)
              var oldService = m.service === 'youtube' ? 'youtube' : 'spotify';
              if (typeof m.study === 'string' && m.study) pl.study[oldService] = m.study;
              if (typeof m.gym === 'string' && m.gym) pl.gym[oldService] = m.gym;
              if (!m.lastMode) m.lastMode = m.study ? 'study' : (m.gym ? 'gym' : 'study');
              if (!m.lastService) m.lastService = oldService;
            }
            s.settings.music = {
              lastMode: ['study', 'work', 'gym'].indexOf(m.lastMode) !== -1 ? m.lastMode : 'study',
              lastService: m.lastService === 'youtube' ? 'youtube' : 'spotify',
              playlists: pl
            };
          }
        }
        ['tasks', 'templates', 'projects', 'log'].forEach(function (k) { if (Array.isArray(p[k])) s[k] = p[k]; });
        if (typeof p.activeId === 'string') s.activeId = p.activeId;
      } else {
        var old = localStorage.getItem(OLD_KEY);
        if (old) {
          var o = JSON.parse(old);
          ['focus', 'short', 'long'].forEach(function (k) { if (Number.isFinite(o[k]) && o[k] >= 1) s.settings[k] = o[k]; });
          if (typeof o.auto === 'boolean') s.settings.auto = o.auto;
        }
      }
    } catch (e) { /* storage unavailable: run with defaults */ }
    if (['none', 'tick', 'tickfast', 'white', 'brown'].indexOf(s.settings.bg) === -1) s.settings.bg = 'none';
    if (['chime', 'bell', 'beep', 'none'].indexOf(s.settings.alarm) === -1) s.settings.alarm = 'chime';
    return s;
  }
  var state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ================= helpers ================= */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function dayKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDur(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h ' + m + 'm' : m + 'm';
  }
  function fmtClock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function minutes(m) { return state.settings[m] * 60000; }
  function findTask(id) { return state.tasks.filter(function (t) { return t.id === id; })[0] || null; }
  function activeTask() { return state.activeId ? findTask(state.activeId) : null; }
  function findProject(id) { return state.projects.filter(function (p) { return p.id === id; })[0] || null; }
  function projectName(id) { var p = id ? findProject(id) : null; return p ? p.name : ''; }
  function projectOptions(selected) {
    var o = '<option value="">No project</option>';
    state.projects.forEach(function (p) {
      o += '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    return o;
  }
  function fv(form, name) { return form.querySelector('[name="' + name + '"]').value; }
  function fvOpt(form, name, fallback) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value : fallback; }
  function clampInt(v, min, max, fallback) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) v = fallback;
    return Math.min(max, Math.max(min, v));
  }

  // Two-step confirmation for destructive buttons (window.confirm can be blocked)
  function confirmClick(btn, action) {
    if (btn.dataset.armed) {
      clearTimeout(btn._t);
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
      action();
      return;
    }
    btn.dataset.label = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = 'Click again to confirm';
    btn._t = setTimeout(function () {
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
    }, 4000);
  }

  /* ================= timer state ================= */
  var mode = 'focus', cycle = 0;
  var total = minutes('focus'), remaining = total;
  var running = false, endAt = 0;
  var audioCtx = null;
  var editingId = null, view = 'timer', rangeType = 'week', rangeOffset = 0;

  var timeEl = $('time'), statusEl = $('status'), ringEl = $('ring');
  var toggleBtn = $('toggle'), pipsEl = $('pips'), announceEl = $('announce');

  /* ================= dial ================= */
  // The ring is a stroked circle; hiding part of its dash leaves an arc for the time left.
  var RING_LEN = 2 * Math.PI * 136;
  ringEl.style.strokeDasharray = RING_LEN.toFixed(2);
  function setRing(f) {
    ringEl.style.strokeDashoffset = (RING_LEN * (1 - Math.max(0, Math.min(1, f)))).toFixed(2);
  }

  /* ================= timer render ================= */
  function statusText() {
    if (mode === 'focus') return 'Session ' + (cycle + 1) + ' of ' + ROUNDS;
    if (mode === 'short') return 'Short break after session ' + cycle + ' of ' + ROUNDS;
    return 'Long break. Round complete.';
  }
  function buildPips() {
    var out = '';
    for (var i = 0; i < ROUNDS; i++) {
      var cls = 'pip';
      if (i < cycle) cls += ' done';
      else if (i === cycle && mode === 'focus') cls += ' current';
      out += '<span class="' + cls + '"></span>';
    }
    pipsEl.innerHTML = out;
  }
  function renderClock() {
    var t = fmtClock(remaining);
    timeEl.textContent = t;
    setRing(total ? remaining / total : 0);
    document.title = t + ' · ' + LABELS[mode];
    toggleBtn.textContent = running ? 'Pause' : (remaining < total ? 'Resume' : 'Start');
  }
  function renderMode() {
    document.body.setAttribute('data-mode', mode);
    document.querySelectorAll('#modes button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    statusEl.textContent = statusText();
    buildPips();
    renderClock();
    renderNow();
    renderFinish();
  }
  function renderNow() {
    var t = activeTask();
    $('now').textContent = t
      ? 'Working on: ' + t.name
      : (state.tasks.some(function (x) { return !x.checked; })
          ? 'Select a task to log sessions to it.'
          : 'No task selected. Sessions still count in your report.');
  }
  function renderToday() {
    var key = dayKey(new Date()), count = 0, mins = 0;
    state.log.forEach(function (e) { if (e.d === key) { count++; mins += e.m; } });
    var goal = state.settings.goal;
    $('today-text').textContent = goal > 0
      ? count + ' of ' + goal + ' pomodoros today'
      : count + (count === 1 ? ' pomodoro today' : ' pomodoros today');
    $('today-min').textContent = fmtDur(mins) + ' focused';
    $('today-barwrap').hidden = goal <= 0;
    $('today-bar').style.width = goal > 0 ? Math.min(100, (count / goal) * 100) + '%' : '0%';
  }

  /* ================= finish-time estimate ================= */
  function estimateMs(pomos) {
    var ms = 0, c = cycle;
    if (mode !== 'focus') ms += remaining;               // finish the current break first
    for (var i = 0; i < pomos; i++) {
      ms += (i === 0 && mode === 'focus') ? remaining : minutes('focus');
      c++;
      if (i < pomos - 1) ms += (c % ROUNDS === 0) ? minutes('long') : minutes('short');
    }
    return ms;
  }
  function renderFinish() {
    var done = 0, est = 0, left = 0;
    state.tasks.forEach(function (t) {
      done += t.done; est += t.est;
      if (!t.checked) left += Math.max(0, t.est - t.done);
    });
    $('pomos').textContent = 'Pomos ' + done + '/' + est;
    var f = $('finish');
    if (left > 0) {
      var ms = estimateMs(left);
      var at = new Date(Date.now() + ms);
      f.textContent = 'Finish at ' + at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
                      ' (' + (ms / 3600000).toFixed(1) + 'h)';
    } else {
      f.textContent = est ? 'All planned pomodoros are done' : '';
    }
  }

  /* ================= sound ================= */
  function ensureAudio() {
    if (!audioCtx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) {}
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function playAlarm(kind) {
    ensureAudio();
    if (!audioCtx || kind === 'none') return;
    var vol = state.settings.volume, now = audioCtx.currentTime;
    function tone(freq, t0, dur, type, peak) {
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }
    if (kind === 'chime') {
      [660, 880, 1100].forEach(function (f, i) { tone(f, now + i * 0.22, 0.55, 'sine', 0.3); });
    } else if (kind === 'bell') {
      [1, 2.76, 5.4].forEach(function (r, i) { tone(520 * r, now, 1.8 / (i + 1) + 0.4, 'sine', 0.3 / (i + 1)); });
    } else if (kind === 'beep') {
      [0, 0.25, 0.5].forEach(function (o) { tone(880, now + o, 0.16, 'square', 0.12); });
    }
  }

  /* ---------- background sound (focus only) ---------- */
  var bgNodes = null, bgTimer = null, bgNext = 0, bgFlip = false, bgPreviewTimer = null;

  function noiseBuffer(kind) {
    var rate = audioCtx.sampleRate, len = rate * 6;
    var buf = audioCtx.createBuffer(1, len, rate), d = buf.getChannelData(0), last = 0, i;
    for (i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else { d[i] = w; }
    }
    var fade = Math.floor(rate * 0.05);                 // soften the loop seam
    for (i = 0; i < fade; i++) { var g = i / fade; d[i] *= g; d[len - 1 - i] *= g; }
    return buf;
  }
  function click(t0, flip) {
    var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = flip ? 780 : 1050;
    var peak = Math.max(0.0002, 0.45 * state.settings.bgVolume);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + 0.06);
  }
  function stopBg() {
    if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
    if (bgNodes && bgNodes.src) {
      try { bgNodes.src.stop(); bgNodes.src.disconnect(); bgNodes.gain.disconnect(); } catch (e) {}
    }
    bgNodes = null;
  }
  function startBg(kind) {
    stopBg();
    if (kind === 'none') return;
    ensureAudio();
    if (!audioCtx) return;
    if (kind === 'white' || kind === 'brown') {
      var src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = noiseBuffer(kind);
      src.loop = true;
      gain.gain.value = state.settings.bgVolume * (kind === 'white' ? 0.12 : 0.4);
      src.connect(gain); gain.connect(audioCtx.destination);
      src.start();
      bgNodes = { src: src, gain: gain };
    } else {
      var interval = kind === 'tickfast' ? 0.5 : 1;
      bgNext = audioCtx.currentTime + 0.05;
      var pump = function () {                          // schedule ticks slightly ahead on the audio clock
        while (bgNext < audioCtx.currentTime + 1.2) { click(bgNext, bgFlip); bgFlip = !bgFlip; bgNext += interval; }
      };
      pump();
      bgTimer = setInterval(pump, 250);
      bgNodes = { tick: true };
    }
  }
  // Start or stop the background sound to match the timer: only while a focus timer is running.
  function syncBg() {
    stopBg();
    if (running && mode === 'focus' && state.settings.bg !== 'none') startBg(state.settings.bg);
  }
  function previewBg() {
    ensureAudio();
    clearTimeout(bgPreviewTimer);
    startBg($('set-bg').value);
    bgPreviewTimer = setTimeout(syncBg, 4000);
  }

  // System notification, opt-in from Settings. Goes through the service worker when
  // there is one, since mobile browsers only allow notifications from there.
  function notify(finished, next) {
    if (!state.settings.notify || !window.Notification || Notification.permission !== 'granted') return;
    var title = LABELS[finished] + ' finished';
    var opts = { body: 'Up next: ' + LABELS[next] + '.', icon: 'icon-192.png', tag: 'pomodoro', silent: true };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title, opts); });
      } else {
        new Notification(title, opts);
      }
    } catch (e) {}
  }

  /* ================= timer logic ================= */
  // Browsers throttle setInterval in background tabs (Chrome: down to once a minute),
  // which would make the alarm late. Timers inside a Web Worker aren't throttled that
  // way, so a tiny inline worker drives the tick; plain setInterval is the fallback.
  var ticker = (function () {
    var worker = null, id = null;
    try {
      var src = 'var id=null;onmessage=function(e){clearInterval(id);id=null;' +
                'if(e.data==="start")id=setInterval(function(){postMessage(0)},200)};';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = function () { tick(); };
    } catch (e) { worker = null; }
    return {
      start: function () { if (worker) worker.postMessage('start'); else id = setInterval(tick, 200); },
      stop: function () { if (worker) worker.postMessage('stop'); if (id) { clearInterval(id); id = null; } }
    };
  })();

  // The running timer survives a page reload or closing the tab.
  var TIMER_KEY = 'pomodoro-timer';
  function saveTimer() {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify({
        mode: mode, cycle: cycle, total: total, remaining: remaining, running: running, endAt: endAt
      }));
    } catch (e) {}
  }
  function restoreTimer() {
    var t;
    try { t = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'); } catch (e) { t = null; }
    if (!t || !LABELS[t.mode]) return;
    mode = t.mode;
    cycle = clampInt(t.cycle, 0, ROUNDS, 0);
    total = t.total > 0 ? t.total : minutes(mode);
    remaining = t.running ? t.endAt - Date.now() : Math.min(total, Math.max(0, Number(t.remaining) || total));
    endAt = t.running ? t.endAt : 0;
    renderMode();
    if (t.running) { if (remaining > 0) start(); else complete(); }
  }

  function stopTicking() {
    var wasRunning = running;
    running = false;
    ticker.stop();
    stopBg();
    if (wasRunning) musicPause();                       // only pause music the timer was driving
  }
  function setMode(next) {
    stopTicking();
    mode = next;
    total = remaining = minutes(next);
    renderMode();
    saveTimer();
  }
  function start() {
    if (running) return;
    ensureAudio();
    if (remaining <= 0) remaining = total;
    endAt = Date.now() + remaining;
    running = true;
    ticker.start();
    syncBg();
    musicPlay();
    renderClock(); renderFinish();
    saveTimer();
  }
  function pause() {
    if (!running) return;
    remaining = Math.max(0, endAt - Date.now());
    stopTicking();
    renderClock(); renderFinish();
    saveTimer();
  }
  function tick() {
    if (!running) return;                               // a worker tick can arrive just after pause
    remaining = endAt - Date.now();
    if (remaining <= 0) complete(); else renderClock();
  }
  function recordSession() {
    // endAt, not now: a timer that ran out while the tab was closed is logged at the time it ended
    var now = new Date(Math.min(Date.now(), endAt || Date.now())), task = activeTask();
    state.log.push({
      t: now.getTime(),
      d: dayKey(now),
      m: Math.round((total / 60000) * 100) / 100,
      task: task ? task.name : '',
      id: task ? task.id : '',
      proj: task ? projectName(task.project) : '',
      pid: task ? (task.project || '') : ''
    });
    if (task) task.done += 1;
    save();
  }
  function complete() {
    stopTicking();
    remaining = 0;
    playAlarm(state.settings.alarm);
    var finished = mode, next;
    if (finished === 'focus') {
      recordSession();
      cycle += 1;
      next = cycle >= ROUNDS ? 'long' : 'short';
    } else {
      if (finished === 'long') cycle = 0;
      next = 'focus';
    }
    announceEl.textContent = LABELS[finished] + ' finished. Up next: ' + LABELS[next] + '.';
    notify(finished, next);
    setMode(next);
    refreshData();
    if (state.settings.auto) start();
  }
  function skip() {
    var next;
    if (mode === 'focus') next = 'short';
    else { if (mode === 'long') cycle = 0; next = 'focus'; }
    setMode(next);
  }

  function refreshData() {
    renderTasks(); renderToday(); renderNow(); renderFinish();
    if (view === 'report') renderReport();
  }

  /* ================= tasks ================= */
  function firstOpenId() {
    var t = state.tasks.filter(function (x) { return !x.checked; })[0];
    return t ? t.id : null;
  }
  function addTask(title, est, note, project) {
    var t = { id: uid(), name: title, est: est, note: note || '', project: project || '', done: 0, checked: false };
    state.tasks.push(t);
    if (!state.activeId) state.activeId = t.id;
    save(); refreshData();
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    if (state.activeId === id) state.activeId = firstOpenId();
    editingId = null;
    save(); refreshData();
  }
  function setChecked(id, val) {
    var t = findTask(id); if (!t) return;
    t.checked = val;
    if (val && state.activeId === id) state.activeId = firstOpenId();
    if (!val && !state.activeId) state.activeId = id;
    save(); refreshData();
  }
  function renderTasks() {
    var html = '';
    state.tasks.forEach(function (t) {
      if (editingId === t.id) {
        html += '<li class="task editing" data-id="' + t.id + '"><form class="edit-form">' +
          '<input class="field" name="title" maxlength="120" required value="' + esc(t.name) + '" aria-label="Task name">' +
          '<div class="row"><label for="e-est">Pomodoros</label>' +
          '<input class="field" id="e-est" name="est" type="number" min="1" max="24" value="' + t.est + '">' +
          (state.projects.length ? '<select class="field" name="project" aria-label="Project" style="width:auto;flex:1">' + projectOptions(t.project) + '</select>' : '') +
          '</div>' +
          '<input class="field" name="note" maxlength="200" placeholder="Note (optional)" value="' + esc(t.note) + '" aria-label="Note">' +
          '<div class="row"><button type="button" class="link danger" data-act="delete">Delete</button>' +
          '<button type="button" class="link" data-act="template">Save as template</button>' +
          '<span class="grow"></span>' +
          '<button type="button" class="btn small" data-act="cancel">Cancel</button>' +
          '<button type="submit" class="btn small solid">Save</button></div></form></li>';
        return;
      }
      html += '<li class="task' + (t.id === state.activeId ? ' active' : '') + (t.checked ? ' checked' : '') + '" data-id="' + t.id + '">' +
        '<input type="checkbox" class="task-check" aria-label="Mark ' + esc(t.name) + ' as done"' + (t.checked ? ' checked' : '') + '>' +
        '<button type="button" class="task-main" data-act="select"><span class="task-name">' + esc(t.name) + '</span>' +
        (t.note ? '<span class="task-note">' + esc(t.note) + '</span>' : '') +
        (projectName(t.project) ? '<span class="chip">' + esc(projectName(t.project)) + '</span>' : '') + '</button>' +
        '<span class="task-count" title="Pomodoros done / estimated">' + t.done + '/' + t.est + '</span>' +
        '<button type="button" class="link" data-act="edit" aria-label="Edit ' + esc(t.name) + '">Edit</button></li>';
    });
    if (!state.tasks.length) html = '<li class="empty">No tasks yet. Add what you plan to work on today.</li>';
    $('task-list').innerHTML = html;
    $('clear-row').hidden = !state.tasks.length;
  }

  $('add-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('add-title').value.trim();
    if (!title) { $('add-title').focus(); return; }
    addTask(title, clampInt($('add-est').value, 1, 24, 1), '', $('add-project').value);
    $('add-title').value = ''; $('add-est').value = 1; $('add-title').focus();
  });

  $('task-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var li = btn.closest('[data-id]'), id = li && li.dataset.id, act = btn.dataset.act;
    if (act === 'select') {
      var t = findTask(id);
      if (t && !t.checked) { state.activeId = id; save(); renderTasks(); renderNow(); }
    } else if (act === 'edit') {
      editingId = id; renderTasks();
      var inp = document.querySelector('.edit-form input[name="title"]'); if (inp) inp.focus();
    } else if (act === 'cancel') {
      editingId = null; renderTasks();
    } else if (act === 'delete') {
      deleteTask(id);
    } else if (act === 'template') {
      var form = btn.closest('form');
      addTemplate(fv(form, 'title').trim() || 'Untitled', clampInt(fv(form, 'est'), 1, 24, 1), fv(form, 'note'), fvOpt(form, 'project', ''));
      btn.textContent = 'Saved'; setTimeout(function () { btn.textContent = 'Save as template'; }, 1500);
    }
  });
  $('task-list').addEventListener('change', function (e) {
    if (!e.target.classList.contains('task-check')) return;
    setChecked(e.target.closest('[data-id]').dataset.id, e.target.checked);
  });
  $('task-list').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, id = form.closest('[data-id]').dataset.id, t = findTask(id);
    var title = fv(form, 'title').trim();
    if (t && title) { t.name = title; t.est = clampInt(fv(form, 'est'), 1, 24, t.est); t.note = fv(form, 'note').trim(); t.project = fvOpt(form, 'project', t.project || ''); }
    editingId = null; save(); refreshData();
  });
  $('task-list').addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && editingId) { editingId = null; renderTasks(); }
  });
  $('clear-done').addEventListener('click', function (e) {
    confirmClick(e.currentTarget, function () {
      state.tasks = state.tasks.filter(function (t) { return !t.checked; });
      if (!findTask(state.activeId)) state.activeId = firstOpenId();
      save(); refreshData();
    });
  });
  $('clear-all').addEventListener('click', function (e) {
    confirmClick(e.currentTarget, function () {
      state.tasks = []; state.activeId = null; editingId = null;
      save(); refreshData();
    });
  });

  /* ================= templates ================= */
  function addTemplate(title, est, note, project) {
    state.templates.push({ id: uid(), name: title, est: est, note: note || '', project: project || '' });
    save(); renderTemplates();
    $('templates').hidden = false; $('tpl-toggle').setAttribute('aria-expanded', 'true');
  }
  function renderTemplates() {
    var html = '';
    state.templates.forEach(function (t) {
      html += '<li data-id="' + t.id + '"><span class="grow">' + esc(t.name) + ' <span class="hint">(' + t.est + ')</span>' +
        (projectName(t.project) ? '<span class="chip">' + esc(projectName(t.project)) + '</span>' : '') + '</span>' +
        '<button type="button" class="btn small" data-act="use">Add</button>' +
        '<button type="button" class="link danger" data-act="remove" aria-label="Remove template ' + esc(t.name) + '">Remove</button></li>';
    });
    if (!state.templates.length) html = '<li class="hint">No templates yet. Type a task above, then choose Save as template.</li>';
    $('tpl-list').innerHTML = html;
    $('tpl-toggle').textContent = state.templates.length ? 'Templates (' + state.templates.length + ')' : 'Templates';
  }
  $('tpl-toggle').addEventListener('click', function () {
    var open = $('templates').hidden;
    $('templates').hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });
  $('add-template').addEventListener('click', function () {
    var title = $('add-title').value.trim();
    if (!title) { $('add-title').focus(); return; }
    addTemplate(title, clampInt($('add-est').value, 1, 24, 1), '', $('add-project').value);
    $('add-title').value = ''; $('add-est').value = 1;
  });
  $('tpl-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var id = btn.closest('[data-id]').dataset.id;
    var tpl = state.templates.filter(function (t) { return t.id === id; })[0]; if (!tpl) return;
    if (btn.dataset.act === 'use') addTask(tpl.name, tpl.est, tpl.note, findProject(tpl.project) ? tpl.project : '');
    else { state.templates = state.templates.filter(function (t) { return t.id !== id; }); save(); renderTemplates(); }
  });

  /* ---------- music player (Spotify / YouTube embeds, played inside the app) ---------- */
  var MODES = ['study', 'work', 'gym'];
  var MUSIC_QUERY = {
    study: 'lofi study beats playlist',
    work: 'deep work focus playlist',
    gym: 'gym workout motivation playlist'
  };
  var MODE_LABEL = { study: 'Study', work: 'Work', gym: 'Gym' };
  var SERVICE_LABEL = { spotify: 'Spotify', youtube: 'YouTube' };
  var pMode = MODES.indexOf(state.settings.music.lastMode) !== -1 ? state.settings.music.lastMode : 'study';
  var pService = state.settings.music.lastService === 'youtube' ? 'youtube' : 'spotify';

  // We never put the user's pasted text straight into an iframe src: only an id we
  // extracted ourselves, matched against a strict safe character set, ever reaches it.
  var SAFE_ID = /^[A-Za-z0-9_-]+$/;

  function safeExternalUrl(u) {
    u = (u || '').trim();
    if (!/^https:\/\//i.test(u)) return '';
    try { new URL(u); return u; } catch (e) { return ''; }
  }
  function musicSearchUrl(mode, service) {
    var q = encodeURIComponent(MUSIC_QUERY[mode]);
    return service === 'youtube'
      ? 'https://www.youtube.com/results?search_query=' + q
      : 'https://open.spotify.com/search/' + q;
  }

  // Returns { embedUrl } on success, null if the link isn't recognized.
  function parseSpotifyLink(raw) {
    var s = (raw || '').trim();
    var m = s.match(/spotify:(playlist|album|track|episode|show):([A-Za-z0-9]+)/i);
    if (!m) m = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|track|episode|show)\/([A-Za-z0-9]+)/i);
    if (!m) return null;
    var type = m[1].toLowerCase(), id = m[2];
    if (!SAFE_ID.test(id)) return null;
    return { embedUrl: 'https://open.spotify.com/embed/' + type + '/' + id + '?utm_source=generator', uri: 'spotify:' + type + ':' + id };
  }
  function parseYoutubeLink(raw) {
    var s = (raw || '').trim(), id = null, isPlaylist = false;
    try {
      var u = new URL(s);
      var list = u.searchParams.get('list');
      if (list) { id = list; isPlaylist = true; }
      else if (u.hostname.replace(/^www\./, '') === 'youtu.be') id = u.pathname.slice(1);
      else if (u.searchParams.get('v')) id = u.searchParams.get('v');
      else { var em = u.pathname.match(/\/embed\/([^/]+)/); if (em) id = em[1]; }
    } catch (e) {
      if (/^(PL|UU|FL|RD|OL)[A-Za-z0-9_-]{5,}$/.test(s)) { id = s; isPlaylist = true; }
      else if (/^[A-Za-z0-9_-]{10,12}$/.test(s)) id = s;
    }
    if (!id || !SAFE_ID.test(id)) return null;
    // enablejsapi=1 lets the page send play/pause commands to the player
    return { embedUrl: 'https://www.youtube-nocookie.com/embed/' + (isPlaylist ? 'videoseries?list=' + id + '&' : id + '?') + 'enablejsapi=1' };
  }
  function parseLink(service, raw) {
    return service === 'youtube' ? parseYoutubeLink(raw) : parseSpotifyLink(raw);
  }

  // Built-in music, played for any mode/service where you haven't saved a link of your own.
  var DEFAULT_PLAYLISTS = {
    study: {
      spotify: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn',              // lofi beats
      youtube: 'https://www.youtube.com/playlist?list=PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4' // Lofi Girl: Compilations & Mixes
      // (playlists, not live streams: a 24/7 stream gets a new video ID whenever it restarts)
    },
    work: {
      spotify: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ',              // Deep Focus
      youtube: 'https://www.youtube.com/playlist?list=PLOD2p6oenFAhGKZEZFVuBEIrQB_aRfzxK' // Focus Music for Work and Studying
    },
    gym: {
      spotify: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP',              // Beast Mode
      youtube: 'https://www.youtube.com/playlist?list=PLTFCM8gfGxuGwVtLFlpSAaewAJ1BKTm6c' // Gym Music Mix
    }
  };

  function savedLink() { return state.settings.music.playlists[pMode][pService]; }
  function currentLink() { return savedLink() || DEFAULT_PLAYLISTS[pMode][pService]; }

  /* ---- the embedded player, played and paused along with the timer ---- */
  // YouTube takes postMessage commands (its embed URL has enablejsapi=1). Spotify goes through
  // its official Embed iFrame API, which wraps the iframe in a small controller object.
  var embed = { service: null, iframe: null, sp: null, spStarted: false };
  var spApi = { api: null, loading: false, failed: false };

  function loadSpotifyEmbedApi() {
    if (spApi.api || spApi.loading || spApi.failed) return;
    spApi.loading = true;
    function giveUp() {                                  // fall back to a plain, uncontrolled embed
      if (spApi.api || spApi.failed) return;
      spApi.loading = false; spApi.failed = true; renderPlayerEmbed();
    }
    window.onSpotifyIframeApiReady = function (IFrameAPI) {
      spApi.api = IFrameAPI; spApi.loading = false; renderPlayerEmbed();
    };
    var s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = giveUp;
    document.head.appendChild(s);
    setTimeout(giveUp, 8000);
  }
  function clearEmbed(wrap) {
    if (embed.sp) { try { embed.sp.destroy(); } catch (e) {} }
    wrap.querySelectorAll('iframe, .sp-host').forEach(function (n) { n.remove(); });
    embed = { service: null, iframe: null, sp: null, spStarted: false };
    delete wrap.dataset.src;
  }
  function renderPlayerEmbed() {
    var wrap = $('player-embed-wrap'), raw = currentLink();
    var parsed = raw ? parseLink(pService, raw) : null;
    wrap.classList.remove('spotify', 'youtube');
    wrap.classList.add(pService);
    $('player-error').textContent = raw && !parsed
      ? "That doesn't look like a " + SERVICE_LABEL[pService] + ' link. Try copying the "Share" link from the app.'
      : '';
    if (!parsed) {
      clearEmbed(wrap);
      wrap.classList.remove('has-embed');
      $('player-empty').textContent = 'Paste a ' + SERVICE_LABEL[pService] + ' playlist or track link below to play it here.';
      return;
    }
    if (wrap.dataset.src === parsed.embedUrl) return;   // already showing this one
    clearEmbed(wrap);
    if (pService === 'spotify' && !spApi.api && !spApi.failed) {
      wrap.classList.remove('has-embed');
      $('player-empty').textContent = 'Loading player…';
      loadSpotifyEmbedApi();                             // calls back into renderPlayerEmbed when ready
      return;
    }
    wrap.dataset.src = parsed.embedUrl;
    wrap.classList.add('has-embed');
    embed.service = pService;

    if (pService === 'spotify' && spApi.api) {
      var host = document.createElement('div');
      host.className = 'sp-host';
      wrap.appendChild(host);                            // replaced by Spotify's iframe
      spApi.api.createController(host, { uri: parsed.uri, width: '100%', height: 80 }, function (ctrl) {
        if (wrap.dataset.src !== parsed.embedUrl) { ctrl.destroy(); return; }   // switched away meanwhile
        embed.sp = ctrl;
        ctrl.addListener('playback_update', function (e) {
          // once anything has played, resume() instead of play() so we don't restart the playlist
          if (e.data && (!e.data.isPaused || e.data.position > 0)) embed.spStarted = true;
        });
        if (running) musicPlay();                        // switched playlist mid-session
      });
      return;
    }
    var f = document.createElement('iframe');
    f.src = parsed.embedUrl;
    f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope; web-share';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = MODE_LABEL[pMode] + ' ' + SERVICE_LABEL[pService] + ' player';
    embed.iframe = f;
    wrap.appendChild(f);
  }

  function ytCommand(func) {
    if (!embed.iframe || !embed.iframe.contentWindow) return;
    embed.iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: [] }), 'https://www.youtube-nocookie.com');
  }
  // Called when the timer starts and stops. Does nothing when the setting is off.
  function musicPlay() {
    if (!state.settings.musicSync) return;
    try {
      if (embed.service === 'youtube') ytCommand('playVideo');
      else if (embed.sp) { if (embed.spStarted) embed.sp.resume(); else embed.sp.play(); embed.spStarted = true; }
    } catch (e) {}
  }
  function musicPause() {
    if (!state.settings.musicSync) return;
    try {
      if (embed.service === 'youtube') ytCommand('pauseVideo');
      else if (embed.sp) embed.sp.pause();
    } catch (e) {}
  }
  function renderPlayer() {
    document.querySelectorAll('#player-modes button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.pmode === pMode));
    });
    document.querySelectorAll('#player-services button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.pservice === pService));
    });
    $('player-mode-label').textContent = '· ' + MODE_LABEL[pMode];
    $('player-link').value = savedLink();
    $('player-clear').hidden = !savedLink();
    $('player-find').href = musicSearchUrl(pMode, pService);
    $('player-note').textContent = (savedLink() ? '' : 'Playing the built-in ' + MODE_LABEL[pMode] + ' playlist. Paste a link above to use your own. ') +
      (pService === 'spotify'
      ? 'Spotify Premium is needed to play full tracks in the player; without it you get 30-second previews.'
      : 'You can also paste any YouTube playlist or video link.');
    renderPlayerEmbed();
    renderSpotifyConnect();
    renderYoutubeConnect();
  }

  // Fills a playlist <select> from a promise of [{id, title, count}], preselecting the saved one.
  function fillPlaylistSelect(sel, listPromise, service) {
    sel.innerHTML = '<option value="">Loading your playlists&hellip;</option>';
    listPromise.then(function (list) {
      if (!list.length) { sel.innerHTML = '<option value="">No playlists found on this account</option>'; return; }
      sel.innerHTML = '<option value="">Choose one of your playlists&hellip;</option>' + list.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.title) + ' (' + p.count + ')</option>';
      }).join('');
      var saved = state.settings.music.playlists[pMode][service];
      list.forEach(function (p) { if (saved && saved.indexOf(p.id) !== -1) sel.value = p.id; });
    }).catch(function (e) {
      sel.innerHTML = '<option value="">Could not load playlists</option>';
      $('player-error').textContent = 'Could not load your playlists: ' + e.message;
    });
  }
  function notSetUp(service, idName) {
    $('player-error').textContent = service + " login isn't set up yet. Add your " + idName +
      ' to config.js (the README has the steps).';
  }

  /* ---------- YouTube sign-in (optional: needs a Web OAuth client ID in config.js) ---------- */
  // Uses Google Identity Services' token flow, which runs entirely in the browser and needs
  // no client secret. The access token lasts an hour and is kept in sessionStorage only.
  var YT_CLIENT_ID = (window.POMODORO_CONFIG && window.POMODORO_CONFIG.googleClientId) || '';
  var YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
  var YT_TOKEN_KEY = 'pomodoro-yt-token';
  var yt = { token: null, expiresAt: 0, client: null, pending: null, gis: null };
  try {
    var ytSaved = JSON.parse(sessionStorage.getItem(YT_TOKEN_KEY) || 'null');
    if (ytSaved && ytSaved.expiresAt > Date.now()) { yt.token = ytSaved.token; yt.expiresAt = ytSaved.expiresAt; }
  } catch (e) {}

  function ytConnected() { return !!yt.token && Date.now() < yt.expiresAt - 60000; }
  function ytForget() {
    yt.token = null; yt.expiresAt = 0;
    try { sessionStorage.removeItem(YT_TOKEN_KEY); } catch (e) {}
  }
  function ytSettle(err) {
    var p = yt.pending; yt.pending = null;
    if (p) { if (err) p.reject(err); else p.resolve(); }
  }
  // Loads Google's script and builds the token client ahead of time, so the Connect click
  // can open the sign-in popup synchronously (browsers block popups opened after an await).
  function ytPrepare() {
    if (!yt.gis) {
      yt.gis = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = resolve;
        s.onerror = function () { yt.gis = null; reject(new Error('Could not load Google sign-in.')); };
        document.head.appendChild(s);
      }).then(function () {
        yt.client = google.accounts.oauth2.initTokenClient({
          client_id: YT_CLIENT_ID,
          scope: YT_SCOPE,
          callback: function (r) {
            if (r.error) return ytSettle(new Error(r.error_description || r.error));
            yt.token = r.access_token;
            yt.expiresAt = Date.now() + (Number(r.expires_in) || 3600) * 1000;
            try { sessionStorage.setItem(YT_TOKEN_KEY, JSON.stringify({ token: yt.token, expiresAt: yt.expiresAt })); } catch (e) {}
            ytSettle(null);
          },
          error_callback: function (err) {
            ytSettle(new Error(err && err.type === 'popup_closed' ? 'The sign-in window was closed.' : 'Sign-in did not complete.'));
          }
        });
      });
    }
    return yt.gis;
  }
  function ytConnect() {
    if (!yt.client) return Promise.reject(new Error('Google sign-in is still loading. Try again in a moment.'));
    return new Promise(function (resolve, reject) {
      yt.pending = { resolve: resolve, reject: reject };
      yt.client.requestAccessToken();
    });
  }
  function ytDisconnect() {
    var tok = yt.token;
    ytForget();
    if (tok && window.google && google.accounts) google.accounts.oauth2.revoke(tok, function () {});
  }
  function ytPlaylists() {
    var url = 'https://www.googleapis.com/youtube/v3/playlists?' +
      new URLSearchParams({ part: 'snippet,contentDetails', mine: 'true', maxResults: '50' }).toString();
    return fetch(url, { headers: { Authorization: 'Bearer ' + yt.token } }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (res.status === 401) { ytForget(); renderYoutubeConnect(); throw new Error('Your Google sign-in expired. Log in again.'); }
        var reason = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
        // YouTube keeps playlists on a channel, not on the Google account itself
        if (reason === 'channelNotFound') {
          throw new Error('this Google account has no YouTube channel. Log out, log in again and pick the account ' +
            '(or Brand Account channel) that owns your playlists. You can still paste a playlist link below.');
        }
        if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
        return (j.items || []).map(function (it) {
          return {
            id: it.id,
            title: (it.snippet && it.snippet.title) || 'Untitled playlist',
            count: (it.contentDetails && it.contentDetails.itemCount) || 0
          };
        });
      });
    });
  }

  function renderYoutubeConnect() {
    var show = pService === 'youtube';
    $('yt-connect').hidden = true;
    $('yt-connected').hidden = true;
    if (!show) return;
    if (YT_CLIENT_ID && ytConnected()) {
      $('yt-connected').hidden = false;
      fillPlaylistSelect($('yt-playlist-select'), ytPlaylists(), 'youtube');
    } else {
      $('yt-connect').hidden = false;
      if (YT_CLIENT_ID) ytPrepare().catch(function (e) { $('player-error').textContent = e.message; });
    }
  }
  $('yt-connect-btn').addEventListener('click', function () {
    if (!YT_CLIENT_ID) return notSetUp('YouTube', 'Google Client ID');
    var btn = this;
    btn.disabled = true; btn.textContent = 'Opening Google sign-in\u2026';
    $('player-error').textContent = '';
    ytConnect().then(function () {
      renderYoutubeConnect();
    }).catch(function (e) {
      $('player-error').textContent = 'Could not log in: ' + e.message;
    }).finally(function () {
      btn.disabled = false; btn.textContent = 'Log in with YouTube';
    });
  });
  $('yt-disconnect-btn').addEventListener('click', function () {
    ytDisconnect(); renderYoutubeConnect();
  });
  $('yt-playlist-select').addEventListener('change', function () {
    if (!SAFE_ID.test(this.value)) return;
    state.settings.music.playlists[pMode].youtube = 'https://www.youtube.com/playlist?list=' + this.value;
    save(); renderPlayer();
  });

  /* ---------- Spotify sign-in (needs a Spotify app Client ID in config.js) ---------- */
  // Authorization Code flow with PKCE, which runs in the browser with no client secret.
  // Sign-in happens in a popup that lands on callback.html; that page hands the result back
  // through localStorage (Spotify's pages can cut the popup's link to this window), so the
  // timer on this page keeps running untouched. Tokens are kept in this browser only.
  var SP_CLIENT_ID = (window.POMODORO_CONFIG && window.POMODORO_CONFIG.spotifyClientId) || '';
  var SP_SCOPE = 'playlist-read-private playlist-read-collaborative';
  var SP_AUTH_KEY = 'pomodoro-spotify-auth', SP_CALLBACK_KEY = 'pomodoro-spotify-callback';
  var SP_REDIRECT = new URL('callback.html', location.origin + location.pathname).href;
  var spPending = null;

  function spLoad() { try { return JSON.parse(localStorage.getItem(SP_AUTH_KEY) || 'null'); } catch (e) { return null; } }
  function spForget() { try { localStorage.removeItem(SP_AUTH_KEY); } catch (e) {} }
  function spConnected() { var a = spLoad(); return !!(a && a.refreshToken); }
  function b64url(bytes) {
    var s = '';
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString() { var a = new Uint8Array(32); crypto.getRandomValues(a); return b64url(a); }

  function spTokenRequest(params) {
    params.client_id = SP_CLIENT_ID;
    return fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw Object.assign(new Error(j.error_description || j.error || ('HTTP ' + res.status)), { code: j.error });
        return j;
      });
    });
  }
  function spStoreTokens(j, prevRefresh) {
    var a = {
      accessToken: j.access_token,
      refreshToken: j.refresh_token || prevRefresh,           // Spotify may rotate the refresh token
      expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000
    };
    try { localStorage.setItem(SP_AUTH_KEY, JSON.stringify(a)); } catch (e) {}
    return a;
  }
  function spAccessToken() {
    var a = spLoad();
    if (!a || !a.refreshToken) return Promise.reject(new Error('Not logged in to Spotify.'));
    if (Date.now() < a.expiresAt - 60000) return Promise.resolve(a.accessToken);
    return spTokenRequest({ grant_type: 'refresh_token', refresh_token: a.refreshToken })
      .then(function (j) { return spStoreTokens(j, a.refreshToken).accessToken; })
      .catch(function (e) {
        if (e.code === 'invalid_grant') { spForget(); renderSpotifyConnect(); throw new Error('Your Spotify login expired. Log in again.'); }
        throw e;
      });
  }

  function spConnect() {
    // Open the popup right away: the PKCE hash below is async, and a popup opened after an
    // await gets blocked. It starts blank and is pointed at Spotify once the hash is ready.
    var popup = window.open('', 'pomodoro-spotify-login', 'width=480,height=720');
    if (!popup) return Promise.reject(new Error('Your browser blocked the login window. Allow pop-ups for this site and try again.'));
    var verifier = randomString(), stateParam = randomString();
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (hash) {
      popup.location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: SP_CLIENT_ID,
        response_type: 'code',
        redirect_uri: SP_REDIRECT,
        scope: SP_SCOPE,
        state: stateParam,
        code_challenge_method: 'S256',
        code_challenge: b64url(new Uint8Array(hash))
      }).toString();
      return new Promise(function (resolve, reject) {
        if (spPending) spPending.reject(new Error('Started a new login.'));
        spPending = { verifier: verifier, state: stateParam, resolve: resolve, reject: reject };
        setTimeout(function () {
          if (spPending && spPending.state === stateParam) { spPending = null; reject(new Error('Login timed out. Try again.')); }
        }, 5 * 60000);
      });
    });
  }
  // callback.html writes the result to localStorage; the storage event delivers it here.
  function spHandleCallback() {
    var raw, r, p = spPending;
    try { raw = localStorage.getItem(SP_CALLBACK_KEY); localStorage.removeItem(SP_CALLBACK_KEY); } catch (e) { return; }
    try { r = JSON.parse(raw); } catch (e) { return; }
    if (!r || !p || r.state !== p.state) return;             // not the login this tab started
    spPending = null;
    if (r.error || !r.code) {
      return p.reject(new Error(r.error === 'access_denied' ? 'Login was cancelled.' : (r.error || 'Spotify did not return a login code.')));
    }
    spTokenRequest({ grant_type: 'authorization_code', code: r.code, redirect_uri: SP_REDIRECT, code_verifier: p.verifier })
      .then(function (j) { spStoreTokens(j); p.resolve(); }, p.reject);
  }
  window.addEventListener('storage', function (e) {
    if (e.key === SP_CALLBACK_KEY && e.newValue) spHandleCallback();
  });

  function spPlaylists() {
    return spAccessToken().then(function (tok) {
      return fetch('https://api.spotify.com/v1/me/playlists?limit=50', { headers: { Authorization: 'Bearer ' + tok } });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (res.status === 401) { spForget(); renderSpotifyConnect(); throw new Error('Your Spotify login expired. Log in again.'); }
        if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
        return (j.items || []).filter(Boolean).map(function (p) {
          var n = (p.items && p.items.total) || (p.tracks && p.tracks.total) || 0;   // field was renamed in newer API versions
          return { id: p.id, title: p.name || 'Untitled playlist', count: n };
        });
      });
    });
  }

  function renderSpotifyConnect() {
    var show = pService === 'spotify';
    $('sp-connect').hidden = true;
    $('sp-connected').hidden = true;
    if (!show) return;
    if (SP_CLIENT_ID && spConnected()) {
      $('sp-connected').hidden = false;
      fillPlaylistSelect($('sp-playlist-select'), spPlaylists(), 'spotify');
    } else {
      $('sp-connect').hidden = false;
    }
  }
  $('sp-connect-btn').addEventListener('click', function () {
    if (!SP_CLIENT_ID) return notSetUp('Spotify', 'Spotify Client ID');
    var btn = this;
    btn.textContent = 'Waiting for Spotify\u2026';
    $('player-error').textContent = '';
    spConnect().then(function () {
      renderSpotifyConnect();
    }).catch(function (e) {
      $('player-error').textContent = 'Could not log in: ' + e.message;
    }).finally(function () {
      btn.textContent = 'Log in with Spotify';
    });
  });
  $('sp-disconnect-btn').addEventListener('click', function () {
    spForget(); renderSpotifyConnect();
  });
  $('sp-playlist-select').addEventListener('change', function () {
    if (!SAFE_ID.test(this.value)) return;
    state.settings.music.playlists[pMode].spotify = 'https://open.spotify.com/playlist/' + this.value;
    save(); renderPlayer();
  });
  document.querySelectorAll('#player-modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      pMode = b.dataset.pmode; state.settings.music.lastMode = pMode; save(); renderPlayer();
    });
  });
  document.querySelectorAll('#player-services button').forEach(function (b) {
    b.addEventListener('click', function () {
      pService = b.dataset.pservice; state.settings.music.lastService = pService; save(); renderPlayer();
    });
  });
  $('player-link-form').addEventListener('submit', function (e) {
    e.preventDefault();
    state.settings.music.playlists[pMode][pService] = $('player-link').value.trim();
    save(); renderPlayer();
  });
  $('player-clear').addEventListener('click', function () {
    state.settings.music.playlists[pMode][pService] = '';
    save(); renderPlayer();
  });

  /* ================= projects ================= */
  function renderProjects() {
    var html = '';
    state.projects.forEach(function (p) {
      html += '<li data-id="' + p.id + '"><span class="grow">' + esc(p.name) + '</span>' +
        '<button type="button" class="link danger" data-act="remove" aria-label="Remove project ' + esc(p.name) + '">Remove</button></li>';
    });
    if (!state.projects.length) html = '<li class="hint">No projects yet. Add one, then pick it when you add a task.</li>';
    $('proj-list').innerHTML = html;
    $('pr-toggle').textContent = state.projects.length ? 'Projects (' + state.projects.length + ')' : 'Projects';
    var sel = $('add-project'), prev = sel.value;
    sel.innerHTML = projectOptions(findProject(prev) ? prev : '');
    sel.hidden = !state.projects.length;
  }
  function deleteProject(id) {
    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    state.tasks.forEach(function (t) { if (t.project === id) t.project = ''; });
    state.templates.forEach(function (t) { if (t.project === id) t.project = ''; });
    save(); renderProjects(); renderTemplates(); renderTasks();
  }
  $('pr-toggle').addEventListener('click', function () {
    var open = $('projects').hidden;
    $('projects').hidden = !open;
    this.setAttribute('aria-expanded', String(open));
    if (open) $('proj-name').focus();
  });
  $('proj-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('proj-name').value.trim();
    if (!name) { $('proj-name').focus(); return; }
    var exists = state.projects.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (!exists) { state.projects.push({ id: uid(), name: name }); save(); }
    $('proj-name').value = '';
    renderProjects(); renderTasks();
  });
  $('proj-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act="remove"]'); if (!btn) return;
    deleteProject(btn.closest('[data-id]').dataset.id);
  });

  /* ================= report ================= */
  function barList(map) {
    var names = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 8);
    var max = names.length ? map[names[0]] : 1, out = '';
    names.forEach(function (nm) {
      out += '<li><div class="row"><span>' + esc(nm) + '</span><span>' + fmtDur(map[nm]) + '</span></div>' +
             '<div class="bar"><span style="width:' + Math.max(2, (map[nm] / max) * 100).toFixed(1) + '%"></span></div></li>';
    });
    return out;
  }
  function getRange() {
    var now = new Date(), r = { keys: [], labels: [], tips: [], index: {} }, i, d;
    if (rangeType === 'week') {
      var dow = (now.getDay() + 6) % 7;
      var s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + rangeOffset * 7);
      for (i = 0; i < 7; i++) {
        d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
        r.keys.push(dayKey(d));
        r.labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
        r.tips.push(d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }));
      }
      r.start = s.getTime();
      r.end = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7).getTime();
      var last = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      r.title = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' to ' +
                last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (rangeType === 'month') {
      var ms = new Date(now.getFullYear(), now.getMonth() + rangeOffset, 1);
      var me = new Date(ms.getFullYear(), ms.getMonth() + 1, 1);
      var n = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
      for (i = 0; i < n; i++) {
        d = new Date(ms.getFullYear(), ms.getMonth(), 1 + i);
        r.keys.push(dayKey(d)); r.labels.push(String(d.getDate()));
        r.tips.push(d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }));
      }
      r.start = ms.getTime(); r.end = me.getTime();
      r.title = ms.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else {
      var y = now.getFullYear() + rangeOffset;
      for (i = 0; i < 12; i++) {
        d = new Date(y, i, 1);
        r.keys.push(y + '-' + pad(i + 1));
        r.labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
        r.tips.push(d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
      }
      r.start = new Date(y, 0, 1).getTime(); r.end = new Date(y + 1, 0, 1).getTime();
      r.title = String(y);
    }
    r.keys.forEach(function (k, idx) { r.index[k] = idx; });
    return r;
  }
  function niceStep(max, target) {
    var raw = max / target, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  }
  function drawChart(vals, r) {
    var W = 640, H = 260, pL = 46, pR = 8, pT = 12, pB = 28;
    var maxMin = Math.max.apply(null, vals.concat([0]));
    var useH = maxMin >= 90, div = useH ? 60 : 1, unit = useH ? 'h' : 'm';
    var data = vals.map(function (v) { return v / div; });
    var dmax = Math.max.apply(null, data.concat([0]));
    var step = niceStep(dmax || 1, 4);
    var top = Math.max(step, Math.ceil(dmax / step - 1e-9) * step);
    var plotW = W - pL - pR, plotH = H - pT - pB, n = vals.length, slot = plotW / n;
    var bw = Math.max(3, Math.min(44, slot * 0.62));
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart of focus time for ' + esc(r.title) + '">';
    var steps = Math.round(top / step), k;
    for (k = 0; k <= steps; k++) {
      var v = k * step, y = pT + plotH - (v / top) * plotH;
      svg += '<line class="grid" x1="' + pL + '" x2="' + (W - pR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"></line>' +
             '<text x="' + (pL - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + parseFloat(v.toFixed(2)) + unit + '</text>';
    }
    data.forEach(function (dv, i) {
      var h = (dv / top) * plotH, x = pL + i * slot + (slot - bw) / 2;
      if (h > 0.5) {
        svg += '<rect class="col" x="' + x.toFixed(1) + '" y="' + (pT + plotH - h).toFixed(1) + '" width="' + bw.toFixed(1) +
               '" height="' + h.toFixed(1) + '" rx="3"><title>' + esc(r.tips[i]) + ': ' + fmtDur(vals[i]) + '</title></rect>';
      }
      var show = rangeType !== 'month' || i === 0 || (i + 1) % 5 === 0;
      if (show) svg += '<text x="' + (pL + i * slot + slot / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(r.labels[i]) + '</text>';
    });
    return svg + '</svg>';
  }
  function streak() {
    var set = {};
    state.log.forEach(function (e) { set[e.d] = 1; });
    var n = new Date(), d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (!set[dayKey(d)]) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    var c = 0;
    while (set[dayKey(d)]) { c++; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); }
    return c;
  }
  function renderReport() {
    var r = getRange();
    $('range-label').textContent = r.title;
    $('range-next').disabled = rangeOffset >= 0;
    $('range-today').hidden = rangeOffset === 0;
    document.querySelectorAll('#range-types button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.range === rangeType));
    });

    var entries = state.log.filter(function (e) { return e.t >= r.start && e.t < r.end; });
    var vals = r.keys.map(function () { return 0; }), days = {}, totalMin = 0, byTask = {}, byProj = {};
    entries.forEach(function (e) {
      var i = r.index[rangeType === 'year' ? e.d.slice(0, 7) : e.d];
      if (i != null) vals[i] += e.m;
      days[e.d] = 1; totalMin += e.m;
      var name = e.task || 'No task';
      byTask[name] = (byTask[name] || 0) + e.m;
      var pn = e.proj || 'No project';
      byProj[pn] = (byProj[pn] || 0) + e.m;
    });

    $('st-focused').textContent = fmtDur(totalMin);
    $('st-pomos').textContent = entries.length;
    $('st-days').textContent = Object.keys(days).length;
    $('st-streak').textContent = streak();
    $('chart').innerHTML = drawChart(vals, r);

    // by task and by project
    $('by-task').innerHTML = barList(byTask) || '<li class="hint">Nothing focused in this period yet.</li>';
    var hasProj = state.projects.length > 0 || Object.keys(byProj).some(function (k) { return k !== 'No project'; });
    $('proj-section').hidden = !hasProj;
    $('by-project').innerHTML = barList(byProj) || '<li class="hint">Nothing focused in this period yet.</li>';

    // sessions
    var sorted = entries.slice().sort(function (a, b) { return b.t - a.t; }), shown = sorted.slice(0, 100);
    var groups = [], cur = null;
    shown.forEach(function (e) {
      if (!cur || cur.d !== e.d) { cur = { d: e.d, t: e.t, min: 0, rows: [] }; groups.push(cur); }
      cur.min += e.m; cur.rows.push(e);
    });
    var sh = '';
    groups.forEach(function (g) {
      sh += '<div class="day-group"><h4>' +
        new Date(g.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
        '<span>' + fmtDur(g.min) + '</span></h4><ul>';
      g.rows.forEach(function (e) {
        sh += '<li><span class="t">' + new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
              '</span><span class="n">' + esc(e.task || 'No task') + (e.proj ? '<span class="chip">' + esc(e.proj) + '</span>' : '') + '</span><span class="m">' + fmtDur(e.m) + '</span></li>';
      });
      sh += '</ul></div>';
    });
    if (sorted.length > shown.length) sh += '<p class="hint">Showing the latest 100 sessions. Export CSV for the full list.</p>';
    $('sessions').innerHTML = sh || '<p class="hint">No focus sessions in this period. Finish a focus timer and it will appear here.</p>';
  }

  document.querySelectorAll('#range-types button').forEach(function (b) {
    b.addEventListener('click', function () { rangeType = b.dataset.range; rangeOffset = 0; renderReport(); });
  });
  $('range-prev').addEventListener('click', function () { rangeOffset -= 1; renderReport(); });
  $('range-next').addEventListener('click', function () { if (rangeOffset < 0) { rangeOffset += 1; renderReport(); } });
  $('range-today').addEventListener('click', function () { rangeOffset = 0; renderReport(); });

  /* ---- CSV export ---- */
  function buildCsv() {
    var rows = ['date,time,task,project,minutes'];
    state.log.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (e) {
      var dt = new Date(e.t);
      rows.push([e.d, pad(dt.getHours()) + ':' + pad(dt.getMinutes()), '"' + String(e.task || '').replace(/"/g, '""') + '"', '"' + String(e.proj || '').replace(/"/g, '""') + '"', e.m].join(','));
    });
    return rows.join('\n');
  }
  $('export-open').addEventListener('click', function () {
    $('csv').value = buildCsv();
    if ($('export').showModal) $('export').showModal();
  });
  $('export-close').addEventListener('click', function () { $('export').close(); });
  $('csv-copy').addEventListener('click', function () {
    var btn = this, ta = $('csv');
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
    ta.select();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    } catch (e) {}
  });
  $('csv-download').addEventListener('click', function () {
    try {
      var blob = new Blob([$('csv').value], { type: 'text/csv' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'pomodoro-history.csv';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {}
  });
  $('clear-history').addEventListener('click', function (e) {
    confirmClick(e.currentTarget, function () { state.log = []; save(); refreshData(); });
  });

  /* ================= views & settings ================= */
  function setView(v) {
    view = v;
    $('view-timer').hidden = v !== 'timer';
    $('view-report').hidden = v !== 'report';
    document.querySelectorAll('.nav [data-view]').forEach(function (b) {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (v === 'report') renderReport();
  }
  document.querySelectorAll('.nav [data-view]').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });

  function bindNumber(id, key, min, max) {
    var el = $(id);
    el.value = state.settings[key];
    el.addEventListener('change', function () {
      var v = clampInt(el.value, min, max, DEFAULTS[key]);
      el.value = v;
      var untouched = !running && remaining === total;
      state.settings[key] = v; save();
      if (key === mode && untouched) { total = remaining = minutes(mode); renderClock(); saveTimer(); }
      renderToday(); renderFinish();
    });
  }
  bindNumber('set-focus', 'focus', 1, 120);
  bindNumber('set-short', 'short', 1, 60);
  bindNumber('set-long', 'long', 1, 90);
  bindNumber('set-goal', 'goal', 0, 24);

  $('set-musicsync').checked = state.settings.musicSync;
  $('set-musicsync').addEventListener('change', function (e) { state.settings.musicSync = e.target.checked; save(); });
  $('set-auto').checked = state.settings.auto;
  $('set-auto').addEventListener('change', function (e) { state.settings.auto = e.target.checked; save(); });
  $('set-alarm').value = state.settings.alarm;
  $('set-alarm').addEventListener('change', function (e) { state.settings.alarm = e.target.value; save(); });
  $('set-volume').value = Math.round(state.settings.volume * 100);
  $('set-volume').addEventListener('change', function (e) { state.settings.volume = Number(e.target.value) / 100; save(); });
  $('alarm-preview').addEventListener('click', function () { playAlarm($('set-alarm').value); });
  $('set-bg').value = state.settings.bg;
  $('set-bg').addEventListener('change', function (e) { state.settings.bg = e.target.value; save(); syncBg(); });
  $('set-bgvol').value = Math.round(state.settings.bgVolume * 100);
  $('set-bgvol').addEventListener('change', function (e) { state.settings.bgVolume = Number(e.target.value) / 100; save(); syncBg(); });
  $('bg-preview').addEventListener('click', previewBg);

  /* ---- notifications (the browser asks for permission the first time) ---- */
  function renderNotify() {
    var el = $('set-notify'), hint = $('notify-hint');
    if (!('Notification' in window)) {
      el.checked = false; el.disabled = true;
      hint.hidden = false; hint.textContent = "This browser doesn't support notifications.";
      return;
    }
    el.checked = state.settings.notify && Notification.permission === 'granted';
    hint.hidden = Notification.permission !== 'denied';
    hint.textContent = "Notifications are blocked for this site. Allow them in your browser's site settings, then turn this on.";
  }
  $('set-notify').addEventListener('change', function (e) {
    if (!e.target.checked) { state.settings.notify = false; save(); return; }
    Promise.resolve(Notification.requestPermission()).then(function (p) {
      state.settings.notify = p === 'granted'; save(); renderNotify();
    });
  });

  /* ---- backup, restore and CSV import ---- */
  function downloadFile(name, type, text) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: type }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    } catch (e) {}
  }
  function dataMsg(text) { $('data-msg').textContent = text; }
  function readFile(input, fn) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    file.text().then(fn).catch(function () { dataMsg("Couldn't read that file."); });
  }

  $('backup-download').addEventListener('click', function () {
    var payload = { app: 'pomodoro', version: 2, exported: new Date().toISOString(), data: state };
    downloadFile('pomodoro-backup-' + dayKey(new Date()) + '.json', 'application/json', JSON.stringify(payload, null, 2));
    dataMsg('Backup downloaded.');
  });
  // Restoring replaces everything, so it uses the same two-step confirm as the other destructive buttons.
  $('backup-restore').addEventListener('click', function (e) {
    confirmClick(e.currentTarget, function () { $('backup-file').click(); });
  });
  $('backup-file').addEventListener('change', function () {
    readFile(this, function (text) {
      var p;
      try { p = JSON.parse(text); } catch (e) { return dataMsg("That file isn't a Pomodoro backup."); }
      var d = p && p.data ? p.data : p;
      if (!d || typeof d !== 'object' || !['tasks', 'log', 'settings'].some(function (k) { return k in d; })) {
        return dataMsg("That file isn't a Pomodoro backup.");
      }
      stopTicking();
      try { localStorage.setItem(KEY, JSON.stringify(d)); localStorage.removeItem(TIMER_KEY); } catch (e) {}
      location.reload();                                // load() validates every field on the way back in
    });
  });

  function parseCsv(text) {
    var rows = [], row = [], f = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  // Imports the "Export CSV" file from the Report tab (desktop or web), skipping sessions already present.
  $('csv-import').addEventListener('click', function () { $('csv-file').click(); });
  $('csv-file').addEventListener('change', function () {
    readFile(this, function (text) {
      var rows = parseCsv(text.replace(/^\s+/, ''));   // \s also covers the byte-order mark Excel adds
      if (!rows.length || rows[0].join(',').trim().toLowerCase() !== 'date,time,task,project,minutes') {
        return dataMsg('Expected a CSV exported from the Report tab (date,time,task,project,minutes).');
      }
      function sessionKey(t, task) { var dt = new Date(t); return dayKey(dt) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + '|' + task; }
      var seen = {}, added = 0, skipped = 0;
      state.log.forEach(function (e) { seen[sessionKey(e.t, e.task || '')] = 1; });
      rows.slice(1).forEach(function (r) {
        var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r[0] || ''), tm = /^(\d{1,2}):(\d{2})$/.exec(r[1] || ''), min = Number(r[4]);
        if (!dm || !tm || !(min > 0)) { if (r.join('').trim()) skipped++; return; }
        var t = new Date(+dm[1], dm[2] - 1, +dm[3], +tm[1], +tm[2]).getTime(), task = r[2] || '', proj = r[3] || '';
        if (seen[sessionKey(t, task)]) { skipped++; return; }
        seen[sessionKey(t, task)] = 1;
        var p = state.projects.filter(function (x) { return x.name === proj; })[0];
        state.log.push({ t: t, d: dayKey(t), m: min, task: task, id: '', proj: proj, pid: p ? p.id : '' });
        added++;
      });
      save(); refreshData();
      dataMsg('Imported ' + added + (added === 1 ? ' session' : ' sessions') + (skipped ? ', skipped ' + skipped + ' already present or unreadable.' : '.'));
    });
  });

  $('open-settings').addEventListener('click', function () {
    renderNotify(); dataMsg('');
    if ($('settings').showModal) $('settings').showModal();
  });
  $('settings-close').addEventListener('click', function () { $('settings').close(); });

  /* ================= main controls ================= */
  toggleBtn.addEventListener('click', function () { running ? pause() : start(); });
  $('reset').addEventListener('click', function () { setMode(mode); });
  $('skip').addEventListener('click', skip);
  document.querySelectorAll('#modes button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space') return;
    if (document.querySelector('dialog[open]')) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'button', 'select', 'textarea', 'summary'].indexOf(tag) !== -1) return;
    e.preventDefault();
    running ? pause() : start();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && running) tick(); });

  /* ================= web-only ================= */
  // Closing the tab mid-session means no alarm, so ask first. (The timer itself is restored on reopen.)
  window.addEventListener('beforeunload', function (e) {
    if (running) { e.preventDefault(); e.returnValue = ''; }
  });

  // Stand-in for the desktop app's single-instance lock: warn when another tab has the app open,
  // since both tabs would write to the same storage.
  try {
    var tabs = new BroadcastChannel('pomodoro-tabs');
    tabs.onmessage = function (e) {
      if (e.data === 'hello') tabs.postMessage('here');
      $('other-tab').hidden = e.data === 'bye';
    };
    tabs.postMessage('hello');
    window.addEventListener('pagehide', function () { tabs.postMessage('bye'); });
  } catch (e) {}

  /* ---- "Install app" button ---- */
  // Chrome, Edge and Android fire beforeinstallprompt when the app can be installed: we keep
  // that event and show our own button, which opens the browser's install dialog. Safari has
  // no such event, so there the button explains the Add to Home Screen / Dock steps instead.
  // The button stays hidden when the app is already installed, and in browsers that can't install.
  (function () {
    var btn = $('install-app'), deferred = null, ua = navigator.userAgent;
    var installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
    if (installed) return;
    if (isIOS || isMacSafari) btn.hidden = false;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();                               // we show our own button instead of the browser's banner
      deferred = e;
      btn.hidden = false;
    });
    window.addEventListener('appinstalled', function () { deferred = null; btn.hidden = true; });

    btn.addEventListener('click', function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; btn.hidden = true; });   // the event is single-use
        return;
      }
      $('install-steps').innerHTML = isIOS
        ? '<li>Tap the <strong>Share</strong> button (the square with an arrow).</li>' +
          '<li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>'
        : '<li>In the menu bar, choose <strong>File → Add to Dock</strong>.</li>' +
          '<li>Click <strong>Add</strong>. (Needs Safari 17 or newer.)</li>';
      $('install-help').showModal();
    });
    $('install-close').addEventListener('click', function () { $('install-help').close(); });
  })();

  // Offline support, which is also what makes the app installable. Service workers need
  // http(s), so skip on file://.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  /* ================= init ================= */
  renderProjects();
  renderTemplates();
  renderTasks();
  renderToday();
  renderMode();
  renderPlayer();
  restoreTimer();
  setInterval(renderFinish, 30000);
})();
