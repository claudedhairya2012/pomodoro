/* ================= Calendar — month view, events, pomodoro history ================= */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');

  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayKey = () => {
    const t = new Date();
    return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
  };

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const loadEvents = () => {
    try {
      const raw = JSON.parse(localStorage.getItem('pomo.events') || '[]');
      return Array.isArray(raw) ? raw.filter((e) => e && e.id && e.date && e.title) : [];
    } catch { return []; }
  };
  const persist = () => {
    try { localStorage.setItem('pomo.events', JSON.stringify(events)); } catch { /* ignore */ }
  };

  let events = loadEvents();
  const now = new Date();
  let vy = now.getFullYear();
  let vm = now.getMonth();
  let selKey = todayKey();

  /* ---------- elements ---------- */
  const el = {
    title: $('#calTitle'),
    grid: $('#calGrid'),
    prev: $('#prevBtn'),
    next: $('#nextBtn'),
    today: $('#todayBtn'),
    dayTitle: $('#dayTitle'),
    dayStats: $('#dayStats'),
    form: $('#eventForm'),
    evTitle: $('#eventTitle'),
    evTime: $('#eventTime'),
    evList: $('#eventList'),
    dayEmpty: $('#dayEmpty'),
    upcoming: $('#upcomingList'),
    upcomingEmpty: $('#upcomingEmpty'),
    toast: $('#toast'),
  };

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
  }

  const statsFor = (key) => {
    try {
      const s = JSON.parse(localStorage.getItem('pomo.stats') || '{}');
      return s[key] || { count: 0, sec: 0 };
    } catch { return { count: 0, sec: 0 }; }
  };

  const fmtMin = (sec) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };

  const heatClass = (count) => (count <= 0 ? '' : count <= 2 ? ' lvl1' : count <= 4 ? ' lvl2' : count <= 7 ? ' lvl3' : ' lvl4');

  function eventsOn(key) {
    return events
      .filter((e) => e.date === key)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }

  /* ---------- month grid ---------- */
  function renderGrid() {
    el.title.textContent = `${MONTHS[vm]} ${vy}`;
    el.grid.innerHTML = '';

    const first = new Date(vy, vm, 1);
    const startOffset = first.getDay(); // Sunday-first
    const daysInMonth = new Date(vy, vm + 1, 0).getDate();
    const daysPrev = new Date(vy, vm, 0).getDate();
    const tk = todayKey();

    for (let i = 0; i < 42; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'day-cell';

      let dayNum; let dateKey; let inMonth = true;
      if (i < startOffset) {
        dayNum = daysPrev - startOffset + 1 + i;
        dateKey = keyOf(vy, vm - 1, dayNum);
        inMonth = false;
      } else if (i >= startOffset + daysInMonth) {
        dayNum = i - startOffset - daysInMonth + 1;
        dateKey = keyOf(vy, vm + 1, dayNum);
        inMonth = false;
      } else {
        dayNum = i - startOffset + 1;
        dateKey = keyOf(vy, vm, dayNum);
      }

      if (!inMonth) cell.classList.add('dim');
      if (dateKey === tk) cell.classList.add('today');
      if (dateKey === selKey) cell.classList.add('sel');
      cell.classList.add(...heatClass(statsFor(dateKey).count).trim().split(' ').filter(Boolean));

      const num = document.createElement('span');
      num.className = 'd-num';
      num.textContent = String(dayNum);
      cell.appendChild(num);

      const st = statsFor(dateKey);
      if (st.count > 0) {
        const p = document.createElement('span');
        p.className = 'd-pomo';
        p.textContent = `🍅${st.count}`;
        p.title = `${st.count} pomodoro${st.count > 1 ? 's' : ''} · ${fmtMin(st.sec)} focused`;
        cell.appendChild(p);
      }

      const evs = eventsOn(dateKey);
      evs.slice(0, 2).forEach((ev) => {
        const chip = document.createElement('span');
        chip.className = 'd-ev';
        chip.textContent = (ev.time ? `${ev.time} ` : '') + ev.title;
        chip.title = chip.textContent;
        cell.appendChild(chip);
      });
      if (evs.length > 2) {
        const more = document.createElement('span');
        more.className = 'd-more';
        more.textContent = `+${evs.length - 2} more`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => {
        selKey = dateKey;
        renderGrid();
        renderDay();
      });
      el.grid.appendChild(cell);
    }
  }

  /* ---------- day panel ---------- */
  function renderDay() {
    const [y, m, d] = selKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    el.dayTitle.textContent = `${DOW[date.getDay()]}, ${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;

    const st = statsFor(selKey);
    el.dayStats.textContent = st.count > 0
      ? `🍅 ${st.count} pomodoro${st.count > 1 ? 's' : ''} · ${fmtMin(st.sec)} focused`
      : 'No pomodoros logged this day.';

    const evs = eventsOn(selKey);
    el.evList.innerHTML = '';
    evs.forEach((ev) => {
      const li = document.createElement('li');
      li.className = 'event-item';

      const time = document.createElement('span');
      time.className = 'ev-time';
      time.textContent = ev.time || 'all-day';

      const name = document.createElement('span');
      name.className = 'ev-name';
      name.textContent = ev.title;

      const del = document.createElement('button');
      del.className = 'ev-del';
      del.setAttribute('aria-label', 'Delete event');
      del.textContent = '✕';
      del.addEventListener('click', () => {
        events = events.filter((x) => x.id !== ev.id);
        persist();
        renderDay();
        renderGrid();
        renderUpcoming();
        toast('Event removed');
      });

      li.append(time, name, del);
      el.evList.appendChild(li);
    });
    el.dayEmpty.hidden = evs.length > 0;
  }

  /* ---------- upcoming ---------- */
  function renderUpcoming() {
    const tk = todayKey();
    const up = events
      .filter((e) => e.date >= tk)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 6);

    el.upcoming.innerHTML = '';
    up.forEach((ev) => {
      const li = document.createElement('li');
      li.className = 'up-item';

      const d = document.createElement('span');
      d.className = 'up-date';
      const [y, m, dd] = ev.date.split('-').map(Number);
      const dt = new Date(y, m - 1, dd);
      d.textContent = `${DOW[dt.getDay()]}, ${MONTHS[m - 1].slice(0, 3)} ${dd}`;

      const t = document.createElement('span');
      t.className = 'up-title';
      t.textContent = (ev.time ? `${ev.time} — ` : '') + ev.title;

      li.append(d, t);
      el.upcoming.appendChild(li);
    });
    el.upcomingEmpty.hidden = up.length > 0;
  }

  /* ---------- events ---------- */
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el.evTitle.value.trim();
    if (!title) return;
    events.push({
      id: `e${Date.now()}${Math.floor(Math.random() * 1e4)}`,
      date: selKey,
      time: el.evTime.value || null,
      title,
    });
    el.evTitle.value = '';
    el.evTime.value = '';
    persist();
    renderDay();
    renderGrid();
    renderUpcoming();
    toast('Event added ✓');
  });

  el.prev.addEventListener('click', () => {
    vm--;
    if (vm < 0) { vm = 11; vy--; }
    renderGrid();
  });
  el.next.addEventListener('click', () => {
    vm++;
    if (vm > 11) { vm = 0; vy++; }
    renderGrid();
  });
  el.today.addEventListener('click', () => {
    const t = new Date();
    vy = t.getFullYear(); vm = t.getMonth(); selKey = todayKey();
    renderGrid();
    renderDay();
  });

  /* ---------- init ---------- */
  renderGrid();
  renderDay();
  renderUpcoming();
})();
