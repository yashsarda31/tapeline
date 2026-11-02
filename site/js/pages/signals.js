import { axis, base, chart, tooltipRow } from '../lib/charts.js';
import { load, screener } from '../lib/data.js';
import { cls, date, esc, int, num, pct, pctAbs, price, t as tf } from '../lib/fmt.js';
import { h, help, icon, seg, table } from '../lib/ui.js';

const VERDICT = {
  edge: ['Measured edge', 'edge'],
  none: ['No measured edge', 'none'],
  negative: ['Works in reverse', 'negative'],
};
export const verdictTag = (v, side) => {
  const [label, c] = VERDICT[v] || VERDICT.none;
  const txt = side === 'short' && v === 'edge' ? 'Measured edge (short)' : label;
  return `<span class="tag ${c}">${txt}</span>`;
};

export async function render(root, parts) {
  const [sg, scr] = await Promise.all([load('signals'), screener()]);
  if (parts[0]) return detail(root, sg, scr, parts[0]);
  overview(root, sg);
}

function hbars(hz, side) {
  const vals = ['5', '20', '60'].map((k) => hz[k]?.mean ?? null);
  const lim = Math.max(0.01, ...vals.map((v) => Math.abs(v || 0))) * 1.1;
  return `<div class="hbars">${['5', '20', '60'].map((k, i) => {
    const v = vals[i];
    const w = v === null ? 0 : (Math.abs(v) / lim) * 50;
    const good = side === 'short' ? v < 0 : v > 0;
    const color = v === null ? 'transparent' : good ? 'var(--up)' : 'var(--down)';
    const left = v >= 0 ? 50 : 50 - w;
    return `<div class="hbar"><span>${k}d</span><div class="trk"><div class="fill" style="left:${left}%;width:${w}%;background:${color}"></div></div><span class="val">${pct(v, 2)}</span></div>`;
  }).join('')}</div>`;
}

function overview(root, sg) {
  const S = sg.signals;
  const nEdge = S.filter((s) => s.verdict === 'edge').length;
  const nNeg = S.filter((s) => s.verdict === 'negative').length;
  const first = S.map((s) => s.first).filter(Boolean).sort()[0];
  root.append(h(`<div class="ph"><div>
    <div class="eyebrow">Signal lab</div>
    <h1>Screens with receipts</h1>
    <p>Most screeners show you which stocks match a pattern and stop there. Here, every screen comes with its track record: what stocks that triggered it went on to do, compared with the rest of the market.</p>
  </div></div>`));
  root.append(h(`<p class="lede">We tested <b>${S.length} popular screens</b> on every trigger in the liquid NSE universe since ${date(first)}. <b>${nEdge}</b> show a measured edge after costs, <b>${nNeg}</b> ${nNeg === 1 ? 'has' : 'have'} worked in reverse, and the other ${S.length - nEdge - nNeg} are indistinguishable from picking stocks at random. The rule for each label is fixed and shown below each card.</p>`));

  const bar = h(`<div class="split" style="margin-bottom:14px"><div class="chips" id="vf"></div><div class="srt"></div></div>`);
  root.append(bar);
  const grid = h('<div class="grid g3"></div>');
  root.append(grid);
  let filter = 'all', sort = 't';
  const chips = [['all', 'All'], ['edge', 'Measured edge'], ['none', 'No edge'], ['negative', 'Works in reverse']];
  bar.querySelector('#vf').innerHTML = chips.map(([v, l]) => `<button class="chip ${v === filter ? 'on' : ''}" data-v="${v}">${l}</button>`).join('');
  bar.querySelector('#vf').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter = b.dataset.v;
    bar.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
  bar.querySelector('.srt').append(seg([['t', 'Sort by evidence'], ['today', 'By matches today']], sort, (v) => { sort = v; draw(); }));

  function draw() {
    const sgn = (s) => (s.side === 'short' ? -1 : 1);
    let list = S.filter((s) => filter === 'all' || s.verdict === filter);
    list = [...list].sort((a, b) => (sort === 'today' ? b.today.length - a.today.length
      : (b.horizons['20'].t ?? -99) * sgn(b) - (a.horizons['20'].t ?? -99) * sgn(a)));
    grid.innerHTML = list.map((s) => {
      const hz = s.horizons['20'];
      return `<a class="card sig" href="#/signals/${s.id}">
        <div class="row"><span class="grp">${esc(s.group)}${s.side === 'short' ? ' · bearish' : ''}</span>${verdictTag(s.verdict, s.side)}</div>
        <h3>${esc(s.name)}</h3>
        <div class="row" style="align-items:flex-end"><div><div class="big ${cls(hz.mean)}">${pct(hz.mean, 2)}</div><div class="muted" style="font-size:11.5px">avg excess return, next 20 sessions</div></div></div>
        ${hbars(s.horizons, s.side)}
        <div class="meta"><div>t-stat<b>${tf(hz.t)}</b></div><div>Beat market<b>${pctAbs(hz.hit)}</b></div><div>Triggers<b>${int(hz.n)}</b></div></div>
        <div class="row" style="border-top:1px solid var(--line);padding-top:10px;font-size:12px"><span class="muted">${s.today.length ? `<b style="color:var(--text)">${s.today.length}</b> match${s.today.length === 1 ? '' : 'es'} today` : 'No matches today'}</span><span class="muted">${icon('arrow')}</span></div>
      </a>`;
    }).join('') || '<div class="empty">None.</div>';
  }
  draw();

  root.append(h(`<div class="section note"><b>How to read this.</b> "Excess return" is the stock's return over the next 5, 20 or 60 sessions minus the equal-weight return of the whole liquid universe over the same window, so a market-wide rally doesn't flatter a screen. The t-stat treats all triggers inside the same ${sg.head}-session window as one observation, so fifty breakouts on a single strong day count once. <b>Measured edge</b> requires t ≥ 2, a positive average in both halves of the history, and an average that still clears ${pctAbs(sg.cost, 1)} round-trip costs. <a href="#/method" style="color:var(--accent)">Full methodology →</a></div>`));
}

function detail(root, sg, scr, id) {
  const s = sg.signals.find((x) => x.id === id);
  if (!s) { root.innerHTML = '<div class="empty">Unknown signal.</div>'; return; }
  const hz = s.horizons;
  const H = hz['20'];
  root.append(h(`<a class="btn" href="#/signals" style="margin-bottom:16px">${icon('back')} All screens</a>`));
  root.append(h(`<div class="ph"><div>
    <div class="eyebrow">${esc(s.group)} · signal lab</div>
    <h1>${esc(s.name)}</h1>
    <p><b>Rule:</b> ${esc(s.rule)}</p>
  </div><div>${verdictTag(s.verdict, s.side)}</div></div>`));
  root.append(h(`<p class="lede">${story(s, sg)}</p>`));

  root.append(h(`<div class="grid g4">
    <div class="card stat"><div class="k">Avg excess, next 20 sessions</div><div class="v ${cls(H.mean)}">${pct(H.mean, 2)}</div><div class="d">median ${pct(H.median, 2)} · after costs ${pct(H.mean - (s.side === 'short' ? -sg.cost : sg.cost), 2)}</div></div>
    <div class="card stat"><div class="k">t-stat ${help('Cluster-robust over non-overlapping 20-session blocks. |t| ≥ 2 is roughly the 5% significance line.')}</div><div class="v">${tf(H.t)}</div><div class="d">${int(H.n)} triggers on ${int(H.dates)} days</div></div>
    <div class="card stat"><div class="k">Beat the market</div><div class="v">${pctAbs(H.hit)}</div><div class="d">of triggers outperformed the universe</div></div>
    <div class="card stat"><div class="k">Stability ${help('The history split in two halves by trigger date. A real effect should show up in both.')}</div><div class="v"><span class="${cls(H.h1)}">${pct(H.h1, 2)}</span> <span class="faint">/</span> <span class="${cls(H.h2)}">${pct(H.h2, 2)}</span></div><div class="d">first half / second half · last 12m ${pct(H.recent?.mean, 2)} (${int(H.recent?.n)})</div></div>
  </div>`));

  // horizon table
  const ht = h(`<div class="card section"><div class="card-h"><h2>By holding period</h2></div><div class="card-b" style="padding-top:8px"></div></div>`);
  root.append(ht);
  table(ht.querySelector('.card-b'), [
    { key: 'h', label: 'Hold', sort: false, fmt: (r) => `<b>${r.h} sessions</b>` },
    { key: 'n', label: 'Triggers', r: true, sort: false, fmt: (r) => int(r.n) },
    { key: 'raw', label: 'Avg return', r: true, sort: false, fmt: (r) => `<span class="${cls(r.raw)}">${pct(r.raw, 2)}</span>` },
    { key: 'base', label: 'Universe', r: true, sort: false, tip: 'Equal-weight universe return over the same windows', fmt: (r) => pct(r.base, 2) },
    { key: 'mean', label: 'Excess', r: true, sort: false, fmt: (r) => `<b class="${cls(r.mean)}">${pct(r.mean, 2)}</b>` },
    { key: 'median', label: 'Median', r: true, sort: false, fmt: (r) => pct(r.median, 2) },
    { key: 'hit', label: 'Beat mkt', r: true, sort: false, fmt: (r) => pctAbs(r.hit) },
    { key: 'p', label: '10th / 90th pct', r: true, sort: false, fmt: (r) => `${pct(r.p10, 1)} / ${pct(r.p90, 1)}` },
    { key: 't', label: 't-stat', r: true, sort: false, fmt: (r) => `<b>${tf(r.t)}</b>` },
  ], { rows: ['5', '20', '60'].map((k) => ({ h: k, ...hz[k] })) });

  // charts
  const ch = h(`<div class="grid g2 section">
    <div class="card"><div class="card-h"><div><h3>Excess return by year</h3><div class="sub">20-session excess, average per trigger</div></div></div><div class="card-b"><div class="chart" id="cy"></div></div></div>
    <div class="card"><div class="card-h"><div><h3>Has it decayed?</h3><div class="sub">Running average of 20-session excess, by trigger date</div></div></div><div class="card-b"><div class="chart" id="cc"></div></div></div>
    <div class="card span2"><div class="card-h"><div><h3>Distribution of outcomes</h3><div class="sub">20-session excess per trigger. The average hides a wide spread; most single trades are noise.</div></div></div><div class="card-b"><div class="chart sm" id="ch"></div></div></div>
  </div>`);
  root.append(ch);
  chart(ch.querySelector('#cy'), (c) => ({
    ...base(c),
    xAxis: { type: 'category', data: H.years.map((y) => y[0]), ...axis(c), splitLine: { show: false } },
    yAxis: { type: 'value', ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => pct(v, 0) } },
    tooltip: { ...base(c).tooltip, formatter: (p) => `<b>${p[0].name}</b><br>${pct(p[0].value, 2)} avg excess<br><span style="color:${c.muted}">${H.years[p[0].dataIndex][2]} triggers</span>` },
    series: [{ type: 'bar', barMaxWidth: 26, data: H.years.map((y) => ({ value: y[1], itemStyle: { color: y[1] >= 0 ? c.up : c.down, borderRadius: 3 } })) }],
  }));
  chart(ch.querySelector('#cc'), (c) => ({
    ...base(c),
    xAxis: { type: 'category', data: H.curve.map((x) => x[0]), ...axis(c), splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => pct(v, 1) } },
    tooltip: { ...base(c).tooltip, valueFormatter: (v) => pct(v, 2) },
    series: [{ type: 'line', data: H.curve.map((x) => x[1]), symbol: 'none', color: c.accent, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: c.line2, type: 'dashed' }, data: [{ yAxis: 0 }], label: { show: false } } }],
  }));
  const ed = H.hist.edges;
  chart(ch.querySelector('#ch'), (c) => ({
    ...base(c),
    xAxis: { type: 'category', data: ed.slice(0, -1).map((e, i) => `${(e * 100).toFixed(0)}%`), ...axis(c), splitLine: { show: false } },
    yAxis: { type: 'value', ...axis(c) },
    tooltip: { ...base(c).tooltip, formatter: (p) => `${(ed[p[0].dataIndex] * 100).toFixed(0)}% to ${(ed[p[0].dataIndex + 1] * 100).toFixed(0)}%: <b>${int(p[0].value)}</b> triggers` },
    series: [{ type: 'bar', barCategoryGap: '8%', data: H.hist.counts.map((v, i) => ({ value: v, itemStyle: { color: ed[i] >= 0 ? c.up : c.down, opacity: 0.75, borderRadius: 2 } })) }],
  }));

  // today's matches
  const rows = s.today.map((sym) => scr.bySym.get(sym)).filter(Boolean);
  const tm = h(`<div class="card section"><div class="card-h"><div><h2>Matching today</h2><div class="sub">${rows.length} stocks in the liquid universe triggered on the latest session</div></div></div><div class="card-b" style="padding-top:8px"></div></div>`);
  root.append(tm);
  table(tm.querySelector('.card-b'), [
    { key: 'sym', label: 'Stock', asc: true, fmt: (r) => `<div class="co"><b>${esc(r.sym)}</b><span>${esc(r.name)}</span></div>` },
    { key: 'sector', label: 'Sector', fmt: (r) => `<span class="muted">${esc(r.sector)}</span>` },
    { key: 'close', label: 'Close', r: true, fmt: (r) => price(r.close) },
    { key: 'r1d', label: '1D', r: true, fmt: (r) => `<span class="${cls(r.r1d)}">${pct(r.r1d, 2)}</span>` },
    { key: 'r1m', label: '1M', r: true, fmt: (r) => `<span class="${cls(r.r1m)}">${pct(r.r1m)}</span>` },
    { key: 'volx', label: 'Vol vs avg', r: true, fmt: (r) => (r.volx ? `${num(r.volx, 1)}×` : '—') },
    { key: 'rs', label: 'RS rating', r: true, tip: '1–99 percentile of weighted 3/6/9/12-month return', fmt: (r) => int(r.rs) },
    { key: 'dh', label: 'From 52W high', r: true, fmt: (r) => pct(r.dh) },
    { key: 'mcap', label: 'Mkt cap', r: true, fmt: (r) => (r.mcap ? `₹${int(r.mcap)} cr` : '—') },
  ], { rows, sortKey: 'rs', onRow: (r) => (location.hash = `#/s/${encodeURIComponent(r.sym)}`), empty: 'No stock triggered this screen on the latest session.' });

  // recent events
  const ev = h(`<div class="card section"><div class="card-h"><div><h2>Recent triggers and how they did</h2><div class="sub">Realised 20-session excess return. Triggers younger than 20 sessions are still open.</div></div></div><div class="card-b" style="padding-top:8px"></div></div>`);
  root.append(ev);
  table(ev.querySelector('.card-b'), [
    { key: 0, label: 'Date', fmt: (r) => date(r[0]), sort: (r) => r[0] },
    { key: 1, label: 'Stock', fmt: (r) => `<a class="sym-chip" href="#/s/${encodeURIComponent(r[1])}">${esc(r[1])}</a> <span class="muted">${esc(scr.bySym.get(r[1])?.name || '')}</span>`, sort: (r) => r[1] },
    { key: 2, label: '20-session excess', r: true, fmt: (r) => (r[2] === null ? '<span class="faint">open</span>' : `<span class="${cls(r[2])}">${pct(r[2], 2)}</span>`), sort: (r) => r[2] },
  ], { rows: s.events, maxHeight: '420px' });
}

function story(s, sg) {
  const H = s.horizons['20'];
  const short = s.side === 'short';
  const ok = H.t !== null;
  if (s.verdict === 'edge') {
    return short
      ? `Stocks that triggered this went on to <b>lag</b> the market by ${pct(Math.abs(H.mean), 2)} on average over 20 sessions (t ${tf(H.t)}), in both halves of the history. Useful as an avoid-list; shorting cash equities in India is intraday-only, so acting on it needs F&O.`
      : `Stocks that triggered this went on to beat the market by <b>${pct(H.mean, 2)}</b> on average over the next 20 sessions (t ${tf(H.t)}), and the effect shows up in both halves of the history. Only ${pctAbs(H.hit)} of individual triggers beat the market, so the edge lives in the average, not in any single trade.`;
  }
  if (s.verdict === 'negative') {
    return short
      ? `Despite the bearish reputation, these stocks have tended to <b>outperform</b> afterwards (${pct(H.mean, 2)}, t ${tf(H.t)}). Selling on this signal has cost money.`
      : `This screen has worked <b>in reverse</b>: triggering stocks lagged the market by ${pct(Math.abs(H.mean), 2)} over the next 20 sessions (t ${tf(H.t)}), consistently across both halves of the sample. Buying it has been a losing habit.`;
  }
  return `Across ${int(H.n)} triggers the average 20-session excess return is ${pct(H.mean, 2)}${ok ? ` with a t-stat of ${tf(H.t)}` : ''}. That's <b>indistinguishable from picking stocks at random</b>${Math.abs(H.mean) < sg.cost ? `, and smaller than the ${pctAbs(sg.cost, 1)} it costs to trade in and out` : ''}. A screen can look convincing on a chart and still carry no information about what happens next.`;
}
