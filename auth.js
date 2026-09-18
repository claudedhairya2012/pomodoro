/* ================= PIN auth + page guard ================= */
(() => {
  'use strict';

  const KEY = 'pomo.unlocked';
  const PINS = {
    '123': 'timer.html',
    '1234': 'calendar.html',
    '12345': 'notes.html',
  };

  const page = document.body.dataset.page || 'app';

  /* ---------- lock screen (index.html) ---------- */
  if (page === 'lock') {
    // Already unlocked in this tab? Go straight in.
    try {
      if (sessionStorage.getItem(KEY) === '1') { location.replace('timer.html'); return; }
    } catch { /* ignore */ }

    let pin = '';
    let accepted = false; // stop input after a successful entry
    const dots = document.getElementById('pinDots');
    const err = document.getElementById('lockErr');
    const card = document.querySelector('.lock-card');

    const draw = () => {
      dots.querySelectorAll('.pdot').forEach((d, i) => d.classList.toggle('fill', i < pin.length));
    };

    const submit = () => {
      if (accepted) return;
      const target = PINS[pin];
      if (target) {
        accepted = true;
        err.textContent = '';
        err.classList.remove('show');
        card.classList.add('ok');
        try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
        setTimeout(() => { location.href = target; }, 220);
      } else {
        err.textContent = 'Wrong PIN — try again';
        err.classList.add('show');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        pin = '';
        draw();
      }
    };

    const press = (k) => {
      if (accepted || pin.length >= 8) return;
      pin += k;
      draw();
      err.textContent = '';
      err.classList.remove('show');
    };
    const back = () => { if (accepted) return; pin = pin.slice(0, -1); draw(); err.textContent = ''; err.classList.remove('show'); };

    document.querySelectorAll('[data-key]').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.key;
        if (k === 'back') back();
        else if (k === 'go') submit();
        else press(k);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') submit();
    });
    return;
  }

  /* ---------- app pages: require unlock ---------- */
  let unlocked = false;
  try { unlocked = sessionStorage.getItem(KEY) === '1'; } catch { /* ignore */ }
  if (!unlocked) {
    location.replace('index.html');
    return;
  }

  document.querySelectorAll('[data-lock]').forEach((b) => {
    b.addEventListener('click', () => {
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      location.href = 'index.html';
    });
  });

  // Shortcut: L to lock
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.matches?.('input, textarea, select') || t.isContentEditable)) return;
    if (e.key === 'l' || e.key === 'L') {
      document.querySelector('[data-lock]')?.click();
    }
  });
})();
