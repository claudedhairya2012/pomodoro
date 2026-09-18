/* ================= Pomodoro — app logic ================= */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : { ...fallback, ...JSON.parse(raw) };
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  const MODES = {
    focus: { label: 'Focus', phase: 'Time to focus', done: 'Focus session complete — take a break 🍅' },
    short: { label: 'Short Break', phase: 'Quick break', done: "Break's over — back to focus 💪" },
    long: { label: 'Long Break', phase: 'Long break — you earned it', done: "Break's over — back to focus 💪" },
  };

  /* ---------- persistent state ---------- */
  const settings = store.get('pomo.settings', {
    focus: 25,
    short: 5,
    long: 15,
    interval: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    volume: 60,
    notify: true,
    muted: false,
  });

  const session = store.get('pomo.session', { completedFocus: 0 });

  const stats = store.get('pomo.stats', { total: { count: 0, sec: 0 } });
  const ensureDay = (key) => (stats[key] ||= { count: 0, sec: 0 });

  let tasks = [];
  try { tasks = JSON.parse(localStorage.getItem('pomo.tasks') || '[]'); } catch { tasks = []; }
  let activeTaskId = localStorage.getItem('pomo.activeTask') || null;

  const saveTasks = () => {
    try {
      localStorage.setItem('pomo.tasks', JSON.stringify(tasks));
      localStorage.setItem('pomo.activeTask', activeTaskId ?? '');
    } catch { /* ignore */ }
  };

  /* ---------- timer state ---------- */
  let mode = 'focus';
  let total = settings.focus * 60;
  let remaining = total; // seconds (float while running)
  let running = false;
  let endTime = 0;

  /* ---------- dom refs ---------- */
  const el = {
    body: document.body,
    time: $('#timeDisplay'),
    phase: $('#phaseLabel'),
    ring: $('#ringProgress'),
    ringSvg: document.querySelector('.ring'),
    startBtn: $('#startBtn'),
    startLabel: $('#startLabel'),
    resetBtn: $('#resetBtn'),
    skipBtn: $('#skipBtn'),
    dots: $('#cycleDots'),
    activeTask: $('#activeTask'),
    activeTaskName: $('#activeTaskName'),
    timerCard: $('#timerCard'),
    statToday: $('#statToday'),
    statFocus: $('#statFocus'),
    statTotal: $('#statTotal'),
    taskForm: $('#taskForm'),
    taskInput: $('#taskInput'),
    taskList: $('#taskList'),
    emptyNote: $('#emptyNote'),
    clearDoneBtn: $('#clearDoneBtn'),
    settingsBtn: $('#settingsBtn'),
    settingsOverlay: $('#settingsOverlay'),
    settingsClose: $('#settingsClose'),
    settingsSave: $('#settingsSave'),
    soundBtn: $('#soundBtn'),
    soundIcon: $('#soundIcon'),
    toast: $('#toast'),
    favicon: $('#favicon'),
  };

  const RING_C = 2 * Math.PI * 138;
  el.ring.style.strokeDasharray = String(RING_C);

  /* ---------- audio ---------- */
  let audioCtx = null;
  const getCtx = () => {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  };

  function bell(ctx, freq, at, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.01; // shimmer partial
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    osc2.connect(g2).connect(gain);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    osc.start(t0); osc2.start(t0);
    osc.stop(t0 + 1); osc2.stop(t0 + 1);
  }

  function chime() {
    if (settings.muted || settings.volume <= 0) return;
    const ctx = getCtx();
    if (!ctx) return;
    const v = (settings.volume / 100) * 0.5;
    [0, 1.35].forEach((rep) => {
      bell(ctx, 880, rep + 0, v);        // A5
      bell(ctx, 1108.73, rep + 0.28, v); // C#6
      bell(ctx, 1318.51, rep + 0.56, v); // E6
    });
  }

  /* ---------- notifications ---------- */
  function requestNotifyPermission() {
    if (!settings.notify) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function notify(title, body) {
    if (!settings.notify || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try { new Notification(title, { body, silent: true }); } catch { /* ignore */ }
    }
  }

  /* ---------- favicon ---------- */
  const favCanvas = document.createElement('canvas');
  favCanvas.width = favCanvas.height = 64;
  function drawFavicon() {
    const ctx = favCanvas.getContext('2d');
    if (!ctx) return;
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff7a70';
    ctx.clearRect(0, 0, 64, 64);
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(32, 32, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(remaining / total, 0, 1));
    ctx.stroke();
    el.favicon.href = favCanvas.toDataURL('image/png');
  }

  /* ---------- rendering ---------- */
  const fmt = (secs) => {
    const s = Math.max(0, Math.ceil(secs));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };

  let lastShown = '';
  function renderTime() {
    const text = fmt(remaining);
    if (text !== lastShown) {
      lastShown = text;
      el.time.textContent = text;
      document.title = `${text} · ${MODES[mode].label}${running ? '' : total !== remaining ? ' ⏸' : ''}`;
      drawFavicon();
    }
    const frac = clamp(remaining / total, 0, 1);
    el.ring.style.strokeDashoffset = String(RING_C * (1 - frac));
  }

  function renderControls() {
    el.startLabel.textContent = running ? 'Pause' : remaining < total ? 'Resume' : 'Start';
    el.body.classList.toggle('running', running);
  }

  function renderDots() {
    const n = Math.max(1, settings.interval);
    const done = session.completedFocus;
    let filled = done % n;
    if (mode === 'long' && done > 0 && filled === 0) filled = n;
    el.dots.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i < filled ? ' filled' : '');
      el.dots.appendChild(d);
    }
  }

  function renderActiveTask() {
    const t = tasks.find((x) => x.id === activeTaskId && !x.done);
    el.activeTask.hidden = !t;
    if (t) el.activeTaskName.textContent = t.name;
  }

  const fmtDur = (sec) => {
    const m = Math.round(sec / 60);
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}m`;
  };

  function renderStats() {
    const day = stats[todayKey()] || { count: 0, sec: 0 };
    el.statToday.textContent = String(day.count);
    el.statFocus.textContent = fmtDur(day.sec);
    el.statTotal.textContent = String(stats.total.count);
  }

  function renderModes() {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
      b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    });
  }

  function renderAll() {
    renderTime();
    renderControls();
    renderDots();
    renderActiveTask();
    renderStats();
    renderModes();
  }

  /* ---------- actions ---------- */
  function snapRing() {
    el.ringSvg.classList.add('no-anim');
    renderTime();
    requestAnimationFrame(() => requestAnimationFrame(() => el.ringSvg.classList.remove('no-anim')));
  }

  function setMode(next, { autostart = false } = {}) {
    mode = next;
    total = clamp(settings[next], 1, 180) * 60;
    remaining = total;
    running = false;
    document.body.dataset.mode = next;
    el.phase.textContent = MODES[next].phase;
    snapRing();
    renderAll();
    if (autostart) start();
  }

  function start() {
    if (running || remaining <= 0) return;
    getCtx(); // unlock audio on user gesture
    requestNotifyPermission();
    running = true;
    endTime = Date.now() + remaining * 1000;
    renderControls();
    renderTime();
  }

  function pause() {
    if (!running) return;
    remaining = Math.max(0, (endTime - Date.now()) / 1000);
    running = false;
    renderControls();
    renderTime();
  }

  const toggle = () => (running ? pause() : start());

  function reset() {
    running = false;
    remaining = total;
    snapRing();
    renderAll();
  }

  function nextModeAfter(wasFocus) {
    if (wasFocus) {
      return session.completedFocus % Math.max(1, settings.interval) === 0 ? 'long' : 'short';
    }
    return 'focus';
  }

  function skip() {
    const wasFocus = mode === 'focus';
    const n = Math.max(1, settings.interval);
    const longDue = wasFocus && session.completedFocus > 0 && session.completedFocus % n === 0;
    setMode(wasFocus ? (longDue ? 'long' : 'short') : 'focus', {
      autostart: wasFocus ? settings.autoStartBreaks : settings.autoStartFocus,
    });
  }

  function complete() {
    const wasFocus = mode === 'focus';
    running = false;
    remaining = 0;
    chime();

    if (wasFocus) {
      session.completedFocus += 1;
      store.set('pomo.session', session);

      const day = ensureDay(todayKey());
      day.count += 1;
      day.sec += total;
      stats.total.count += 1;
      stats.total.sec += total;
      store.set('pomo.stats', stats);

      const task = tasks.find((t) => t.id === activeTaskId && !t.done);
      if (task) {
        task.count += 1;
        saveTasks();
        renderTasks();
      }

      notify('Pomodoro complete!', MODES.focus.done);
      toast(MODES.focus.done);
    } else {
      notify('Break finished', MODES.focus.done);
      toast(MODES.focus.done);
    }

    el.timerCard.classList.remove('pulse');
    void el.timerCard.offsetWidth; // restart animation
    el.timerCard.classList.add('pulse');

    setMode(nextModeAfter(wasFocus), {
      autostart: wasFocus ? settings.autoStartBreaks : settings.autoStartFocus,
    });
  }

  /* ---------- main loop (timestamp-based, survives tab throttling) ---------- */
  setInterval(() => {
    if (!running) return;
    const msLeft = endTime - Date.now();
    if (msLeft <= 0) {
      complete();
      return;
    }
    remaining = msLeft / 1000;
    renderTime();
  }, 250);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && running) {
      remaining = Math.max(0, (endTime - Date.now()) / 1000);
      renderTime();
    }
  });

  /* ---------- tasks ---------- */
  function renderTasks() {
    el.taskList.innerHTML = '';
    tasks.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'task' + (t.done ? ' done' : '') + (t.id === activeTaskId && !t.done ? ' active' : '');
      li.dataset.id = t.id;
      li.title = 'Click to make active · double-click to rename';

      const check = document.createElement('button');
      check.className = 'task-check';
      check.setAttribute('aria-label', t.done ? 'Mark as not done' : 'Mark as done');
      check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      check.addEventListener('click', (e) => {
        e.stopPropagation();
        t.done = !t.done;
        if (t.done && t.id === activeTaskId) activeTaskId = null;
        saveTasks();
        renderTasks();
      });

      const name = document.createElement('span');
      name.className = 'task-name';
      name.textContent = t.name;

      li.addEventListener('click', () => {
        if (t.done) return;
        activeTaskId = activeTaskId === t.id ? null : t.id;
        saveTasks();
        renderTasks();
      });

      li.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (li.querySelector('.task-edit')) return;
        const input = document.createElement('input');
        input.className = 'task-edit';
        input.value = t.name;
        input.maxLength = 120;
        li.replaceChild(input, name);
        input.focus();
        input.select();
        const commit = (keep) => {
          const v = input.value.trim();
          if (keep && v) t.name = v;
          saveTasks();
          renderTasks();
        };
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') commit(true);
          else if (ev.key === 'Escape') commit(false);
          ev.stopPropagation();
        });
        input.addEventListener('blur', () => commit(true));
        input.addEventListener('click', (ev) => ev.stopPropagation());
      });

      if (t.count > 0) {
        const count = document.createElement('span');
        count.className = 'task-count';
        count.textContent = `🍅 ${t.count}`;
        li.appendChild(count);
      }

      const del = document.createElement('button');
      del.className = 'task-del';
      del.setAttribute('aria-label', 'Delete task');
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        tasks = tasks.filter((x) => x.id !== t.id);
        if (activeTaskId === t.id) activeTaskId = null;
        saveTasks();
        renderTasks();
      });

      li.prepend(check, name);
      li.appendChild(del);
      el.taskList.appendChild(li);
    });

    el.emptyNote.hidden = tasks.length > 0;
    el.clearDoneBtn.hidden = !tasks.some((t) => t.done);
    renderActiveTask();
  }

  el.taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el.taskInput.value.trim();
    if (!name) return;
    tasks.push({ id: `t${Date.now()}${Math.floor(Math.random() * 1e4)}`, name, done: false, count: 0 });
    el.taskInput.value = '';
    saveTasks();
    renderTasks();
  });

  el.clearDoneBtn.addEventListener('click', () => {
    tasks = tasks.filter((t) => !t.done);
    saveTasks();
    renderTasks();
  });

  /* ---------- sound toggle ---------- */
  function renderSoundIcon() {
    el.soundBtn.classList.toggle('muted', settings.muted);
    el.soundIcon.querySelectorAll('.wave').forEach((w) => (w.style.display = settings.muted ? 'none' : ''));
    el.soundIcon.querySelectorAll('.mute-x').forEach((x) => (x.style.display = settings.muted ? '' : 'none'));
  }
  el.soundBtn.addEventListener('click', () => {
    settings.muted = !settings.muted;
    store.set('pomo.settings', settings);
    renderSoundIcon();
    toast(settings.muted ? 'Sound off' : 'Sound on');
    if (!settings.muted) {
      const ctx = getCtx();
      if (ctx) bell(ctx, 880, 0, (settings.volume / 100) * 0.5);
    }
  });

  /* ---------- settings modal ---------- */
  const setInputs = {
    focus: $('#setFocus'),
    short: $('#setShort'),
    long: $('#setLong'),
    interval: $('#setInterval'),
    autoBreak: $('#setAutoBreak'),
    autoFocus: $('#setAutoFocus'),
    volume: $('#setVolume'),
    notify: $('#setNotify'),
  };

  function fillRange(elInput) {
    const min = Number(elInput.min) || 0;
    const max = Number(elInput.max) || 100;
    elInput.style.setProperty('--fill', `${((elInput.value - min) / (max - min)) * 100}%`);
  }

  function openSettings() {
    setInputs.focus.value = settings.focus;
    setInputs.short.value = settings.short;
    setInputs.long.value = settings.long;
    setInputs.interval.value = settings.interval;
    setInputs.autoBreak.checked = settings.autoStartBreaks;
    setInputs.autoFocus.checked = settings.autoStartFocus;
    setInputs.volume.value = settings.volume;
    setInputs.notify.checked = settings.notify && 'Notification' in window && Notification.permission === 'granted';
    fillRange(setInputs.volume);
    el.settingsOverlay.hidden = false;
  }

  function closeSettings() {
    el.settingsOverlay.hidden = true;
  }

  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === el.settingsOverlay) closeSettings();
  });
  setInputs.volume.addEventListener('input', () => fillRange(setInputs.volume));

  $('#testSoundBtn').addEventListener('click', () => {
    const prev = settings.volume;
    settings.volume = Number(setInputs.volume.value);
    const ctx = getCtx();
    if (ctx) {
      bell(ctx, 880, 0, (settings.volume / 100) * 0.5);
      bell(ctx, 1108.73, 0.28, (settings.volume / 100) * 0.5);
    }
    settings.volume = prev;
  });

  setInputs.notify.addEventListener('change', (e) => {
    if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        if (p !== 'granted') e.target.checked = false;
      }).catch(() => { e.target.checked = false; });
    }
  });

  el.settingsSave.addEventListener('click', () => {
    settings.focus = clamp(Math.round(Number(setInputs.focus.value)) || 25, 1, 180);
    settings.short = clamp(Math.round(Number(setInputs.short.value)) || 5, 1, 60);
    settings.long = clamp(Math.round(Number(setInputs.long.value)) || 15, 1, 90);
    settings.interval = clamp(Math.round(Number(setInputs.interval.value)) || 4, 1, 8);
    settings.autoStartBreaks = setInputs.autoBreak.checked;
    settings.autoStartFocus = setInputs.autoFocus.checked;
    settings.volume = clamp(Math.round(Number(setInputs.volume.value)) || 0, 0, 100);
    settings.notify = setInputs.notify.checked && 'Notification' in window && Notification.permission === 'granted';
    store.set('pomo.settings', settings);

    if (!running) setMode(mode); // refresh duration of the idle phase
    renderDots();
    renderSoundIcon();
    closeSettings();
    toast('Settings saved ✓');
  });

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
  }

  /* ---------- keyboard shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.target.isContentEditable) return;
    if (!el.settingsOverlay.hidden) {
      if (e.key === 'Escape') closeSettings();
      return;
    }
    switch (e.key) {
      case ' ': // space
        if (e.target.tagName === 'BUTTON') return; // let native click happen
        e.preventDefault();
        toggle();
        break;
      case 'r': case 'R': reset(); break;
      case 'n': case 'N': skip(); break;
      case 'm': case 'M': el.soundBtn.click(); break;
      case '1': setMode('focus'); break;
      case '2': setMode('short'); break;
      case '3': setMode('long'); break;
      case 'Escape': if (activeTaskId) { activeTaskId = null; saveTasks(); renderTasks(); } break;
    }
  });

  /* ---------- wire controls ---------- */
  el.startBtn.addEventListener('click', toggle);
  el.resetBtn.addEventListener('click', reset);
  el.skipBtn.addEventListener('click', skip);
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  /* ---------- init ---------- */
  document.body.dataset.mode = mode;
  el.phase.textContent = MODES[mode].phase;
  renderSoundIcon();
  renderTasks();
  renderAll();
})();
