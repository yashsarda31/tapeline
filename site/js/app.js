import { disposeAll, rethemeAll } from './lib/charts.js';
import { meta, screener } from './lib/data.js';
import { date, esc, pct, cls, price } from './lib/fmt.js';
import { hydrateIcons, icon, initTips } from './lib/ui.js';

const ROUTES = {
  '': () => import('./pages/market.js'),
  sectors: () => import('./pages/sectors.js'),
  factors: () => import('./pages/factors.js'),
  signals: () => import('./pages/signals.js'),
  screener: () => import('./pages/screener.js'),
  watchlist: () => import('./pages/watchlist.js'),
  s: () => import('./pages/stock.js'),
  method: () => import('./pages/method.js'),
};
const NAV = { '': 'market', s: null };

const main = document.getElementById('main');
let seq = 0;

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const key = parts[0] || '';
  const loader = ROUTES[key];
  const my = ++seq;
  document.getElementById('side').classList.remove('open');
  const navKey = key in NAV ? NAV[key] : key;
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === navKey));
  disposeAll();
  document.title = 'Tapeline · NSE market analytics with receipts';
  if (!loader) {
    main.innerHTML = `<div class="empty"><h2>Page not found</h2><p><a class="btn" href="#/">Back to market</a></p></div>`;
    return;
  }
  main.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const mod = await loader();
    if (my !== seq) return;
    main.innerHTML = '';
    await mod.render(main, parts.slice(1), new URLSearchParams(query || ''));
    if (my !== seq) return;
    hydrateIcons(main);
    if (!sessionStorage.getItem('tl-keep-scroll')) window.scrollTo(0, 0);
    sessionStorage.removeItem('tl-keep-scroll');
  } catch (e) {
    console.error(e);
    if (my === seq) main.innerHTML = `<div class="empty"><h2>Couldn't load this page</h2><p class="muted">${esc(e.message)}</p></div>`;
  }
}

// ---------- search ----------
const modal = document.getElementById('search');
const q = document.getElementById('q');
const res = document.getElementById('qres');
let hits = [], sel = 0;

async function openSearch() {
  modal.hidden = false;
  q.value = '';
  q.focus();
  await renderHits();
}
function closeSearch() { modal.hidden = true; }

const PAGES = [
  ['Market pulse', '#/'], ['Sector rotation', '#/sectors'], ['Factor monitor', '#/factors'],
  ['Signal lab', '#/signals'], ['Screener', '#/screener'], ['Watchlist', '#/watchlist'], ['Methodology', '#/method'],
];

async function renderHits() {
  const { list } = await screener();
  const s = q.value.trim().toUpperCase();
  let stocks;
  if (!s) {
    stocks = [...list].filter((r) => r.liq).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 8);
  } else {
    const score = (r) => {
      const n = r.name.toUpperCase();
      if (r.sym === s) return 0;
      if (r.sym.startsWith(s)) return 1;
      if (n.startsWith(s)) return 2;
      if (r.sym.includes(s)) return 3;
      if (n.includes(s)) return 4;
      return 9;
    };
    stocks = list.map((r) => [score(r), r]).filter(([k]) => k < 9)
      .sort((a, b) => a[0] - b[0] || (b[1].mcap || 0) - (a[1].mcap || 0)).slice(0, 12).map(([, r]) => r);
  }
  const pages = s ? PAGES.filter(([n]) => n.toUpperCase().includes(s)) : [];
  hits = [...pages.map(([n, href]) => ({ href, page: n })), ...stocks.map((r) => ({ href: `#/s/${encodeURIComponent(r.sym)}`, r }))];
  sel = 0;
  res.innerHTML = (pages.length ? '<div class="sr-h">Pages</div>' : '') +
    hits.map((hh, i) => {
      if (hh.page) return `<a class="sr ${i === sel ? 'on' : ''}" href="${hh.href}" data-i="${i}"><span class="s">${icon('arrow')}</span><span class="nm">${hh.page}</span></a>`;
      const r = hh.r;
      const head = i === pages.length ? `<div class="sr-h">${s ? 'Stocks' : 'Largest stocks'}</div>` : '';
      return `${head}<a class="sr ${i === sel ? 'on' : ''}" href="${hh.href}" data-i="${i}"><span class="s">${esc(r.sym)}</span><span class="nm">${esc(r.name)}</span><span class="c">${price(r.close)}</span><span class="c ${cls(r.r1d)}">${pct(r.r1d)}</span></a>`;
    }).join('') || '<div class="empty">No match</div>';
}
function move(d) {
  if (!hits.length) return;
  sel = (sel + d + hits.length) % hits.length;
  res.querySelectorAll('.sr').forEach((el) => el.classList.toggle('on', +el.dataset.i === sel));
  res.querySelector('.sr.on')?.scrollIntoView({ block: 'nearest' });
}

q.addEventListener('input', renderHits);
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter' && hits[sel]) { location.hash = hits[sel].href; closeSearch(); }
  else if (e.key === 'Escape') closeSearch();
});
res.addEventListener('click', () => closeSearch());
modal.addEventListener('click', (e) => { if (e.target === modal) closeSearch(); });
document.getElementById('searchBtn').addEventListener('click', openSearch);
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    openSearch();
  }
});

// ---------- theme / menu ----------
const themeBtn = document.getElementById('themeBtn');
function syncThemeIcon() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('tl-theme', next); } catch {}
  syncThemeIcon();
  rethemeAll();
});
document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('side').classList.toggle('open'));

// ---------- boot ----------
hydrateIcons();
syncThemeIcon();
initTips();
meta().then((m) => {
  document.getElementById('asofPill').innerHTML = `Data as of <b>${date(m.asof)}</b>`;
  document.getElementById('asof').innerHTML =
    `End-of-day data · <b>${date(m.asof)}</b><br>${m.symbols} stocks · liquid universe ${m.universe}<br>Built ${esc(m.built)}`;
}).catch(() => {});
window.addEventListener('hashchange', route);
route();
