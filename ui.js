// Petits outils d'interface : création d'éléments, fenêtres (modales) et messages.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// h('div', {class:'x', onclick: fn}, 'texte', autreElement)
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (value !== undefined) el.value = value;
  return el;
}

export function openModal({ title, body, actions = [], wide = false, sticky = false, onClose } = {}) {
  const back = h('div', { class: 'backdrop' });
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); if (onClose) onClose(); };
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    title ? h('h2', {}, title) : null,
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map((a) => h('button', {
      class: 'btn ' + (a.class || ''),
      onclick: async (e) => {
        const r = a.onClick ? await a.onClick(e) : undefined;
        if (!a.keepOpen && r !== false) close();
      },
    }, a.label))) : null);
  back.append(box);
  if (!sticky) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.getElementById('modal-root').append(back);
  return { close, el: box };
}

let timer;
export function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 3200);
}
