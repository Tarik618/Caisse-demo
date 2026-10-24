// Graphiques SVG sans bibliothèque (fonctionnent hors ligne).
import { esc } from './ui.js';

const W = 600;

export function barChart(data, { height = 230, fmt = (v) => v, showValues = true } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const padL = 8, padR = 8, padT = 26, padB = 30;
  const iw = W - padL - padR, ih = height - padT - padB;
  const bw = iw / data.length;
  let s = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  for (let i = 1; i <= 3; i++) {
    const y = padT + ih - (ih * i) / 3;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/>`;
  }
  s += `<line x1="${padL}" x2="${W - padR}" y1="${height - padB}" y2="${height - padB}" class="axis"/>`;
  data.forEach((d, i) => {
    const bh = ih * (d.value / max);
    const x = padL + i * bw + bw * 0.14;
    const w = bw * 0.72;
    const y = height - padB - bh;
    if (d.value > 0) s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" class="bar${d.hi ? ' hi' : ''}"/>`;
    if (showValues && d.value > 0) s += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="val" text-anchor="middle">${esc(fmt(d.value))}</text>`;
    s += `<text x="${(x + w / 2).toFixed(1)}" y="${height - 10}" class="lbl" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return s + '</svg>';
}

export function lineChart(data, { height = 230, fmt = (v) => v } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const padL = 14, padR = 14, padT = 28, padB = 30;
  const iw = W - padL - padR, ih = height - padT - padB;
  const step = data.length > 1 ? iw / (data.length - 1) : 0;
  const pts = data.map((d, i) => [padL + i * step, padT + ih - ih * (d.value / max)]);
  let s = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  for (let i = 1; i <= 3; i++) {
    const y = padT + ih - (ih * i) / 3;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/>`;
  }
  s += `<line x1="${padL}" x2="${W - padR}" y1="${height - padB}" y2="${height - padB}" class="axis"/>`;
  if (pts.length) {
    const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const area = `${pts[0][0].toFixed(1)},${height - padB} ${line} ${pts[pts.length - 1][0].toFixed(1)},${height - padB}`;
    s += `<polygon points="${area}" class="area"/><polyline points="${line}" class="line"/>`;
  }
  data.forEach((d, i) => {
    const [x, y] = pts[i];
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="dot${d.hi ? ' hi' : ''}"/>`;
    if (d.value > 0) s += `<text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" class="val" text-anchor="middle">${esc(fmt(d.value))}</text>`;
    s += `<text x="${x.toFixed(1)}" y="${height - 10}" class="lbl" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return s + '</svg>';
}

export function hbarChart(data, { fmt = (v) => v } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const rowH = 34, labelW = 190, padR = 70;
  const height = Math.max(rowH, data.length * rowH) + 6;
  let s = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  data.forEach((d, i) => {
    const y = 3 + i * rowH;
    const bw = (W - labelW - padR) * (d.value / max);
    s += `<text x="0" y="${y + 20}" class="lbl left">${esc(d.label.length > 24 ? d.label.slice(0, 23) + '…' : d.label)}</text>`;
    s += `<rect x="${labelW}" y="${y + 5}" width="${Math.max(2, bw).toFixed(1)}" height="20" rx="4" class="bar"/>`;
    s += `<text x="${(labelW + bw + 8).toFixed(1)}" y="${y + 20}" class="val left">${esc(fmt(d.value))}</text>`;
  });
  return s + '</svg>';
}
