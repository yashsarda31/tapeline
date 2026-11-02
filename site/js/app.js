import { disposeAll, rethemeAll } from './lib/charts.js';
import { load, meta, screener } from './lib/data.js';
import { date, esc, num, pct, cls, price } from './lib/fmt.js';
import { hydrateIcons, icon, initTips, watch } from './lib/ui.js';

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

const SKELETON = `<div class="skel" aria-busy="true" aria-label="Loading">
  <div class="sk" style="width:150px;height:12px"></div><div class="sk" style="width:min(520px,80%);height:36px;margin-top:6px"></div>
  <div class="sk" style="width:min(700px,92%);height:14px"></div><div class="sk" style="width:min(560px,70%);height:14px"></div>
  <div class="skel-row"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
  <div class="sk" style="height:340px;border-radius:14px;margin-top:2px"></div></div>`;

// Breadcrumb from the nav: "Section / Page".
function crumb(navKey, key, parts) {
  const link = document.querySelector(`#nav a[data-r="${navKey}"]`);
  let sec = '', page = '';
  if (link) {
    page = link.textContent.trim();
    let p = link.previousElementSibling;
    while (p && !p.classList.contains('nav-h')) p = p.previousElementSibling;
    sec = p?.textContent || '';
  }
  if (key === 's') { sec = 'Stocks'; page = parts[1] || ''; }
  document.getElementById('crumb').innerHTML = `${sec ? `<span>${esc(sec)}</span><i>/</i>` : ''}<b>${esc(page)}</b>`;
}

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
  crumb(navKey, key, parts);
  syncWatchCount();
  disposeAll();
  document.title = 'Tapeline · NSE market analytics with receipts';
  if (!loader) {
    main.innerHTML = `<div class="empty"><h2>Page not found</h2><p><a class="btn" href="#/">Back to market</a></p></div>`;
    return;
  }
  main.innerHTML = SKELETON;
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
const side = document.getElementById('side');
document.getElementById('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); side.classList.toggle('open'); });
document.addEventListener('click', (e) => {
  if (side.classList.contains('open') && !side.contains(e.target)) side.classList.remove('open');
});

// ---------- watchlist count ----------
function syncWatchCount() {
  const n = watch.all().length;
  document.getElementById('wlCount').textContent = n ? String(n) : '';
}
window.addEventListener('tl-watch', syncWatchCount);
window.addEventListener('storage', syncWatchCount);

// ---------- ticker tape ----------
function tape(mk) {
  const track = document.getElementById('tapeTrack');
  const item = (x) => {
    const inv = x.id === 'vix';
    return `<span class="tk"><span class="tk-n">${esc(x.label)}</span><span class="tk-p">${num(x.last, x.last > 1000 ? 1 : 2)}</span><span class="tk-c ${cls(inv ? -x.r1d : x.r1d)}">${pct(x.r1d, 2)}</span></span>`;
  };
  const run = mk.indices.map(item).join('');
  track.innerHTML = `<div class="tape-run">${run}</div><div class="tape-run" aria-hidden="true">${run}</div>`;
  // Constant reading speed whatever the content width.
  track.style.setProperty('--dur', `${Math.max(30, track.firstElementChild.offsetWidth / 40)}s`);
}

// ---------- boot ----------
hydrateIcons();
syncThemeIcon();
initTips();
document.getElementById('kbdHint').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
meta().then((m) => {
  document.getElementById('asofPill').innerHTML = `<span class="dot"></span>EOD <b>${date(m.asof)}</b>`;
  document.getElementById('asof').innerHTML =
    `<div class="st"><span class="dot live"></span>End-of-day · <b>${date(m.asof)}</b></div>${m.symbols} stocks · liquid universe ${m.universe}<br><span class="faint">Built ${esc(m.built)}</span>`;
  document.getElementById('qMeta').textContent = `${m.symbols} NSE stocks · ${PAGES.length} pages`;
}).catch(() => {});
load('market').then(tape).catch(() => document.getElementById('tape').remove());
window.addEventListener('hashchange', route);
route();
