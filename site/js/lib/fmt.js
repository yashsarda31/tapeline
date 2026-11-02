// Number formatting. Every function tolerates null/undefined and returns "—".
const DASH = '—';
const ok = (v) => v !== null && v !== undefined && !Number.isNaN(v);

export const pct = (v, d = 1, sign = true) =>
  ok(v) ? `${sign && v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%` : DASH;
export const pctAbs = (v, d = 0) => (ok(v) ? `${(v * 100).toFixed(d)}%` : DASH);
export const num = (v, d = 2) =>
  ok(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : DASH;
export const int = (v) => (ok(v) ? Math.round(v).toLocaleString('en-IN') : DASH);
export const price = (v) => (ok(v) ? num(v, v >= 1000 ? 1 : 2) : DASH);
export const t = (v) => (ok(v) ? v.toFixed(2) : DASH);
export const x = (v, d = 1) => (ok(v) ? `${v.toFixed(d)}×` : DASH);

// ₹ crore with Indian scale words
export const cr = (v) => {
  if (!ok(v)) return DASH;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 1 : 2)}L cr`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k cr`;
  return `₹${v.toFixed(v >= 100 ? 0 : 1)} cr`;
};
export const vol = (v) => {
  if (!ok(v)) return DASH;
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} k`;
  return String(Math.round(v));
};
export const cls = (v) => (!ok(v) || v === 0 ? '' : v > 0 ? 'up' : 'down');
export const date = (s) => {
  if (!s) return DASH;
  const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const dateShort = (s) => {
  if (!s) return DASH;
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const isOk = ok;
