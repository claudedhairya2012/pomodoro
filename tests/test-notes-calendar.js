/* Notes, Calendar and auth tests: run with `node tests/test-notes-calendar.js` */
'use strict';
const assert = require('assert');
const { createEnv } = require('./shim');

const modPath = (f) => require.resolve(f);
const freshRequire = (f) => {
  delete require.cache[modPath(f)];
  return require(f);
};

async function testAuth() {
  // --- guard: app page without unlock → redirected to lock ---
  {
    const env = createEnv();
    const redirects = [];
    global.location = { replace: (u) => redirects.push(u), href: '' };
    require('../auth.js'); // page not "lock", sessionStorage empty
    assert.deepStrictEqual(redirects, ['index.html'], 'unlocked guard redirects');
  }

  // --- lock screen: wrong PIN, backspace, correct PINs route correctly ---
  {
    const env = createEnv();
    global.location = { replace: () => {}, href: '' };
    env.body.dataset.page = 'lock';
    freshRequire('../auth.js');

    env.fireDoc('keydown', { key: '9' });
    env.fireDoc('keydown', { key: '9' });
    env.fireDoc('keydown', { key: 'Enter' });
    assert.strictEqual(env.q('#lockErr').textContent, 'Wrong PIN — try again', 'wrong PIN rejected');

    // digits + backspace + submit: 1234 → calendar
    for (const k of ['1', '2', '3', '4']) env.fireDoc('keydown', { key: k });
    env.fireDoc('keydown', { key: 'Backspace' }); // → 123
    env.fireDoc('keydown', { key: '4' });         // → 1234
    env.fireDoc('keydown', { key: 'Enter' });
    await env.sleep(300);
    assert.strictEqual(global.location.href, 'calendar.html', '1234 → calendar');
    assert.strictEqual(env.q('#lockErr').textContent, '');
  }

  // --- lock screen: 123 → timer, 12345 → notes ---
  {
    const env = createEnv();
    global.location = { replace: () => {}, href: '' };
    env.body.dataset.page = 'lock';
    freshRequire('../auth.js');
    for (const k of '123') env.fireDoc('keydown', { key: k });
    env.fireDoc('keydown', { key: 'Enter' });
    await env.sleep(300);
    assert.strictEqual(global.location.href, 'timer.html', '123 → timer');
  }
  {
    const env = createEnv();
    global.location = { replace: () => {}, href: '' };
    env.body.dataset.page = 'lock';
    freshRequire('../auth.js');
    for (const k of '12345') env.fireDoc('keydown', { key: k });
    env.fireDoc('keydown', { key: 'Enter' });
    await env.sleep(300);
    assert.strictEqual(global.location.href, 'notes.html', '12345 → notes');
  }
  console.log('✅ test-auth passed');
}

async function testNotes() {
  const env = createEnv({ hour: 10 });
  freshRequire('../notes.js');
  const { q, mem, sleep } = env;

  assert.strictEqual(q('#notesEmpty').hidden, false, 'empty state visible');
  assert.strictEqual(q('#editorWrap').hidden, true);

  // create a note
  q('#newBtn').dispatch('click');
  assert.strictEqual(q('#editorWrap').hidden, false);
  assert.strictEqual(JSON.parse(mem.get('pomo.notes')).length, 1);

  // type title + body → debounced autosave
  q('#noteTitle').value = 'Groceries';
  q('#noteTitle').dispatch('input');
  q('#noteEditor').innerHTML = '<p>Milk, eggs</p>';
  q('#noteEditor').textContent = 'Milk, eggs';
  q('#noteEditor').dispatch('input');
  await sleep(700);
  let notes = JSON.parse(mem.get('pomo.notes'));
  assert.strictEqual(notes[0].title, 'Groceries');
  assert.ok(notes[0].html.includes('Milk'), 'body saved');
  assert.ok(q('#counts').textContent.includes('2 words'), `counts: ${q('#counts').textContent}`);

  // second note + search filter
  q('#newBtn').dispatch('click');
  q('#noteTitle').value = 'Book ideas';
  q('#noteTitle').dispatch('input');
  await sleep(700);
  assert.strictEqual(JSON.parse(mem.get('pomo.notes')).length, 2);
  q('#searchInput').value = 'grocer';
  q('#searchInput').dispatch('input');
  assert.strictEqual(q('#noteList').children.length, 1, 'search filters list');
  q('#searchInput').value = '';
  q('#searchInput').dispatch('input');
  assert.strictEqual(q('#noteList').children.length, 2);

  // pin active note (Book ideas) → persisted
  q('#pinBtn').dispatch('click');
  assert.strictEqual(
    JSON.parse(mem.get('pomo.notes')).find((n) => n.title === 'Book ideas').pinned,
    true, 'pinned persisted'
  );

  // colours: 8 swatches, click 4th → persisted
  assert.strictEqual(q('#swatches').children.length, 8);
  q('#swatches').children[3].dispatch('click');
  assert.strictEqual(
    JSON.parse(mem.get('pomo.notes')).find((n) => n.title === 'Book ideas').color,
    3, 'colour persisted'
  );

  // export backup (no crash)
  q('#backupBtn').dispatch('click');
  await sleep(10);

  // import merges a backup: new note added + newer versions overwrite
  const backup = {
    app: 'pomodoro-notes',
    notes: [
      { id: 'ext1', title: 'From backup', html: '<p>hi</p>', color: 2, pinned: false, createdAt: 1, updatedAt: 5 },
      ...JSON.parse(mem.get('pomo.notes')).map((n) => ({ ...n, title: `${n.title}!`, updatedAt: n.updatedAt + 5000 })),
    ],
  };
  q('#importInput').files = [{ text: async () => JSON.stringify(backup) }];
  q('#importInput').dispatch('change');
  await sleep(50);
  notes = JSON.parse(mem.get('pomo.notes'));
  assert.strictEqual(notes.length, 3, 'import added one external note');
  assert.ok(notes.find((n) => n.title === 'Groceries!'), 'newer version overwrote existing');

  // delete active note
  const before = notes.length;
  q('#deleteBtn').dispatch('click');
  assert.strictEqual(JSON.parse(mem.get('pomo.notes')).length, before - 1, 'note deleted');

  console.log('✅ test-notes passed');
}

async function testCalendar() {
  const env = createEnv({ hour: 10 });
  env.now = Date.UTC(2026, 8, 18, 10, 0, 0); // sandbox "today" = 2026-09-18
  env.mem.set('pomo.stats', JSON.stringify({ '2026-09-18': { count: 3, sec: 4500 } }));
  freshRequire('../calendar.js');
  const { q, mem } = env;

  // 42-cell month grid for September 2026
  assert.strictEqual(q('#calGrid').children.length, 42, '6-week grid');
  assert.strictEqual(q('#calTitle').textContent, 'September 2026');
  assert.ok(q('#dayTitle').textContent.includes('Sep 18, 2026'), `day title: ${q('#dayTitle').textContent}`);
  assert.ok(q('#dayStats').textContent.includes('🍅 3'), 'stats from timer app visible');

  // add an event
  q('#eventTitle').value = 'Team meeting';
  q('#eventTime').value = '09:00';
  q('#eventForm').dispatch('submit');
  const events = JSON.parse(mem.get('pomo.events'));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].title, 'Team meeting');
  assert.strictEqual(events[0].date, '2026-09-18');
  assert.strictEqual(q('#eventList').children.length, 1);
  assert.strictEqual(q('#upcomingList').children.length, 1, 'shows in upcoming');

  // navigate months
  q('#prevBtn').dispatch('click');
  assert.strictEqual(q('#calTitle').textContent, 'August 2026');
  q('#nextBtn').dispatch('click');
  q('#nextBtn').dispatch('click');
  assert.strictEqual(q('#calTitle').textContent, 'October 2026');
  q('#todayBtn').dispatch('click');
  assert.strictEqual(q('#calTitle').textContent, 'September 2026');

  // click another day → selection moves
  q('#calGrid').children[0].dispatch('click');
  assert.ok(q('#dayTitle').textContent.includes('Aug 30, 2026'), `sel: ${q('#dayTitle').textContent}`);
  assert.strictEqual(q('#dayStats').textContent, 'No pomodoros logged this day.');

  // today button re-selects today
  q('#todayBtn').dispatch('click');
  assert.ok(q('#dayTitle').textContent.includes('Sep 18'));

  // delete the event
  q('#eventList').children[0].children[2].dispatch('click');
  assert.strictEqual(JSON.parse(mem.get('pomo.events')).length, 0);
  assert.strictEqual(q('#dayEmpty').hidden, false, 'empty note shown after delete');

  console.log('✅ test-calendar passed');
}

(async () => {
  await testAuth();
  await testNotes();
  await testCalendar();
  console.log('🎉 all notes/calendar/auth tests passed');
  process.exit(0);
})().catch((e) => { console.error('❌', e.stack); process.exit(1); });
