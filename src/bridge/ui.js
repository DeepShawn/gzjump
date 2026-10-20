// DOM side of the game: overlays, HUD, settings and local records.
import {THEMES, BOOLEAN_SETTINGS, MODES} from './constants.js';
import {dateKey, difficultyLevel, hellMultiplier, mythMultiplier, modeName} from './rules.js';
import {game, saved} from './state.js';
import {drawFruitIcon} from './render.js';

export const $ = id => document.getElementById(id);

const PANELS = {home: 'home-screen', pause: 'pause-screen', result: 'result-screen', settings: 'settings-screen', records: 'records-screen'};
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 5L5 9H2V15H5L10 19V5Z"/><path d="M14 8C17 10 17 14 14 16M17 5C22 9 22 15 17 19"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 5L5 9H2V15H5L10 19V5Z"/><path d="M16 9L22 15M22 9L16 15"/></svg>';

let toastTimer = 0;

export function toast(s) { $('toast').textContent = s; $('toast').classList.add('visible'); toastTimer = 2.5; }
export function tickToast(dt) {
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('visible');
}
export function live(s) { $('live').textContent = s; }
export function setHold(s) { $('hold-text').textContent = s; }
export function setChargeFill(ratio) { $('charge-fill').style.width = Math.min(100, ratio * 100) + '%'; }
export function setHolding(on) { document.body.classList.toggle('holding', on); }

// Shows one overlay (or none while playing) and the HUD pieces that fit it.
export function setScreen(next) {
  const {phase} = game;
  game.screen = next;
  for (const [key, id] of Object.entries(PANELS)) $(id).hidden = key !== next;
  $('game-hud').hidden = !(next === null || phase === 'walking' || phase === 'extending' || phase === 'dropping');
  $('control').hidden = !(next === null && (phase === 'ready' || phase === 'extending'));
  $('pause-button').hidden = next !== null || phase === 'dead';
  $('settings-button').hidden = next === null;
  $('footer').hidden = false;
}

// Hides the controls as soon as the fruit starts falling.
export function hideControls() { $('control').hidden = true; $('pause-button').hidden = true; }

export function updateHud() {
  const {score, bridges, mode} = game, d = difficultyLevel(score, mode);
  $('score').textContent = score;
  $('best-score').textContent = Math.max(score, saved.best);
  $('progress').style.width = Math.min(100, bridges / 30 * 100) + '%';
  $('pause-score').textContent = score;
  $('pause-gap').textContent = bridges;
  $('bridge-hint').textContent = mode === 'hell' ? `地狱 ×${hellMultiplier(score)} · 看好下一块路面`
    : mode === 'myth' ? `神话 ×${mythMultiplier(score)} · 预判超远坑距`
    : d > 0 ? `难度 ${Math.round(d * 100)}% · 看好下一块路面` : '看好下一块路面，长按伸板';
}

export function bumpScore() {
  const el = $('score');
  el.classList.remove('bump');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('bump');
}

export function selectModeTab(mode) {
  for (const id of MODES) {
    $('mode-' + id).classList.toggle('active', id === mode);
    $('mode-' + id).setAttribute('aria-selected', String(id === mode));
  }
}

export function updateSettings() {
  $('sound-button').innerHTML = saved.sound ? ICON_SOUND : ICON_MUTE;
  $('sound-button').setAttribute('aria-label', saved.sound ? '关闭音效' : '开启音效');
  for (const k of BOOLEAN_SETTINGS) $('setting-' + k).setAttribute('aria-checked', String(saved[k]));
  $('setting-time').value = saved.time;
  document.body.classList.toggle('beta-ui', saved.beta);
  $('weather').textContent = `${THEMES[saved.time].label} · 海风平静，适合搭路`;
}

export function renderRecords() {
  const list = $('records-list');
  if (!saved.records.length) list.textContent = '还没有搭路纪录，先去跨过第一个坑吧。';
  else list.replaceChildren(...saved.records.slice(0, 6).flatMap((r, i) => [
    ...(i ? [document.createElement('br')] : []),
    `第 ${i + 1} 次　${r.score} 分 · ${r.bridges} 块路面 · ${modeName(r.mode)}`
  ]));
  $('records-best').textContent = saved.best;
  $('records-runs').textContent = saved.runs;
}

function resultCopy({score, mode}) {
  if (score === 0) return '先试着搭一块短板。';
  if (mode === 'myth') return '神话航线只给最精准的果子。';
  if (score < 8) return '木板长度还可以再稳一点。';
  if (score >= 25) return '这条路已经搭得很远了。';
  return '下一块路面还在前面。';
}

export function fillResult() {
  const {score, mode} = game;
  $('result-score').textContent = score;
  $('result-bridges').textContent = game.bridges;
  $('result-perfect').textContent = game.perfectHits;
  $('result-best').textContent = saved.best;
  $('new-best').hidden = score <= game.bestBefore;
  $('result-mode-label').textContent = mode === 'daily' ? 'DAILY BRIDGE · ' + dateKey()
    : mode === 'hell' ? `HELL BRIDGE · ×${hellMultiplier(score)}`
    : mode === 'myth' ? `MYTH BRIDGE · ×${mythMultiplier(score)}` : 'ENDLESS BRIDGE';
  $('result-copy').textContent = resultCopy(game);
  drawFruitIcon($('result-fruit'));
}
