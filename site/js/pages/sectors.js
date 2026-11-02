import { axis, base, chart, colors, dateAxis, heatColor, tooltipRow } from '../lib/charts.js';
import { load } from '../lib/data.js';
import { cls, esc, int, pct, pctAbs } from '../lib/fmt.js';
import { h, help, seg, table } from '../lib/ui.js';

const QUAD_COLOR = { Leading: 'up', Weakening: 'warn', Lagging: 'down', Improving: 'info' };

export async function render(root) {
  const sc = await load('sectors');
  const S = sc.sectors;
  const by = (q) => S.filter((s) => s.quad === q).map((s) => `<b>${esc(s.id)}</b>`);
  const join = (a) => (a.length ? a.join(', ') : 'none');

  root.append(h(`<div class="ph"><div>
    <div class="eyebrow">Sector rotation</div>
    <h1>Where the money is moving</h1>
    <p>Equal-weight sector composites built from the liquid universe, so a sector's move reflects its typical stock rather than its two biggest names.</p>
  </div></div>`));
  root.append(h(`<p class="lede">Leading: ${join(by('Leading'))}. Improving: ${join(by('Improving'))}. Weakening: ${join(by('Weakening'))}. Lagging: ${join(by('Lagging'))}. The universe itself is ${pct(sc.bench.r1m)} over the month and ${pct(sc.bench.r1y)} over the year.</p>`));

  const top = h(`<div class="grid g2">
    <div class="card"><div class="card-h"><div><h2>Relative rotation graph ${help('X axis: relative strength vs the equal-weight universe (above 100 = outperforming). Y axis: momentum of that relative strength (above 100 = improving). Sectors tend to rotate clockwise: Improving → Leading → Weakening → Lagging. Tails show the last 10 weeks.')}</h2><div class="sub">Weekly, last 10 weeks of tail</div></div></div><div class="card-b"><div class="chart lg" id="rrg"></div></div></div>
    <div class="card"><div class="card-h"><div><h2>Sector scoreboard</h2><div class="sub">Equal-weight returns and breadth</div></div></div><div class="card-b" style="padding-top:8px" id="st"></div></div>
  </div>`);
  root.append(top);
  chart(top.querySelector('#rrg'), (c) => rrgOption(c, S));
  table(top.querySelector('#st'), [
    { key: 'id', label: 'Sector', asc: true, fmt: (r) => `<b>${esc(r.id)}</b><div class="faint" style="font-size:11px">${r.n} stocks · <span style="color:var(--${QUAD_COLOR[r.quad] || 'muted'})">${r.quad || ''}</span></div>` },
    ...[['r1w', '1W'], ['r1m', '1M'], ['r3m', '3M'], ['r1y', '1Y']].map(([k, l]) => ({ key: k, label: l, r: true, fmt: (r) => `<span class="${cls(r[k])}">${pct(r[k])}</span>` })),
    { key: 'b50', label: '>50DMA', r: true, tip: 'Share of the sector above its 50-day average', fmt: (r) => `${pctAbs(r.b50)}<div class="bar" style="margin-top:4px"><span style="width:${r.b50 * 100}%"></span></div>` },
  ], { rows: S, sortKey: 'r1m' });

  // monthly excess heatmap
  const hm = h(`<div class="card section"><div class="card-h"><div><h2>Monthly excess return vs the universe</h2><div class="sub">Each cell is the sector's month minus the equal-weight universe's month. Rotation shows up as colour moving down the columns.</div></div></div><div class="card-b"><div class="tbl-wrap"></div></div></div>`);
  root.append(hm);
  const months = sc.mex_months;
  const c = colors();
  hm.querySelector('.tbl-wrap').innerHTML = `<table class="t" style="font-size:12px"><thead><tr><th>Sector</th>${months.map((m) => `<th class="r" style="padding:6px 3px">${m.slice(2).replace('-', '/')}</th>`).join('')}</tr></thead><tbody>${S.map((s) =>
    `<tr><td><b>${esc(s.id)}</b></td>${s.mex.map((v, i) => `<td style="padding:3px 2px"><div class="heat" style="background:${heatColor(v, 0.06, c)}" data-tip="${esc(s.id)} ${months[i]}: ${pct(v, 1)} vs universe">${v === null ? '' : (v * 100).toFixed(0)}</div></td>`).join('')}</tr>`).join('')}</tbody></table>`;

  // relative strength lines
  const rl = h(`<div class="card section"><div class="card-h"><div><h2>Relative strength</h2><div class="sub">Sector composite ÷ universe, rebased to 1. Rising means outperforming. Click legend items to toggle.</div></div></div><div class="card-b"><div class="chart lg"></div></div></div>`);
  root.append(rl);
  chart(rl.querySelector('.chart'), (c) => ({
    ...base(c),
    color: c.series,
    legend: { type: 'scroll', top: 0, textStyle: { color: c.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8, pageTextStyle: { color: c.muted } },
    grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: sc.rel_dates, ...dateAxis(c), splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, ...axis(c) },
    tooltip: { ...base(c).tooltip, order: 'valueDesc', valueFormatter: (v) => (v === null || v === undefined ? '—' : v.toFixed(3)) },
    series: S.map((s) => ({ name: s.id, type: 'line', data: s.rel, symbol: 'none', lineStyle: { width: 1.5 }, emphasis: { focus: 'series' } })),
  }));

  // industries
  const ind = sc.industries;
  const it = h(`<div class="card section"><div class="card-h"><div><h2>Industries</h2><div class="sub">${ind.length} industries with at least three liquid stocks</div></div></div>
    <div class="toolbar"><input class="input" placeholder="Filter industries…" id="if"><select class="input" id="is"><option value="">All sectors</option>${S.map((s) => `<option>${esc(s.id)}</option>`).join('')}</select><span class="count" id="ic"></span></div>
    <div class="card-b" style="padding-top:0"></div></div>`);
  root.append(it);
  const tbl = table(it.querySelector('.card-b'), [
    { key: 'id', label: 'Industry', asc: true, fmt: (r) => `<b>${esc(r.id)}</b><div class="faint" style="font-size:11px">${esc(r.sector)} · ${r.n} stocks</div>` },
    ...[['r1w', '1W'], ['r1m', '1M'], ['r3m', '3M'], ['r6m', '6M'], ['r1y', '1Y']].map(([k, l]) => ({ key: k, label: l, r: true, fmt: (r) => `<span class="${cls(r[k])}">${pct(r[k])}</span>` })),
    { key: 'b50', label: '>50DMA', r: true, fmt: (r) => pctAbs(r.b50) },
    { key: 'b200', label: '>200DMA', r: true, fmt: (r) => pctAbs(r.b200) },
    { key: 'best', label: 'Leaders (1M)', sort: false, fmt: (r) => r.best.map((s) => `<a class="sym-chip" href="#/s/${encodeURIComponent(s)}">${esc(s)}</a>`).join(' ') },
  ], { rows: ind, sortKey: 'r1m', maxHeight: '640px' });
  const apply = () => {
    const q = it.querySelector('#if').value.toLowerCase();
    const sec = it.querySelector('#is').value;
    const rows = ind.filter((r) => (!q || r.id.toLowerCase().includes(q)) && (!sec || r.sector === sec));
    tbl.update(rows);
    it.querySelector('#ic').textContent = `${rows.length} shown`;
  };
  it.querySelector('#if').addEventListener('input', apply);
  it.querySelector('#is').addEventListener('change', apply);
  apply();
}

function rrgOption(c, S) {
  const pts = S.flatMap((s) => s.rrg.map((p) => [p[1], p[2]]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const span = Math.ceil((Math.max(...xs.map((v) => Math.abs(v - 100)), ...ys.map((v) => Math.abs(v - 100)), 1.5) + 0.3) * 2) / 2;
  const [x0, x1, y0, y1] = [100 - span, 100 + span, 100 - span, 100 + span];
  const quad = (name, xa, xb, ya, yb, col) => [{ name, xAxis: xa, yAxis: ya, itemStyle: { color: col } }, { xAxis: xb, yAxis: yb }];
  const alpha = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  return {
    ...base(c),
    grid: { left: 8, right: 16, top: 12, bottom: 28, containLabel: true },
    xAxis: { type: 'value', min: x0, max: x1, interval: span / 2, name: 'Relative strength →', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: c.muted, fontSize: 11 }, ...axis(c), splitLine: { show: false } },
    yAxis: { type: 'value', min: y0, max: y1, interval: span / 2, name: 'Momentum →', nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: c.muted, fontSize: 11 }, ...axis(c), splitLine: { show: false } },
    tooltip: {
      ...base(c).tooltip, trigger: 'item',
      formatter: (p) => {
        const s = S[p.seriesIndex];
        const pt = s.rrg[p.dataIndex];
        return `<b>${esc(s.id)}</b> <span style="color:${c.muted}">${pt[0]}</span><br>RS-ratio ${pt[1].toFixed(2)} · momentum ${pt[2].toFixed(2)}<br>${s.quad} · 1M ${pct(s.r1m)}`;
      },
    },
    series: [
      {
        type: 'scatter', data: [], silent: true,
        markArea: {
          silent: true, label: { position: 'insideTopLeft', color: c.faint, fontSize: 11, fontWeight: 600 },
          data: [
            quad('Improving', x0, 100, 100, y1, alpha(c.info, 0.07)),
            quad('Leading', 100, x1, 100, y1, alpha(c.up, 0.07)),
            quad('Lagging', x0, 100, y0, 100, alpha(c.down, 0.06)),
            quad('Weakening', 100, x1, y0, 100, alpha(c.warn, 0.07)),
          ],
        },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: c.line2 }, label: { show: false }, data: [{ xAxis: 100 }, { yAxis: 100 }] },
      },
      ...S.map((s, i) => {
        const col = c.series[i % c.series.length];
        const n = s.rrg.length;
        return {
          type: 'line', data: s.rrg.map((p) => [p[1], p[2]]), z: 3, smooth: 0.35,
          lineStyle: { color: col, width: 1.6, opacity: 0.85 }, itemStyle: { color: col },
          symbol: 'circle', symbolSize: (v, p) => (p.dataIndex === n - 1 ? 10 : 4),
          label: { show: true, formatter: (p) => (p.dataIndex === n - 1 ? s.id : ''), position: 'right', color: c.text2, fontSize: 11, fontWeight: 600 },
          labelLayout: { hideOverlap: true },
        };
      }),
    ],
  };
}
