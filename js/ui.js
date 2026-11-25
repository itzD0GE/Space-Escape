// Small DOM helpers shared by the menus and result screens.
import { STUDIO } from './data.js';

export const $ = (id) => document.getElementById(id);
export const show = (id, on = true) => $(id).classList.toggle('show', on);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

export function toast(title, body = '') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<strong>${esc(title)}</strong>${esc(body)}`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4100);
}

// Compact rows for the start screen and result screen.
export function miniBoard(el, entries, youId, limit = 3) {
  const list = (entries || []).slice(0, limit);
  el.innerHTML = list.length
    ? list.map((e, i) => `<div class="leaderboard-row${e.id === youId ? ' leaderboard-row-you' : ''}"><span>${i + 1}. ${esc(e.initials)}${e.id === youId ? ' <span class="you-tag">YOU</span>' : ''} • W${Number(e.wave) || 1}</span><span>${fmt(e.score)}</span></div>`).join('')
    : '<div class="leaderboard-row"><span>No scores yet</span></div>';
}

export function fullBoard(el, entries, youId) {
  el.innerHTML = (entries || []).length
    ? entries.map((e, i) => `<div class="board-row${e.id === youId ? ' leaderboard-row-you' : ''}"><span>${i + 1}.</span><span>${esc(e.initials)}</span><small>W${Number(e.wave) || 1}${e.ship ? ' · ' + esc(e.ship) : ''}</small><span>${fmt(e.score)}</span></div>`).join('')
    : '<p>No scores yet. Be the first.</p>';
}

// A 1200x630 result card, drawn on a canvas so it can be shared as an image.
export function shareCard({ title, score, wave, lines = [], shipImg }) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 1200, 630);
  g.addColorStop(0, '#0a0a0f'); g.addColorStop(0.5, '#1a1a2e'); g.addColorStop(1, '#0a0a0f');
  x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 140; i++) { x.globalAlpha = 0.2 + ((i * 37) % 60) / 100; x.fillRect((i * 271) % 1200, (i * 149) % 630, 2, 2); }
  x.globalAlpha = 1; x.strokeStyle = '#00f5ff'; x.lineWidth = 6; x.strokeRect(24, 24, 1152, 582);
  x.textAlign = 'center'; x.shadowBlur = 30;
  x.fillStyle = '#00f5ff'; x.shadowColor = '#00f5ff'; x.font = '900 64px Orbitron, monospace'; x.fillText('404: SPACE ESCAPE', 600, 120);
  x.fillStyle = '#39ff14'; x.shadowColor = '#39ff14'; x.font = '700 34px Orbitron, monospace'; x.fillText(title, 600, 185);
  x.fillStyle = '#ffd700'; x.shadowColor = '#ffd700'; x.font = '900 130px Orbitron, monospace'; x.fillText(fmt(score), 600, 345);
  x.shadowBlur = 0; x.fillStyle = '#e8faff'; x.font = '700 36px Orbitron, monospace'; x.fillText(`WAVE ${wave}`, 600, 410);
  x.font = '400 26px Orbitron, monospace'; x.fillStyle = '#9cefff';
  lines.slice(0, 2).forEach((l, i) => x.fillText(l, 600, 465 + i * 38));
  if (shipImg && shipImg.complete && shipImg.naturalWidth) { x.drawImage(shipImg, 90, 250, 150, 150); x.drawImage(shipImg, 960, 250, 150, 150); }
  x.fillStyle = '#ff6600'; x.font = '700 24px Orbitron, monospace'; x.fillText(`A ${STUDIO} game`, 600, 575);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function shareResult(blob, text) {
  const file = new File([blob], 'space-escape-score.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text, url: location.href }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
