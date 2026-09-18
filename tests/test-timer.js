/* Timer smoke tests: run with `node tests/test-timer.js` */
'use strict';
const assert = require('assert');
const { createEnv } = require('./shim');

const env = createEnv({ hour: 10 });
require('../app.js');

const { q, body, modeButtons, fireDoc, advance, sleep } = env;

(async () => {
  assert.strictEqual(body.dataset.mode, 'focus');
  assert.strictEqual(q('#timeDisplay').textContent, '25:00');

  // start & tick
  q('#startBtn').dispatch('click');
  advance(5 / 60); // exactly 5s
  await sleep(300);
  assert.strictEqual(q('#timeDisplay').textContent, '24:55');

  // complete focus #1 → short break auto-starts
  advance(30);
  await sleep(300);
  assert.strictEqual(body.dataset.mode, 'short', 'auto-switches to short break');
  let stats = JSON.parse(env.mem.get('pomo.stats'));
  assert.strictEqual(stats.total.count, 1, 'one pomodoro recorded');
  assert.strictEqual(JSON.parse(env.mem.get('pomo.session')).completedFocus, 1);

  // finish break
  advance(6);
  await sleep(300);
  assert.strictEqual(body.dataset.mode, 'focus');

  // tasks
  q('#taskInput').value = 'Write report';
  q('#taskForm').dispatch('submit');
  let tasks = JSON.parse(env.mem.get('pomo.tasks'));
  assert.strictEqual(tasks.length, 1, 'task added');
  q('#taskList').children[0].dispatch('click'); // activate task
  q('#startBtn').dispatch('click');
  advance(30);
  await sleep(300);
  tasks = JSON.parse(env.mem.get('pomo.tasks'));
  assert.strictEqual(tasks[0].count, 1, 'task got a 🍅');
  assert.strictEqual(q('#statToday').textContent, '2');

  // skip break → focus
  q('#skipBtn').dispatch('click');
  assert.strictEqual(body.dataset.mode, 'focus');

  // keyboard shortcuts
  fireDoc('keydown', { key: ' ', target: { matches: () => false, tagName: 'DIV', isContentEditable: false } });
  fireDoc('keydown', { key: 'r', target: { matches: () => false, tagName: 'DIV', isContentEditable: false } });
  assert.strictEqual(q('#timeDisplay').textContent, '25:00', 'R resets');

  // settings
  q('#setFocus').value = '50';
  q('#settingsSave').dispatch('click');
  assert.strictEqual(JSON.parse(env.mem.get('pomo.settings')).focus, 50);
  assert.strictEqual(q('#timeDisplay').textContent, '50:00', 'idle timer picks up new duration');

  // mode buttons
  modeButtons[2].dispatch('click');
  assert.strictEqual(body.dataset.mode, 'long');
  assert.strictEqual(q('#timeDisplay').textContent, '15:00');

  // typing in inputs is ignored
  fireDoc('keydown', { key: ' ', target: { matches: () => true, tagName: 'INPUT', isContentEditable: false } });

  console.log('✅ test-timer passed');
  process.exit(0);
})().catch((e) => { console.error('❌', e.stack); process.exit(1); });
