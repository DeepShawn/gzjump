// Side-view canvas renderer. Reads game state; never changes it.
import {TAU, THEMES, FRUIT_COLORS, DROP_TIME, WALK_TIME, FALL_TIME, LANDING_MARGIN} from './constants.js';
import {clamp, lerp, easeOutCubic, easeInOut, easeOutBack} from './rules.js';
import {game, view, saved, fruit, currentPlatform, targetPlatform, pivotX, boardEnd, isFalling} from './state.js';

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
let canvas, ctx;

export function initRenderer(el) {
  canvas = el;
  ctx = canvas.getContext('2d', {alpha: false, desynchronized: true});
  return !!ctx;
}

export function resize() {
  const W = view.W = innerWidth, H = view.H = innerHeight;
  view.DPR = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * view.DPR); canvas.height = Math.round(H * view.DPR);
  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  view.scale = clamp(Math.min(W / 780, H / 720), .62, 1.2);
  view.roadY = H * (W < 700 ? .68 : .70);
}

const theme = () => THEMES[saved.time] || THEMES.day;
// The camera keeps the fruit a quarter of the way across the screen.
export const worldX = x => view.W * .25 + (x - game.camera) * view.scale;

function drawSky(th) {
  const {W, H} = view;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.sky[0]); g.addColorStop(.42, th.sky[1]); g.addColorStop(.68, th.sky[2]); g.addColorStop(1, th.waterDeep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// Sun or moon gives the scene a clear light source.
function drawCelestial() {
  const {W, H} = view, x = W * .78, y = H * .18, night = saved.time === 'night';
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, night ? 4 : 8, x, y, night ? 110 : 145);
  glow.addColorStop(0, night ? '#d8f1e6cc' : '#fff4c8cc'); glow.addColorStop(.32, night ? '#b7e7df38' : '#ffe8a84d'); glow.addColorStop(1, '#fff1b900');
  ctx.fillStyle = glow; ctx.fillRect(x - 150, y - 150, 300, 300);
  ctx.fillStyle = night ? '#d9f2e4' : '#ffe2a0'; ctx.globalAlpha = night ? .88 : .74;
  ctx.beginPath(); ctx.arc(x, y, night ? 19 : 25, 0, TAU); ctx.fill();
  ctx.restore();
}

// Layered distant shore and mountains.
function drawHills(th, horizon, t) {
  const {W, H} = view;
  ctx.save();
  ctx.fillStyle = th.mountain; ctx.globalAlpha = .34;
  ctx.beginPath(); ctx.moveTo(0, horizon + 28);
  for (let i = 0; i <= 8; i++) { const x = i * W / 8; ctx.quadraticCurveTo(x + W / 16, horizon - 42 - Math.sin(i * 1.7) * 15, x + W / 8, horizon + 28); }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = .5; ctx.fillStyle = th.horizon;
  ctx.beginPath(); ctx.moveTo(0, horizon + 48);
  for (let i = 0; i <= 10; i++) { const x = i * W / 10; ctx.quadraticCurveTo(x + W / 20, horizon + 5 + Math.sin(i * 1.9 + t * .08) * 10, x + W / 10, horizon + 48); }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Soft moving cloud bands.
function drawClouds(th, t) {
  const {W, H} = view;
  ctx.save(); ctx.fillStyle = th.cloud;
  for (let i = 0; i < 4; i++) {
    const x = ((i * 290 + t * 14) % (W + 420)) - 210, y = H * (.24 + i * .055) + Math.sin(t * .25 + i) * 10;
    ctx.beginPath(); ctx.ellipse(x, y, 150, 24, 0, 0, TAU); ctx.ellipse(x + 105, y + 5, 95, 18, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Water below the horizon with repeated perspective glints.
function drawWater(th, horizon, t) {
  const {W, H, scale} = view;
  ctx.save();
  const g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, th.water); g.addColorStop(1, th.waterDeep + 'bb');
  ctx.globalAlpha = .66; ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.globalAlpha = .26; ctx.strokeStyle = '#d4f2e3'; ctx.lineWidth = 1;
  for (let i = 0; i < 11; i++) {
    const y = horizon + 20 * scale + i * 22 * scale + Math.sin(t * .5 + i) * 3;
    const shift = ((t * (8 + i * .7) + i * 63) % (W + 180)) - 90;
    ctx.beginPath(); ctx.moveTo(shift, y); ctx.quadraticCurveTo(shift + 34, y - 4, shift + 70, y); ctx.stroke();
  }
  ctx.restore();
}

function drawBetaRays(t) {
  if (!saved.beta || saved.time === 'night') return;
  const {W, H} = view;
  ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = '#fffbe1'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(W * (.05 + i * .32), H);
    ctx.quadraticCurveTo(W * (.2 + i * .31) + Math.sin(t * .35 + i) * 20, H * .42, W * (.31 + i * .3), 0); ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(t) {
  const th = theme(), horizon = view.H * .48;
  drawSky(th); drawCelestial(); drawHills(th, horizon, t); drawClouds(th, t); drawWater(th, horizon, t); drawBetaRays(t);
}

// The pit between platform p and the next one.
function drawPit(p) {
  const {H, scale, roadY} = view, next = game.platforms[p.index + 1];
  if (!next) return;
  const left = worldX(p.left + p.width), right = worldX(next.left);
  if (right < 0 || left > view.W) return;
  const width = Math.max(1, right - left);
  ctx.save();
  ctx.shadowColor = '#103b4dcc'; ctx.shadowBlur = 18;
  const g = ctx.createLinearGradient(0, roadY, 0, H);
  g.addColorStop(0, '#164c5ee8'); g.addColorStop(.2, '#0d3b53f2'); g.addColorStop(1, '#08283ee8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(left, roadY - 2 * scale); ctx.lineTo(right, roadY - 2 * scale); ctx.lineTo(right, H); ctx.lineTo(left, H); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // Hard vertical pit walls make a narrow gap readable on small screens.
  const wall = Math.min(11 * scale, width * .18), lip = Math.min(5 * scale, width);
  ctx.fillStyle = '#123e52';
  ctx.fillRect(left, roadY - 1 * scale, wall, H - roadY); ctx.fillRect(Math.max(left, right - 11 * scale), roadY - 1 * scale, wall, H - roadY);
  ctx.fillStyle = '#7bc5bd66';
  ctx.fillRect(left, roadY - 3 * scale, lip, H - roadY); ctx.fillRect(Math.max(left, right - 5 * scale), roadY - 3 * scale, lip, H - roadY);
  // Drifting water lines inside the pit, then a bright lip on each edge.
  ctx.globalAlpha = .3; ctx.strokeStyle = '#c4eee1'; ctx.lineWidth = 1;
  for (let i = 0; i < Math.max(2, Math.floor(width / 45)); i++) {
    const y = roadY + 18 * scale + i * 18 * scale, shift = (game.worldTime * (10 + i * 2) + i * 37) % Math.max(width, 1);
    ctx.beginPath(); ctx.moveTo(left + 10 * scale + shift * .2, y); ctx.quadraticCurveTo((left + right) / 2, y - 5 * scale, right - 10 * scale - shift * .15, y + 2 * scale); ctx.stroke();
  }
  ctx.globalAlpha = .8; ctx.strokeStyle = '#efffe0'; ctx.lineWidth = 2 * scale;
  ctx.beginPath(); ctx.moveTo(left, roadY); ctx.quadraticCurveTo(left + width * .12, roadY - 4 * scale, left + width * .25, roadY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(right - width * .25, roadY); ctx.quadraticCurveTo(right - width * .12, roadY - 4 * scale, right, roadY); ctx.stroke();
  ctx.restore();
}

function drawPlatform(p, t) {
  const {W, scale, roadY} = view, {bridges} = game;
  const x = worldX(p.left), w = p.width * scale, h = 40 * scale;
  if (x > W + 100 || x + w < -100) return;
  // New platforms rise into place.
  const reveal = easeOutCubic(clamp((game.worldTime - (p.born ?? 0)) / .52, 0, 1)), lift = (1 - reveal) * 28 * scale;
  ctx.save();
  ctx.globalAlpha = p.index < bridges ? .3 : 1;
  ctx.translate(x, roadY + lift);
  // Deep underside, top slab and a bright rim separate road from the pit.
  ctx.fillStyle = '#193f3c66'; ctx.beginPath(); ctx.roundRect(2 * scale, 12 * scale, w, h, 6 * scale); ctx.fill();
  ctx.fillStyle = '#7d987e'; ctx.fillRect(0, 10 * scale, w, h);
  const top = ctx.createLinearGradient(0, 0, 0, 12 * scale);
  top.addColorStop(0, '#fffde2'); top.addColorStop(1, theme().road);
  ctx.fillStyle = top; ctx.beginPath(); ctx.roundRect(0, 0, w, 13 * scale, 5 * scale); ctx.fill();
  ctx.strokeStyle = '#ffffffd0'; ctx.lineWidth = 1.4 * scale;
  ctx.beginPath(); ctx.moveTo(6 * scale, 2.5 * scale); ctx.lineTo(Math.max(7 * scale, w - 8 * scale), 2.5 * scale); ctx.stroke();
  ctx.strokeStyle = '#476b5b99'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(2 * scale, 13 * scale); ctx.lineTo(Math.max(3 * scale, w - 2 * scale), 13 * scale); ctx.stroke();
  // Paving dents.
  const dents = Math.max(2, Math.floor(p.width / 45));
  ctx.fillStyle = '#557b675e';
  for (let i = 0; i < dents; i++) { ctx.beginPath(); ctx.ellipse((i + .5) * w / dents, 7 * scale, 7 * scale, 1.7 * scale, 0, 0, TAU); ctx.fill(); }
  if (saved.beta && p.index >= bridges) {
    const pulse = .5 + .5 * Math.sin(t * 2.2 + p.phase);
    ctx.globalAlpha = .12 + .08 * pulse; ctx.strokeStyle = '#f4ffd4'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(w / 2, 6 * scale, w * .47 + pulse * 4 * scale, 10 * scale, 0, 0, TAU); ctx.stroke();
  }
  if (saved.guides && (p.index === bridges + 1 || p.index === bridges + 2)) {
    const next = p.index === bridges + 1;
    ctx.globalAlpha = 1; ctx.fillStyle = next ? '#315e4d' : '#617d68';
    ctx.font = `700 ${Math.max(9, 11 * scale)}px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(next ? '下一块' : '下下块', w / 2, -14 * scale);
  }
  ctx.restore();
}

// Dashed line to the target's centre, its safe zone, and the board's tip.
function drawAimGuide(t) {
  if (!saved.guides || game.screen !== null || isFalling()) return;
  const target = targetPlatform();
  if (!target) return;
  const {scale, roadY} = view, {board} = game;
  const tx = worldX(target.left + target.width / 2), px = worldX(pivotX()), end = board ? worldX(boardEnd()) : px;
  ctx.save();
  ctx.globalAlpha = game.phase === 'ready' ? .45 : .7;
  ctx.setLineDash([4 * scale, 7 * scale]); ctx.strokeStyle = '#f6f5ce'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(px, roadY - 7 * scale); ctx.lineTo(tx, roadY - 7 * scale); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = .16; ctx.fillStyle = '#fff4ac';
  ctx.fillRect(worldX(target.left + LANDING_MARGIN), roadY - 2 * scale, Math.max(1, (target.width - LANDING_MARGIN * 2) * scale), 6 * scale);
  ctx.globalAlpha = .9; ctx.strokeStyle = '#fff4ac'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(tx, roadY - 2 * scale, 6 * scale + Math.sin(t * 4) * 1.5 * scale, 0, TAU); ctx.stroke();
  if (board) {
    ctx.globalAlpha = .95; ctx.fillStyle = game.phase === 'extending' ? '#f1c86b' : '#f6f4c9';
    ctx.beginPath(); ctx.arc(end, roadY - 2 * scale, 3.5 * scale, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// The board stands upright while growing, then swings down onto the road.
function drawBoard(t) {
  const {board, phase} = game;
  if (!board || phase === 'ready' || phase === 'dead') return;
  const {scale, roadY} = view;
  let angle = -Math.PI / 2;
  if (phase === 'dropping' || phase === 'walking') angle += Math.PI / 2 * easeOutBack(clamp(game.dropTime / DROP_TIME, 0, 1));
  const len = board.length * scale;
  ctx.save();
  ctx.translate(worldX(pivotX()), roadY + 2 * scale); ctx.rotate(angle);
  ctx.fillStyle = '#9c6b43'; ctx.shadowColor = saved.beta ? '#f1d28caa' : '#3b624c35'; ctx.shadowBlur = saved.beta ? 13 : 6;
  ctx.beginPath(); ctx.roundRect(0, -6 * scale, len, 12 * scale, 4 * scale); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e7bd75'; ctx.fillRect(8 * scale, -3 * scale, len - 16 * scale, 3 * scale);
  ctx.fillStyle = '#74482e';
  for (let i = 0; i < Math.ceil(len / (27 * scale)); i++) ctx.fillRect((19 + i * 27) * scale, -4 * scale, 2 * scale, 8 * scale);
  if (saved.beta) { ctx.fillStyle = '#fff1beaa'; ctx.fillRect(Math.max(8, len - (18 + ((t * 35) % 36)) * scale), -3 * scale, 11 * scale, 2 * scale); }
  ctx.restore();
}

// Fruit centred on the current origin, about 60 units tall.
function drawFruitShape(g) {
  const c = FRUIT_COLORS[fruit] || FRUIT_COLORS.orange;
  const grad = g.createRadialGradient(-9, -15, 2, 8, 8, 34);
  grad.addColorStop(0, c[0]); grad.addColorStop(.52, c[1]); grad.addColorStop(1, c[2]);
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(0, -27);
  g.bezierCurveTo(24, -32, 34, -12, 27, 9); g.bezierCurveTo(21, 27, 6, 31, 0, 29);
  g.bezierCurveTo(-9, 31, -28, 22, -29, 3); g.bezierCurveTo(-34, -14, -18, -31, 0, -27);
  g.fill();
  g.strokeStyle = '#66804d'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(0, -25); g.quadraticCurveTo(-2, -34, 3, -39); g.stroke();
  g.fillStyle = '#5b9860'; g.beginPath(); g.ellipse(10, -35, 10, 4, -.3, 0, TAU); g.fill();
  g.fillStyle = '#414b34'; g.beginPath(); g.ellipse(-9, 2, 2, 3, 0, 0, TAU); g.ellipse(9, 2, 2, 3, 0, 0, TAU); g.fill();
  g.strokeStyle = '#414b34'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 9, 5, .2, Math.PI - .2); g.stroke();
}

// Fruit portrait for the result card.
export function drawFruitIcon(target) {
  const g = target.getContext('2d');
  g.clearRect(0, 0, target.width, target.height);
  g.save(); g.translate(target.width / 2, target.height * .58); g.scale(target.width / 100, target.width / 100);
  drawFruitShape(g);
  g.restore();
}

export function fallX() {
  const {fall} = game;
  return lerp(fall.startX, fall.targetX, easeInOut(clamp(fall.time / FALL_TIME, 0, 1)));
}

// Ripples where the fruit drops into the pit.
function drawFallEffects() {
  if (!isFalling()) return;
  const {scale, roadY} = view, u = clamp(game.fall.time / FALL_TIME, 0, 1), x = worldX(fallX());
  ctx.save(); ctx.globalAlpha = (1 - u) * .65; ctx.strokeStyle = '#efffe5'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x + (i - 1) * 14 * scale, roadY + 15 * scale, 18 * (1 - u) + i * 4, 5 * (1 - u) + i * 1.5, 0, 0, TAU); ctx.stroke(); }
  ctx.restore();
}

// Rings and sparks where the board lands.
function drawImpactEffects() {
  const {impact} = game, {scale, roadY} = view;
  if (impact.time > 1) return;
  const u = clamp(impact.time / .72, 0, 1), x = worldX(impact.x);
  ctx.save();
  ctx.globalAlpha = (1 - u) * .65; ctx.strokeStyle = impact.kind === 'success' ? '#fff0a0' : '#c7f0e2'; ctx.lineWidth = 2 * scale;
  ctx.beginPath(); ctx.ellipse(x, roadY + 5 * scale, (10 + u * 35) * scale, (3 + u * 8) * scale, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = (1 - u) * .45;
  ctx.beginPath(); ctx.ellipse(x, roadY + 5 * scale, (20 + u * 58) * scale, (6 + u * 12) * scale, 0, 0, TAU); ctx.stroke();
  for (const p of game.particles) {
    const q = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = q; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(worldX(p.x), p.y, p.size * scale * q, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer() {
  const {scale, roadY, H} = view, {phase} = game;
  let x = game.playerX, y = roadY - 19 * scale, rot = 0, sx = 1, sy = 1, bob = Math.sin(game.worldTime * 2.2) * 1.5;
  if (phase === 'walking') {
    // Two little hops across the board.
    const q = clamp(game.walkTime / WALK_TIME, 0, 1), hop = Math.max(0, Math.sin(q * Math.PI * 2));
    x = lerp(game.walkStart, game.walkEnd, easeInOut(q));
    y -= hop * 5 * scale; sx = 1 - .06 * hop; sy = 1 + .08 * hop; bob = 0;
  }
  if (isFalling()) {
    const u = clamp(game.fall.time / FALL_TIME, 0, 1);
    x = fallX(); y = roadY - 19 * scale + Math.pow(u, 1.5) * H * .33;
    rot = game.fall.rotation * u * 5; sx = 1 + .12 * u; sy = 1 - .18 * u; bob = 0;
  }
  ctx.save();
  ctx.globalAlpha = isFalling() ? 1 - clamp(game.fall.time / .92, 0, 1) * .35 : 1;
  ctx.translate(worldX(x), y + bob); ctx.rotate(rot); ctx.scale(sx, sy);
  ctx.scale(scale, scale);
  drawFruitShape(ctx);
  ctx.restore();
}

export function render(t = game.worldTime) {
  drawBackground(t);
  for (const p of game.platforms) drawPit(p);
  for (const p of game.platforms) drawPlatform(p, t);
  drawAimGuide(t); drawBoard(t); drawFallEffects(); drawImpactEffects(); drawPlayer();
}
