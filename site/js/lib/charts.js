// ECharts wrapper: theme from CSS variables, auto-resize, rebuilt on theme change.
const live = new Set();

export function colors() {
  const s = getComputedStyle(document.documentElement);
  const v = (k) => s.getPropertyValue(k).trim();
  return {
    text: v('--text'), text2: v('--text2'), muted: v('--muted'), faint: v('--faint'), line: v('--line'), line2: v('--line2'),
    card: v('--card'), card2: v('--card2'), accent: v('--accent'), up: v('--up'), down: v('--down'), warn: v('--warn'), info: v('--info'),
    c2: v('--c2'), c3: v('--c3'), c4: v('--c4'),
    upBg: v('--up-bg'), downBg: v('--down-bg'), mono: v('--mono'), sans: v('--sans'),
    series: [v('--accent'), v('--c2'), v('--c4'), '#ff7a59', v('--c3'), '#9ad94a', '#ff5fa2', '#7dd3fc', '#c08457', '#e8e3d5', '#8b93a7', '#d4a017'],
  };
}

export function base(c = colors()) {
  return {
    animationDuration: 600,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: c.sans, color: c.muted },
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis', backgroundColor: alpha(c.card, 0.9), borderColor: c.line2, borderWidth: 1, padding: [10, 12],
      textStyle: { color: c.text, fontSize: 12, fontFamily: c.sans },
      extraCssText: 'box-shadow:0 16px 40px -12px rgba(0,0,0,.45);border-radius:10px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);min-width:150px;',
      axisPointer: { lineStyle: { color: c.line2, type: [3, 3] }, crossStyle: { color: c.line2 }, label: { backgroundColor: c.line2, color: c.text, fontFamily: c.mono, fontSize: 10.5 } },
    },
  };
}

export const axis = (c, extra = {}) => ({
  axisLine: { lineStyle: { color: c.line } }, axisTick: { show: false },
  axisLabel: { color: c.faint, fontSize: 10.5, fontFamily: c.mono, hideOverlap: true },
  splitLine: { lineStyle: { color: c.line, opacity: 0.7 } }, ...extra,
});

// "2025-11-17" -> "Nov ’25" on date category axes; anything else passes through.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateLabel = (v) => {
  const m = /^(\d{2})(\d{2})-(\d{2})/.exec(v);
  return m ? `${MON[+m[3] - 1]} ’${m[2]}` : v;
};
export const dateAxis = (c, extra = {}) => {
  const a = axis(c, extra);
  return { ...a, axisLabel: { ...a.axisLabel, formatter: dateLabel } };
};

/** Vertical fade from `color` at opacity a0 to transparent: area fills. */
export const areaGrad = (color, a0 = 0.22) => ({
  color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(color, a0) }, { offset: 1, color: alpha(color, 0) }] },
});

/** Mount a chart. build(c) returns an option; re-run on theme change. */
export function chart(el, build, { onClick } = {}) {
  const inst = echarts.init(el, null, { renderer: 'canvas' });
  const render = () => inst.setOption(build(colors()), true);
  render();
  if (onClick) inst.on('click', onClick);
  const ro = new ResizeObserver(() => inst.resize());
  ro.observe(el);
  const rec = { inst, render, ro, el };
  live.add(rec);
  return inst;
}

export function rethemeAll() { live.forEach((r) => r.render()); }
export function disposeAll() {
  live.forEach((r) => { r.ro.disconnect(); r.inst.dispose(); });
  live.clear();
}

export function spark(el, values, up) {
  return chart(el, (c) => {
    const col = up ? c.up : c.down;
    return {
      animation: false,
      grid: { left: 0, right: 0, top: 3, bottom: 1 },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map((_, i) => i) },
      yAxis: { type: 'value', show: false, scale: true },
      series: [{
        type: 'line', data: values, symbol: 'none', smooth: 0.2, lineStyle: { width: 1.5, color: col },
        areaStyle: areaGrad(col, 0.2),
        markPoint: { symbol: 'circle', symbolSize: 5, silent: true, itemStyle: { color: col, borderColor: c.card, borderWidth: 1.5 }, label: { show: false }, data: [{ coord: [values.length - 1, values[values.length - 1]] }] },
      }],
    };
  });
}

// Diverging colour for a return, clipped at ±lim: flat reads as neutral grey,
// large moves approach the up/down colour (opaque, so tiles look the same on any surface).
export function heatColor(v, lim, c = colors()) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'transparent';
  const a = Math.pow(Math.min(1, Math.abs(v) / lim), 0.8);
  const k = 0.1 + a * 0.72;
  const b = rgb(c.line2), t = rgb(v >= 0 ? c.up : c.down);
  return `rgb(${b.map((x, i) => Math.round(x + (t[i] - x) * k)).join(',')})`;
}
function rgb(hex) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexToRgb = (hex) => rgb(hex).join(',');
export const alpha = (hex, a) => `rgba(${hexToRgb(hex)},${a})`;
export const tooltipRow = (color, label, value) =>
  `<div style="display:flex;justify-content:space-between;gap:18px;align-items:center;line-height:1.7"><span style="color:var(--text2)"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:7px"></span>${label}</span><b style="font-family:var(--mono);font-weight:500;font-variant-numeric:tabular-nums">${value}</b></div>`;
