import { db } from './db.js';
import { t, setLang, getLang } from './i18n.js';
import { barChart, lineChart, hbarChart } from './charts.js';
import { buildSaleTicket, buildZTicket, buildTestTicket, deliver } from './print.js';
import { h, openModal, toast } from './ui.js';

const $app = document.getElementById('app');
const DAY = 86400000;

const DEFAULTS = {
  shopName: 'Ma Pâtisserie', address: '', phone: '', footer: 'Merci de votre visite !',
  currency: 'DH', lang: 'fr', ticketLang: 'fr', paper: 58, printMethod: 'preview', autoPrint: true, cut: true,
};

const SEED = [
  { name: 'Mille-feuille', nameAr: 'ميل فاي', emoji: '🍰', category: 'Pâtisserie', price: 9, stock: 20, minStock: 5 },
  { name: 'Éclair au chocolat', nameAr: 'إكلير بالشوكولاتة', emoji: '🍫', category: 'Pâtisserie', price: 7, stock: 25, minStock: 5 },
  { name: 'Tarte aux fruits', nameAr: 'تارت الفواكه', emoji: '🍓', category: 'Pâtisserie', price: 10, stock: 12, minStock: 4 },
  { name: 'Pain complet', nameAr: 'خبز كامل', emoji: '🍞', category: 'Pain', price: 3, stock: 40, minStock: 10 },
  { name: 'Baguette', nameAr: 'باغيت', emoji: '🥖', category: 'Pain', price: 1.5, stock: 60, minStock: 15 },
  { name: 'Pain de mie', nameAr: 'خبز القالب', emoji: '🍞', category: 'Pain', price: 12, stock: 15, minStock: 4 },
  { name: 'Croissant', nameAr: 'كرواسون', emoji: '🥐', category: 'Viennoiserie', price: 3, stock: 35, minStock: 10 },
  { name: 'Pain au chocolat', nameAr: 'بان أو شوكولا', emoji: '🥐', category: 'Viennoiserie', price: 3.5, stock: 30, minStock: 10 },
  { name: 'Brioche', nameAr: 'بريوش', emoji: '🧁', category: 'Viennoiserie', price: 4, stock: 18, minStock: 5 },
];

const S = {
  user: null, users: [], screen: 'pos', cart: [], discount: { type: 'pct', value: 0 },
  cat: 'all', q: '', settings: { ...DEFAULTS }, products: [], shift: null,
};

/* ---------------- Outils ---------------- */
const loc = () => (getLang() === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR');
// En arabe, on isole « 3.00 DH » pour qu'il garde son ordre (sinon il s'affiche « DH 3.00 »).
const money = (n) => {
  const s = `${(Math.round((+n || 0) * 100) / 100).toFixed(2)} ${S.settings.currency}`;
  return getLang() === 'ar' ? '⁦' + s + '⁩' : s;
};
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const pname = (p) => (getLang() === 'ar' && p.nameAr ? p.nameAr : p.name);
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleDateString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric' });
const isAdmin = () => S.user && S.user.role === 'admin';

async function hashPin(pin) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('caisse:' + pin));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return 'plain:' + pin;
}

async function saveSetting(key, value) {
  S.settings[key] = value;
  await db.put('settings', { key, value });
}

const DEMO_BUILD = true; // mettre false pour une version « client » sans ventes fictives

async function seedIfEmpty() {
  if ((await db.count('users')) === 0) {
    await db.put('users', { name: 'Admin', role: 'admin', pin: await hashPin('1234') });
    await db.put('users', { name: 'Caissier', role: 'cashier', pin: await hashPin('1111') });
  }
  if ((await db.count('products')) === 0) {
    for (const p of SEED) await db.put('products', { ...p, active: true });
  }
}

async function refreshCore() {
  const rows = await db.all('settings');
  S.settings = { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  setLang(S.settings.lang);
  S.users = await db.all('users');
  S.products = await db.all('products');
  S.shift = (await db.all('shifts')).find((s) => !s.closedAt) || null;
}

const activeProducts = () => S.products.filter((p) => p.active !== false);
const lowStock = () => activeProducts().filter((p) => p.stock <= p.minStock);

/* ---------------- Rendu général ---------------- */
async function render() {
  $app.replaceChildren();
  if (!S.user) { $app.append(renderLogin()); return; }

  const items = [
    ['pos', '🛒'], ['history', '🧾'], ['shift', '💰'],
    ...(isAdmin() ? [['stock', '📦'], ['dash', '📊'], ['settings', '⚙️']] : []),
  ];
  const nav = h('nav', { class: 'rail' },
    h('div', { class: 'rail-logo' }, '🥐'),
    items.map(([id, ic]) => h('button', {
      class: 'rail-btn' + (S.screen === id ? ' on' : ''),
      onclick: () => { S.screen = id; render(); },
    }, h('span', { class: 'ic' }, ic), h('span', { class: 'lb' }, t('nav_' + id)))),
    h('div', { class: 'grow' }),
    h('div', { class: 'rail-user' }, S.user.name),
    h('button', { class: 'rail-btn', onclick: () => { S.user = null; S.cart = []; render(); } },
      h('span', { class: 'ic' }, '🔒'), h('span', { class: 'lb' }, t('logout'))));

  const low = lowStock().length;
  const header = h('header', { class: 'topbar' },
    h('h1', {}, t('nav_' + S.screen)),
    h('div', { class: 'grow' }),
    low && isAdmin() ? h('button', { class: 'pill warn', onclick: () => { S.screen = 'stock'; S.stockFilter = 'low'; render(); } }, `⚠ ${low} ${t('low_stock_short')}`) : null,
    h('span', { class: 'pill ' + (S.shift ? 'ok' : 'off') },
      S.shift ? `${t('shift_open_since')} ${fmtTime(S.shift.openedAt)}` : t('shift_closed')));

  const main = h('main', { class: 'content' });
  $app.append(h('div', { class: 'shell' }, nav, h('div', { class: 'col' }, header, main)));
  const screens = { pos: screenPos, history: screenHistory, shift: screenShift, stock: screenStock, dash: screenDash, settings: screenSettings };
  main.append(await screens[S.screen]());
}

/* ---------------- Connexion par code PIN ---------------- */
function renderLogin() {
  let sel = S.users[0] && S.users[0].id;
  let pin = '';
  const root = h('div', { class: 'login' });
  const tryLogin = async () => {
    const u = S.users.find((x) => x.id === sel);
    if (u && (await hashPin(pin)) === u.pin) { S.user = u; S.screen = 'pos'; render(); return; }
    toast(t('bad_pin'), 'bad');
    pin = ''; draw();
    root.querySelector('.login-card').classList.add('shake');
  };
  const press = (k) => {
    if (k === '⌫') { pin = pin.slice(0, -1); draw(); return; }
    if (k === '✓') { if (pin.length === 4) tryLogin(); return; }
    if (pin.length < 4) { pin += k; draw(); if (pin.length === 4) tryLogin(); }
  };
  function draw() {
    root.replaceChildren(h('div', { class: 'login-card' },
      h('div', { class: 'logo' }, '🥐'),
      h('h1', {}, S.settings.shopName),
      h('p', { class: 'muted' }, t('choose_user')),
      h('div', { class: 'chips' }, S.users.map((u) => h('button', {
        class: 'chip' + (u.id === sel ? ' on' : ''), onclick: () => { sel = u.id; pin = ''; draw(); },
      }, u.name))),
      h('div', { class: 'dots' }, [0, 1, 2, 3].map((i) => h('span', { class: 'dot' + (i < pin.length ? ' on' : '') }))),
      h('div', { class: 'numpad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => h('button', { class: 'key', onclick: () => press(k) }, k))),
      h('div', { class: 'login-lang' },
        ['fr', 'ar'].map((l) => h('button', { class: 'chip small' + (getLang() === l ? ' on' : ''), onclick: async () => { await saveSetting('lang', l); setLang(l); draw(); } }, l === 'fr' ? 'Français' : 'العربية')))));
  }
  draw();
  return root;
}

/* ---------------- Caisse ---------------- */
function cartTotals() {
  const subtotal = r2(S.cart.reduce((a, i) => a + i.price * i.qty, 0));
  let disc = S.discount.type === 'pct' ? subtotal * (S.discount.value / 100) : S.discount.value;
  disc = Math.min(subtotal, Math.max(0, r2(disc)));
  return { subtotal, discount: disc, total: r2(subtotal - disc) };
}

function screenPos() {
  if (!S.shift) return openShiftPrompt();
  const root = h('div', { class: 'pos' });
  const left = h('div', { class: 'pos-left' });
  const cartBox = h('aside', { class: 'cart card' });
  root.append(left, cartBox);

  const cats = [...new Set(activeProducts().map((p) => p.category))];

  function drawLeft() {
    const list = activeProducts()
      .filter((p) => S.cat === 'all' || p.category === S.cat)
      .filter((p) => !S.q || (p.name + ' ' + (p.nameAr || '')).toLowerCase().includes(S.q.toLowerCase()));
    left.replaceChildren(
      h('div', { class: 'pos-tools' },
        h('div', { class: 'chips' }, ['all', ...cats].map((c) => h('button', {
          class: 'chip' + (S.cat === c ? ' on' : ''), onclick: () => { S.cat = c; drawLeft(); },
        }, c === 'all' ? t('all') : c))),
        h('input', {
          class: 'input search', type: 'search', placeholder: t('search'), value: S.q,
          oninput: (e) => { S.q = e.target.value; drawGrid(); },
        })),
      h('div', { class: 'grid', id: 'grid' }));
    drawGrid();
  }

  function drawGrid() {
    const grid = left.querySelector('#grid');
    const list = activeProducts()
      .filter((p) => S.cat === 'all' || p.category === S.cat)
      .filter((p) => !S.q || (p.name + ' ' + (p.nameAr || '')).toLowerCase().includes(S.q.toLowerCase()));
    grid.replaceChildren(...list.map((p) => {
      const inCart = (S.cart.find((i) => i.pid === p.id) || {}).qty || 0;
      const out = p.stock - inCart <= 0;
      return h('button', { class: 'tile' + (out ? ' out' : ''), disabled: out, onclick: () => addToCart(p) },
        inCart ? h('span', { class: 'badge-qty' }, inCart) : null,
        h('span', { class: 'emoji' }, p.emoji || '🍞'),
        h('span', { class: 'tname' }, pname(p)),
        h('span', { class: 'tprice' }, money(p.price)),
        h('span', { class: 'tstock' + (p.stock <= p.minStock ? ' low' : '') }, out ? t('out_of_stock') : `${t('stock')}: ${p.stock - inCart}`));
    }));
    if (!list.length) grid.append(h('p', { class: 'muted pad' }, t('no_result')));
  }

  function addToCart(p) {
    const line = S.cart.find((i) => i.pid === p.id);
    const have = line ? line.qty : 0;
    if (have + 1 > p.stock) { toast(t('stock_limit'), 'warn'); return; }
    if (line) line.qty++;
    else S.cart.push({ pid: p.id, name: p.name, nameAr: p.nameAr, price: p.price, qty: 1 });
    drawCart(); drawGrid();
  }

  function changeQty(item, d) {
    const p = S.products.find((x) => x.id === item.pid);
    if (d > 0 && item.qty + 1 > p.stock) { toast(t('stock_limit'), 'warn'); return; }
    item.qty += d;
    if (item.qty <= 0) S.cart = S.cart.filter((x) => x !== item);
    drawCart(); drawGrid();
  }

  function drawCart() {
    const { subtotal, discount, total } = cartTotals();
    cartBox.replaceChildren(
      h('div', { class: 'cart-head' }, h('h2', {}, t('cart')),
        S.cart.length ? h('button', { class: 'btn ghost small', onclick: () => { S.cart = []; S.discount = { type: 'pct', value: 0 }; drawCart(); drawGrid(); } }, t('clear')) : null),
      h('div', { class: 'cart-lines' },
        S.cart.length ? S.cart.map((it) => h('div', { class: 'cline' },
          h('div', { class: 'cinfo' }, h('div', { class: 'cname' }, pname(it)), h('div', { class: 'muted small' }, `${money(it.price)} × ${it.qty}`)),
          h('div', { class: 'qty' },
            h('button', { class: 'qbtn', onclick: () => changeQty(it, -1) }, '−'),
            h('span', {}, it.qty),
            h('button', { class: 'qbtn', onclick: () => changeQty(it, 1) }, '+')),
          h('div', { class: 'ctotal' }, money(it.price * it.qty))))
          : h('p', { class: 'muted pad center' }, t('cart_empty'))),
      h('div', { class: 'cart-sum' },
        discount > 0 ? h('div', { class: 'sumrow' }, h('span', {}, t('subtotal')), h('span', {}, money(subtotal))) : null,
        discount > 0 ? h('div', { class: 'sumrow disc' }, h('span', {}, t('discount')), h('span', {}, '− ' + money(discount))) : null,
        h('div', { class: 'sumrow big' }, h('span', {}, t('total')), h('span', {}, money(total))),
        h('div', { class: 'cart-actions' },
          h('button', { class: 'btn', disabled: !S.cart.length, onclick: () => discountModal(drawCart) }, '％ ' + t('discount')),
          h('button', { class: 'btn primary xl', disabled: !S.cart.length, onclick: payModal }, `${t('pay')}  ${money(total)}`))));
  }

  function discountModal(after) {
    let type = S.discount.type; let val = String(S.discount.value || '');
    const input = h('input', { class: 'input big', inputmode: 'decimal', value: val, placeholder: '0', oninput: (e) => { val = e.target.value; } });
    const seg = h('div', { class: 'seg' });
    const drawSeg = () => seg.replaceChildren(...[['pct', '%'], ['amt', S.settings.currency]].map(([k, l]) =>
      h('button', { class: 'seg-btn' + (type === k ? ' on' : ''), onclick: () => { type = k; drawSeg(); } }, l)));
    drawSeg();
    const quick = h('div', { class: 'chips' }, [5, 10, 15, 20].map((n) => h('button', { class: 'chip', onclick: () => { type = 'pct'; val = String(n); input.value = val; drawSeg(); } }, n + '%')));
    openModal({
      title: t('discount'), body: h('div', { class: 'stack' }, seg, input, quick),
      actions: [
        { label: t('remove_discount'), onClick: () => { S.discount = { type: 'pct', value: 0 }; after(); } },
        { label: t('apply'), class: 'primary', onClick: () => { const v = parseFloat(String(val).replace(',', '.')) || 0; S.discount = { type, value: Math.max(0, type === 'pct' ? Math.min(100, v) : v) }; after(); } },
      ],
    });
  }

  function payModal() {
    const { total } = cartTotals();
    let method = 'cash';
    let paid = '';
    const changeEl = h('div', { class: 'change' });
    const okBtn = h('button', { class: 'btn primary xl', onclick: confirm }, t('confirm_payment'));
    const input = h('input', { class: 'input big', inputmode: 'decimal', placeholder: t('amount_received'), oninput: (e) => { paid = e.target.value; refresh(); } });
    const cashBox = h('div', { class: 'stack' });
    const quickVals = [...new Set([Math.ceil(total), ...[10, 20, 50, 100, 200].filter((v) => v >= total)])].slice(0, 5);
    cashBox.append(input, h('div', { class: 'chips' }, quickVals.map((v) => h('button', { class: 'chip', onclick: () => { paid = String(v); input.value = paid; refresh(); } }, money(v)))), changeEl);
    const seg = h('div', { class: 'seg' });
    const num = () => parseFloat(String(paid).replace(',', '.')) || 0;
    function refresh() {
      seg.replaceChildren(...[['cash', t('cash')], ['card', t('card')]].map(([k, l]) =>
        h('button', { class: 'seg-btn' + (method === k ? ' on' : ''), onclick: () => { method = k; refresh(); } }, l)));
      cashBox.style.display = method === 'cash' ? '' : 'none';
      const given = num();
      const change = r2(given - total);
      changeEl.textContent = `${t('change')} : ${money(Math.max(0, change))}`;
      changeEl.classList.toggle('bad', given > 0 && change < 0);
      okBtn.disabled = method === 'cash' && given < total;
    }
    const modal = openModal({
      title: t('payment'),
      body: h('div', { class: 'stack' }, h('div', { class: 'pay-total' }, money(total)), seg, cashBox, okBtn),
      actions: [{ label: t('cancel') }],
    });
    refresh();
    setTimeout(() => input.focus(), 50);

    async function confirm() {
      okBtn.disabled = true;
      const tot = cartTotals();
      const given = method === 'cash' ? num() : tot.total;
      const sale = {
        ts: Date.now(), userId: S.user.id, userName: S.user.name, shiftId: S.shift.id,
        items: S.cart.map((i) => ({ pid: i.pid, name: i.name, nameAr: i.nameAr, qty: i.qty, price: i.price })),
        subtotal: tot.subtotal, discount: tot.discount, total: tot.total,
        method, paid: given, change: method === 'cash' ? r2(given - tot.total) : 0, voided: false,
      };
      try {
        sale.id = await db.completeSale(sale);
      } catch (e) {
        okBtn.disabled = false;
        const m = String(e.message);
        if (m.startsWith('STOCK:')) { const [, n, left] = m.split(':'); toast(`${t('stock_limit')} (${n}: ${left})`, 'bad'); }
        else toast(t('error') + ' : ' + m, 'bad');
        S.products = await db.all('products'); drawCart(); drawGrid();
        return;
      }
      modal.close();
      S.cart = []; S.discount = { type: 'pct', value: 0 };
      S.products = await db.all('products');
      drawCart(); drawGrid();
      const canvas = buildSaleTicket(sale, S.settings);
      if (S.settings.autoPrint && S.settings.printMethod !== 'preview') deliver(canvas, S.settings);
      openModal({
        title: '✔ ' + t('sale_done') + ' N° ' + sale.id,
        sticky: true,
        body: h('div', { class: 'center stack' },
          h('div', { class: 'pay-total' }, money(sale.total)),
          sale.method === 'cash' ? h('div', { class: 'change big' }, `${t('change')} : ${money(sale.change)}`) : h('div', { class: 'muted' }, t('card'))),
        actions: [
          { label: '🖨 ' + t('print_ticket'), onClick: () => { deliver(canvas, S.settings); return false; }, keepOpen: true },
          { label: t('new_sale'), class: 'primary' },
        ],
      });
    }
  }

  drawLeft();
  drawCart();
  return root;
}

function openShiftPrompt() {
  let val = '';
  const input = h('input', { class: 'input big', inputmode: 'decimal', placeholder: '0.00', oninput: (e) => { val = e.target.value; } });
  return h('div', { class: 'center-page' }, h('div', { class: 'card narrow stack' },
    h('div', { class: 'big-ic' }, '💰'),
    h('h2', {}, t('open_register')),
    h('p', { class: 'muted' }, t('open_register_hint')),
    h('label', { class: 'label' }, t('float_amount')),
    input,
    h('button', {
      class: 'btn primary xl', onclick: async () => {
        const f = r2(parseFloat(String(val).replace(',', '.')) || 0);
        const id = await db.put('shifts', { openedAt: Date.now(), userId: S.user.id, userName: S.user.name, float: f });
        S.shift = (await db.all('shifts')).find((s) => s.id === id);
        render();
      },
    }, t('open_register'))));
}

/* ---------------- Historique ---------------- */
async function screenHistory() {
  const root = h('div', { class: 'page' });
  let day = new Date().toISOString().slice(0, 10);
  const listBox = h('div', { class: 'card flush' });
  async function draw() {
    const [y, m, d] = day.split('-').map(Number);
    const lo = new Date(y, m - 1, d).getTime();
    let sales = await db.range('sales', 'ts', lo, lo + DAY - 1);
    if (!isAdmin()) sales = sales.filter((s) => s.userId === S.user.id);
    sales.sort((a, b) => b.ts - a.ts);
    const total = sales.filter((s) => !s.voided).reduce((a, s) => a + s.total, 0);
    listBox.replaceChildren(
      h('div', { class: 'hist-sum' }, h('span', {}, `${sales.length} ${t('tickets')}`), h('strong', {}, money(total))),
      sales.length ? h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['N°', t('time'), t('cashier'), t('items'), t('payment'), t('total')].map((x) => h('th', {}, x)))),
        h('tbody', {}, sales.map((s) => h('tr', { class: 'click' + (s.voided ? ' void' : ''), onclick: () => saleDetail(s, draw) },
          h('td', {}, s.id), h('td', {}, fmtTime(s.ts)), h('td', {}, s.userName),
          h('td', {}, s.items.reduce((a, i) => a + i.qty, 0)),
          h('td', {}, s.method === 'card' ? t('card') : t('cash')),
          h('td', {}, s.voided ? h('span', { class: 'tag bad' }, t('voided')) : money(s.total))))))
        : h('p', { class: 'muted pad center' }, t('no_sales')));
  }
  root.append(h('div', { class: 'toolbar' }, h('input', { class: 'input', type: 'date', value: day, onchange: (e) => { day = e.target.value; draw(); } })), listBox);
  await draw();
  return root;
}

function saleDetail(s, refresh) {
  const canvas = () => buildSaleTicket(s, S.settings);
  openModal({
    title: `${t('ticket')} N° ${s.id}` + (s.voided ? ' — ' + t('voided') : ''),
    body: h('div', { class: 'stack' },
      h('div', { class: 'muted' }, `${fmtDate(s.ts)} ${fmtTime(s.ts)} · ${s.userName}`),
      h('table', { class: 'table' }, h('tbody', {}, s.items.map((i) => h('tr', {}, h('td', {}, `${i.qty} × ${pname(i)}`), h('td', { class: 'end' }, money(i.qty * i.price)))))),
      s.discount > 0 ? h('div', { class: 'sumrow disc' }, h('span', {}, t('discount')), h('span', {}, '− ' + money(s.discount))) : null,
      h('div', { class: 'sumrow big' }, h('span', {}, t('total')), h('span', {}, money(s.total)))),
    actions: [
      { label: '🖨 ' + t('print_ticket'), onClick: () => { deliver(canvas(), S.settings); return false; }, keepOpen: true },
      isAdmin() && !s.voided ? {
        label: t('void_sale'), class: 'danger', onClick: async () => {
          if (!window.confirm(t('void_confirm'))) return false;
          try { await db.voidSale(s.id, S.user.name); S.products = await db.all('products'); toast(t('sale_voided'), 'ok'); refresh(); } catch (e) { toast(t('error') + ' : ' + e.message, 'bad'); }
        },
      } : null,
      { label: t('close') },
    ].filter(Boolean),
  });
}

/* ---------------- Clôture de caisse ---------------- */
async function shiftTotals(shift, until) {
  const sales = (await db.range('sales', 'ts', shift.openedAt, until || Date.now() + 1)).filter((s) => s.shiftId === shift.id);
  const ok = sales.filter((s) => !s.voided);
  const cashSales = r2(ok.filter((s) => s.method === 'cash').reduce((a, s) => a + s.total, 0));
  const cardSales = r2(ok.filter((s) => s.method === 'card').reduce((a, s) => a + s.total, 0));
  return {
    count: ok.length, cashSales, cardSales, total: r2(cashSales + cardSales),
    discounts: r2(ok.reduce((a, s) => a + s.discount, 0)), voids: sales.length - ok.length,
    expected: r2(shift.float + cashSales),
  };
}

async function screenShift() {
  const root = h('div', { class: 'page' });
  if (!S.shift) {
    root.append(openShiftPrompt());
  } else {
    const tt = await shiftTotals(S.shift);
    let counted = '';
    const diffEl = h('div', { class: 'diff' });
    const input = h('input', {
      class: 'input big', inputmode: 'decimal', placeholder: t('counted_cash'),
      oninput: (e) => { counted = e.target.value; upd(); },
    });
    const num = () => parseFloat(String(counted).replace(',', '.'));
    const upd = () => {
      const c = num();
      if (isNaN(c)) { diffEl.textContent = ''; return; }
      const d = r2(c - tt.expected);
      diffEl.textContent = `${t('diff')} : ${d > 0 ? '+' : ''}${money(d)}`;
      diffEl.className = 'diff ' + (d === 0 ? 'ok' : 'bad');
    };
    root.append(
      h('div', { class: 'kpis' },
        kpi(t('tickets'), tt.count), kpi(t('cash_sales'), money(tt.cashSales)), kpi(t('card_sales'), money(tt.cardSales)), kpi(t('total_sales'), money(tt.total), true)),
      h('div', { class: 'card stack' },
        h('div', { class: 'sumrow' }, h('span', {}, t('float_amount')), h('span', {}, money(S.shift.float))),
        h('div', { class: 'sumrow' }, h('span', {}, t('cash_sales')), h('span', {}, money(tt.cashSales))),
        h('div', { class: 'sumrow big' }, h('span', {}, t('expected_cash')), h('span', {}, money(tt.expected))),
        h('label', { class: 'label' }, t('counted_cash')), input, diffEl,
        h('button', {
          class: 'btn primary xl', onclick: async () => {
            const c = num();
            if (isNaN(c)) { toast(t('enter_counted'), 'warn'); return; }
            if (!window.confirm(t('close_confirm'))) return;
            const z = { ...tt, openedAt: S.shift.openedAt, closedAt: Date.now(), userName: S.user.name, float: S.shift.float, counted: r2(c), diff: r2(c - tt.expected) };
            await db.put('shifts', { ...S.shift, closedAt: z.closedAt, closedBy: S.user.name, counted: z.counted, expected: z.expected, diff: z.diff, z });
            S.shift = null; S.cart = [];
            deliver(buildZTicket(z, S.settings), S.settings);
            toast(t('register_closed'), 'ok');
            render();
          },
        }, t('close_register'))));
  }
  const past = (await db.all('shifts')).filter((s) => s.closedAt).sort((a, b) => b.closedAt - a.closedAt).slice(0, 8);
  if (past.length) {
    root.append(h('h3', { class: 'sec' }, t('past_shifts')), h('div', { class: 'card flush' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, [t('date'), t('cashier'), t('total_sales'), t('diff'), ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, past.map((s) => h('tr', {},
        h('td', {}, `${fmtDate(s.closedAt)} ${fmtTime(s.closedAt)}`), h('td', {}, s.closedBy || s.userName),
        h('td', {}, money(s.z ? s.z.total : 0)), h('td', { class: s.diff === 0 ? 'okc' : 'badc' }, (s.diff > 0 ? '+' : '') + money(s.diff)),
        h('td', {}, s.z ? h('button', { class: 'btn small', onclick: () => deliver(buildZTicket(s.z, S.settings), S.settings) }, '🖨') : null)))))));
  }
  return root;
}

function kpi(label, value, accent) {
  return h('div', { class: 'kpi' + (accent ? ' accent' : '') }, h('div', { class: 'kl' }, label), h('div', { class: 'kv' }, value));
}

/* ---------------- Stock ---------------- */
async function screenStock() {
  const root = h('div', { class: 'page' });
  let filter = S.stockFilter || 'all';
  S.stockFilter = null;
  let q = '';
  const box = h('div', { class: 'card flush' });

  function draw() {
    let list = S.products.filter((p) => (filter === 'arch' ? p.active === false : p.active !== false));
    if (filter === 'low') list = list.filter((p) => p.stock <= p.minStock);
    if (q) list = list.filter((p) => (p.name + ' ' + (p.nameAr || '') + ' ' + p.category).toLowerCase().includes(q.toLowerCase()));
    box.replaceChildren(h('table', { class: 'table stock-table' },
      h('thead', {}, h('tr', {}, ['', t('product'), t('category'), t('price'), t('stock'), ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, list.map((p) => {
        const state = p.stock <= 0 ? 'bad' : (p.stock <= p.minStock ? 'warn' : 'ok');
        return h('tr', {},
          h('td', { class: 'emo' }, p.emoji || '🍞'),
          h('td', {}, h('div', {}, p.name), p.nameAr ? h('div', { class: 'muted small' }, p.nameAr) : null),
          h('td', {}, p.category), h('td', {}, money(p.price)),
          h('td', {}, h('span', { class: 'tag ' + state }, p.stock <= 0 ? t('out_of_stock') : `${p.stock}`), p.stock <= p.minStock && p.stock > 0 ? h('span', { class: 'muted small' }, ` (min ${p.minStock})`) : null),
          h('td', { class: 'actions' },
            p.active !== false ? h('button', { class: 'btn small', onclick: () => restockModal(p) }, '＋ ' + t('restock')) : h('button', { class: 'btn small', onclick: async () => { await db.put('products', { ...p, active: true }); await reload(); } }, t('restore')),
            h('button', { class: 'btn small', onclick: () => productModal(p) }, '✎'),
            h('button', { class: 'btn small danger', onclick: () => removeProduct(p) }, '🗑')));
      }))), ...(list.length ? [] : [h('p', { class: 'muted pad center' }, t('no_result'))]));
  }
  async function reload() { S.products = await db.all('products'); draw(); }

  function restockModal(p) {
    let n = '';
    const input = h('input', { class: 'input big', inputmode: 'numeric', placeholder: '0', oninput: (e) => { n = e.target.value; } });
    openModal({
      title: `${t('restock')} — ${p.name}`,
      body: h('div', { class: 'stack' }, h('div', { class: 'muted' }, `${t('stock')}: ${p.stock}`), input,
        h('div', { class: 'chips' }, [5, 10, 20, 50].map((v) => h('button', { class: 'chip', onclick: () => { n = String(v); input.value = n; } }, '+' + v)))),
      actions: [{ label: t('cancel') }, {
        label: t('save'), class: 'primary', onClick: async () => {
          const v = parseInt(n, 10);
          if (!v || v < 1) { toast(t('invalid'), 'warn'); return false; }
          await db.put('products', { ...p, stock: p.stock + v }); await reload(); toast(t('saved'), 'ok');
        },
      }],
    });
    setTimeout(() => input.focus(), 50);
  }

  function productModal(p) {
    const d = p || { name: '', nameAr: '', emoji: '🍞', category: '', price: '', stock: 0, minStock: 5, active: true };
    const f = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
    const cats = [...new Set(S.products.map((x) => x.category))];
    const name = h('input', { class: 'input', value: d.name });
    const nameAr = h('input', { class: 'input', value: d.nameAr || '', dir: 'rtl' });
    const emoji = h('input', { class: 'input', value: d.emoji || '', maxlength: '4' });
    const cat = h('input', { class: 'input', value: d.category, list: 'cats' });
    const price = h('input', { class: 'input', inputmode: 'decimal', value: d.price });
    const stock = h('input', { class: 'input', inputmode: 'numeric', value: d.stock });
    const min = h('input', { class: 'input', inputmode: 'numeric', value: d.minStock });
    openModal({
      title: p ? t('edit_product') : t('add_product'), wide: true,
      body: h('div', { class: 'form' }, f(t('name_fr'), name), f(t('name_ar'), nameAr), f('Emoji', emoji), f(t('category'), cat),
        h('datalist', { id: 'cats' }, cats.map((c) => h('option', { value: c }))), f(t('price'), price), f(t('stock'), stock), f(t('min_stock'), min)),
      actions: [{ label: t('cancel') }, {
        label: t('save'), class: 'primary', onClick: async () => {
          const pr = parseFloat(String(price.value).replace(',', '.'));
          if (!name.value.trim() || !cat.value.trim() || isNaN(pr) || pr < 0) { toast(t('invalid'), 'warn'); return false; }
          const row = { ...d, name: name.value.trim(), nameAr: nameAr.value.trim(), emoji: emoji.value.trim() || '🍞', category: cat.value.trim(), price: pr, stock: parseInt(stock.value, 10) || 0, minStock: parseInt(min.value, 10) || 0, active: true };
          await db.put('products', row); await reload(); toast(t('saved'), 'ok');
        },
      }],
    });
  }

  // Suppression : si le produit a déjà été vendu, on l'ARCHIVE et on l'explique (jamais d'échec silencieux).
  async function removeProduct(p) {
    if (await db.productUsed(p.id)) {
      if (p.active === false) { toast(t('already_archived'), 'warn'); return; }
      openModal({
        title: t('cannot_delete'), body: h('p', {}, t('cannot_delete_hint')),
        actions: [{ label: t('cancel') }, { label: t('archive'), class: 'primary', onClick: async () => { await db.put('products', { ...p, active: false }); await reload(); toast(t('archived_done'), 'ok'); } }],
      });
      return;
    }
    if (!window.confirm(`${t('delete')} « ${p.name} » ?`)) return;
    await db.del('products', p.id); await reload(); toast(t('deleted'), 'ok');
  }

  root.append(h('div', { class: 'toolbar' },
    h('div', { class: 'chips' }, [['all', t('all')], ['low', t('low_stock_short')], ['arch', t('archived')]].map(([k, l]) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: (e) => { filter = k; root.querySelectorAll('.toolbar .chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); draw(); } }, l))),
    h('input', { class: 'input search', type: 'search', placeholder: t('search'), oninput: (e) => { q = e.target.value; draw(); } }),
    h('div', { class: 'grow' }),
    h('button', { class: 'btn primary', onclick: () => productModal(null) }, '＋ ' + t('add_product'))), box);
  draw();
  return root;
}

/* ---------------- Tableau de bord ---------------- */
async function screenDash() {
  const now = Date.now();
  const today0 = startOfDay(now);
  const from = today0 - 29 * DAY;
  const sales = (await db.range('sales', 'ts', from, now + 1)).filter((s) => !s.voided);
  const sum = (arr) => r2(arr.reduce((a, s) => a + s.total, 0));
  const todaySales = sales.filter((s) => s.ts >= today0);
  const yestSales = sales.filter((s) => s.ts >= today0 - DAY && s.ts < today0);
  const todayTotal = sum(todaySales);
  const yestTotal = sum(yestSales);
  const delta = yestTotal > 0 ? Math.round(((todayTotal - yestTotal) / yestTotal) * 100) : null;
  const avg = todaySales.length ? todayTotal / todaySales.length : 0;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const lo = today0 - i * DAY;
    days.push({
      label: new Date(lo).toLocaleDateString(loc(), { weekday: 'short' }),
      value: sum(sales.filter((s) => s.ts >= lo && s.ts < lo + DAY)), hi: i === 0,
    });
  }
  const hours = [];
  for (let hr = 6; hr <= 21; hr++) {
    hours.push({ label: String(hr), value: todaySales.filter((s) => new Date(s.ts).getHours() === hr).length });
  }
  const agg = new Map();
  sales.forEach((s) => s.items.forEach((i) => {
    const a = agg.get(i.pid) || { label: pname(i), value: 0, qty: 0 };
    a.value += i.qty * i.price; a.qty += i.qty; agg.set(i.pid, a);
  }));
  const top = [...agg.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  const topQty = [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 6).map((x) => ({ label: x.label, value: x.qty }));

  const chart = (title, svg, sub) => h('div', { class: 'card chart-card' }, h('h3', {}, title), sub ? h('div', { class: 'muted small' }, sub) : null, h('div', { class: 'svgbox', html: svg }));
  const low = lowStock();

  return h('div', { class: 'page' },
    h('div', { class: 'kpis' },
      kpi(t('revenue_today'), money(todayTotal), true),
      h('div', { class: 'kpi' }, h('div', { class: 'kl' }, t('vs_yesterday')), h('div', { class: 'kv ' + (delta == null ? '' : (delta >= 0 ? 'okc' : 'badc')) }, delta == null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%`)),
      kpi(t('tickets'), todaySales.length), kpi(t('avg_ticket'), money(avg))),
    h('div', { class: 'charts' },
      chart(t('sales_7days'), lineChart(days, { fmt: (v) => Math.round(v) }), S.settings.currency),
      chart(t('tickets_by_hour'), barChart(hours, { fmt: (v) => v, showValues: false }), t('today')),
      chart(t('top_products'), top.length ? hbarChart(top, { fmt: (v) => Math.round(v) }) : `<p class="muted pad">${t('no_sales')}</p>`, `30 ${t('days')} · ${S.settings.currency}`),
      chart(t('top_qty'), topQty.length ? hbarChart(topQty) : `<p class="muted pad">${t('no_sales')}</p>`, `30 ${t('days')}`)),
    low.length ? h('div', { class: 'card' }, h('h3', {}, '⚠ ' + t('low_stock_title')),
      h('div', { class: 'chips' }, low.map((p) => h('span', { class: 'tag ' + (p.stock <= 0 ? 'bad' : 'warn') }, `${p.emoji || ''} ${pname(p)} : ${p.stock}`)))) : null);
}

/* ---------------- Réglages ---------------- */
async function screenSettings() {
  const root = h('div', { class: 'page settings' });
  const field = (label, key, opts = {}) => {
    const input = h('input', { class: 'input', value: S.settings[key] ?? '', ...opts });
    input.addEventListener('change', async () => { await saveSetting(key, input.value); toast(t('saved'), 'ok'); });
    return h('label', { class: 'field' }, h('span', {}, label), input);
  };
  const seg = (label, key, options, after) => h('div', { class: 'field' }, h('span', {}, label),
    h('div', { class: 'seg' }, options.map(([v, l]) => h('button', {
      class: 'seg-btn' + (S.settings[key] === v ? ' on' : ''),
      onclick: async () => { await saveSetting(key, v); if (after) after(v); render(); },
    }, l))));
  const toggle = (label, key) => h('label', { class: 'field row' }, h('span', {}, label),
    h('input', { type: 'checkbox', class: 'switch', checked: S.settings[key] ? true : null, onchange: async (e) => { await saveSetting(key, e.target.checked); } }));

  root.append(
    h('div', { class: 'card stack' }, h('h3', {}, t('set_shop')),
      h('div', { class: 'form' }, field(t('shop_name'), 'shopName'), field(t('address'), 'address'), field(t('phone'), 'phone'), field(t('footer'), 'footer'), field(t('currency'), 'currency', { maxlength: '5' }))),
    h('div', { class: 'card stack' }, h('h3', {}, t('set_language')),
      seg(t('ui_language'), 'lang', [['fr', 'Français'], ['ar', 'العربية']], (v) => setLang(v)),
      seg(t('ticket_language'), 'ticketLang', [['fr', 'Français'], ['ar', 'العربية'], ['both', 'FR + AR']])),
    h('div', { class: 'card stack' }, h('h3', {}, t('set_print')),
      seg(t('paper'), 'paper', [[58, '58 mm'], [80, '80 mm']]),
      seg(t('print_method'), 'printMethod', [['preview', t('pm_preview')], ['rawbt', 'RawBT'], ['system', t('pm_system')]]),
      h('p', { class: 'muted small' }, t('print_hint')),
      toggle(t('auto_print'), 'autoPrint'), toggle(t('cut_paper'), 'cut'),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: () => deliver(buildTestTicket(S.settings), S.settings) }, '🖨 ' + t('test_print')))),
    h('div', { class: 'card stack' }, h('h3', {}, t('set_users')), h('div', { id: 'users' }, usersTable())),
    h('div', { class: 'card stack' }, h('h3', {}, t('set_backup')), h('p', { class: 'muted small' }, t('backup_hint')),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn primary', onclick: exportBackup }, '⬇ ' + t('export')),
        h('label', { class: 'btn' }, '⬆ ' + t('import'), h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: importBackup })))),
    h('div', { class: 'card stack' }, h('h3', {}, t('set_demo')), h('p', { class: 'muted small' }, t('demo_hint')),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn', onclick: () => addDemo() }, t('demo_add')),
        h('button', { class: 'btn danger', onclick: removeDemo }, t('demo_remove')))));
  return root;
}

function usersTable() {
  const box = h('div', { class: 'stack' });
  const draw = () => {
    box.replaceChildren(h('table', { class: 'table' }, h('tbody', {}, S.users.map((u) => h('tr', {},
      h('td', {}, u.name), h('td', {}, u.role === 'admin' ? t('role_admin') : t('role_cashier')),
      h('td', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => userModal(u) }, '✎'),
        h('button', { class: 'btn small danger', onclick: () => delUser(u) }, '🗑')))))),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => userModal(null) }, '＋ ' + t('add_user'))),
      h('p', { class: 'muted small' }, t('pin_hint')));
  };
  async function reload() { S.users = await db.all('users'); draw(); }
  async function delUser(u) {
    if (u.id === S.user.id) { toast(t('cant_delete_self'), 'warn'); return; }
    if (u.role === 'admin' && S.users.filter((x) => x.role === 'admin').length < 2) { toast(t('last_admin'), 'warn'); return; }
    if (!window.confirm(`${t('delete')} « ${u.name} » ?`)) return;
    await db.del('users', u.id); await reload();
  }
  function userModal(u) {
    const name = h('input', { class: 'input', value: u ? u.name : '' });
    const role = h('select', { class: 'input', value: u ? u.role : 'cashier' }, h('option', { value: 'cashier' }, t('role_cashier')), h('option', { value: 'admin' }, t('role_admin')));
    const pin = h('input', { class: 'input', inputmode: 'numeric', maxlength: '4', placeholder: u ? t('pin_keep') : '4 ' + t('digits') });
    openModal({
      title: u ? t('edit_user') : t('add_user'),
      body: h('div', { class: 'form' }, h('label', { class: 'field' }, h('span', {}, t('name')), name), h('label', { class: 'field' }, h('span', {}, t('role')), role), h('label', { class: 'field' }, h('span', {}, 'PIN'), pin)),
      actions: [{ label: t('cancel') }, {
        label: t('save'), class: 'primary', onClick: async () => {
          if (!name.value.trim() || (!u && !/^\d{4}$/.test(pin.value)) || (pin.value && !/^\d{4}$/.test(pin.value))) { toast(t('invalid'), 'warn'); return false; }
          const row = { ...(u || {}), name: name.value.trim(), role: role.value };
          if (pin.value) row.pin = await hashPin(pin.value);
          await db.put('users', row);
          if (u && S.user.id === u.id) S.user = { ...S.user, ...row };
          await reload(); toast(t('saved'), 'ok');
        },
      }],
    });
  }
  draw();
  return box;
}

async function exportBackup() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `sauvegarde-caisse-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  toast(t('export_done'), 'ok');
}

async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!window.confirm(t('import_confirm'))) return;
    await db.importAll(payload);
    S.user = null; await refreshCore(); toast(t('import_done'), 'ok'); render();
  } catch (err) { toast(t('import_bad'), 'bad'); }
}

// Ventes de démonstration (marquées demo:true : elles ne touchent pas au stock et se suppriment à part).
async function addDemo(silent = false) {
  const prods = activeProducts();
  if (!prods.length) return;
  const now = Date.now();
  let n = 0;
  for (let d = 6; d >= 0; d--) {
    const count = 14 + Math.floor(Math.random() * 14);
    const minTs = startOfDay(now) - d * DAY; // pour « aujourd'hui », on répartit les ventes entre minuit et maintenant
    for (let i = 0; i < count; i++) {
      const base = startOfDay(now) - d * DAY;
      const hour = 7 + Math.floor(Math.random() * 13);
      let ts = base + hour * 3600000 + Math.floor(Math.random() * 3600000);
      if (d === 0 && ts > now) ts = minTs + Math.floor(Math.random() * Math.max(60000, now - minTs));
      if (ts > now) continue;
      const lines = 1 + Math.floor(Math.random() * 3);
      const items = [];
      for (let k = 0; k < lines; k++) {
        const p = prods[Math.floor(Math.random() * prods.length)];
        if (!items.find((x) => x.pid === p.id)) items.push({ pid: p.id, name: p.name, nameAr: p.nameAr, qty: 1 + Math.floor(Math.random() * 3), price: p.price });
      }
      const total = r2(items.reduce((a, x) => a + x.qty * x.price, 0));
      await db.put('sales', { ts, userId: S.user ? S.user.id : 1, userName: S.user ? S.user.name : 'Admin', shiftId: 0, items, subtotal: total, discount: 0, total, method: Math.random() < 0.8 ? 'cash' : 'card', paid: total, change: 0, voided: false, demo: true });
      n++;
    }
  }
  if (!silent) toast(`${n} ${t('demo_added')}`, 'ok');
}

async function removeDemo() {
  const all = await db.all('sales');
  let n = 0;
  for (const s of all) if (s.demo) { await db.del('sales', s.id); n++; }
  toast(`${n} ${t('demo_removed')}`, 'ok');
}

/* ---------------- Démarrage ---------------- */
(async function boot() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* facultatif */ }
  await seedIfEmpty();
  await refreshCore();
  // Version DÉMO : au tout premier lancement, on ajoute 7 jours de ventes fictives pour que les graphiques soient parlants.
  if (DEMO_BUILD && !S.settings.demoSeeded) { await addDemo(true); await saveSetting('demoSeeded', true); }
  await render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
