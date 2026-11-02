import { esc } from './fmt.js';

const ICONS = {
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7L4 5z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7V4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
export const icon = (name) => `<i data-icon="${name}"><svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg></i>`;
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]:not(:has(svg))').forEach((el) => {
    el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[el.dataset.icon] || ''}</svg>`;
  });
}

export const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

// Hover help: any element with data-tip shows a tooltip.
export function initTips() {
  const tip = document.getElementById('tip');
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = Math.min(300, tip.offsetWidth);
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (r.bottom + 8 + tip.offsetHeight > window.innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-tip]')) tip.hidden = true;
  });
}
export const help = (text) => `<span class="help" data-tip="${esc(text)}">?</span>`;

export function seg(options, value, onChange) {
  const el = h(`<div class="seg">${options.map(([v, l]) => `<button data-v="${v}" class="${v === value ? 'on' : ''}">${l}</button>`).join('')}</div>`);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    onChange(b.dataset.v);
  });
  return el;
}

/**
 * Sortable table. columns: [{key, label, r (right-align), fmt(row) -> html, sort(row) -> value, tip}]
 * opts: {rows, sortKey, sortDir, onRow(row), rowClass(row), limit}
 */
export function table(host, columns, opts) {
  let { sortKey = null, sortDir = -1 } = opts;
  let rows = opts.rows;
  const wrap = h('<div class="tbl-wrap"><table class="t"><thead></thead><tbody></tbody></table></div>');
  if (opts.maxHeight) wrap.style.maxHeight = opts.maxHeight;
  const thead = wrap.querySelector('thead');
  const tbody = wrap.querySelector('tbody');
  host.replaceChildren(wrap);

  function head() {
    thead.innerHTML = `<tr>${columns.map((c) => {
      const s = c.sort !== false ? 'sort' : '';
      const d = c.key === sortKey ? (sortDir > 0 ? 'asc' : 'desc') : '';
      return `<th class="${s} ${d} ${c.r ? 'r' : ''}" data-k="${c.key}"${c.tip ? ` data-tip="${esc(c.tip)}"` : ''}>${c.label}</th>`;
    }).join('')}</tr>`;
  }
  function body() {
    let rs = rows;
    const col = sortKey && columns.find((c) => c.key === sortKey);
    if (col) {
      const get = typeof col.sort === 'function' ? col.sort : (r) => r[sortKey];
      rs = [...rows].sort((a, b) => {
        const va = get(a), vb = get(b);
        const na = va === null || va === undefined || Number.isNaN(va), nb = vb === null || vb === undefined || Number.isNaN(vb);
        if (na && nb) return 0;
        if (na) return 1;
        if (nb) return -1;
        return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sortDir;
      });
    }
    if (opts.limit) rs = rs.slice(0, opts.limit);
    if (!rs.length) {
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty">${opts.empty || 'Nothing matches.'}</td></tr>`;
      return;
    }
    tbody.innerHTML = rs.map((r, i) => `<tr data-i="${i}" class="${opts.onRow ? 'link' : ''} ${opts.rowClass ? opts.rowClass(r) : ''}">${columns.map((c) =>
      `<td class="${c.r ? 'r num' : ''} ${c.cls || ''}">${c.fmt ? c.fmt(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
    tbody._rows = rs;
  }
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th.sort');
    if (!th) return;
    const k = th.dataset.k;
    if (sortKey === k) sortDir = -sortDir;
    else { sortKey = k; sortDir = columns.find((c) => c.key === k).asc ? 1 : -1; }
    head(); body();
  });
  if (opts.onRow) {
    tbody.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-i]');
      if (tr) opts.onRow(tbody._rows[+tr.dataset.i], e);
    });
  }
  head(); body();
  return {
    update(newRows) { rows = newRows; body(); },
    sorted() { return tbody._rows || []; },
  };
}

export function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Watchlist lives in this browser only.
const WL_KEY = 'tl-watch';
export const watch = {
  all() { try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]'); } catch { return []; } },
  has(s) { return this.all().includes(s); },
  toggle(s) {
    const w = this.all();
    const i = w.indexOf(s);
    if (i >= 0) w.splice(i, 1); else w.push(s);
    try { localStorage.setItem(WL_KEY, JSON.stringify(w)); } catch {}
    window.dispatchEvent(new Event('tl-watch'));
    return i < 0;
  },
};
