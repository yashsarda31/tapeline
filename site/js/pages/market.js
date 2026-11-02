import { alpha, areaGrad, axis, base, chart, colors, dateAxis, heatColor, spark, tooltipRow } from '../lib/charts.js';
import { load, screener } from '../lib/data.js';
import { cls, date, esc, int, num, ordinal, pct, pctAbs, price, t as tf } from '../lib/fmt.js';
import { h, help, seg, table } from '../lib/ui.js';

export async function render(root) {
  const [mk, sg, { list }] = await Promise.all([load('market'), load('signals'), screener()]);
  const s = mk.summary;
  const liq = list.filter((r) => r.liq);

  root.append(h(`<div class="ph"><div>
      <div class="eyebrow">Market pulse · ${date(s.date)}</div>
      <h1>How the market is really doing</h1>
      <p>The index tells you about 50 stocks. This page looks at the ${s.n} most liquid NSE names, then checks what similar readings have meant for the Nifty afterwards.</p>
    </div></div>`));
  root.append(h(`<p class="lede">${narrative(mk)}</p>`));

  // India index cards
  const india = mk.indices.filter((x) => x.group === 'india');
  const cards = h(`<div class="card strip c6"></div>`);
  root.append(cards);
  india.forEach((x) => {
    const inv = x.id === 'vix';
    const c = h(`<div class="idx"><div class="n"><span>${esc(x.label)}</span><span class="${cls(inv ? -x.r1d : x.r1d)}">${pct(x.r1d, 2)}</span></div>
      <div class="p">${num(x.last, x.last > 1000 ? 1 : 2)}</div>
      <div class="n"><span>1M <b class="${cls(inv ? -x.r1m : x.r1m)}">${pct(x.r1m)}</b></span><span>1Y <b class="${cls(inv ? -x.r1y : x.r1y)}">${pct(x.r1y)}</b></span></div>
      <div class="spark"></div></div>`);
    cards.append(c);
    spark(c.querySelector('.spark'), x.spark, inv ? x.r1m <= 0 : x.r1m >= 0);
  });

  // breadth tiles
  const advPct = s.adv / Math.max(1, s.adv + s.dec);
  root.append(h(`<div class="card strip c4" style="margin-top:16px">
    <div class="stat"><div class="k">Advancers / decliners ${help('Liquid universe, latest session.')}</div>
      <div class="v"><span class="up">${s.adv}</span> <span class="faint">/</span> <span class="down">${s.dec}</span></div>
      <div class="adbar"><div class="a" style="width:${advPct * 100}%"></div><div class="d" style="width:${(1 - advPct) * 100}%"></div></div>
      <div class="d">Median stock ${pct(s.ew_med1d, 2)} · equal-weight ${pct(s.ew1d, 2)}</div></div>
    <div class="stat"><div class="k">Above 50-day average ${help('Share of liquid stocks closing above their own 50-day moving average.')}</div>
      <div class="v">${pctAbs(s.p50)}</div><div class="d">Lower than ${pctAbs(1 - s.p50_rank)} of sessions since ${date(s.since)}</div></div>
    <div class="stat"><div class="k">Above 200-day average ${help('Share of liquid stocks closing above their own 200-day moving average: the long-term trend.')}</div>
      <div class="v">${pctAbs(s.p200)}</div><div class="d">Lower than ${pctAbs(1 - s.p200_rank)} of sessions since ${date(s.since)}</div></div>
    <div class="stat"><div class="k">52-week highs / lows ${help('New 52-week closing highs and lows in the liquid universe.')}</div>
      <div class="v"><span class="up">${s.nh}</span> <span class="faint">/</span> <span class="down">${s.nl}</span></div>
      <div class="d">McClellan oscillator ${num(s.mcc, 0)} ${help('19/39-day EMA spread of net advances. Below −100 is a washed-out reading, above +100 a strong thrust.')}</div></div>
  </div>`));

  // breadth history chart
  const hc = h(`<div class="card section"><div class="card-h"><div><h2>Breadth history</h2><div class="sub">Nifty 50 on top, participation underneath. Drag the slider to zoom.</div></div><div class="ctl"></div></div>
    <div class="card-b"><div class="chart xl"></div></div></div>`);
  root.append(hc);
  let mode = 'dma';
  const hist = mk.history;
  const inst = chart(hc.querySelector('.chart'), (c) => breadthOption(c, hist, mode));
  hc.querySelector('.ctl').append(seg([['dma', '% above DMAs'], ['hl', 'Highs − lows'], ['mcc', 'McClellan'], ['vix', 'India VIX']], mode, (v) => {
    mode = v;
    const z = inst.getOption().dataZoom?.[0];
    inst.setOption(breadthOption(undefined, hist, mode, z), true);
  }));

  // regimes
  const reg = h(`<div class="section"><h2>What readings like today's have meant</h2>
    <p class="sub">Nifty 50 return over the following 20 and 60 sessions, grouped by the reading on the day. Breadth tables cover ${date(s.since)} onward (about ${Math.round((Date.parse(s.date) - Date.parse(s.since)) / 3.156e10 * 10) / 10} years); the VIX table uses index history back to 2009. Today's group is highlighted. Windows overlap, so the number of independent periods is far smaller than the day count; the t-stat accounts for that.</p>
    <div class="grid g3"></div></div>`);
  const rg = reg.querySelector('.grid');
  for (const key of ['p200', 'p50', 'vix']) {
    const r = mk.regimes[key];
    if (!r) continue;
    const card = h(`<div class="card"><div class="card-h"><div><h3>${esc(r.title)}</h3><div class="sub">Today: <b>${key === 'vix' ? num(r.value, 1) : pctAbs(r.value)}</b> → ${esc(r.current)}</div></div></div><div class="card-b" style="padding-top:8px"></div>
      <div class="card-f">All days: next 20d ${pct(r.all.m20)} · next 60d ${pct(r.all.m60)}. * marks a group that differs from all days at |t| ≥ 2. Hover a number for hit rate and t.</div></div>`);
    rg.append(card);
    table(card.querySelector('.card-b'), [
      { key: 'label', label: 'Reading', sort: false, fmt: (x) => `<b>${esc(x.label)}</b>` },
      { key: 'days', label: 'Days', r: true, sort: false, fmt: (x) => int(x.days) },
      { key: 'm20', label: 'Next 20d', r: true, sort: false, fmt: (x) => `<span class="${cls(x.m20)}" data-tip="hit rate ${pctAbs(x.hit20)} · t vs all days ${tf(x.t20)} · ~${x.ind20 ?? '—'} independent periods">${pct(x.m20)}</span>` },
      { key: 'm60', label: 'Next 60d', r: true, sort: false, fmt: (x) => `<span class="${cls(x.m60)}" data-tip="hit rate ${pctAbs(x.hit60)} · t vs all days ${tf(x.t60)} · ~${x.ind60 ?? '—'} independent periods">${pct(x.m60)}</span>${Math.abs(x.t60 || 0) >= 2 ? '<sup class="faint" title="differs from all days, |t| ≥ 2">*</sup>' : ''}` },
    ], { rows: r.rows, rowClass: (x) => (x.label === r.current ? 'cur' : '') });
  }
  root.append(reg);

  // treemap
  const tm = h(`<div class="card section"><div class="card-h"><div><h2>Market map</h2><div class="sub">Liquid universe grouped by sector, sized by market cap. Click a tile to open the stock.</div></div><div class="ctl split"></div></div>
    <div class="card-b"><div class="chart xl"></div></div></div>`);
  root.append(tm);
  let per = 'r1d';
  const LIM = { r1d: 0.04, r1w: 0.08, r1m: 0.15, r3m: 0.25, ytd: 0.4, r1y: 0.5 };
  const tinst = chart(tm.querySelector('.chart'), (c) => treemapOption(c, liq, per, LIM[per]),
    { onClick: (p) => { if (p.data?.sym) location.hash = `#/s/${encodeURIComponent(p.data.sym)}`; } });
  tm.querySelector('.ctl').append(seg([['r1d', '1D'], ['r1w', '1W'], ['r1m', '1M'], ['r3m', '3M'], ['ytd', 'YTD'], ['r1y', '1Y']], per, (v) => {
    per = v; tinst.setOption(treemapOption(undefined, liq, per, LIM[per]), true);
  }));

  // movers
  const mv = h(`<div class="card section"><div class="card-h"><div><h2>Movers</h2><div class="sub">Liquid universe, latest session</div></div><div class="ctl"></div></div><div class="card-b" style="padding-top:8px"></div></div>`);
  root.append(mv);
  const sigName = Object.fromEntries(sg.signals.map((x) => [x.id, x.name]));
  const MOVERS = {
    gain: { rows: () => [...liq].sort((a, b) => b.r1d - a.r1d).slice(0, 15) },
    lose: { rows: () => [...liq].sort((a, b) => a.r1d - b.r1d).slice(0, 15) },
    volx: { rows: () => liq.filter((r) => r.volx).sort((a, b) => b.volx - a.volx).slice(0, 15) },
    dlv: { rows: () => liq.filter((r) => r.dlv && r.dlv20).sort((a, b) => b.dlv / b.dlv20 - a.dlv / a.dlv20).slice(0, 15) },
    hi: { rows: () => liq.filter((r) => r.dh !== null).sort((a, b) => b.dh - a.dh).slice(0, 15) },
  };
  const cols = [
    { key: 'sym', label: 'Stock', fmt: (r) => `<div class="co"><b>${esc(r.sym)}</b><span>${esc(r.name)}</span></div>`, asc: true },
    { key: 'sector', label: 'Sector', fmt: (r) => `<span class="muted">${esc(r.sector)}</span>` },
    { key: 'close', label: 'Close', r: true, fmt: (r) => price(r.close) },
    { key: 'r1d', label: '1D', r: true, fmt: (r) => `<span class="${cls(r.r1d)}">${pct(r.r1d, 2)}</span>` },
    { key: 'volx', label: 'Vol vs avg', r: true, fmt: (r) => (r.volx ? `${num(r.volx, 1)}×` : '—') },
    { key: 'dlv', label: 'Delivery', r: true, fmt: (r) => (r.dlv ? `${num(r.dlv, 0)}% <span class="faint">/ ${num(r.dlv20, 0)}</span>` : '—'), tip: 'Today / 20-day average delivery %' },
    { key: 'dh', label: 'From 52W high', r: true, fmt: (r) => pct(r.dh) },
    { key: 'sig', label: 'Signals today', sort: false, fmt: (r) => r.sig.map((x) => `<a class="sym-chip" href="#/signals/${x}" title="${esc(sigName[x])}">${esc(sigName[x] || x)}</a>`).join(' ') },
  ];
  const mt = table(mv.querySelector('.card-b'), cols, { rows: MOVERS.gain.rows(), onRow: (r) => (location.hash = `#/s/${encodeURIComponent(r.sym)}`) });
  mv.querySelector('.ctl').append(seg([['gain', 'Gainers'], ['lose', 'Losers'], ['volx', 'Unusual volume'], ['dlv', 'Delivery spikes'], ['hi', 'At 52W highs']], 'gain', (v) => mt.update(MOVERS[v].rows())));

  // global
  const gl = mk.indices.filter((x) => x.group !== 'india');
  const gc = h(`<div class="card section"><div class="card-h"><div><h2>Global and macro</h2><div class="sub">Latest close on each market's own calendar</div></div></div><div class="card-b" style="padding-top:8px"></div></div>`);
  root.append(gc);
  table(gc.querySelector('.card-b'), [
    { key: 'label', label: 'Market', fmt: (x) => `<b>${esc(x.label)}</b>`, asc: true },
    { key: 'last', label: 'Last', r: true, fmt: (x) => num(x.last, x.last > 1000 ? 0 : 2) },
    ...['r1d', 'r1w', 'r1m', 'ytd', 'r1y'].map((k) => ({ key: k, label: { r1d: '1D', r1w: '1W', r1m: '1M', ytd: 'YTD', r1y: '1Y' }[k], r: true, fmt: (x) => `<span class="${cls(x[k])}">${pct(x[k])}</span>` })),
    { key: 'date', label: 'As of', r: true, fmt: (x) => `<span class="muted">${date(x.date)}</span>` },
  ], { rows: gl });
}

function narrative(mk) {
  const s = mk.summary;
  const r = mk.regimes.p200;
  const row = r.rows.find((x) => x.label === r.current);
  const tone = s.p200 < 0.3 ? 'weak' : s.p200 < 0.5 ? 'soft' : s.p200 < 0.7 ? 'healthy' : 'strong';
  const nifty = mk.indices.find((x) => x.id === 'nifty50');
  const nb = nifty ? ` The Nifty 50 is ${pct(nifty.r1m)} over the month.` : '';
  let hist = '';
  if (row && row.m60 !== null) {
    const sig = Math.abs(row.t60 || 0) >= 2;
    hist = ` Since ${date(s.since)}, when ${r.current} of stocks were above their 200-DMA, the Nifty's next 60 sessions averaged <b>${pct(row.m60)}</b> against ${pct(r.all.m60)} on all days. ${sig ? `That gap is statistically meaningful (t ${tf(row.t60)}).` : `That gap is within noise (t ${tf(row.t60)}), so treat it as context, not a forecast.`}`;
  }
  return `Breadth is <b>${tone}</b>: ${pctAbs(s.p200)} of liquid stocks are above their 200-day average and ${pctAbs(s.p50)} above their 50-day, with ${s.nh} new highs against ${s.nl} new lows.${nb}${hist}`;
}

function breadthOption(c0, hist, mode, zoom) {
  const c = c0 || colors();
  const n = hist.dates.length;
  const start = zoom ? zoom.start : Math.max(0, 100 - (750 / n) * 100);
  const end = zoom ? zoom.end : 100;
  let lower;
  if (mode === 'dma') {
    lower = [
      { name: '% above 200-DMA', type: 'line', data: hist.p200.map((v) => v * 100), color: c.accent, areaStyle: areaGrad(c.accent, 0.22) },
      { name: '% above 50-DMA', type: 'line', data: hist.p50.map((v) => v * 100), color: c.c2 },
    ];
  } else if (mode === 'hl') {
    lower = [{ name: 'New highs − new lows', type: 'bar', data: hist.nh.map((v, i) => ({ value: v - hist.nl[i], itemStyle: { color: v - hist.nl[i] >= 0 ? c.up : c.down } })) }];
  } else if (mode === 'mcc') {
    lower = [{ name: 'McClellan oscillator', type: 'line', data: hist.mcc, color: c.accent, areaStyle: { color: alpha(c.accent, 0.12) } }];
  } else {
    lower = [{ name: 'India VIX', type: 'line', data: hist.vix || [], color: c.warn, areaStyle: areaGrad(c.warn, 0.2) }];
  }
  lower.forEach((x) => Object.assign(x, { xAxisIndex: 1, yAxisIndex: 1, symbol: 'none', lineStyle: { width: 1.3 }, large: true }));
  return {
    ...base(c),
    legend: { top: 0, right: 0, textStyle: { color: c.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [{ left: 8, right: 12, top: 28, height: '48%', containLabel: true }, { left: 8, right: 12, top: '62%', bottom: 52, containLabel: true }],
    xAxis: [
      { type: 'category', data: hist.dates, ...axis(c), axisLabel: { show: false }, splitLine: { show: false } },
      { type: 'category', data: hist.dates, gridIndex: 1, ...dateAxis(c), splitLine: { show: false } },
    ],
    yAxis: [
      { type: 'value', scale: true, ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => Math.round(v).toLocaleString('en-IN') } },
      { type: 'value', gridIndex: 1, scale: mode !== 'dma', ...axis(c), min: mode === 'dma' ? 0 : undefined, max: mode === 'dma' ? 100 : undefined },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start, end },
      { type: 'slider', xAxisIndex: [0, 1], start, end, height: 22, bottom: 8, borderColor: c.line, backgroundColor: c.card2, fillerColor: alpha(c.accent, 0.1), dataBackground: { lineStyle: { color: c.line2 }, areaStyle: { color: c.card2 } }, selectedDataBackground: { lineStyle: { color: c.accent, opacity: 0.6 }, areaStyle: { color: alpha(c.accent, 0.08) } }, moveHandleStyle: { color: c.line2 }, textStyle: { color: c.muted, fontSize: 10, fontFamily: c.mono }, handleStyle: { color: c.card, borderColor: c.accent }, brushSelect: false },
    ],
    tooltip: {
      ...base(c).tooltip,
      formatter: (ps) => {
        const d = ps[0]?.axisValue;
        return `<div style="margin-bottom:4px;color:${c.muted}">${date(d)}</div>` + ps.map((p) => {
          const v = typeof p.value === 'object' ? p.value?.value : p.value;
          const txt = p.seriesName.startsWith('%') ? `${num(v, 1)}%` : p.seriesName === 'Nifty 50' ? num(v, 1) : num(v, 0);
          return tooltipRow(p.color?.colorStops ? c.accent : typeof p.color === 'string' ? p.color : c.accent, p.seriesName, txt);
        }).join('');
      },
    },
    series: [
      { name: 'Nifty 50', type: 'line', data: hist.nifty, symbol: 'none', color: c.text2, lineStyle: { width: 1.4 }, large: true },
      ...lower,
    ],
  };
}

function treemapOption(c0, rows, per, lim) {
  const c = c0 || colors();
  const bySec = {};
  rows.forEach((r) => {
    if (!r.mcap) return;
    (bySec[r.sector] ||= []).push(r);
  });
  const total = rows.reduce((a, r) => a + (r.mcap || 0), 0);
  const data = Object.entries(bySec).map(([sec, rs]) => {
    const tot = rs.reduce((a, r) => a + r.mcap, 0);
    const avg = rs.reduce((a, r) => a + (r[per] || 0) * r.mcap, 0) / tot;
    return {
      name: sec, value: tot, ret: avg,
      children: rs.sort((a, b) => b.mcap - a.mcap).map((r) => ({
        name: r.sym, value: r.mcap, sym: r.sym, ret: r[per], full: r.name,
        itemStyle: { color: heatColor(r[per], lim, c), borderColor: c.card },
      })),
    };
  });
  return {
    tooltip: {
      ...base(c).tooltip, trigger: 'item',
      formatter: (p) => {
        const d = p.data;
        if (!d) return '';
        return d.sym
          ? `<b style="font-family:var(--mono)">${esc(d.sym)}</b> <span style="color:${c.muted}">${esc(d.full)}</span><br>${pct(d.ret, 2)} · mcap ₹${int(d.value)} cr`
          : `<b>${esc(d.name)}</b><br>cap-weighted ${pct(d.ret, 2)}`;
      },
    },
    series: [{
      type: 'treemap', data, roam: false, nodeClick: false, breadcrumb: { show: false },
      width: '100%', height: '100%', top: 0, left: 0, squareRatio: 0.7,
      label: {
        show: true, overflow: 'truncate',
        formatter: (p) => (p.data.value < total * 0.0022 ? '' : p.data.value < total * 0.005 ? `{s|${p.name}}` : `{s|${p.name}}\n{r|${pct(p.data.ret, 1)}}`),
        rich: { s: { fontFamily: c.mono, fontSize: 11, fontWeight: 600, color: c.text }, r: { fontFamily: c.mono, fontSize: 10, color: c.text2 } },
      },
      upperLabel: { show: true, height: 20, color: c.muted, fontSize: 11, fontWeight: 600, formatter: (p) => `${p.name}  ${pct(p.data.ret, 1)}` },
      levels: [
        { upperLabel: { show: false }, itemStyle: { borderColor: c.card, borderWidth: 3, gapWidth: 3, color: c.card2 } },
        { itemStyle: { borderColor: c.card, borderWidth: 1, gapWidth: 1 } },
      ],
    }],
  };
}
