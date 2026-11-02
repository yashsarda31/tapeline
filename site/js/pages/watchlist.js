import { load, screener } from '../lib/data.js';
import { cls, cr, esc, int, num, pct, price } from '../lib/fmt.js';
import { h, icon, table, watch } from '../lib/ui.js';

export async function render(root) {
  const [{ bySym, list }, sg] = await Promise.all([screener(), load('signals')]);
  const sigName = Object.fromEntries(sg.signals.map((s) => [s.id, s.name]));
  root.append(h(`<div class="ph"><div><div class="eyebrow">Watchlist</div><h1>Your watchlist</h1>
    <p>Stored in this browser only. Nothing is sent anywhere. Star a stock from its page or from the screener.</p></div></div>`));
  const host = h('<div class="card"></div>');
  root.append(host);

  function draw() {
    const rows = watch.all().map((s) => bySym.get(s)).filter(Boolean);
    if (!rows.length) {
      const ideas = [...list].filter((r) => r.liq).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 10);
      host.innerHTML = `<div class="empty"><p>Your watchlist is empty.</p><p class="muted">Some of the largest names to start with:</p><div class="chips" style="justify-content:center">${ideas.map((r) => `<a class="sym-chip" href="#/s/${encodeURIComponent(r.sym)}">${esc(r.sym)}</a>`).join('')}</div></div>`;
      return;
    }
    host.innerHTML = '<div class="card-b" style="padding-top:8px"></div>';
    table(host.querySelector('.card-b'), [
      { key: 'x', label: '', sort: false, fmt: (r) => `<button class="icon-btn rm" data-s="${esc(r.sym)}" style="width:26px;height:26px;border:0;background:none;color:var(--warn)" aria-label="Remove from watchlist">${icon('star')}</button>` },
      { key: 'sym', label: 'Stock', asc: true, fmt: (r) => `<div class="co"><b>${esc(r.sym)}</b><span>${esc(r.name)}</span></div>` },
      { key: 'close', label: 'Price', r: true, fmt: (r) => price(r.close) },
      ...[['r1d', '1D'], ['r1w', '1W'], ['r1m', '1M'], ['r1y', '1Y']].map(([k, l]) => ({ key: k, label: l, r: true, fmt: (r) => `<span class="${cls(r[k])}">${pct(r[k], k === 'r1d' ? 2 : 1)}</span>` })),
      { key: 'rs', label: 'RS', r: true, fmt: (r) => int(r.rs) },
      { key: 'dh', label: 'From high', r: true, fmt: (r) => pct(r.dh) },
      { key: 'rsi', label: 'RSI', r: true, fmt: (r) => num(r.rsi, 0) },
      { key: 'mcap', label: 'Mkt cap', r: true, fmt: (r) => cr(r.mcap) },
      { key: 'sig', label: 'Signals today', sort: (r) => r.sig.length, fmt: (r) => r.sig.map((x) => `<a class="sym-chip" href="#/signals/${x}">${esc(sigName[x] || x)}</a>`).join(' ') },
    ], { rows, sortKey: 'r1d', onRow: (r) => (location.hash = `#/s/${encodeURIComponent(r.sym)}`) });
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.rm');
    if (!b) return;
    e.stopPropagation();
    watch.toggle(b.dataset.s);
    draw();
  }, true);
  draw();
}
