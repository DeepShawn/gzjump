// 果子搭路 · Fruit Bridge — entry point: input, buttons and the frame loop.
// Hold to grow a board, release to drop it across the pit.
import {game, saved, persist, audio} from './state.js';
import {initRenderer, resize, render} from './render.js';
import {$, setScreen, updateSettings, selectModeTab, renderRecords, toast} from './ui.js';
import {resetRun, beginExtend, releaseBoard, step, pause, resume, goHome} from './game.js';
import {uploadScore} from './upload.js';

const canvas = $('bridge-canvas');

function start() {
  if (!initRenderer(canvas)) return;
  let last = 0, pointerId = null, keyHeld = false;

  function frame(t) {
    const dt = Math.min(.05, last ? (t - last) / 1000 : 1 / 60);
    last = t;
    if (!document.hidden) { step(dt); render(); }
    requestAnimationFrame(frame);
  }
  const resumeGame = () => { if (resume()) last = performance.now(); };
  const leaveToHop = () => { location.href = 'index.html'; };

  // Pointer: press grows the board, release (or losing the pointer) drops it.
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!beginExtend()) return;
    e.preventDefault();
    pointerId = e.pointerId ?? 'touch';
    if (canvas.setPointerCapture && e.pointerId !== undefined) try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const pointerUp = e => {
    if (pointerId === null || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
    pointerId = null;
    releaseBoard();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, pointerUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('blur', () => {
    if (pointerId !== null) { pointerId = null; releaseBoard(); }
    if (keyHeld) { keyHeld = false; releaseBoard(); }
  });

  // Keyboard: Space holds, Esc / P pauses. Typing in the nickname field is left alone.
  const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '');
  addEventListener('keydown', e => {
    if (typing(e)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && !keyHeld) { keyHeld = true; beginExtend(); }
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (game.screen === null) pause();
      else if (game.screen === 'pause') resumeGame();
      else if (game.screen === 'settings' || game.screen === 'records') goHome();
    }
  });
  addEventListener('keyup', e => {
    if (e.code !== 'Space' || typing(e)) return;
    e.preventDefault();
    keyHeld = false;
    releaseBoard();
  });
  addEventListener('resize', resize);
  addEventListener('visibilitychange', () => { if (document.hidden && game.screen === null) pause(); });

  // Buttons.
  const on = (id, fn) => $(id).addEventListener('click', fn);
  on('start-button', () => resetRun());
  on('retry-button', () => resetRun());
  on('restart-button', () => resetRun());
  on('pause-button', pause);
  on('resume-button', resumeGame);
  on('pause-close', resumeGame);
  on('pause-home', goHome);
  on('result-home', goHome);
  on('home-button', leaveToHop);
  on('settings-button', () => { if (game.screen === null) pause(); setScreen('settings'); });
  on('records-button', () => { renderRecords(); setScreen('records'); });
  on('help-button', () => toast('长按伸长木板，松手让它咣当落下。让木板末端落在下一块路面上，果子就会自动走过去。'));
  on('bridge-upload', () => void uploadScore(false));
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', goHome);
  for (const id of ['endless', 'daily', 'hell', 'myth']) on('mode-' + id, () => { game.mode = id; selectModeTab(id); });

  // Settings.
  const toggle = (key, after) => () => { saved[key] = !saved[key]; persist(); updateSettings(); after?.(); };
  on('sound-button', toggle('sound', () => { if (saved.sound) audio.beep('good'); }));
  on('setting-sound', toggle('sound'));
  on('setting-haptic', toggle('haptic'));
  on('setting-guides', toggle('guides'));
  on('setting-beta', toggle('beta', () => render(0)));
  $('setting-time').addEventListener('change', e => { saved.time = e.target.value; persist(); updateSettings(); render(0); });

  resize();
  updateSettings();
  resetRun();
  setScreen('home');
  requestAnimationFrame(frame);

  // Read-only diagnostics, only with #debug.
  if (location.hash === '#debug') window.FruitBridgeDebug = Object.freeze({
    state: () => ({screen: game.screen, mode: game.mode, phase: game.phase, score: game.score, bridges: game.bridges, perfectHits: game.perfectHits,
      board: game.board && {...game.board}, platforms: game.platforms.map(p => ({left: p.left, width: p.width, index: p.index, phase: p.phase}))})
  });
}

start();
