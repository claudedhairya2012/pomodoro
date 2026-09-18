/* ================= Notes — rich text, colours, images, export ================= */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const PASTELS = ['#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#ffdeeb', '#ffe8cc', '#c5f6fa', '#e9ecef'];
  const uid = () => `n${Date.now()}${Math.floor(Math.random() * 1e4)}`;

  /* ---------- persistence ---------- */
  const loadNotes = () => {
    try {
      const raw = JSON.parse(localStorage.getItem('pomo.notes') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  };
  const persist = () => {
    try {
      localStorage.setItem('pomo.notes', JSON.stringify(notes));
      return true;
    } catch {
      toast('⚠️ Storage full — export a backup & remove large images');
      return false;
    }
  };

  let notes = loadNotes();
  let activeId = null;
  let dirty = false;
  let selectedImg = null;

  /* ---------- elements ---------- */
  const el = {
    list: $('#noteList'),
    empty: $('#notesEmpty'),
    count: $('#noteCount'),
    search: $('#searchInput'),
    newBtn: $('#newBtn'),
    emptyNewBtn: $('#emptyNewBtn'),
    backupBtn: $('#backupBtn'),
    importBtn: $('#importBtn'),
    importInput: $('#importInput'),
    editorWrap: $('#editorWrap'),
    emptyEditor: $('#emptyEditor'),
    title: $('#noteTitle'),
    pinBtn: $('#pinBtn'),
    exportHtmlBtn: $('#exportHtmlBtn'),
    deleteBtn: $('#deleteBtn'),
    swatches: $('#swatches'),
    toolbar: $('#toolbar'),
    checklistBtn: $('#checklistBtn'),
    clearFmtBtn: $('#clearFmtBtn'),
    imageBtn: $('#imageBtn'),
    imgInput: $('#imgInput'),
    surface: $('#noteEditor'),
    counts: $('#counts'),
    saveState: $('#saveState'),
    imgBar: $('#imgBar'),
    imgDownload: $('#imgDownload'),
    imgRemove: $('#imgRemove'),
    imgClose: $('#imgClose'),
    toast: $('#toast'),
  };

  /* ---------- helpers ---------- */
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3000);
  }

  const active = () => notes.find((n) => n.id === activeId) || null;

  function snippet(html, len = 90) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > len ? t.slice(0, len) + '…' : t;
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : `${d}d ago`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  /* ---------- rendering ---------- */
  function renderList() {
    const q = (el.search.value || '').trim().toLowerCase();
    const shown = notes
      .filter((n) => !q || (n.title || 'untitled').toLowerCase().includes(q) || snippet(n.html, 1e6).toLowerCase().includes(q))
      .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));

    el.list.innerHTML = '';
    shown.forEach((n) => {
      const li = document.createElement('li');
      li.className = 'note-item' + (n.id === activeId ? ' active' : '');
      li.style.borderLeftColor = PASTELS[n.color % PASTELS.length];

      const t = document.createElement('div');
      t.className = 'ni-title';
      t.textContent = n.title || 'Untitled';
      const s = document.createElement('div');
      s.className = 'ni-snip';
      s.textContent = n.pinned ? '📌 ' : '';
      s.textContent += snippet(n.html) || 'Empty note';
      const m = document.createElement('div');
      m.className = 'ni-meta';
      m.textContent = timeAgo(n.updatedAt);

      li.append(t, s, m);
      li.addEventListener('click', () => openNote(n.id));
      el.list.appendChild(li);
    });

    el.empty.hidden = shown.length > 0;
    el.count.textContent = String(notes.length);
  }

  function renderSwatches() {
    el.swatches.innerHTML = '';
    PASTELS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (active()?.color === i ? ' active' : '');
      b.style.background = c;
      b.title = `Colour ${i + 1}`;
      b.setAttribute('aria-label', `Colour ${i + 1}`);
      b.addEventListener('click', () => {
        const n = active();
        if (!n) return;
        n.color = i;
        flushSave(true);
        setSurfaceColor(i);
        renderSwatches();
        renderList();
      });
      el.swatches.appendChild(b);
    });
  }

  function setSurfaceColor(i) {
    el.surface.className = `note-surface c${i % PASTELS.length}`;
  }

  function updateCounts() {
    const text = (el.surface.textContent || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.replace(/\n/g, '').length;
    el.counts.textContent = `${words} word${words === 1 ? '' : 's'} · ${chars} chars`;
  }

  function showEditor(show) {
    el.editorWrap.hidden = !show;
    el.emptyEditor.hidden = show;
  }

  /* ---------- open / save ---------- */
  function flushSave(force = false) {
    const n = active();
    if (!n || (!dirty && !force)) { dirty = false; return; }
    n.title = el.title.value.trim();
    n.html = el.surface.innerHTML;
    n.updatedAt = Date.now();
    dirty = false;
    persist();
    renderList();
  }

  let saveTimer = null;
  const scheduleSave = () => {
    dirty = true;
    el.saveState.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      flushSave();
      el.saveState.textContent = 'Saved ✓';
      setTimeout(() => { if (el.saveState.textContent === 'Saved ✓') el.saveState.textContent = ''; }, 1600);
    }, 500);
  };

  function openNote(id) {
    flushSave(); // save previous note before switching
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    activeId = id;
    deselectImg();

    el.title.value = n.title;
    el.surface.innerHTML = n.html;
    setSurfaceColor(n.color);
    el.pinBtn.classList.toggle('on', !!n.pinned);
    showEditor(true);
    renderSwatches();
    renderList();
    updateCounts();
    el.saveState.textContent = '';
  }

  function newNote() {
    flushSave();
    const n = {
      id: uid(), title: '', html: '', color: 0,
      pinned: false, createdAt: Date.now(), updatedAt: Date.now(),
    };
    notes.unshift(n);
    persist();
    openNote(n.id);
    el.title.focus();
  }

  function deleteNote() {
    const n = active();
    if (!n) return;
    if (!confirm(`Delete “${n.title || 'Untitled'}”? This cannot be undone.`)) return;
    notes = notes.filter((x) => x.id !== n.id);
    activeId = null;
    persist();
    el.title.value = '';
    el.surface.innerHTML = '';
    showEditor(false);
    renderList();
    toast('Note deleted');
  }

  /* ---------- toolbar ---------- */
  const exec = (cmd, val = null) => {
    el.surface.focus();
    document.execCommand(cmd, false, val);
    scheduleSave();
  };

  el.toolbar.querySelectorAll('[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    b.addEventListener('click', () => exec(b.dataset.cmd, b.dataset.value || null));
  });
  el.toolbar.querySelectorAll('[data-block]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => exec('formatBlock', `<${b.dataset.block}>`));
  });

  el.clearFmtBtn.addEventListener('mousedown', (e) => e.preventDefault());
  el.clearFmtBtn.addEventListener('click', () => exec('removeFormat'));

  el.checklistBtn.addEventListener('mousedown', (e) => e.preventDefault());
  el.checklistBtn.addEventListener('click', () => {
    exec('insertHTML',
      '<ul class="cklist"><li class="ck"><span class="ckbox" contenteditable="false"></span><span>Task</span></li></ul><p><br></p>');
  });

  /* ---------- images: compress + insert ---------- */
  const readFile = (file) => new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });

  async function toDataURL(file) {
    const raw = await readFile(file);
    if (!raw) return null;
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = raw;
      });
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale >= 1 && file.size < 180 * 1024) return raw; // small enough as-is
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return raw;
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82);
    } catch {
      return raw;
    }
  }

  function insertImageAtCursor(dataUrl) {
    el.surface.focus();
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || !el.surface.contains(sel.anchorNode)) {
      // no caret inside editor → append at end
      const range = document.createRange ? document.createRange() : null;
      if (range && sel) {
        range.selectNodeContents(el.surface);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.surface.insertAdjacentHTML('beforeend', imgHtml(dataUrl));
        scheduleSave();
        return;
      }
    }
    exec('insertHTML', imgHtml(dataUrl));
  }

  const imgHtml = (src) => `<img src="${src}" alt="note image" contenteditable="false" />`;

  async function insertImageFiles(files) {
    let count = 0;
    for (const f of files) {
      if (!f.type || !f.type.startsWith('image/')) continue;
      const url = await toDataURL(f);
      if (url) { insertImageAtCursor(url); count++; }
    }
    if (count) { scheduleSave(); toast(`Imported ${count} image${count > 1 ? 's' : ''}`); }
    updateCounts();
  }

  el.imageBtn.addEventListener('click', () => el.imgInput.click());
  el.imgInput.addEventListener('change', () => {
    insertImageFiles([...el.imgInput.files]);
    el.imgInput.value = '';
  });

  // drag & drop
  ['dragover', 'dragenter'].forEach((ev) => el.surface.addEventListener(ev, (e) => {
    e.preventDefault();
    el.surface.classList.add('dropping');
  }));
  ['dragleave', 'drop'].forEach((ev) => el.surface.addEventListener(ev, (e) => {
    e.preventDefault();
    el.surface.classList.remove('dropping');
  }));
  el.surface.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) insertImageFiles(files);
  });

  // paste images
  el.surface.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      insertImageFiles(files);
    }
  });

  /* ---------- selected image floating bar ---------- */
  function positionImgBar() {
    if (!selectedImg) return;
    const r = selectedImg.getBoundingClientRect();
    el.imgBar.hidden = false;
    el.imgBar.style.top = `${r.bottom + window.scrollY + 8}px`;
    const left = r.left + window.scrollX + r.width / 2 - el.imgBar.offsetWidth / 2;
    el.imgBar.style.left = `${Math.max(10, Math.min(left, document.documentElement.scrollWidth - el.imgBar.offsetWidth - 10))}px`;
  }

  function deselectImg() {
    selectedImg?.classList.remove('img-sel');
    selectedImg = null;
    el.imgBar.hidden = true;
  }

  el.surface.addEventListener('click', (e) => {
    // checklist toggle
    const box = e.target.closest?.('.ckbox');
    if (box) {
      e.preventDefault();
      box.closest('.ck')?.classList.toggle('done');
      scheduleSave();
      return;
    }
    // image select
    if (e.target.tagName === 'IMG') {
      deselectImg();
      selectedImg = e.target;
      selectedImg.classList.add('img-sel');
      positionImgBar();
    } else {
      deselectImg();
    }
  });
  window.addEventListener?.('scroll', deselectImg, { passive: true });
  window.addEventListener?.('resize', deselectImg);

  el.imgDownload.addEventListener('click', () => {
    if (!selectedImg) return;
    const ext = (selectedImg.src || '').startsWith('data:image/png') ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = selectedImg.src;
    a.download = `note-image-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Image exported ⬇');
  });

  el.imgRemove.addEventListener('click', () => {
    if (!selectedImg) return;
    selectedImg.remove();
    deselectImg();
    scheduleSave();
    toast('Image removed');
  });

  el.imgClose.addEventListener('click', deselectImg);

  /* ---------- exports / backup ---------- */
  function download(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  el.exportHtmlBtn.addEventListener('click', () => {
    flushSave();
    const n = active();
    if (!n) return;
    const bg = PASTELS[n.color % PASTELS.length];
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(n.title || 'Note')}</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;background:${bg};color:#1a1d27;margin:0;padding:48px 20px;}
  main{max-width:760px;margin:0 auto;background:#fffdf6;border-radius:16px;padding:36px 40px;box-shadow:0 12px 40px rgba(0,0,0,.12);}
  h1{margin:0 0 18px;font-size:28px;}
  img{max-width:100%;border-radius:10px;}
  .cklist{list-style:none;padding-left:4px;} .ck{display:flex;gap:8px;} .ck.done .ckbox::after{content:"✓";}
  .ckbox{width:16px;height:16px;border:2px solid #444;border-radius:5px;flex-shrink:0;margin-top:4px;text-align:center;font-size:12px;line-height:13px;}
  footer{margin-top:28px;font-size:12px;color:#8a8f98;}
</style></head>
<body><main><h1>${esc(n.title || 'Untitled')}</h1><div>${n.html || '<p><em>Empty note</em></p>'}</div>
<footer>Exported from Pomodoro Notes · ${new Date().toLocaleString()}</footer></main></body></html>`;
    download(`${(n.title || 'note').replace(/[^\w-]+/g, '_')}.html`, new Blob([html], { type: 'text/html' }));
    toast('Note exported as .html (images embedded) ⬇');
  });

  el.backupBtn.addEventListener('click', () => {
    flushSave();
    const payload = { app: 'pomodoro-notes', version: 1, exportedAt: Date.now(), notes };
    download(`pomodoro-notes-backup-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    toast(`Backup exported — ${notes.length} note${notes.length === 1 ? '' : 's'} ⬇`);
  });

  el.importBtn.addEventListener('click', () => el.importInput.click());
  el.importInput.addEventListener('change', async () => {
    const file = el.importInput.files[0];
    el.importInput.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = Array.isArray(data) ? data : data.notes;
      if (!Array.isArray(incoming)) throw new Error('bad format');
      const byId = new Map(notes.map((n) => [n.id, n]));
      let added = 0; let updated = 0;
      for (const raw of incoming) {
        if (!raw || typeof raw !== 'object' || !raw.id) continue;
        const n = {
          id: String(raw.id), title: String(raw.title || '').slice(0, 120),
          html: String(raw.html || ''), color: Number(raw.color) || 0,
          pinned: !!raw.pinned, createdAt: Number(raw.createdAt) || Date.now(),
          updatedAt: Number(raw.updatedAt) || Date.now(),
        };
        const cur = byId.get(n.id);
        if (!cur) { notes.push(n); byId.set(n.id, n); added++; }
        else if (n.updatedAt > cur.updatedAt) { Object.assign(cur, n); updated++; }
      }
      persist();
      renderList();
      toast(`Imported ${added} new, ${updated} updated ✓`);
    } catch {
      toast('⚠️ Could not read that backup file');
    }
  });

  /* ---------- editor events ---------- */
  el.title.addEventListener('input', scheduleSave);
  el.surface.addEventListener('input', () => { scheduleSave(); updateCounts(); });

  el.pinBtn.addEventListener('click', () => {
    const n = active();
    if (!n) return;
    n.pinned = !n.pinned;
    el.pinBtn.classList.toggle('on', n.pinned);
    flushSave(true);
    toast(n.pinned ? '📌 Pinned to top' : 'Unpinned');
  });

  el.deleteBtn.addEventListener('click', deleteNote);
  el.newBtn.addEventListener('click', newNote);
  el.emptyNewBtn.addEventListener('click', newNote);
  el.search.addEventListener('input', renderList);

  document.addEventListener('pagehide', () => flushSave());

  /* ---------- init ---------- */
  showEditor(false);
  renderList();
  if (notes.length) openNote([...notes].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt))[0].id);
})();
