import test from 'node:test';
import assert from 'node:assert/strict';
import {createRng, hashSeed, runSeed, difficultyLevel, hellMultiplier, mythMultiplier, nextGap, platformWidth, boardMax, judgeLanding, bridgePoints, uploadMode} from '../src/bridge/rules.js';
import {parseSave, addRun} from '../src/bridge/storage.js';

test('daily seed and rng are deterministic', () => {
  assert.equal(runSeed('daily', '2026-10-20'), hashSeed('fruit-bridge:2026-10-20'));
  const a = createRng(123), b = createRng(123);
  const xs = Array.from({length: 5}, a);
  assert.deepEqual(xs, Array.from({length: 5}, b));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

test('difficulty stays flat for 300 points in endless and ramps in hell and myth', () => {
  assert.equal(difficultyLevel(300, 'endless'), 0);
  assert.ok(difficultyLevel(301, 'daily') > 0);
  assert.equal(difficultyLevel(820, 'endless'), 1);
  assert.equal(hellMultiplier(0), 20); assert.equal(hellMultiplier(1000), 100);
  assert.equal(mythMultiplier(0), 200); assert.equal(mythMultiplier(5000), 1000);
  assert.equal(difficultyLevel(0, 'hell'), 0); assert.equal(difficultyLevel(240, 'hell'), 1);
});

test('generated gaps and widths respect each mode minimum', () => {
  const rng = createRng(7);
  for (const mode of ['endless', 'hell', 'myth']) for (const d of [0, .5, 1]) for (let i = 0; i < 200; i++) {
    assert.ok(nextGap(rng, mode, d) >= 5);
    assert.ok(platformWidth(rng, mode, d) >= {endless: 38, hell: 28, myth: 12}[mode]);
  }
  // Every mode draws the same number of rng values per gap.
  const counts = ['endless', 'hell', 'myth'].map(mode => { let n = 0; const r = () => (n++, .5); nextGap(r, mode, 1); return n; });
  assert.deepEqual(counts, [3, 5, 5]);
});

test('board length is capped per mode', () => {
  assert.equal(boardMax('endless', 10, 50), 170);
  assert.equal(boardMax('endless', 2000, 50), 760);
  assert.equal(boardMax('hell', 2000, 50), 980);
  assert.equal(boardMax('myth', 3000, 50), 2200);
});

test('landing needs 8px inside the target; the centre band is a bullseye', () => {
  const target = {left: 100, width: 100};
  assert.deepEqual(judgeLanding(107, target), {ok: false, perfect: false});
  assert.deepEqual(judgeLanding(108, target), {ok: true, perfect: false});
  assert.deepEqual(judgeLanding(150, target), {ok: true, perfect: true});
  assert.deepEqual(judgeLanding(193, target), {ok: false, perfect: false});
  assert.deepEqual(judgeLanding(150, undefined), {ok: false, perfect: false});
  assert.equal(bridgePoints(false), 1); assert.equal(bridgePoints(true), 2);
});

test('upload modes match the Edge Function', () => {
  assert.deepEqual(['endless', 'daily', 'hell', 'myth'].map(uploadMode), ['bridge_endless', 'bridge_daily', 'bridge_endless', 'bridge_myth']);
});

test('saves are sanitised and keep the 20 newest runs', () => {
  const saved = parseSave('{"sound":0,"time":"noon","best":"-4","runs":"x","records":{}}');
  assert.equal(saved.sound, false); assert.equal(saved.time, 'day'); assert.equal(saved.best, 0); assert.equal(saved.runs, 0); assert.deepEqual(saved.records, []);
  assert.equal(parseSave('not json').guides, true);
  for (let i = 0; i < 25; i++) addRun(saved, {score: i, bridges: i, perfect: 0, mode: 'endless', date: ''});
  assert.equal(saved.runs, 25); assert.equal(saved.best, 24); assert.equal(saved.records.length, 20); assert.equal(saved.records[0].score, 24);
});
