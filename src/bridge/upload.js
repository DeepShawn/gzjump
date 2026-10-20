// Optional cloud score upload through the gzjump-submit Edge Function.
// Signed-in players (session shared with Fruit Hop) upload automatically.
import {AUTH_SESSION_KEY, PLAYER_NAME_KEY, DEVICE_ID_KEY} from './constants.js';
import {dateKey, uploadMode} from './rules.js';
import {readItem, writeItem} from './storage.js';
import {game, fruit} from './state.js';
import {$} from './ui.js';

let completed = null, uploading = false;
const setStatus = s => { $('bridge-upload-status').textContent = s; };

function authSession() {
  try { return JSON.parse(readItem(AUTH_SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function deviceId() {
  let id = readItem(DEVICE_ID_KEY);
  if (!id) { id = crypto.randomUUID(); writeItem(DEVICE_ID_KEY, id); }
  return id;
}

// Snapshot the finished run and prefill the nickname.
export function prepareUpload() {
  const session = authSession(), email = session?.user?.email;
  const fallback = email?.includes('@') ? email.slice(0, email.indexOf('@')).slice(0, 20) : '搭路玩家';
  $('bridge-player-name').value = readItem(PLAYER_NAME_KEY) || fallback;
  completed = {
    id: crypto.randomUUID(), score: game.score, jumps: game.bridges, perfect: game.perfectHits,
    combo: game.perfectHits ? 1 : 0, mode: uploadMode(game.mode), day: dateKey(), fruit,
    duration_ms: Math.max(600, Math.round(performance.now() - game.runStart)), assist: false, device_id: deviceId()
  };
  $('bridge-upload').disabled = false;
  $('bridge-upload').textContent = '上传成绩';
  setStatus(session?.access_token ? '已登录，正在自动上传成绩…' : '输入昵称后可以上传，游客成绩需要管理员审核。');
  if (session?.access_token) void uploadScore(true);
}

export async function uploadScore(auto = false) {
  if (!completed || uploading) return;
  const player_name = $('bridge-player-name').value.trim();
  if (!player_name || [...player_name].length > 20 || /[\p{Cc}\p{Cf}<>]/u.test(player_name)) { setStatus('请输入 1–20 个字符的昵称。'); return; }
  const config = window.GZJUMP_CONFIG;
  if (!config) { setStatus('上传配置尚未加载，请稍后重试。'); return; }
  const session = authSession(), snapshot = completed;
  uploading = true;
  $('bridge-upload').disabled = true;
  setStatus(auto ? '正在自动上传成绩…' : '正在上传成绩…');
  try {
    const key = config.publishableKey || config.anonKey;
    const r = await fetch(config.url + '/functions/v1/gzjump-submit', {
      method: 'POST',
      headers: {apikey: key, Authorization: 'Bearer ' + (session?.access_token || key), 'Content-Type': 'application/json'},
      body: JSON.stringify({...snapshot, player_name}),
      signal: AbortSignal.timeout(15000)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || '上传失败，请稍后重试');
    writeItem(PLAYER_NAME_KEY, player_name);
    if (completed !== snapshot) return; // a newer run is already on screen
    completed = null;
    $('bridge-upload').textContent = '已上传';
    setStatus(data.status === 'approved' ? '成绩已进入云端榜单。' : '成绩已提交，等待管理员审核。');
  } catch (e) {
    if (completed !== snapshot) return;
    setStatus((auto ? '自动上传失败：' : '') + (e.message || '请检查网络后重试。'));
    $('bridge-upload').disabled = false;
  } finally { uploading = false; }
}
