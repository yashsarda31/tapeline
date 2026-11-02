// ECharts wrapper: theme from CSS variables, auto-resize, rebuilt on theme change.
const live = new Set();

export function colors() {
  const s = getComputedStyle(document.documentElement);
  const v = (k) => s.getPropertyValue(k).trim();
  return {
    text: v('--text'), text2: v('--text2'), muted: v('--muted'), faint: v('--faint'), line: v('--line'), line2: v('--line2'),
    card: v('--card'), card2: v('--card2'), accent: v('--accent'), up: v('--up'), down: v('--down'), warn: v('--warn'),
    upBg: v('--up-bg'), downBg: v('--down-bg'), mono: v('--mono'), sans: v('--sans'),
    series: [v('--accent'), '#4f8cff', '#f2994a', '#2bb3c0', '#e05fa0', '#9bbf3b', '#c98a12', '#8d6e63', '#7e8aa2', '#d65db1', '#00a6a6'],
  };
}

export function base(c = colors()) {
  return {
    animationDuration: 400,
    textStyle: { fontFamily: c.sans, color: c.muted },
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis', backgroundColor: c.card, borderColor: c.line2, borderWidth: 1, padding: [8, 10],
      textStyle: { color: c.text, fontSize: 12, fontFamily: c.sans }, extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.18);border-radius:8px;',
      axisPointer: { lineStyle: { color: c.line2 }, crossStyle: { color: c.line2 } },
    },
  };
}

export const axis = (c, extra = {}) => ({
  axisLine: { lineStyle: { color: c.line } }, axisTick: { show: false },
  axisLabel: { color: c.muted, fontSize: 11, fontFamily: c.mono, hideOverlap: true },
  splitLine: { lineStyle: { color: c.line, type: [3, 3] } }, ...extra,
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
  return chart(el, (c) => ({
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{
      type: 'line', data: values, symbol: 'none', lineStyle: { width: 1.5, color: up ? c.up : c.down },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: up ? c.upBg : c.downBg }, { offset: 1, color: 'transparent' }] } },
    }],
  }));
}

// Diverging colour for a return, clipped at ±lim.
export function heatColor(v, lim, c = colors()) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'transparent';
  const a = Math.min(1, Math.abs(v) / lim);
  const rgb = v >= 0 ? hexToRgb(c.up) : hexToRgb(c.down);
  return `rgba(${rgb},${(0.08 + a * 0.62).toFixed(3)})`;
}
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
export const tooltipRow = (color, label, value) =>
  `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>${label}</span><b style="font-family:var(--mono)">${value}</b></div>`;
