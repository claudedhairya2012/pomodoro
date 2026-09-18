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

  /* ---------- Smart Routine — on-device adaptive coach ---------- */
  const ai = (() => {
    const BOUNDS = { focus: [5, 120], short: [2, 20], long: [8, 45] };
    const state = store.get('pomo.ai', {
      enabled: false,
      plan: null, // { focus, short, long } — seeded from manual settings on first enable
      goal: 8,    // pomodoros per day
      cema: 0.75, // completion-rate exponential moving average (0..1)
      consec: 0,  // focus sessions completed since the last long break actually finished
      bonusLong: 0,
      buckets: { m: { ok: 0, n: 0 }, a: { ok: 0, n: 0 }, e: { ok: 0, n: 0 } }, // time-of-day performance
      history: [], // recent focus outcomes for the trend strip
      note: 'Ready to learn your rhythm.',
    });

    const save = () => store.set('pomo.ai', state);
    const ensurePlan = () => {
      if (!state.plan) state.plan = { focus: settings.focus, short: settings.short, long: settings.long };
    };
    const pushHistory = (entry) => {
      state.history.push(entry);
      if (state.history.length > 150) state.history = state.history.slice(-150);
    };
    const bucketOf = (h) => (h < 5 ? 'e' : h < 12 ? 'm' : h < 17 ? 'a' : 'e');
    const sample = (ok) => { state.cema = 0.7 * state.cema + 0.3 * ok; };

    // Minutes each phase should run while Smart Routine is on.
    function effective(kind) {
      ensurePlan();
      if (kind === 'focus') {
        let v = state.plan.focus;
        const b = state.buckets[bucketOf(new Date().getHours())];
        if (b.n >= 3) {
          const r = b.ok / b.n;
          if (r < 0.55) v -= 2;      // this part of the day is historically hard — start smaller
          else if (r > 0.85) v += 1; // historically strong — stretch a little
        }
        return clamp(v, BOUNDS.focus[0], BOUNDS.focus[1]);
      }
      if (kind === 'long') return clamp(state.plan.long + (state.bonusLong || 0), BOUNDS.long[0], BOUNDS.long[1]);
      return clamp(state.plan.short, BOUNDS.short[0], BOUNDS.short[1]);
    }

    // Called after a focus session runs to completion.
    function afterFocusComplete() {
      ensurePlan();
      state.consec += 1;
      sample(1);
      const b = bucketOf(new Date().getHours());
      state.buckets[b].n += 1;
      state.buckets[b].ok += 1;
      pushHistory({ t: Date.now(), mode: 'focus', ok: 1 });

      let delta;
      let note;
      if (state.cema >= 0.8) {
        delta = state.consec >= 3 ? 2 : 1;
        note = state.consec >= 3
          ? `🔥 ${state.consec} in a row — stretching focus to ${state.plan.focus + delta}m`
          : `💪 Strong run — nudging focus to ${state.plan.focus + delta}m`;
      } else if (state.cema >= 0.55) {
        delta = 0;
        note = `🍅 Logged. Holding ${state.plan.focus}m focus`;
      } else {
        delta = -1;
        note = `Keeping it doable — easing focus to ${state.plan.focus - 1}m`;
      }
      state.plan.focus = clamp(state.plan.focus + delta, BOUNDS.focus[0], BOUNDS.focus[1]);

      const day = stats[todayKey()] || { count: 0 };
      if (day.count === state.goal) note = `🎯 Daily goal of ${state.goal} hit — anything more is bonus!`;

      state.note = note;
      save();
      renderCoach();
      return note;
    }

    // Focus abandoned mid-session (skip / reset / mode switch while running).
    function onAbandon(pctDone) {
      ensurePlan();
      sample(0);
      const drop = pctDone >= 0.5 ? 1 : 3; // "so close" vs "too much at once"
      state.plan.focus = clamp(state.plan.focus - drop, BOUNDS.focus[0], BOUNDS.focus[1]);
      state.plan.short = clamp(state.plan.short + 1, BOUNDS.short[0], BOUNDS.short[1]);
      pushHistory({ t: Date.now(), mode: 'focus', ok: 0 });
      state.note = pctDone >= 0.5
        ? `So close — easing to ${state.plan.focus}m focus`
        : `Too much at once — trying ${state.plan.focus}m with ${state.plan.short}m breaks`;
      save();
      renderCoach();
      toast(state.note);
    }

    // Break skipped while still fresh — that break type feels too long.
    function onBreakSkipped(kind) {
      ensurePlan();
      const key = kind === 'long' ? 'long' : 'short';
      state.plan[key] = clamp(state.plan[key] - 1, BOUNDS[key][0], BOUNDS[key][1]);
      state.note = `Breaks feel long — ${key} break now ${state.plan[key]}m`;
      save();
      renderCoach();
      toast(state.note);
    }

    return { state, save, ensurePlan, effective, afterFocusComplete, onAbandon, onBreakSkipped };
  })();

  /* ---------- timer state ---------- */
  // While Smart Routine is on, phase durations come from the adaptive plan.
  const modeMinutes = (kind) =>
    ai.state.enabled ? ai.effective(kind) : clamp(settings[kind], 1, 180);

  let mode = 'focus';
  let total = modeMinutes('focus') * 60;
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
    coachCard: $('#coachCard'),
    coachBody: $('#coachBody'),
    coachSub: $('#coachSub'),
    aiToggle: $('#aiToggle'),
    aiFocus: $('#aiFocus'),
    aiShort: $('#aiShort'),
    aiLong: $('#aiLong'),
    aiTrend: $('#aiTrend'),
    aiTrendDots: $('#aiTrendDots'),
    aiGoalVal: $('#aiGoalVal'),
    aiGoalFill: $('#aiGoalFill'),
    aiNote: $('#aiNote'),
    goalMinus: $('#goalMinus'),
    goalPlus: $('#goalPlus'),
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
    renderCoach();
  }

  /* ---------- smart routine UI ---------- */
  function renderCoach() {
    const on = ai.state.enabled;
    el.coachCard.dataset.on = String(on);
    el.coachBody.hidden = !on;
    el.coachSub.textContent = on ? 'Auto-pilot — adapting timings to you' : 'Off — your manual timings';
    el.aiToggle.setAttribute('aria-checked', String(on));
    if (!on) return;

    el.aiFocus.textContent = `${ai.effective('focus')}m`;
    el.aiShort.textContent = `${ai.effective('short')}m`;
    el.aiLong.textContent = `${ai.effective('long')}m`;
    el.aiTrend.textContent = `${Math.round(ai.state.cema * 100)}%`;

    el.aiTrendDots.innerHTML = '';
    ai.state.history
      .filter((h) => h.mode === 'focus')
      .slice(-8)
      .forEach((h) => {
        const d = document.createElement('span');
        d.className = 't-dot ' + (h.ok ? 'ok' : 'fail');
        el.aiTrendDots.appendChild(d);
      });

    const day = stats[todayKey()] || { count: 0 };
    const goal = Math.max(1, ai.state.goal);
    el.aiGoalVal.textContent = `${day.count}/${goal}`;
    el.aiGoalFill.style.width = `${Math.min(100, (day.count / goal) * 100)}%`;
    el.aiNote.textContent = ai.state.note || '';
  }

  function setAiEnabled(on) {
    ai.state.enabled = on;
    if (on) ai.ensurePlan();
    ai.save();
    renderCoach();
    if (!running) setMode(mode); // idle: apply new durations right away
    toast(on ? '✨ Smart Routine on — timings adapt as you go' : 'Smart Routine off — manual timings');
  }

  /* ---------- actions ---------- */
  function snapRing() {
    el.ringSvg.classList.add('no-anim');
    renderTime();
    requestAnimationFrame(() => requestAnimationFrame(() => el.ringSvg.classList.remove('no-anim')));
  }

  function setMode(next, { autostart = false } = {}) {
    mode = next;
    if (next !== 'long') ai.state.bonusLong = 0; // fatigue bonus only applies while in a long break
    total = modeMinutes(next) * 60;
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
    interruptSample();
    running = false;
    remaining = total;
    snapRing();
    renderAll();
  }

  function pickBreakMode() {
    const n = Math.max(1, settings.interval);
    const fatigued = ai.state.enabled && ai.state.consec >= n + 2; // long breaks keep getting skipped
    if (fatigued || (session.completedFocus > 0 && session.completedFocus % n === 0)) {
      return { mode: 'long', fatigued };
    }
    return { mode: 'short', fatigued: false };
  }

  // Record a learning sample when a running phase is interrupted early.
  function interruptSample() {
    if (!running || !ai.state.enabled) return;
    if (mode === 'focus') {
      const pctDone = (total - remaining) / total;
      if (pctDone >= 0.05) ai.onAbandon(pctDone); // ignore accidental immediate skips
    } else if (remaining / total > 0.3) {
      ai.onBreakSkipped(mode);
    }
  }

  function skip() {
    interruptSample();
    const wasFocus = mode === 'focus';
    const pick = wasFocus ? pickBreakMode() : { mode: 'focus', fatigued: false };
    if (pick.mode === 'long') {
      ai.state.bonusLong = pick.fatigued ? 5 : 0;
      ai.save();
    }
    setMode(pick.mode, {
      autostart: wasFocus ? settings.autoStartBreaks : settings.autoStartFocus,
    });
  }

  function complete() {
    const wasFocus = mode === 'focus';
    running = false;
    remaining = 0;
    chime();
    let coachNote = null;

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
      if (ai.state.enabled) coachNote = ai.afterFocusComplete();
      toast(coachNote || MODES.focus.done);
    } else {
      if (mode === 'long') { // a long break actually finished — fatigue resets
        ai.state.consec = 0;
        ai.save();
      }
      notify('Break finished', MODES.focus.done);
      toast(MODES.focus.done);
    }

    el.timerCard.classList.remove('pulse');
    void el.timerCard.offsetWidth; // restart animation
    el.timerCard.classList.add('pulse');

    let nextMode = 'focus';
    if (wasFocus) {
      const pick = pickBreakMode();
      if (pick.mode === 'long') {
        ai.state.bonusLong = pick.fatigued ? 5 : 0;
        ai.save();
      }
      nextMode = pick.mode;
    }
    setMode(nextMode, {
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
    b.addEventListener('click', () => {
      interruptSample();
      setMode(b.dataset.mode);
    });
  });

  el.aiToggle.addEventListener('click', () => setAiEnabled(!ai.state.enabled));
  el.goalMinus.addEventListener('click', () => {
    ai.state.goal = clamp(ai.state.goal - 1, 2, 16);
    ai.save();
    renderCoach();
  });
  el.goalPlus.addEventListener('click', () => {
    ai.state.goal = clamp(ai.state.goal + 1, 2, 16);
    ai.save();
    renderCoach();
  });

  /* ---------- init ---------- */
  document.body.dataset.mode = mode;
  el.phase.textContent = MODES[mode].phase;
  renderSoundIcon();
  renderTasks();
  renderAll();
})();
