import { alpha, areaGrad, axis, base, chart, colors, dateAxis, heatColor, tooltipRow } from '../lib/charts.js';
import { load, meta, screener, stock } from '../lib/data.js';
import { cls, cr, date, esc, int, isOk, num, pct, pctAbs, price, t as tf, vol } from '../lib/fmt.js';
import { h, help, icon, seg, table, watch } from '../lib/ui.js';
import { verdictTag } from './signals.js';

const RANGES = [['63', '3M'], ['126', '6M'], ['252', '1Y'], ['756', '3Y'], ['1260', '5Y']];

function sma(a, n) {
  const out = new Array(a.length).fill(null);
  let s = 0, k = 0;
  const q = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    q.push(v);
    if (v !== null) { s += v; k++; }
    if (q.length > n) { const o = q.shift(); if (o !== null) { s -= o; k--; } }
    if (q.length === n && k >= n * 0.9) out[i] = s / k;
  }
  return out;
}

export async function render(root, parts) {
  const sym = parts[0];
  const [d, m, scr, sg] = await Promise.all([stock(sym).catch(() => null), meta(), screener(), load('signals')]);
  if (!d) { root.innerHTML = `<div class="empty"><h2>No data for ${esc(sym)}</h2><p><a class="btn" href="#/screener">Open the screener</a></p></div>`; return; }
  const row = scr.bySym.get(sym) || {};
  const S = d.stats;
  const dates = m.cal.slice(d.i0);
  const sigById = Object.fromEntries(sg.signals.map((s) => [s.id, s]));
  document.title = `${sym} · ${d.name} · Tapeline`;

  // header
  const head = h(`<div class="sh"><div>
      <h1>${esc(d.name)} <span class="sym-chip" style="font-size:13px">${esc(sym)}</span></h1>
      <div class="meta"><span>${esc(d.sector)}</span><span class="faint">·</span><span>${esc(d.industry)}</span>
        ${d.fno ? '<span class="tag plain none">F&O</span>' : ''}${d.liq ? '<span class="tag plain none" data-tip="One of the 500 most liquid names, the universe every signal is tested on">Liquid 500</span>' : ''}
        <button class="star ${watch.has(sym) ? 'on' : ''}" id="wl">${icon('star')} <span>${watch.has(sym) ? 'Watching' : 'Watch'}</span></button></div>
    </div><div>
      <div class="px">${price(S.close)}</div>
      <div style="text-align:right" class="mono"><span class="pill ${cls(S.r1d)}">${pct(S.r1d, 2)}</span> <span class="muted" style="font-size:12px">${date(m.asof)}</span></div>
    </div></div>`);
  root.append(head);
  head.querySelector('#wl').addEventListener('click', (e) => {
    const on = watch.toggle(sym);
    const b = e.currentTarget;
    b.classList.toggle('on', on);
    b.querySelector('span').textContent = on ? 'Watching' : 'Watch';
  });

  // active signals today
  const act = row.sig || [];
  if (act.length) {
    root.append(h(`<div class="card" style="padding:12px 16px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <b style="font-size:13px">Triggered on the latest session:</b>
      ${act.map((id) => { const s = sigById[id]; return `<a href="#/signals/${id}" class="chip" style="display:inline-flex;gap:8px;align-items:center">${esc(s.name)} ${verdictTag(s.verdict, s.side)} <span class="mono muted">${pct(s.horizons['20'].mean, 2)}/20d</span></a>`; }).join('')}
    </div>`));
  }

  // price chart
  const cc = h(`<div class="card"><div class="card-h"><div class="seg-wrap" style="display:flex;gap:8px;flex-wrap:wrap"></div><div class="legend" id="lg"></div></div><div class="card-b"><div class="chart xl"></div></div></div>`);
  root.append(cc);
  const ma50 = sma(d.c, 50), ma200 = sma(d.c, 200);
  let range = '252', overlay = 'ma';
  const markers = (d.sigs || []).map(([id, i]) => [id, i - d.i0]).filter(([, i]) => i >= 0 && i < dates.length);
  const opt = (c) => priceOption(c, d, dates, ma50, ma200, markers, sigById, range, overlay);
  const inst = chart(cc.querySelector('.chart'), opt);
  const sw = cc.querySelector('.seg-wrap');
  sw.append(seg(RANGES.filter(([n]) => +n <= dates.length + 30 || n === '63'), range, (v) => { range = v; inst.setOption(opt(colors()), true); }));
  sw.append(seg([['ma', 'Moving averages'], ['rs', 'vs Nifty 50'], ['sig', 'Signal history']], overlay, (v) => { overlay = v; inst.setOption(opt(colors()), true); }));
  cc.querySelector('#lg').innerHTML = `<span><i class="sw" style="background:var(--c2)"></i>50-DMA</span><span><i class="sw" style="background:var(--c3)"></i>200-DMA</span><span><i class="sw" style="background:var(--accent)"></i>Delivery %</span>`;

  // stats
  const rng = S.hi52 > S.lo52 ? (S.close - S.lo52) / (S.hi52 - S.lo52) : null;
  const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const P = (v, dd = 1) => `<span class="${cls(v)}">${pct(v, dd)}</span>`;
  root.append(h(`<div class="grid g3 section">
    <div class="card"><div class="card-h"><h3>Performance</h3></div><div class="card-b">${kv([
      ['1 week', P(S.r1w)], ['1 month', P(S.r1m)], ['3 months', P(S.r3m)], ['6 months', P(S.r6m)], ['Year to date', P(S.ytd)], ['1 year', P(S.r1y)],
      ['3-year CAGR', P(S.cagr3)], ['5-year CAGR', P(S.cagr5)],
      [`RS rating ${help('1–99 percentile of weighted 3/6/9/12-month return across all 750 stocks')}`, `<b>${int(S.rs)}</b>`],
    ])}</div></div>
    <div class="card"><div class="card-h"><h3>Risk</h3></div><div class="card-b">${kv([
      ['Volatility (60d, ann.)', pctAbs(S.vol)], ['Volatility (1y, ann.)', pctAbs(S.vol1y)],
      [`Beta vs Nifty 50 ${help('1-year daily beta. 1.3 means the stock has tended to move 1.3% for every 1% Nifty move.')}`, num(S.beta, 2)],
      ['Sharpe (1y, no rf)', tf(S.sharpe1y)], ['Below 5-year peak', P(S.dd_now)], ['Worst drawdown, 1y', P(S.dd1y)], ['Worst drawdown, 5y', P(S.dd5y)],
      ['Avg traded value', cr(S.tv)], ['Market cap', cr(S.mcap)],
    ])}</div></div>
    <div class="card"><div class="card-h"><h3>Technicals</h3></div><div class="card-b">
      <div class="muted" style="font-size:12px">52-week range</div>
      <div class="range"><div class="dot" style="left:${(rng ?? 0.5) * 100}%"></div></div>
      <div class="range-l"><span>${price(S.lo52)}</span><span>${pct(S.dh)} from high</span><span>${price(S.hi52)}</span></div>
      <div style="height:10px"></div>${kv([
      ['RSI (14)', num(S.rsi, 0)],
      ['vs 50-DMA', isOk(S.ma50) ? P(S.close / S.ma50 - 1) : '—'], ['vs 200-DMA', isOk(S.ma200) ? P(S.close / S.ma200 - 1) : '—'],
      ['Volume vs 50d avg', isOk(S.volx) ? `${num(S.volx, 1)}×` : '—'],
      [`Delivery % ${help('Share of traded quantity taken into demat, a rough gauge of investment rather than intraday buying')}`, isOk(S.dlv) ? `${num(S.dlv, 0)}% <span class="faint">20d ${num(S.dlv20, 0)} · 60d ${num(S.dlv60, 0)}</span>` : '—'],
      ['Momentum percentile', int(S.mom)],
    ])}</div></div>
  </div>`));

  // fundamentals + consensus
  const f = d.fund || {};
  const c0 = d.cons;
  const fc = h(`<div class="grid g2 section">
    <div class="card"><div class="card-h"><div><h3>Valuation and profitability</h3><div class="sub">${f.as_of ? `Yahoo key stats as of ${date(f.as_of)}` : 'No data'}</div></div></div><div class="card-b">${kv([
      ['P/E (trailing)', num(f.trailing_pe, 1)], ['P/E (forward)', num(f.forward_pe, 1)], ['P/B', num(f.price_to_book, 2)], ['EV/EBITDA', num(f.ev_to_ebitda, 1)],
      ['ROE', pctAbs(f.roe, 1)], ['ROA', pctAbs(f.roa, 1)], ['Operating margin', pctAbs(f.operating_margin, 1)], ['Net margin', pctAbs(f.profit_margin, 1)],
      ['Debt / equity', isOk(f.debt_to_equity) ? `${num(f.debt_to_equity / 100, 2)}×` : '—'], ['Dividend yield', pctAbs(f.dy, 2)],
      ['Revenue (TTM)', isOk(f.revenue_ttm) ? cr(f.revenue_ttm / 1e7) : '—'], ['Net income (TTM)', isOk(f.net_income_ttm) ? cr(f.net_income_ttm / 1e7) : '—'],
    ])}</div></div>
    <div class="card"><div class="card-h"><div><h3>Analyst consensus</h3><div class="sub">${c0 ? `${int(c0.n)} analysts · ${date(c0.as_of)}` : 'No coverage'}</div></div></div><div class="card-b" id="cons"></div></div>
  </div>`);
  root.append(fc);
  const consEl = fc.querySelector('#cons');
  if (c0 && isOk(c0.mean)) {
    const lo = Math.min(c0.low, S.close), hi = Math.max(c0.high, S.close);
    const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
    const votes = c0.votes || [];
    const vt = votes.reduce((a, b) => a + (b || 0), 0);
    const vcol = ['var(--up)', 'color-mix(in srgb, var(--up) 55%, transparent)', 'var(--line2)', 'color-mix(in srgb, var(--down) 55%, transparent)', 'var(--down)'];
    consEl.innerHTML = `<div class="split"><div><div class="muted" style="font-size:12px">Mean target</div><div class="mono" style="font-size:22px;font-weight:600">${price(c0.mean)} <span class="pill ${cls(c0.mean / S.close - 1)}">${pct(c0.mean / S.close - 1)}</span></div></div>
      <div style="text-align:right"><div class="muted" style="font-size:12px">Rating</div><div style="font-weight:600;text-transform:capitalize">${esc((c0.key || '').replace('_', ' '))} <span class="mono muted">${num(c0.reco, 1)}/5</span></div></div></div>
      <div style="position:relative;height:34px;margin:16px 0 4px">
        <div style="position:absolute;top:14px;left:${pos(c0.low)}%;width:${pos(c0.high) - pos(c0.low)}%;height:6px;border-radius:3px;background:var(--accent-bg)"></div>
        <div style="position:absolute;top:8px;left:${pos(c0.mean)}%;width:2px;height:18px;background:var(--accent)" data-tip="Mean target ${price(c0.mean)}"></div>
        <div style="position:absolute;top:10px;left:${pos(S.close)}%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:var(--text);border:2px solid var(--card)" data-tip="Price ${price(S.close)}"></div>
      </div>
      <div class="range-l"><span>Low ${price(c0.low)}</span><span>High ${price(c0.high)}</span></div>
      ${vt ? `<div style="margin-top:16px" class="muted">Recommendations</div><div class="adbar" style="height:10px">${votes.map((v, i) => `<div style="width:${(v / vt) * 100}%;background:${vcol[i]}" data-tip="${['Strong buy', 'Buy', 'Hold', 'Sell', 'Strong sell'][i]}: ${v}"></div>`).join('')}</div>
      <div class="legend" style="margin-top:6px">${['Strong buy', 'Buy', 'Hold', 'Sell', 'Strong sell'].map((l, i) => `<span><i class="sw" style="background:${vcol[i]}"></i>${l} ${votes[i] || 0}</span>`).join('')}</div>` : ''}
      <div class="note" style="margin-top:14px">Sell-side targets are a sentiment gauge. They are typically set above the price and revised after it moves.</div>`;
  } else consEl.innerHTML = '<div class="empty">No analyst coverage in the data.</div>';

  // holding + seasonality
  const hs = h(`<div class="grid g2 section">
    <div class="card"><div class="card-h"><div><h3>Promoter holding</h3><div class="sub">% of equity, by quarter</div></div></div><div class="card-b"><div class="chart sm" id="hold"></div></div></div>
    <div class="card"><div class="card-h"><div><h3>Seasonality ${help('Monthly returns by calendar month. Patterns here are mostly noise; a month needs many years of consistent sign before it means anything.')}</h3><div class="sub">Monthly return, each year</div></div></div><div class="card-b"><div class="tbl-wrap" id="season"></div></div></div>
  </div>`);
  root.append(hs);
  if (d.holding.length) {
    chart(hs.querySelector('#hold'), (c) => ({
      ...base(c),
      xAxis: { type: 'category', data: d.holding.map((x) => x[0].slice(0, 7)), ...axis(c), splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => `${v}%` } },
      tooltip: { ...base(c).tooltip, valueFormatter: (v) => `${num(v, 2)}%` },
      series: [{ name: 'Promoter', type: 'bar', barMaxWidth: 22, data: d.holding.map((x) => x[1]), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c.accent }, { offset: 1, color: alpha(c.accent, 0.25) }] }, borderRadius: [4, 4, 0, 0] } }],
    }));
  } else hs.querySelector('#hold').outerHTML = '<div class="empty">No shareholding data.</div>';
  const se = d.season;
  const col = colors();
  const avg = Array.from({ length: 12 }, (_, j) => {
    const v = se.m.map((r) => r[j]).filter(isOk);
    return v.length ? [v.reduce((a, b) => a + b, 0) / v.length, v.filter((x) => x > 0).length / v.length] : [null, null];
  });
  const MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  hs.querySelector('#season').innerHTML = `<table class="t" style="font-size:11px"><thead><tr><th></th>${MON.map((x) => `<th class="r" style="padding:4px 2px;text-align:center">${x}</th>`).join('')}</tr></thead><tbody>
    ${se.years.slice(-10).map((y, i0) => { const i = se.years.length - Math.min(10, se.years.length) + i0; return `<tr><td class="mono muted" style="padding:2px 6px">${y}</td>${se.m[i].map((v) => `<td style="padding:2px 1px"><div class="heat" style="background:${heatColor(v, 0.12, col)};padding:3px 0" data-tip="${pct(v, 1)}">${isOk(v) ? (v * 100).toFixed(0) : ''}</div></td>`).join('')}</tr>`; }).join('')}
    <tr><td class="muted" style="padding:6px">avg</td>${avg.map(([v, hit]) => `<td style="padding:2px 1px"><div class="heat" style="font-weight:600" data-tip="${isOk(v) ? `avg ${pct(v, 1)}, positive in ${pctAbs(hit)} of years` : ''}">${isOk(v) ? (v * 100).toFixed(1) : ''}</div></td>`).join('')}</tr>
  </tbody></table>`;

  // peers
  const peersBy = (k) => scr.list.filter((r) => r[k] === row[k]);
  let peers = peersBy('industry');
  if (peers.length < 4) peers = peersBy('sector');
  peers = peers.sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 12);
  if (!peers.find((r) => r.sym === sym) && row.sym) peers.push(row);
  const pc = h(`<div class="card section"><div class="card-h"><div><h3>Peers</h3><div class="sub">${esc(row.industry && peersBy('industry').length >= 4 ? row.industry : row.sector)}, largest by market cap</div></div></div><div class="card-b" style="padding-top:8px"></div></div>`);
  root.append(pc);
  table(pc.querySelector('.card-b'), [
    { key: 'sym', label: 'Stock', asc: true, fmt: (r) => `<div class="co"><b>${esc(r.sym)}</b><span>${esc(r.name)}</span></div>` },
    { key: 'mcap', label: 'Mkt cap', r: true, fmt: (r) => cr(r.mcap) },
    ...[['r1m', '1M'], ['r3m', '3M'], ['r1y', '1Y']].map(([k, l]) => ({ key: k, label: l, r: true, fmt: (r) => `<span class="${cls(r[k])}">${pct(r[k])}</span>` })),
    { key: 'rs', label: 'RS', r: true, fmt: (r) => int(r.rs) },
    { key: 'pe', label: 'P/E', r: true, fmt: (r) => num(r.pe, 1) },
    { key: 'roe', label: 'ROE', r: true, fmt: (r) => pctAbs(r.roe, 1) },
    { key: 'upside', label: 'Target upside', r: true, fmt: (r) => `<span class="${cls(r.upside)}">${pct(r.upside)}</span>` },
  ], { rows: peers, sortKey: 'mcap', rowClass: (r) => (r.sym === sym ? 'cur' : ''), onRow: (r) => (location.hash = `#/s/${encodeURIComponent(r.sym)}`) });

  // signal history on this stock
  if (markers.length) {
    const sh = h(`<div class="card section"><div class="card-h"><div><h3>Signal history on ${esc(sym)}</h3><div class="sub">Every trigger in the last three years and what the stock did over the next 20 sessions (raw return, not vs the market)</div></div></div><div class="card-b" style="padding-top:8px"></div></div>`);
    root.append(sh);
    const rows = markers.map(([id, i]) => {
      const j = i + 20;
      const fwd = j < d.c.length && d.c[i] && d.c[j] ? d.c[j] / d.c[i] - 1 : null;
      return { id, date: dates[i], fwd, s: sigById[id] };
    }).sort((a, b) => b.date.localeCompare(a.date));
    table(sh.querySelector('.card-b'), [
      { key: 'date', label: 'Date', fmt: (r) => date(r.date) },
      { key: 'id', label: 'Signal', fmt: (r) => `<a href="#/signals/${r.id}" style="color:var(--accent)">${esc(r.s?.name || r.id)}</a>` },
      { key: 'v', label: 'Tested edge', sort: false, fmt: (r) => (r.s ? verdictTag(r.s.verdict, r.s.side) : '') },
      { key: 'fwd', label: 'Next 20 sessions', r: true, fmt: (r) => (r.fwd === null ? '<span class="faint">open</span>' : `<span class="${cls(r.fwd)}">${pct(r.fwd, 1)}</span>`) },
    ], { rows, maxHeight: '360px' });
  }

  // insider + deals
  if (d.insider.length || d.deals.length) {
    const g = h(`<div class="grid g2 section">
      <div class="card"><div class="card-h"><div><h3>Insider trades</h3><div class="sub">SEBI PIT disclosures, latest first</div></div></div><div class="card-b" style="padding-top:8px" id="ins"></div></div>
      <div class="card"><div class="card-h"><div><h3>Bulk and block deals</h3><div class="sub">Exchange disclosures, latest first</div></div></div><div class="card-b" style="padding-top:8px" id="dl"></div></div>
    </div>`);
    root.append(g);
    table(g.querySelector('#ins'), [
      { key: 0, label: 'Date', fmt: (r) => date(r[0]), sort: (r) => r[0] },
      { key: 1, label: 'Who', fmt: (r) => `<div class="co"><b style="font-family:var(--sans);font-weight:500">${esc((r[1] || '').slice(0, 28))}</b><span>${esc(r[2] || '')}</span></div>`, sort: false },
      { key: 3, label: 'Type', fmt: (r) => `<span class="${/buy|acq/i.test(r[3] || '') ? 'up' : /sell|disp/i.test(r[3] || '') ? 'down' : ''}">${esc(r[3] || '')}</span>`, sort: false },
      { key: 5, label: 'Value', r: true, fmt: (r) => (r[5] ? cr(r[5] / 1e7) : '—'), sort: (r) => r[5] },
    ], { rows: d.insider, empty: 'No insider trades on record.' });
    table(g.querySelector('#dl'), [
      { key: 0, label: 'Date', fmt: (r) => date(r[0]), sort: (r) => r[0] },
      { key: 1, label: 'Client', fmt: (r) => `<span title="${esc(r[1])}">${esc((r[1] || '').slice(0, 30))}</span>`, sort: false },
      { key: 2, label: 'Side', fmt: (r) => `<span class="${/buy/i.test(r[2]) ? 'up' : 'down'}">${esc(r[2])}</span> <span class="faint">${esc(r[5])}</span>`, sort: false },
      { key: 3, label: 'Qty', r: true, fmt: (r) => vol(r[3]), sort: (r) => r[3] },
      { key: 4, label: 'Price', r: true, fmt: (r) => price(r[4]), sort: (r) => r[4] },
    ], { rows: d.deals, empty: 'No bulk or block deals on record.' });
  }

  // about
  if (d.desc) {
    root.append(h(`<div class="card section"><div class="card-h"><h3>About ${esc(d.name)}</h3></div><div class="card-b desc">${esc(d.desc)}${d.desc.length >= 900 ? '…' : ''}
      <div class="muted" style="margin-top:10px;font-size:12.5px">${d.employees ? `${int(d.employees)} employees · ` : ''}${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(d.url.replace(/^https?:\/\//, ''))} ${icon('ext')}</a>` : ''}</div></div></div>`));
  }
}

function priceOption(c, d, dates, ma50, ma200, markers, sigById, range, overlay) {
  const n = dates.length;
  const start = Math.max(0, 100 - (+range / n) * 100);
  const ohlc = d.o.map((o, i) => [o, d.c[i], d.l[i], d.h[i]]);
  const upCol = c.up, dnCol = c.down;
  const volData = d.v.map((v, i) => ({ value: v, itemStyle: { color: d.c[i] >= d.o[i] ? upCol : dnCol, opacity: 0.45 } }));
  const series = [
    {
      name: 'Price', type: 'candlestick', data: ohlc, itemStyle: { color: upCol, color0: dnCol, borderColor: upCol, borderColor0: dnCol }, barMaxWidth: 10,
      markPoint: overlay === 'sig' ? {
        symbol: 'pin', symbolSize: 26, label: { fontSize: 9, fontWeight: 700, color: '#fff', formatter: (p) => p.data.short },
        data: markers.map(([id, i]) => {
          const s = sigById[id];
          const bear = s?.side === 'short';
          return { coord: [i, bear ? d.h[i] : d.l[i]], short: (s?.name || id)[0], value: s?.name, symbolRotate: bear ? 0 : 180, itemStyle: { color: s?.verdict === 'edge' ? c.up : s?.verdict === 'negative' ? c.down : c.faint }, symbolOffset: [0, bear ? -6 : 6] };
        }),
        tooltip: { formatter: (p) => `${esc(p.data.value)}<br>${date(dates[p.data.coord[0]])}` },
      } : undefined,
    },
  ];
  if (overlay === 'ma' || overlay === 'sig') {
    series.push({ name: '50-DMA', type: 'line', data: ma50, symbol: 'none', lineStyle: { width: 1.2, color: c.c2 }, color: c.c2 });
    series.push({ name: '200-DMA', type: 'line', data: ma200, symbol: 'none', lineStyle: { width: 1.2, color: c.c3 }, color: c.c3 });
  } else if (overlay === 'rs' && d.rs) {
    series.push({ name: 'Ratio to Nifty 50', type: 'line', data: d.rs, yAxisIndex: 3, symbol: 'none', lineStyle: { width: 1.4, color: c.warn, type: 'dashed' }, color: c.warn });
  }
  series.push({ name: 'Volume', type: 'bar', data: volData, xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 8 });
  series.push({ name: 'Delivery %', type: 'line', data: d.d, xAxisIndex: 2, yAxisIndex: 2, symbol: 'none', lineStyle: { width: 1.1, color: c.accent }, color: c.accent, areaStyle: areaGrad(c.accent, 0.2), connectNulls: false });
  const cat = (idx, show) => ({ type: 'category', data: dates, gridIndex: idx, ...axis(c), axisLabel: { ...dateAxis(c).axisLabel, show }, splitLine: { show: false }, boundaryGap: true });
  return {
    ...base(c),
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 28, right: 60, top: 10, height: '56%', containLabel: false },
      { left: 28, right: 60, top: '68%', height: '10%' },
      { left: 28, right: 60, top: '81%', height: '10%' },
    ],
    xAxis: [cat(0, false), cat(1, false), cat(2, true)],
    yAxis: [
      { type: 'value', scale: true, position: 'right', ...axis(c) },
      { type: 'value', gridIndex: 1, position: 'right', ...axis(c), axisLabel: { show: false }, splitLine: { show: false } },
      { type: 'value', gridIndex: 2, position: 'right', min: 0, max: 100, ...axis(c), axisLabel: { ...axis(c).axisLabel, fontSize: 9, formatter: (v) => (v === 50 ? 'dlv' : '') }, splitNumber: 2, splitLine: { show: false } },
      { type: 'value', scale: true, show: false },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1, 2], start, end: 100 }],
    tooltip: {
      ...base(c).tooltip,
      formatter: (ps) => {
        const i = ps[0]?.dataIndex;
        if (i === undefined) return '';
        const ch = i > 0 && d.c[i - 1] ? d.c[i] / d.c[i - 1] - 1 : null;
        let s = `<div style="margin-bottom:4px;color:${c.muted}">${date(dates[i])}</div>`;
        s += tooltipRow(d.c[i] >= d.o[i] ? upCol : dnCol, 'Close', `${price(d.c[i])} <span style="color:${ch >= 0 ? upCol : dnCol}">${pct(ch, 2)}</span>`);
        s += tooltipRow(c.faint, 'O / H / L', `${price(d.o[i])} / ${price(d.h[i])} / ${price(d.l[i])}`);
        if (overlay !== 'rs') {
          if (ma50[i]) s += tooltipRow(c.c2, '50-DMA', price(ma50[i]));
          if (ma200[i]) s += tooltipRow(c.c3, '200-DMA', price(ma200[i]));
        }
        s += tooltipRow(c.faint, 'Volume', vol(d.v[i]));
        if (d.d[i] !== null) s += tooltipRow(c.accent, 'Delivery', `${num(d.d[i], 1)}%`);
        return s;
      },
    },
    series,
  };
}
