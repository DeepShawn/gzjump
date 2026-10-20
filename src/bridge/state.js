// The single mutable state shared by the game, renderer and UI modules.
import {PLAYER_START_X} from './constants.js';
import {createRng} from './rules.js';
import {loadSave, loadFruit, persistSave} from './storage.js';
import {createAudio} from './audio.js';

export const saved = loadSave();
export const fruit = loadFruit();
export const audio = createAudio(saved);
export const persist = () => persistSave(saved);

export const game = {
  // UI flow. screen is home | pause | result | settings | records, or null while playing.
  screen: 'home',
  mode: 'endless',
  // ready → extending → dropping → walking → ready, or dropping → falling → dead.
  phase: 'ready',
  rng: createRng(0),
  platforms: [], score: 0, bridges: 0, perfectHits: 0, bestBefore: 0,
  runStart: 0, runRecorded: false,
  playerX: PLAYER_START_X, camera: 0,
  board: null, // {length, max, landEnd?, perfect?}
  dropTime: 0, walkTime: 0, walkStart: 0, walkEnd: 0,
  fall: {time: 0, startX: 0, targetX: 0, rotation: 0},
  impact: {time: 1, x: 0, kind: 'success'},
  particles: [],
  worldTime: 0
};

// Viewport metrics, set by the renderer on resize.
export const view = {W: 0, H: 0, DPR: 1, scale: 1, roadY: 0};

export const currentPlatform = () => game.platforms[game.bridges] || game.platforms[0];
export const targetPlatform = () => game.platforms[game.bridges + 1];
export const pivotX = () => { const p = currentPlatform(); return p.left + p.width; };
export const boardEnd = () => pivotX() + (game.board?.length || 0);
export const isFalling = () => game.phase === 'falling' || game.phase === 'dead';
