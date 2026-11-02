import { load, screener } from '../lib/data.js';
import { cls, cr, esc, int, num, pct, pctAbs, price } from '../lib/fmt.js';
import { download, h, icon, table, watch } from '../lib/ui.js';

// Every numeric field the filter builder and the views can use.
export const FIELDS = {
  mcap: ['Market cap (₹ cr)', 'n'], close: ['Price', 'n'], r1d: ['1D return', 'p'], r1w: ['1W return', 'p'], r1m: ['1M return', 'p'],
  r3m: ['3M return', 'p'], r6m: ['6M return', 'p'], ytd: ['YTD return', 'p'], r1y: ['1Y return', 'p'], rs: ['RS rating (1–99)', 'n'],
  mom: ['Momentum percentile', 'n'], vol: ['Volatility (ann.)', 'p'], beta: ['Beta vs Nifty', 'n'], dh: ['From 52W high', 'p'],
  dl: ['Above 52W low', 'p'], rsi: ['RSI 14', 'n'], tv: ['Avg traded value (₹ cr)', 'n'], volx: ['Volume vs 50d avg', 'n'],
  dlv: ['Delivery % today', 'n'], dlv20: ['Delivery % 20d', 'n'], pe: ['P/E', 'n'], pb: ['P/B', 'n'], roe: ['ROE', 'p'],
  dy: ['Dividend yield', 'p'], de: ['Debt / equity', 'n'], upside: ['Analyst target upside', 'p'], analysts: ['# analysts', 'n'],
  prom: ['Promoter holding %', 'n'], promchg: ['Promoter change (QoQ, pts)', 'n'],
};

const PRESETS = [
  { id: 'all', name: 'All stocks', f: () => true },
  { id: 'liquid', name: 'Liquid 500', f: (r) => r.liq },
  { id: 'momentum', name: 'Momentum leaders', sig: 'momentum', f: (r) => r.sig.includes('momentum') },
  { id: 'highs', name: 'At 52-week highs', sig: 'high52', f: (r) => r.liq && r.dh >= -0.01 },
  { id: 'rs', name: 'Strong RS in uptrend', f: (r) => r.liq && r.rs >= 80 && r.a50 && r.a200 },
  { id: 'pullback', name: 'Oversold in uptrend', f: (r) => r.liq && r.rsi < 40 && r.a200 },
  { id: 'delivery', name: 'Delivery spike', sig: 'delivery_surge', f: (r) => r.liq && r.dlv && r.dlv20 && r.dlv >= 1.5 * r.dlv20 && r.volx >= 1.5 },
  { id: 'upside', name: 'Analyst upside > 20%', f: (r) => r.upside >= 0.2 && r.analysts >= 5 },
  { id: 'lowvol', name: 'Calm compounders', f: (r) => r.liq && r.vol <= 0.25 && r.r1y >= 0.15 },
  { id: 'value', name: 'P/E < 15, ROE > 15%', f: (r) => r.pe > 0 && r.pe < 15 && r.roe > 0.15 },
  { id: 'promoter', name: 'Promoters buying', f: (r) => r.promchg >= 0.5 },
  { id: 'broken', name: 'Broken trends', f: (r) => r.liq && !r.a200 && r.dh <= -0.3 },
];

const co = (r) => `<div class="co"><b>${esc(r.sym)}${r.fno ? ' <span class="faint" style="font-size:10px">F&O</span>' : ''}</b><span>${esc(r.name)}</span></div>`;
const P = (k, d = 1) => ({ key: k, label: { r1d: '1D', r1w: '1W', r1m: '1M', r3m: '3M', r6m: '6M', ytd: 'YTD', r1y: '1Y' }[k] || k, r: true, fmt: (r) => `<span class="${cls(r[k])}">${pct(r[k], d)}</span>` });

function viewCols(view, sigName) {
  const star = { key: 'star', label: '', sort: false, fmt: (r) => `<button class="icon-btn wl" data-s="${esc(r.sym)}" style="width:26px;height:26px;border:0;background:none;color:${watch.has(r.sym) ? 'var(--warn)' : 'var(--faint)'}" aria-label="Toggle watchlist">${icon('star')}</button>` };
  const stock = { key: 'sym', label: 'Stock', asc: true, fmt: co };
  const sec = { key: 'sector', label: 'Sector', asc: true, fmt: (r) => `<span class="muted">${esc(r.sector)}</span>` };
  const mcap = { key: 'mcap', label: 'Mkt cap', r: true, fmt: (r) => cr(r.mcap) };
  const close = { key: 'close', label: 'Price', r: true, fmt: (r) => price(r.close) };
  const rs = { key: 'rs', label: 'RS', r: true, tip: 'RS rating: 1–99 percentile of weighted 3/6/9/12-month return across all 750 stocks', fmt: (r) => `<span style="color:${r.rs >= 80 ? 'var(--up)' : r.rs <= 20 ? 'var(--down)' : 'inherit'}">${int(r.rs)}</span>` };
  const sig = { key: 'sig', label: 'Signals today', sort: (r) => r.sig.length, fmt: (r) => r.sig.map((x) => `<a class="sym-chip" href="#/signals/${x}">${esc(sigName[x] || x)}</a>`).join(' ') };
  const V = {
    overview: [star, stock, sec, mcap, close, P('r1d', 2), P('r1m'), P('r1y'), rs,
      { key: 'dh', label: 'From high', r: true, fmt: (r) => pct(r.dh) },
      { key: 'pe', label: 'P/E', r: true, fmt: (r) => num(r.pe, 1) }, sig],
    performance: [star, stock, close, P('r1d', 2), P('r1w'), P('r1m'), P('r3m'), P('r6m'), P('ytd'), P('r1y'), rs,
      { key: 'mom', label: 'Mom pct', r: true, tip: '12-1 month momentum percentile in the liquid universe', fmt: (r) => int(r.mom) }],
    technical: [star, stock, close,
      { key: 'rsi', label: 'RSI', r: true, fmt: (r) => `<span class="${r.rsi >= 70 ? 'up' : r.rsi <= 30 ? 'down' : ''}">${num(r.rsi, 0)}</span>` },
      { key: 'a50', label: '50DMA', r: true, sort: (r) => +r.a50, fmt: (r) => (r.a50 ? '<span class="up">above</span>' : '<span class="down">below</span>') },
      { key: 'a200', label: '200DMA', r: true, sort: (r) => +r.a200, fmt: (r) => (r.a200 ? '<span class="up">above</span>' : '<span class="down">below</span>') },
      { key: 'dh', label: 'From high', r: true, fmt: (r) => pct(r.dh) },
      { key: 'dl', label: 'Off low', r: true, fmt: (r) => pct(r.dl) },
      { key: 'vol', label: 'Volatility', r: true, fmt: (r) => pctAbs(r.vol) },
      { key: 'beta', label: 'Beta', r: true, fmt: (r) => num(r.beta, 2) },
      { key: 'volx', label: 'Vol×', r: true, tip: 'Latest volume vs 50-day average', fmt: (r) => num(r.volx, 1) },
      { key: 'dlv', label: 'Deliv %', r: true, fmt: (r) => (r.dlv ? `${num(r.dlv, 0)} <span class="faint">/ ${num(r.dlv20, 0)}</span>` : '—'), tip: 'Delivery % today / 20-day average' },
      { key: 'tv', label: 'Traded/day', r: true, fmt: (r) => cr(r.tv) }],
    fundamentals: [star, stock, sec, mcap,
      { key: 'pe', label: 'P/E', r: true, fmt: (r) => num(r.pe, 1) },
      { key: 'pb', label: 'P/B', r: true, fmt: (r) => num(r.pb, 1) },
      { key: 'roe', label: 'ROE', r: true, fmt: (r) => pctAbs(r.roe, 1) },
      { key: 'dy', label: 'Div yld', r: true, fmt: (r) => pctAbs(r.dy, 2) },
      { key: 'de', label: 'D/E', r: true, fmt: (r) => num(r.de, 0) },
      { key: 'upside', label: 'Target upside', r: true, fmt: (r) => `<span class="${cls(r.upside)}">${pct(r.upside)}</span>` },
      { key: 'analysts', label: 'Analysts', r: true, fmt: (r) => int(r.analysts) },
      { key: 'prom', label: 'Promoter', r: true, fmt: (r) => (r.prom ? `${num(r.prom, 1)}%` : '—') },
      { key: 'promchg', label: 'Δ QoQ', r: true, fmt: (r) => `<span class="${cls(r.promchg)}">${r.promchg ? num(r.promchg, 2) : '—'}</span>` }],
  };
  return V[view];
}

export async function render(root, _parts, qs) {
  const [{ list }, sg] = await Promise.all([screener(), load('signals')]);
  const sigName = Object.fromEntries(sg.signals.map((s) => [s.id, s.name]));
  const sigVerdict = Object.fromEntries(sg.signals.map((s) => [s.id, s]));
  const st = {
    preset: qs.get('p') || 'liquid', view: qs.get('v') || 'overview', q: '', sector: '', fno: false, extra: [],
  };
  const sectors = [...new Set(list.map((r) => r.sector))].sort();

  root.append(h(`<div class="ph"><div><div class="eyebrow">Screener</div><h1>Screen ${list.length} NSE stocks</h1>
    <p>Start from a preset, add your own conditions, and sort any column. Presets tied to a tested signal show its measured track record.</p></div></div>`));
  root.append(h(`<div class="chips" id="presets" style="margin-bottom:14px">${PRESETS.map((p) => `<button class="chip" data-p="${p.id}">${esc(p.name)}</button>`).join('')}</div>`));
  const card = h(`<div class="card">
    <div class="toolbar">
      <input class="input" id="sq" placeholder="Filter by symbol or name" style="width:200px">
      <select class="input" id="sec"><option value="">All sectors</option>${sectors.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
      <label class="chip" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="fno" style="margin:0"> F&O only</label>
      <span style="width:1px;height:20px;background:var(--line)"></span>
      <select class="input" id="ff">${Object.entries(FIELDS).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <select class="input" id="fo"><option value="ge">≥</option><option value="le">≤</option></select>
      <input class="input" id="fv" placeholder="value" style="width:90px" inputmode="decimal">
      <button class="btn" id="fadd">Add condition</button>
      <span class="count" id="cnt"></span>
    </div>
    <div class="toolbar" id="extra" style="display:none"></div>
    <div class="toolbar" style="justify-content:space-between">
      <div class="seg" id="views">${['overview', 'performance', 'technical', 'fundamentals'].map((v) => `<button data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
      <div id="pnote" class="muted" style="font-size:12px;flex:1;min-width:200px"></div>
      <button class="btn" id="csv">${icon('download')} CSV</button>
    </div>
    <div id="tbl"></div>
  </div>`);
  root.append(card);
  const $ = (s) => card.querySelector(s);
  let tbl = null;

  function rows() {
    const p = PRESETS.find((x) => x.id === st.preset) || PRESETS[0];
    const q = st.q.toUpperCase();
    return list.filter((r) => p.f(r)
      && (!q || r.sym.includes(q) || r.name.toUpperCase().includes(q))
      && (!st.sector || r.sector === st.sector)
      && (!st.fno || r.fno)
      && st.extra.every(([k, op, v]) => r[k] !== null && r[k] !== undefined && (op === 'ge' ? r[k] >= v : r[k] <= v)));
  }
  function draw(rebuild) {
    root.querySelectorAll('#presets .chip').forEach((b) => b.classList.toggle('on', b.dataset.p === st.preset));
    card.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
    const p = PRESETS.find((x) => x.id === st.preset);
    const s = p?.sig && sigVerdict[p.sig];
    $('#pnote').innerHTML = s ? `Tested as <a href="#/signals/${s.id}" style="color:var(--accent)">${esc(s.name)}</a>: ${pct(s.horizons['20'].mean, 2)} avg 20-session excess, t ${s.horizons['20'].t?.toFixed(2) ?? '—'} · <span class="tag ${s.verdict} plain" style="padding:1px 6px">${s.verdict === 'edge' ? 'measured edge' : s.verdict === 'negative' ? 'works in reverse' : 'no measured edge'}</span>` : '';
    const rs = rows();
    $('#cnt').textContent = `${rs.length} of ${list.length} stocks`;
    if (rebuild || !tbl) {
      const cols = viewCols(st.view, sigName);
      const want = st.preset === 'momentum' ? 'rs' : st.view === 'performance' ? 'r1m' : st.view === 'technical' ? 'rsi' : 'mcap';
      const sortKey = cols.some((c) => c.key === want) ? want : 'sym';
      tbl = table($('#tbl'), cols, { rows: rs, sortKey, onRow: (r) => (location.hash = `#/s/${encodeURIComponent(r.sym)}`), maxHeight: '70vh' });
    } else tbl.update(rs);
    $('#extra').style.display = st.extra.length ? 'flex' : 'none';
    $('#extra').innerHTML = st.extra.map(([k, op, v], i) => `<span class="chip on" data-i="${i}">${esc(FIELDS[k][0])} ${op === 'ge' ? '≥' : '≤'} ${FIELDS[k][1] === 'p' ? `${(v * 100).toFixed(1)}%` : v} ✕</span>`).join('') + '<button class="btn" id="fclr">Clear conditions</button>';
    history.replaceState(null, '', `#/screener?p=${st.preset}&v=${st.view}`);
  }

  root.querySelector('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) { st.preset = b.dataset.p; draw(true); }
  });
  $('#views').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { st.view = b.dataset.v; draw(true); }
  });
  $('#sq').addEventListener('input', (e) => { st.q = e.target.value; draw(); });
  $('#sec').addEventListener('change', (e) => { st.sector = e.target.value; draw(); });
  $('#fno').addEventListener('change', (e) => { st.fno = e.target.checked; draw(); });
  const addCond = () => {
    const k = $('#ff').value;
    let v = parseFloat($('#fv').value);
    if (Number.isNaN(v)) return;
    if (FIELDS[k][1] === 'p') v /= 100;         // percent fields are typed as percentages
    st.extra.push([k, $('#fo').value, v]);
    $('#fv').value = '';
    draw();
  };
  $('#fadd').addEventListener('click', addCond);
  $('#fv').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCond(); });
  $('#ff').addEventListener('change', () => { $('#fv').placeholder = FIELDS[$('#ff').value][1] === 'p' ? 'value in %' : 'value'; });
  $('#extra').addEventListener('click', (e) => {
    if (e.target.id === 'fclr') { st.extra = []; draw(); return; }
    const c = e.target.closest('.chip');
    if (c) { st.extra.splice(+c.dataset.i, 1); draw(); }
  });
  $('#tbl').addEventListener('click', (e) => {
    const b = e.target.closest('.wl');
    if (!b) return;
    e.stopPropagation();
    const on = watch.toggle(b.dataset.s);
    b.style.color = on ? 'var(--warn)' : 'var(--faint)';
  }, true);
  $('#csv').addEventListener('click', () => {
    const keys = ['sym', 'name', 'sector', 'industry', ...Object.keys(FIELDS), 'sig'];
    const q = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const csv = [keys.join(','), ...tbl.sorted().map((r) => keys.map((k) => q(Array.isArray(r[k]) ? r[k].join(' ') : r[k])).join(','))].join('\n');
    download(`tapeline-screener-${st.preset}.csv`, csv);
  });
  $('#fv').placeholder = FIELDS.mcap[1] === 'p' ? 'value in %' : 'value';
  draw(true);
}
