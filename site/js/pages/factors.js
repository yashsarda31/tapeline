import { axis, base, chart, colors, spark } from '../lib/charts.js';
import { load, screener } from '../lib/data.js';
import { cls, esc, pct, pctAbs, t as tf } from '../lib/fmt.js';
import { h, help, seg } from '../lib/ui.js';

export async function render(root) {
  const [fc, scr] = await Promise.all([load('factors'), screener()]);
  const F = fc.factors;
  const ranked = [...F].sort((a, b) => (b.stats.r3m ?? -9) - (a.stats.r3m ?? -9));
  const best = ranked[0], worst = ranked[ranked.length - 1];

  root.append(h(`<div class="ph"><div>
    <div class="eyebrow">Factor monitor</div>
    <h1>Which styles the market is paying for</h1>
    <p>Each month the liquid universe is sorted into fifths on a characteristic. The line is the top fifth minus the bottom fifth: when it rises, that style is being rewarded.</p>
  </div></div>`));
  root.append(h(`<p class="lede">Over the last three months <b>${esc(best.name.toLowerCase())}</b> has paid the most (${pct(best.stats.r3m)} top-minus-bottom) and <b>${esc(worst.name.toLowerCase())}</b> the least (${pct(worst.stats.r3m)}). Since ${F[0].stats.start.slice(0, 7)}, the styles with a statistically reliable premium (|t| ≥ 2) are ${F.filter((f) => Math.abs(f.stats.t) >= 2).map((f) => `<b>${esc(f.name.toLowerCase())}</b> (${pct(f.stats.ann, 1)}/yr)`).join(', ') || 'none'}.</p>`));

  const grid = h('<div class="grid g4"></div>');
  root.append(grid);
  F.forEach((f) => {
    const st = f.stats;
    const card = h(`<div class="card stat" style="cursor:pointer" data-id="${f.id}">
      <div class="k">${esc(f.name)} ${help(f.desc)}</div>
      <div class="v ${cls(st.r3m)}">${pct(st.r3m)}</div>
      <div class="d">last 3 months · 1Y <b class="${cls(st.r1y)}">${pct(st.r1y)}</b></div>
      <div style="height:34px;margin-top:8px" class="sp"></div>
      <div class="d">Since ${st.start.slice(0, 4)}: <b>${pct(st.ann, 1)}/yr</b>, t ${tf(st.t)}</div></div>`);
    grid.append(card);
    const n = f.ls.length;
    const tail = f.ls.slice(Math.max(0, n - 104));
    const b0 = tail[0];
    spark(card.querySelector('.sp'), tail.map((v) => v / b0), tail[tail.length - 1] >= b0);
    card.addEventListener('click', () => { pick(f.id); document.getElementById('fdetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  });

  // cumulative chart with rebasing range
  const cc = h(`<div class="card section"><div class="card-h"><div><h2>Top-minus-bottom quintile, cumulative</h2><div class="sub">Gross of costs, rebased to 1 at the start of the window. Log scale.</div></div><div class="ctl"></div></div><div class="card-b"><div class="chart lg"></div></div></div>`);
  root.append(cc);
  let range = 'all';
  const cutoff = (r) => {
    const last = new Date(F[0].dates[F[0].dates.length - 1]);
    const yrs = { all: 50, '5y': 5, '2y': 2, '1y': 1 }[r];
    const d = new Date(last); d.setFullYear(d.getFullYear() - yrs);
    return d.toISOString().slice(0, 10);
  };
  const cumOpt = (c) => {
    const cut = cutoff(range);
    return {
      ...base(c), color: c.series,
      legend: { top: 0, textStyle: { color: c.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
      grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true },
      xAxis: { type: 'time', ...axis(c), splitLine: { show: false } },
      yAxis: { type: 'log', ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => v.toFixed(2) } },
      tooltip: { ...base(c).tooltip, order: 'valueDesc', valueFormatter: (v) => (Array.isArray(v) ? '' : `${((v - 1) * 100).toFixed(1)}%`) },
      series: F.map((f) => {
        const pts = f.dates.map((d, i) => [d, f.ls[i]]).filter(([d, v]) => d >= cut && v);
        const b = pts[0]?.[1] || 1;
        return { name: f.name, type: 'line', symbol: 'none', lineStyle: { width: 1.6 }, emphasis: { focus: 'series' }, data: pts.map(([d, v]) => [d, v / b]) };
      }),
    };
  };
  const ci = chart(cc.querySelector('.chart'), cumOpt);
  cc.querySelector('.ctl').append(seg([['1y', '1Y'], ['2y', '2Y'], ['all', 'All history']], range, (v) => { range = v; ci.setOption(cumOpt(colors()), true); }));

  // rolling 12m
  const rc = h(`<div class="card section"><div class="card-h"><div><h2>Rolling 12-month spread</h2><div class="sub">Shows regimes: a style can pay for years and then stop. Momentum's best stretches line up with bull markets.</div></div></div><div class="card-b"><div class="chart"></div></div></div>`);
  root.append(rc);
  chart(rc.querySelector('.chart'), (c) => ({
    ...base(c), color: c.series,
    legend: { top: 0, textStyle: { color: c.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
    grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true },
    xAxis: { type: 'time', ...axis(c), splitLine: { show: false } },
    yAxis: { type: 'value', ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => pct(v, 0) } },
    tooltip: { ...base(c).tooltip, order: 'valueDesc', valueFormatter: (v) => pct(v, 1) },
    series: F.map((f) => ({ name: f.name, type: 'line', symbol: 'none', lineStyle: { width: 1.4 }, emphasis: { focus: 'series' }, data: f.dates.map((d, i) => [d, f.roll12[i]]).filter((p) => p[1] !== null) })),
  }));

  // per-factor detail
  const dt = h(`<div class="section" id="fdetail"><div class="split" style="margin-bottom:12px"><h2 style="margin:0">Factor detail</h2><div class="ctl"></div></div><div class="body"></div></div>`);
  root.append(dt);
  const body = dt.querySelector('.body');
  let detailCharts = [];
  const segEl = seg(F.map((f) => [f.id, f.name]), F[0].id, (v) => draw(v));
  segEl.style.flexWrap = 'wrap';
  dt.querySelector('.ctl').append(segEl);
  function pick(id) {
    segEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === id));
    draw(id);
  }
  function draw(id) {
    detailCharts.forEach((x) => x.dispose());
    const f = F.find((x) => x.id === id);
    const st = f.stats;
    const chips = (syms) => syms.slice(0, 24).map((s) => `<a class="sym-chip" href="#/s/${encodeURIComponent(s)}" title="${esc(scr.bySym.get(s)?.name || '')}">${esc(s)}</a>`).join(' ');
    body.innerHTML = `<p class="muted" style="margin:0 0 12px">${esc(f.desc)}</p>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="card stat"><div class="k">Annual spread</div><div class="v ${cls(st.ann)}">${pct(st.ann, 1)}</div><div class="d">t ${tf(st.t)} · since ${st.start.slice(0, 4)}</div></div>
        <div class="card stat"><div class="k">Sharpe</div><div class="v">${tf(st.sharpe)}</div><div class="d">vol ${pctAbs(st.vol, 1)}</div></div>
        <div class="card stat"><div class="k">Worst drawdown</div><div class="v down">${pct(st.maxdd, 1)}</div><div class="d">peak to trough</div></div>
        <div class="card stat"><div class="k">Positive months</div><div class="v">${pctAbs(st.hit_m)}</div><div class="d">6M ${pct(st.r6m)} · 1M ${pct(st.r1m)}</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><div><h3>Return by quintile ${help('Annualised equal-weight return of each fifth. A real factor climbs steadily from Q1 to Q5, not just at one end.')}</h3><div class="sub">Q1 = lowest score, Q5 = highest</div></div></div><div class="card-b"><div class="chart sm" id="fq"></div></div></div>
        <div class="card"><div class="card-h"><div><h3>Spread by calendar year</h3><div class="sub">Top minus bottom quintile</div></div></div><div class="card-b"><div class="chart sm" id="fy"></div></div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-h"><h3>In the top quintile now</h3></div><div class="card-b chips">${chips(f.top)}</div></div>
        <div class="card"><div class="card-h"><h3>In the bottom quintile now</h3></div><div class="card-b chips">${chips(f.bottom)}</div></div>
      </div>`;
    detailCharts = [
      chart(body.querySelector('#fq'), (c) => ({
        ...base(c),
        xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'], ...axis(c), splitLine: { show: false } },
        yAxis: { type: 'value', ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => pct(v, 0) } },
        tooltip: { ...base(c).tooltip, valueFormatter: (v) => `${pct(v, 1)}/yr` },
        series: [{ type: 'bar', barMaxWidth: 40, data: f.q_ann.map((v, i) => ({ value: v, itemStyle: { color: c.accent, opacity: 0.45 + i * 0.13, borderRadius: 3 } })) }],
      })),
      chart(body.querySelector('#fy'), (c) => ({
        ...base(c),
        xAxis: { type: 'category', data: st.years.map((y) => y[0]), ...axis(c), splitLine: { show: false } },
        yAxis: { type: 'value', ...axis(c), axisLabel: { ...axis(c).axisLabel, formatter: (v) => pct(v, 0) } },
        tooltip: { ...base(c).tooltip, valueFormatter: (v) => pct(v, 1) },
        series: [{ type: 'bar', barMaxWidth: 24, data: st.years.map((y) => ({ value: y[1], itemStyle: { color: y[1] >= 0 ? c.up : c.down, borderRadius: 3 } })) }],
      })),
    ];
  }
  draw(F[0].id);

  // correlations
  const cr = h(`<div class="grid g2 section">
    <div class="card"><div class="card-h"><div><h3>How the styles relate</h3><div class="sub">Correlation of daily spreads, last three years</div></div></div><div class="card-b"><div class="chart" id="corr"></div></div></div>
    <div class="card"><div class="card-h"><h3>What this page leaves out</h3></div><div class="card-b desc">
      <p style="margin-top:0"><b>Value and quality are missing on purpose.</b> Testing them properly needs the fundamentals that were known at each past date. The warehouse only has reliable point-in-time statements from 2023, and a test on today's ratios would quietly use information nobody had at the time.</p>
      <p><b>Costs are not deducted.</b> Momentum and reversal turn over far more than low volatility, so their net spreads are smaller than shown.</p>
      <p style="margin-bottom:0"><b>Survivorship.</b> The universe is today's 750 listed names, so stocks that later delisted are absent. That flatters momentum and size more than the others. The <a href="#/method" style="color:var(--accent)">methodology</a> has details.</p>
    </div></div>
  </div>`);
  root.append(cr);
  const names = Object.fromEntries(F.map((f) => [f.id, f.name]));
  chart(cr.querySelector('#corr'), (c) => ({
    ...base(c),
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...base(c).tooltip, trigger: 'item', formatter: (p) => `${names[fc.corr.ids[p.value[0]]]} × ${names[fc.corr.ids[p.value[1]]]}: <b>${p.value[2].toFixed(2)}</b>` },
    xAxis: { type: 'category', data: fc.corr.ids.map((i) => names[i]), ...axis(c), axisLabel: { ...axis(c).axisLabel, rotate: 30, fontFamily: c.sans }, splitLine: { show: false } },
    yAxis: { type: 'category', data: fc.corr.ids.map((i) => names[i]), ...axis(c), axisLabel: { ...axis(c).axisLabel, fontFamily: c.sans }, splitLine: { show: false } },
    visualMap: { show: false, min: -1, max: 1, inRange: { color: [c.down, c.card2, c.up] } },
    series: [{ type: 'heatmap', data: fc.corr.m.flatMap((row, i) => row.map((v, j) => [j, i, v])), label: { show: true, color: c.text, fontFamily: c.mono, fontSize: 11, formatter: (p) => p.value[2].toFixed(2) }, itemStyle: { borderColor: c.card, borderWidth: 2 } }],
  }));
}
