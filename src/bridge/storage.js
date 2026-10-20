// Settings, best score and recent runs, stored flat in one localStorage blob.
import {STORAGE_KEY, HOP_STORAGE_KEY, DEFAULT_SETTINGS, BOOLEAN_SETTINGS, THEMES, FRUIT_COLORS} from './constants.js';

export function parseSave(raw) {
  let saved = {...DEFAULT_SETTINGS, best: 0, runs: 0, records: []};
  try { const o = JSON.parse(raw || 'null'); if (o) saved = {...saved, ...o}; } catch (_) {}
  for (const k of BOOLEAN_SETTINGS) saved[k] = !!saved[k];
  if (!THEMES[saved.time]) saved.time = 'day';
  saved.best = Math.max(0, Number(saved.best) || 0);
  saved.runs = Math.max(0, Number(saved.runs) || 0);
  if (!Array.isArray(saved.records)) saved.records = [];
  return saved;
}

// Newest first, capped at 20.
export function addRun(saved, record) {
  saved.runs++;
  saved.best = Math.max(saved.best, record.score);
  saved.records.unshift(record);
  saved.records = saved.records.slice(0, 20);
}

export function readItem(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
export function writeItem(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }

export const loadSave = () => parseSave(readItem(STORAGE_KEY));
export const persistSave = saved => writeItem(STORAGE_KEY, JSON.stringify(saved));

// The fruit picked in Fruit Hop also walks the bridge.
export function loadFruit() {
  try {
    const fruit = JSON.parse(readItem(HOP_STORAGE_KEY) || '{}')?.settings?.fruit;
    return FRUIT_COLORS[fruit] ? fruit : 'orange';
  } catch (_) { return 'orange'; }
}
