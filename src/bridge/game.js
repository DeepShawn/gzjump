// Run lifecycle and the board state machine.
import {TAU, BOARD_START, BOARD_GROWTH, DROP_TIME, WALK_TIME, FALL_TIME, PLAYER_START_X, FIRST_PLATFORM_WIDTH, PLATFORMS_AHEAD, PLATFORM_COLORS} from './constants.js';
import {createRng, runSeed, lerp, difficultyLevel, nextGap, platformWidth, boardMax, judgeLanding, bridgePoints, modeName} from './rules.js';
import {game, view, saved, audio, persist, currentPlatform, targetPlatform, pivotX, boardEnd} from './state.js';
import {addRun} from './storage.js';
import {setScreen, setHold, setChargeFill, setHolding, hideControls, updateHud, bumpScore, live, fillResult, tickToast} from './ui.js';
import {fallX} from './render.js';
import {prepareUpload} from './upload.js';

function vibrate(p) { if (saved.haptic && navigator.vibrate) try { navigator.vibrate(p); } catch (_) {} }

// Arguments are evaluated before the phase roll, so each platform consumes
// rng() as gap → width → phase. Keep that order: it defines the daily route.
function buildPlatform(left, width, index) {
  return {left, width, index, phase: game.rng() * TAU, born: game.worldTime, color: PLATFORM_COLORS[index % PLATFORM_COLORS.length]};
}

function appendPlatform() {
  const {rng, mode} = game, last = game.platforms[game.platforms.length - 1], d = difficultyLevel(game.score, mode);
  game.platforms.push(buildPlatform(last.left + last.width + nextGap(rng, mode, d), platformWidth(rng, mode, d), last.index + 1));
}

function ensurePlatforms() { while (game.platforms.length < game.bridges + PLATFORMS_AHEAD) appendPlatform(); }

export function resetRun(mode = game.mode) {
  Object.assign(game, {
    mode, rng: createRng(runSeed(mode)), worldTime: 0,
    score: 0, bridges: 0, perfectHits: 0, bestBefore: saved.best,
    playerX: PLAYER_START_X, camera: 0, board: null, particles: [], phase: 'ready',
    runStart: performance.now(), runRecorded: false
  });
  game.fall.time = 0;
  game.impact.time = 1;
  setHolding(false);
  game.platforms = [buildPlatform(0, FIRST_PLATFORM_WIDTH, 0)];
  ensurePlatforms();
  updateHud();
  setScreen(null);
  live(`${modeName(mode)}${mode === 'daily' ? '挑战' : '模式'}开始。长按伸长木板，松手搭路。`);
}

// Press: the board starts growing upright from the platform's edge.
export function beginExtend() {
  const target = targetPlatform();
  if (game.screen !== null || game.phase !== 'ready' || !target) return false;
  audio.init();
  game.phase = 'extending';
  setHolding(true);
  game.board = {length: BOARD_START, max: boardMax(game.mode, target.left - pivotX(), target.width)};
  setHold('继续按住，木板会变长');
  setChargeFill(0);
  return true;
}

// Release: the board swings down.
export function releaseBoard() {
  if (game.phase !== 'extending' || !game.board) return;
  setHolding(false);
  game.phase = 'dropping';
  game.dropTime = 0;
  setHold('咣当——木板落下');
  audio.beep('drop');
  vibrate(12);
}

function spawnImpact(x, kind) {
  const {rng} = game, success = kind === 'success';
  const palette = success ? ['#f5d27a', '#f4f7d4', '#8bc795'] : ['#8fc6bf', '#e8f3d7', '#6d9da0'];
  Object.assign(game.impact, {time: 0, x, kind});
  game.particles = [];
  for (let i = 0; i < (success ? 10 : 7); i++) {
    const a = rng() * TAU, s = success ? 35 + rng() * 80 : 20 + rng() * 48;
    game.particles.push({x, y: view.roadY - 2 * view.scale, vx: Math.cos(a) * s, vy: -25 - rng() * 55, life: .35 + rng() * .35, max: .7, size: 2 + rng() * 3, color: palette[i % palette.length]});
  }
}

// The board has landed: either the fruit walks across or it drops into the pit.
function settleBoard() {
  const {board} = game, end = boardEnd(), {ok, perfect} = judgeLanding(end, targetPlatform());
  board.landEnd = end;
  if (!ok) {
    game.phase = 'falling';
    Object.assign(game.fall, {time: 0, startX: pivotX() - 10, targetX: end, rotation: (game.rng() - .5) * .7});
    spawnImpact(end, 'fall');
    audio.beep('bad');
    vibrate([22, 35, 55]);
    setHold('糟糕，掉进深坑了…');
    hideControls();
    return;
  }
  board.perfect = perfect;
  spawnImpact(end, 'success');
  game.phase = 'walking';
  game.walkTime = 0; game.walkStart = pivotX() - 10; game.walkEnd = end;
  audio.beep('good');
  vibrate(perfect ? [12, 25, 12] : 10);
  setHold(perfect ? '正中靶心，果子过桥！' : '果子正在过桥…');
}

function finishWalk() {
  const precise = !!game.board?.perfect;
  game.bridges++;
  game.score += bridgePoints(precise);
  if (precise) game.perfectHits++;
  game.playerX = game.board?.landEnd ?? boardEnd();
  game.board = null;
  game.phase = 'ready';
  ensurePlatforms();
  updateHud();
  setHold(precise ? '靶心命中！下一块和下下块都看得到' : '下一块和下下块都看得到');
  bumpScore();
}

function recordRun() {
  if (game.runRecorded) return;
  game.runRecorded = true;
  addRun(saved, {score: game.score, bridges: game.bridges, perfect: game.perfectHits, mode: game.mode, date: new Date().toISOString()});
  persist();
}

function showResult() {
  recordRun();
  fillResult();
  prepareUpload();
  setScreen('result');
}

export function step(dt) {
  game.worldTime += dt;
  tickToast(dt);
  for (const p of game.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 145 * dt; }
  if (game.impact.time <= 1) game.impact.time += dt;
  if (game.screen !== null) return;
  switch (game.phase) {
    case 'extending':
      game.board.length = Math.min(game.board.max, game.board.length + dt * BOARD_GROWTH);
      setChargeFill(game.board.length / game.board.max);
      break;
    case 'dropping':
      if ((game.dropTime += dt) >= DROP_TIME) settleBoard();
      break;
    case 'walking':
      if ((game.walkTime += dt) >= WALK_TIME) finishWalk();
      break;
    case 'falling':
      if ((game.fall.time += dt) >= FALL_TIME) { game.playerX = fallX(); game.phase = 'dead'; showResult(); }
      break;
  }
  game.camera = lerp(game.camera, Math.max(0, currentPlatform().left - 60), 1 - Math.exp(-dt * 4));
}

export function pause() {
  if (game.screen !== null || game.phase === 'dead') return;
  setScreen('pause');
  document.getElementById('pause-close').focus();
}

export function resume() {
  if (game.screen !== 'pause') return false;
  setScreen(null);
  return true;
}

export function goHome() { setScreen('home'); }
