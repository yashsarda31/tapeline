"""Screener rows for every name, and one JSON file per stock for the deep-dive page."""
from __future__ import annotations

import numpy as np
import pandas as pd

from util import arr, clean, dump, num

CAL_DAYS = 1260          # five years of daily bars per stock page


def _r(P: pd.DataFrame, n: int) -> pd.Series:
    return P.iloc[-1] / P.iloc[-1 - n] - 1


def screener(pn, ind, snaps, E) -> tuple[list, list, pd.DataFrame]:
    last = pn.dates[-1]
    P, C = pn.P, pn.C
    ks = snaps["ks"]
    cons = snaps["cons"].sort_values("as_of").groupby("symbol").last()
    hold = snaps["hold"]
    prom = hold[hold["category"] == "promoter"].sort_values("period")
    prom_last = prom.groupby("symbol")["pct"].last()
    prom_prev = prom.groupby("symbol")["pct"].apply(lambda s: s.iloc[-2] if len(s) > 1 else np.nan)

    prev_year = P[P.index.year < last.year]
    df = pd.DataFrame(index=pn.meta.index)
    df["close"] = C.ffill(limit=5).iloc[-1]
    df["r1d"] = pn.R.iloc[-1]
    for k, n in (("r1w", 5), ("r1m", 21), ("r3m", 63), ("r6m", 126), ("r1y", 252)):
        df[k] = _r(P, n)
    df["ytd"] = P.iloc[-1] / prev_year.iloc[-1] - 1
    r9 = _r(P, 189)
    rs_raw = 0.4 * df["r3m"] + 0.2 * df["r6m"] + 0.2 * r9 + 0.2 * df["r1y"]
    df["rs"] = (rs_raw.rank(pct=True) * 98 + 1).round()
    df["mom"] = (ind.mom12_1.iloc[-1].rank(pct=True) * 100).round()
    df["vol"] = pn.R.iloc[-60:].std() * np.sqrt(252)
    if pn.nifty is not None:
        nr = pn.nifty.pct_change().iloc[-252:]
        R1 = pn.R.iloc[-252:]
        cov = R1.sub(R1.mean()).mul(nr - nr.mean(), axis=0).mean()
        df["beta"] = cov / nr.var(ddof=0)
    hi = pn.H.iloc[-252:].max()
    lo = pn.L.iloc[-252:].min()
    df["dh"] = df["close"] / hi - 1
    df["dl"] = df["close"] / lo - 1
    df["a50"] = df["close"] > ind.ma50.iloc[-1]
    df["a200"] = df["close"] > ind.ma200.iloc[-1]
    df["rsi"] = ind.rsi14.iloc[-1]
    df["tv"] = pn.TV.iloc[-20:].mean() / 1e7
    df["volx"] = ind.volx.iloc[-1]
    df["dlv"] = pn.D.iloc[-1]
    df["dlv20"] = pn.D.iloc[-20:].mean()
    df["liq"] = pn.U.iloc[-1]

    scale = (df["close"] / ks["current_price"]).where(ks["current_price"] > 0)
    df["mcap"] = ks["market_cap"] * scale.fillna(1) / 1e7
    df["pe"] = ks["trailing_pe"].where((ks["trailing_pe"] > 0) & (ks["trailing_pe"] < 1000))
    df["pb"] = ks["price_to_book"].where((ks["price_to_book"] > 0) & (ks["price_to_book"] < 200))
    df["roe"] = ks["roe"]
    dy = ks["dividend_yield"]
    df["dy"] = ks["dividend_yield"] / 100             # Yahoo key stats report yield in percent
    df["de"] = ks["debt_to_equity"]
    df["upside"] = cons["target_mean"] / df["close"] - 1
    df["analysts"] = cons["num_analysts"]
    df["reco"] = cons["reco_mean"]
    df["prom"] = prom_last
    df["promchg"] = prom_last - prom_prev

    active = {s: [] for s in df.index}
    for sid, e in E.items():
        row = e.iloc[-1]
        for s in row[row].index:
            if pn.U.iloc[-1].get(s, False):
                active[s].append(sid)

    df = df[pn.meta["has_px"]]
    cols = ["sym", "name", "sector", "industry", "fno", "mcap", "close", "r1d", "r1w", "r1m", "r3m", "r6m", "ytd", "r1y",
            "rs", "mom", "vol", "beta", "dh", "dl", "a50", "a200", "rsi", "tv", "volx", "dlv", "dlv20",
            "pe", "pb", "roe", "dy", "de", "upside", "analysts", "reco", "prom", "promchg", "liq", "sig"]
    nd = {"mcap": 0, "close": 2, "rs": 0, "mom": 0, "rsi": 1, "tv": 1, "volx": 2, "dlv": 1, "dlv20": 1, "pe": 1,
          "pb": 2, "analysts": 0, "reco": 2, "prom": 2, "promchg": 2, "de": 1}
    rows = []
    meta = pn.meta
    for s, r in df.iterrows():
        row = []
        for c in cols:
            if c == "sym":
                row.append(s)
            elif c in ("name", "sector", "industry"):
                row.append(meta.at[s, c])
            elif c == "fno":
                row.append(bool(meta.at[s, "fno"]))
            elif c in ("a50", "a200", "liq"):
                row.append(bool(r[c]))
            elif c == "sig":
                row.append(active.get(s, []))
            else:
                row.append(num(r[c], nd.get(c, 4)))
        rows.append(row)
    return cols, rows, df


def season(P: pd.Series) -> dict:
    m = P.dropna().resample("ME").last().pct_change().dropna()
    if m.empty:
        return {"years": [], "m": []}
    years = sorted(set(m.index.year))
    grid = [[None] * 12 for _ in years]
    for d, v in m.items():
        grid[years.index(d.year)][d.month - 1] = round(float(v), 4)
    return {"years": years, "m": grid}


def stock_files(pn, ind, snaps, E, scr: pd.DataFrame, outdir):
    cal = pn.dates[-CAL_DAYS:]
    off = len(pn.dates) - CAL_DAYS
    meta = pn.meta
    cons = snaps["cons"]
    hold = snaps["hold"]
    ins = snaps["insider"]
    deals = snaps["deals"]
    ks = snaps["ks"]
    reco = snaps["reco"]
    cons_g = dict(tuple(cons.groupby("symbol")))
    hold_g = dict(tuple(hold.groupby("symbol")))
    ins_g = dict(tuple(ins.groupby("symbol")))
    deals_g = dict(tuple(deals.groupby("symbol")))
    since = pn.dates[-756]
    sig_idx = {}
    for sid, e in E.items():
        if sid == "momentum":
            continue
        sub = e.loc[since:] & pn.U.loc[since:]
        di, si = np.nonzero(sub.values)
        base = len(pn.dates) - len(sub) - off
        for d, s in zip(di, si):
            sig_idx.setdefault(sub.columns[s], []).append([sid, int(d + base)])

    nifty = pn.nifty
    total = 0
    for s in scr.index:
        c = pn.C[s].iloc[off:]
        first = c.first_valid_index()
        if first is None:
            continue
        i0 = int(cal.get_loc(first))
        sl = slice(off + i0, None)
        P = pn.P[s]
        R = pn.R[s]
        p5 = P.iloc[-CAL_DAYS:].dropna()
        eq = p5 / p5.cummax() - 1
        y1 = P.iloc[-252:].dropna()
        dd1 = (y1 / y1.cummax() - 1).min() if len(y1) else np.nan
        r1 = R.iloc[-252:]
        ann = r1.mean() * 252
        vol1 = r1.std() * np.sqrt(252)

        def cagr(n):
            pp = P.dropna()
            if len(pp) <= n:
                return None
            return float((pp.iloc[-1] / pp.iloc[-1 - n]) ** (252 / n) - 1)

        row = scr.loc[s]
        stats = {k: row.get(k) for k in ("close", "r1d", "r1w", "r1m", "r3m", "r6m", "ytd", "r1y", "rs", "mom", "vol",
                                          "beta", "dh", "dl", "rsi", "tv", "volx", "dlv", "dlv20", "mcap")}
        stats.update({
            "cagr3": cagr(756), "cagr5": cagr(1260), "vol1y": vol1, "sharpe1y": ann / vol1 if vol1 else None,
            "dd1y": dd1, "dd5y": float(eq.min()) if len(eq) else None, "dd_now": float(eq.iloc[-1]) if len(eq) else None,
            "hi52": float(pn.H[s].iloc[-252:].max()), "lo52": float(pn.L[s].iloc[-252:].min()),
            "ma50": ind.ma50[s].iloc[-1], "ma200": ind.ma200[s].iloc[-1],
            "dlv60": pn.D[s].iloc[-60:].mean(),
        })
        k = ks.loc[s] if s in ks.index else None
        fund = None
        if k is not None:
            fund = {f: k.get(f) for f in ("trailing_pe", "forward_pe", "price_to_book", "ev_to_ebitda", "roe", "roa",
                                           "profit_margin", "operating_margin", "debt_to_equity", "revenue_ttm",
                                           "net_income_ttm", "as_of")}
            fund["dy"] = row.get("dy")
            if k.get("financial_currency") and k.get("price_currency") and k["financial_currency"] != k["price_currency"]:
                fund["revenue_ttm"] = fund["net_income_ttm"] = None   # statements in USD, price in INR
        cg = cons_g.get(s)
        consd = None
        if cg is not None and len(cg):
            lc = cg.iloc[-1]
            consd = {"mean": lc["target_mean"], "high": lc["target_high"], "low": lc["target_low"],
                     "n": lc["num_analysts"], "key": lc["reco_key"], "reco": lc["reco_mean"], "as_of": lc["as_of"],
                     "hist": [[a, t, p] for a, t, p in cg[["as_of", "target_mean", "price"]].itertuples(index=False)]}
            if s in reco.index:
                consd["votes"] = reco.loc[s, ["strong_buy", "buy", "hold", "sell", "strong_sell"]].tolist()
        hg = hold_g.get(s)
        holding = []
        if hg is not None:
            pv = hg.pivot_table(index="period", columns="category", values="pct", aggfunc="last").sort_index()
            pv = pv[pv.sum(axis=1) > 0].iloc[-16:]
            holding = [[p, r.get("promoter"), r.get("public")] for p, r in pv.iterrows()]
        ig = ins_g.get(s)
        insider = [] if ig is None else ig.head(12)[["date", "acquirer", "category", "txn_type", "qty", "value", "mode"]].values.tolist()
        dg = deals_g.get(s)
        dl = [] if dg is None else dg.head(12)[["date", "client", "side", "qty", "price", "kind"]].values.tolist()

        doc = {
            "sym": s, "name": meta.at[s, "name"], "sector": meta.at[s, "sector"], "industry": meta.at[s, "industry"],
            "fno": bool(meta.at[s, "fno"]), "liq": bool(row.get("liq")),
            "desc": (meta.at[s, "descr"] or "")[:900] if isinstance(meta.at[s, "descr"], str) else "",
            "url": meta.at[s, "url"] if isinstance(meta.at[s, "url"], str) else None,
            "employees": num(meta.at[s, "employees"], 0),
            "i0": i0,
            "o": arr(pn.O[s].values[sl]), "h": arr(pn.H[s].values[sl]), "l": arr(pn.L[s].values[sl]),
            "c": arr(pn.C[s].values[sl]), "v": arr(pn.V[s].values[sl], 0), "d": arr(pn.D[s].values[sl], 1),
            "rs": arr((pn.C[s] / nifty).values[sl] * 1000, 3) if nifty is not None else None,
        }
        doc = {**doc, **clean({
            "stats": stats, "season": season(P), "sigs": sig_idx.get(s, []),
            "fund": fund, "cons": consd, "holding": holding, "insider": insider, "deals": dl,
        })}
        total += dump(outdir / f"{s}.json", doc, already_clean=True)
    return [d.strftime("%Y-%m-%d") for d in cal], total
