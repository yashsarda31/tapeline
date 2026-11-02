// Fetch-once cache for the static JSON the build writes.
const cache = new Map();

export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}.json`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    }).catch((e) => { cache.delete(name); throw e; }));
  }
  return cache.get(name);
}

export const stock = (sym) => load(`s/${encodeURIComponent(sym)}`);

// Screener rows as objects, plus a symbol index. Computed once.
let scr = null;
export async function screener() {
  if (!scr) {
    scr = load('screener').then(({ cols, rows }) => {
      const list = rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
      const bySym = new Map(list.map((r) => [r.sym, r]));
      return { list, bySym };
    });
  }
  return scr;
}

export const meta = () => load('meta');
