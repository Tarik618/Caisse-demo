// Tickets : le ticket est DESSINÉ comme une image (canvas), puis converti en commandes ESC/POS.
// Pourquoi une image ? Les imprimantes thermiques ne gèrent pas toutes l'arabe ni les accents :
// une image s'imprime pareil sur toutes, dans n'importe quelle langue.
import { h, openModal, toast } from './ui.js';

const TK = {
  fr: {
    ticket: 'Ticket N°', date: 'Date', cashier: 'Caissier', subtotal: 'Sous-total', discount: 'Remise',
    total: 'TOTAL', method: 'Paiement', cash: 'Espèces', card: 'Carte', received: 'Reçu', change: 'Rendu',
    voided: '*** ANNULÉ ***', z: 'CLÔTURE DE CAISSE (Z)', opened: 'Ouverture', closed: 'Clôture',
    tickets: 'Tickets', cash_sales: 'Ventes espèces', card_sales: 'Ventes carte', total_sales: 'Total des ventes',
    float: 'Fond de caisse', expected: 'Espèces attendues', counted: 'Espèces comptées', diff: 'Écart',
    voids: 'Annulations', discounts: 'Remises', sign: 'Signature', test: 'TEST D\'IMPRESSION',
    test_ok: 'Si vous lisez ceci, l\'imprimante fonctionne.',
  },
  ar: {
    ticket: 'تذكرة رقم', date: 'التاريخ', cashier: 'البائع', subtotal: 'المجموع الفرعي', discount: 'تخفيض',
    total: 'المجموع', method: 'الأداء', cash: 'نقدًا', card: 'بطاقة', received: 'المبلغ المستلم', change: 'الباقي',
    voided: '*** ملغاة ***', z: 'إغلاق الصندوق (Z)', opened: 'الفتح', closed: 'الإغلاق',
    tickets: 'عدد التذاكر', cash_sales: 'مبيعات نقدية', card_sales: 'مبيعات البطاقة', total_sales: 'مجموع المبيعات',
    float: 'رصيد الصندوق', expected: 'النقد المتوقع', counted: 'النقد المحسوب', diff: 'الفرق',
    voids: 'الإلغاءات', discounts: 'التخفيضات', sign: 'التوقيع', test: 'اختبار الطباعة',
    test_ok: 'إذا كنت تقرأ هذا فالطابعة تعمل.',
  },
};

const FONT = '"Noto Sans Arabic","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const m2 = (n) => (Math.round((+n || 0) * 100) / 100).toFixed(2);

// Date au format JJ/MM/AAAA HH:MM, construite à la main : le format du téléphone en arabe mélange
// les sens de lecture et donnait une date illisible sur le ticket.
function dateStr(ts, lang) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  const s = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return lang === 'ar' ? '\u202A' + s + '\u202C' : s;
}

const DEFAULT_FOOTER_FR = 'Merci de votre visite !';
const DEFAULT_FOOTER_AR = 'شكرا لزيارتكم';

// ---------- Dessin d'un ticket à partir d'une liste de lignes ----------
function layout(lines, W, rtl, draw, ctx) {
  const base = W >= 500 ? 26 : 22;
  const pad = 10;
  const inner = W - pad * 2;
  const font = (size, bold) => `${bold ? '700' : '400'} ${size}px ${FONT}`;
  const startX = rtl ? W - pad : pad;
  const endX = rtl ? pad : W - pad;
  const startAlign = rtl ? 'right' : 'left';
  const endAlign = rtl ? 'left' : 'right';
  ctx.textBaseline = 'top';
  ctx.direction = rtl ? 'rtl' : 'ltr';

  const wrap = (text, maxW) => {
    const words = String(text).split(' ');
    const out = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW || !cur) cur = test;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  };

  let y = pad;
  for (let L of lines) {
    const size = Math.round(base * (L.size || 1));
    const lh = Math.round(size * 1.32);
    ctx.font = font(size, L.bold);
    if (L.t === 'space') { y += L.h || 8; continue; }
    if (L.t === 'sep') {
      if (draw) {
        ctx.fillStyle = '#000';
        if (L.style === 'double') { ctx.fillRect(pad, y + 3, inner, 2); ctx.fillRect(pad, y + 8, inner, 2); }
        else { for (let x = pad; x < W - pad; x += 10) ctx.fillRect(x, y + 5, 6, 2); }
      }
      y += 14; continue;
    }
    if (L.t === 'text') {
      const rows = wrap(L.text, inner);
      for (const r of rows) {
        if (draw) {
          ctx.fillStyle = '#000';
          ctx.textAlign = L.align === 'center' ? 'center' : (L.align === 'end' ? endAlign : startAlign);
          const x = L.align === 'center' ? W / 2 : (L.align === 'end' ? endX : startX);
          ctx.fillText(r, x, y);
        }
        y += lh;
      }
      continue;
    }
    if (L.t === 'row') {
      // En arabe, on force « chiffres + devise » à rester dans l'ordre naturel (gauche à droite).
      if (rtl && L.right) L = { ...L, right: '‪' + L.right + '‬' };
      const rw = ctx.measureText(L.right || '').width;
      const rows = wrap(L.left, Math.max(60, inner - rw - 12));
      rows.forEach((r, i) => {
        if (draw) {
          ctx.fillStyle = '#000';
          ctx.textAlign = startAlign;
          ctx.fillText(r, startX, y);
          if (i === 0 && L.right) { ctx.textAlign = endAlign; ctx.fillText(L.right, endX, y); }
        }
        y += lh;
      });
      continue;
    }
    if (L.t === 'box') { // texte centré sur fond noir (ex. ANNULÉ)
      if (draw) {
        ctx.fillStyle = '#000';
        ctx.fillRect(pad, y, inner, lh + 8);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(L.text, W / 2, y + 4);
      }
      y += lh + 14;
    }
  }
  return y + pad + 6;
}

function makeCanvas(lines, paper, rtl) {
  const W = paper === 80 ? 576 : 384;
  const probe = document.createElement('canvas').getContext('2d');
  const height = layout(lines, W, rtl, false, probe);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, canvas.height);
  layout(lines, W, rtl, true, ctx);
  return canvas;
}

function langInfo(s) {
  const lang = s.ticketLang || 'fr';
  return { lang, rtl: lang === 'ar', tk: TK[lang === 'ar' ? 'ar' : 'fr'] };
}

function head(s, lines) {
  lines.push({ t: 'text', text: s.shopName, bold: true, size: 1.3, align: 'center' });
  if (s.address) lines.push({ t: 'text', text: s.address, align: 'center', size: 0.85 });
  if (s.phone) lines.push({ t: 'text', text: s.phone, align: 'center', size: 0.85 });
  lines.push({ t: 'sep' });
}

export function buildSaleTicket(sale, s) {
  const { lang, rtl, tk } = langInfo(s);
  const cur = s.currency;
  const L = [];
  head(s, L);
  L.push({ t: 'row', left: `${tk.ticket} ${sale.id ?? '-'}`, right: '', bold: true });
  L.push({ t: 'text', text: dateStr(sale.ts, lang), size: 0.9 });
  L.push({ t: 'text', text: `${tk.cashier}: ${sale.userName}`, size: 0.9 });
  if (sale.voided) L.push({ t: 'box', text: tk.voided, bold: true });
  L.push({ t: 'sep' });
  for (const it of sale.items) {
    const name = lang === 'ar' && it.nameAr ? it.nameAr : it.name;
    L.push({ t: 'row', left: `${it.qty} x ${name}`, right: m2(it.qty * it.price) });
    if (lang === 'both' && it.nameAr) L.push({ t: 'text', text: it.nameAr, size: 0.85, align: 'end' });
    if (it.qty > 1) L.push({ t: 'text', text: `   ${it.qty} x ${m2(it.price)}`, size: 0.8 });
  }
  L.push({ t: 'sep' });
  if (sale.discount > 0) {
    L.push({ t: 'row', left: tk.subtotal, right: m2(sale.subtotal) });
    L.push({ t: 'row', left: tk.discount, right: '-' + m2(sale.discount) });
  }
  L.push({ t: 'row', left: tk.total, right: `${m2(sale.total)} ${cur}`, bold: true, size: 1.35 });
  L.push({ t: 'row', left: tk.method, right: sale.method === 'card' ? tk.card : tk.cash, size: 0.9 });
  if (sale.method === 'cash') {
    L.push({ t: 'row', left: tk.received, right: m2(sale.paid), size: 0.9 });
    L.push({ t: 'row', left: tk.change, right: m2(sale.change), size: 0.9 });
  }
  L.push({ t: 'sep' });
  const footer = lang === 'ar' && s.footer === DEFAULT_FOOTER_FR ? DEFAULT_FOOTER_AR : s.footer;
  if (footer) L.push({ t: 'text', text: footer, align: 'center', size: 0.9 });
  L.push({ t: 'space', h: 6 });
  return makeCanvas(L, s.paper, rtl);
}

export function buildZTicket(z, s) {
  const { lang, rtl, tk } = langInfo(s);
  const cur = s.currency;
  const L = [];
  head(s, L);
  L.push({ t: 'text', text: tk.z, bold: true, align: 'center', size: 1.05 });
  L.push({ t: 'sep', style: 'double' });
  L.push({ t: 'row', left: tk.opened, right: dateStr(z.openedAt, lang), size: 0.85 });
  L.push({ t: 'row', left: tk.closed, right: dateStr(z.closedAt, lang), size: 0.85 });
  L.push({ t: 'row', left: tk.cashier, right: z.userName, size: 0.9 });
  L.push({ t: 'sep' });
  L.push({ t: 'row', left: tk.tickets, right: String(z.count) });
  L.push({ t: 'row', left: tk.cash_sales, right: m2(z.cashSales) });
  L.push({ t: 'row', left: tk.card_sales, right: m2(z.cardSales) });
  L.push({ t: 'row', left: tk.discounts, right: m2(z.discounts), size: 0.9 });
  L.push({ t: 'row', left: tk.voids, right: String(z.voids), size: 0.9 });
  L.push({ t: 'row', left: tk.total_sales, right: `${m2(z.total)} ${cur}`, bold: true, size: 1.15 });
  L.push({ t: 'sep' });
  L.push({ t: 'row', left: tk.float, right: m2(z.float) });
  L.push({ t: 'row', left: tk.expected, right: m2(z.expected) });
  L.push({ t: 'row', left: tk.counted, right: m2(z.counted) });
  L.push({ t: 'row', left: tk.diff, right: (z.diff > 0 ? '+' : '') + m2(z.diff), bold: true, size: 1.15 });
  L.push({ t: 'space', h: 22 });
  L.push({ t: 'text', text: tk.sign + ' : ______________', size: 0.9 });
  L.push({ t: 'space', h: 6 });
  return makeCanvas(L, s.paper, rtl);
}

export function buildTestTicket(s) {
  const { rtl, tk } = langInfo(s);
  const L = [];
  head(s, L);
  L.push({ t: 'text', text: tk.test, bold: true, align: 'center', size: 1.1 });
  L.push({ t: 'text', text: tk.test_ok, align: 'center', size: 0.9 });
  L.push({ t: 'sep' });
  L.push({ t: 'text', text: 'àéèêç ôûù — 0123456789', align: 'center' });
  L.push({ t: 'text', text: 'صندوق المخبزة — ١٢٣', align: 'center' });
  L.push({ t: 'space', h: 6 });
  return makeCanvas(L, s.paper, rtl);
}

// ---------- Conversion image -> commandes ESC/POS (GS v 0 = image raster) ----------
export function escposRaster(canvas, { cut = true, feed = 4 } = {}) {
  const w = canvas.width, h = canvas.height;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const bpr = Math.ceil(w / 8);
  const out = [0x1b, 0x40]; // ESC @ : initialise l'imprimante
  const band = 64;
  for (let y0 = 0; y0 < h; y0 += band) {
    const bh = Math.min(band, h - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, bpr & 255, bpr >> 8, bh & 255, bh >> 8);
    for (let y = 0; y < bh; y++) {
      for (let bx = 0; bx < bpr; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < w) {
            const i = ((y0 + y) * w + x) * 4;
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            if (lum < 165) b |= 0x80 >> bit;
          }
        }
        out.push(b);
      }
    }
  }
  out.push(0x1b, 0x64, feed);                 // avance le papier
  if (cut) out.push(0x1d, 0x56, 0x42, 0x00);  // coupe (ignoré si pas de couteau)
  return Uint8Array.from(out);
}

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- Envoi ----------
function sendRawBT(canvas, s) {
  const b64 = toBase64(escposRaster(canvas, { cut: s.cut }));
  window.location.href = 'rawbt:base64,' + b64;
}

function systemPrint(canvas, s) {
  let area = document.getElementById('print-area');
  if (!area) { area = h('div', { id: 'print-area' }); document.body.append(area); }
  let style = document.getElementById('print-page-style');
  if (!style) { style = h('style', { id: 'print-page-style' }); document.head.append(style); }
  style.textContent = `@page { size: ${s.paper === 80 ? '80mm' : '58mm'} auto; margin: 0; }`;
  area.replaceChildren(h('img', { src: canvas.toDataURL('image/png'), alt: 'ticket' }));
  setTimeout(() => window.print(), 60);
}

export function showPreview(canvas, s) {
  canvas.style.width = '100%';
  canvas.style.maxWidth = canvas.width + 'px';
  openModal({
    title: '🧾',
    wide: false,
    body: h('div', { class: 'preview' }, canvas),
    actions: [
      { label: 'RawBT', class: 'primary', onClick: () => { sendRawBT(canvas, s); return false; }, keepOpen: true },
      { label: 'PDF / ' + (s.lang === 'ar' ? 'طباعة' : 'Impr.'), onClick: () => { systemPrint(canvas, s); return false; }, keepOpen: true },
      { label: 'OK' },
    ],
  });
}

export async function deliver(canvas, s) {
  try {
    if (s.printMethod === 'rawbt') sendRawBT(canvas, s);
    else if (s.printMethod === 'system') systemPrint(canvas, s);
    else showPreview(canvas, s);
  } catch (e) {
    toast(String(e.message || e), 'bad');
  }
}
