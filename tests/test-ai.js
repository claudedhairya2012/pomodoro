/* Smart Routine (AI coach) tests: run with `node tests/test-ai.js` */
'use strict';
const assert = require('assert');
const { createEnv } = require('./shim');

const env = createEnv({ hour: 10 }); // deterministic morning bucket (no bonus/penalty)
require('../app.js');

const { q, mem, body, advance, sleep } = env;
const aiState = () => JSON.parse(mem.get('pomo.ai'));

(async () => {
  assert.strictEqual(q('#timeDisplay').textContent, '25:00');

  /* toggle on — plan seeds from manual settings */
  q('#aiToggle').dispatch('click');
  assert.strictEqual(aiState().enabled, true);
  assert.strictEqual(aiState().plan.focus, 25);

  /* focus #1 → cema 0.825 → +1m → 26; break auto-starts */
  q('#startBtn').dispatch('click');
  advance(40);
  await sleep(300);
  assert.strictEqual(aiState().plan.focus, 26, 'focus nudged +1 after strong start');
  assert.strictEqual(aiState().consec, 1);
  assert.strictEqual(body.dataset.mode, 'short');
  advance(6);
  await sleep(300);
  assert.strictEqual(body.dataset.mode, 'focus', 'break finished');

  /* cycles 2-3 (26m, 27m) → plan 29 */
  for (const dur of [26, 27]) {
    q('#startBtn').dispatch('click');
    advance(dur + 6);
    await sleep(300);
    advance(6);
    await sleep(300);
  }
  assert.strictEqual(aiState().plan.focus, 29, 'streak raises focus to 29');
  assert.strictEqual(aiState().consec, 3);

  /* cycle 4 → due long break (15m), no fatigue bonus */
  q('#startBtn').dispatch('click');
  advance(31);
  await sleep(300);
  assert.strictEqual(body.dataset.mode, 'long');
  assert.strictEqual(q('#timeDisplay').textContent, '15:00');
  assert.strictEqual(aiState().plan.focus, 31);

  /* skip long break while fresh → trimmed to 14m, fatigue persists */
  q('#skipBtn').dispatch('click');
  assert.strictEqual(aiState().plan.long, 14, 'long break trimmed after skip');
  assert.strictEqual(aiState().consec, 4);
  assert.strictEqual(body.dataset.mode, 'focus');

  /* cycle 5 (31 plan + 1 bucket bonus = 32m) → short break */
  q('#startBtn').dispatch('click');
  advance(32);
  await sleep(300);
  assert.strictEqual(body.dataset.mode, 'short');
  advance(7);
  await sleep(300);
  assert.strictEqual(aiState().plan.focus, 33);
  assert.strictEqual(aiState().consec, 5);

  /* cycle 6 → consec 6 ≥ interval+2 → forced long break with +5m */
  q('#startBtn').dispatch('click');
  advance(35);
  await sleep(300);
  assert.strictEqual(body.dataset.mode, 'long', 'fatigue forces a long break');
  assert.strictEqual(q('#timeDisplay').textContent, '19:00', '14m plan + 5m fatigue bonus');
  advance(21);
  await sleep(300);
  assert.strictEqual(aiState().consec, 0, 'fatigue cleared by completed long break');
  assert.strictEqual(body.dataset.mode, 'focus');

  /* abandon a focus 5/36 in → −3m focus, +1m short */
  q('#startBtn').dispatch('click');
  advance(5);
  await sleep(300); // let a tick pass, like a real user moment
  q('#skipBtn').dispatch('click');
  assert.strictEqual(aiState().plan.focus, 32, 'abandon drops focus');
  assert.strictEqual(aiState().plan.short, 6, 'break lengthened after abandon');
  assert.strictEqual(body.dataset.mode, 'short');

  /* skip fresh short break → trimmed back to 5m */
  advance(0.5);
  q('#skipBtn').dispatch('click');
  assert.strictEqual(aiState().plan.short, 5);
  assert.strictEqual(body.dataset.mode, 'focus');

  /* goal stepper, trend UI, toggle off restores manual timings */
  q('#goalPlus').dispatch('click');
  assert.strictEqual(aiState().goal, 9);
  assert.ok(q('#aiTrend').textContent.includes('%'));
  q('#aiToggle').dispatch('click');
  assert.strictEqual(aiState().enabled, false);
  assert.strictEqual(q('#timeDisplay').textContent, '25:00', 'manual settings restored');

  /* persistence round-trip: re-enable keeps learned plan */
  q('#aiToggle').dispatch('click');
  assert.strictEqual(aiState().plan.focus, 32, 'learned plan survives reload');

  console.log('✅ test-ai passed');
  process.exit(0);
})().catch((e) => { console.error('❌', e.stack); process.exit(1); });
