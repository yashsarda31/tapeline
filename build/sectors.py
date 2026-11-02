"""Sector and industry rotation from equal-weight composites of the liquid universe.

NSE's own sectoral indices are cap-weighted and few; building composites from
constituents gives every sector the same treatment and lets industries in.
The rotation graph follows the usual JdK-style approximation on weekly data:
RS-Ratio is the z-scored relative strength vs the universe, RS-Momentum the
z-scored rate of change of that ratio, both centred on 100.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RRG_W = 14       # weeks in the RRG normalisation window
TAIL = 10        # weeks of tail drawn on the RRG


def composite(pn, groups: pd.Series, min_members: int = 3) -> tuple[pd.DataFrame, pd.Series]:
    R = pn.R.where(pn.U)
    bench = R.mean(axis=1)
    cols = {}
    for g, syms in groups.groupby(groups).groups.items():
        syms = [s for s in syms if s in R.columns]
        sub = R[syms]
        n = sub.notna().sum(axis=1)
        cols[g] = sub.mean(axis=1).where(n >= min_members)
    return pd.DataFrame(cols), bench


def period_returns(idx: pd.Series) -> dict:
    s = idx.dropna()
    if len(s) < 30:
        return {}

    def r(n):
        return float(s.iloc[-1] / s.iloc[-1 - n] - 1) if len(s) > n else None

    prev = s[s.index.year < s.index[-1].year]
    return {"r1d": r(1), "r1w": r(5), "r1m": r(21), "r3m": r(63), "r6m": r(126), "r1y": r(252),
            "ytd": float(s.iloc[-1] / prev.iloc[-1] - 1) if len(prev) else None}


def rrg(idx_w: pd.Series, bench_w: pd.Series):
    rs = 100 * idx_w / bench_w
    rsr = 100 + (rs - rs.rolling(RRG_W).mean()) / rs.rolling(RRG_W).std(ddof=0)
    roc = 100 * (rsr / rsr.shift(1) - 1)
    rsm = 100 + (roc - roc.rolling(RRG_W).mean()) / roc.rolling(RRG_W).std(ddof=0)
    df = pd.DataFrame({"x": rsr, "y": rsm}).dropna().iloc[-TAIL:]
    return [[d.strftime("%Y-%m-%d"), round(float(a), 3), round(float(b), 3)] for d, (a, b) in df.iterrows()]


def quadrant(x, y):
    if x >= 100 and y >= 100:
        return "Leading"
    if x >= 100:
        return "Weakening"
    if y >= 100:
        return "Improving"
    return "Lagging"


def build(pn, ind):
    last = pn.dates[-1]
    u_now = pn.U.loc[last]
    meta = pn.meta
    above50 = (pn.C.loc[last] > ind.ma50.loc[last])
    above200 = (pn.C.loc[last] > ind.ma200.loc[last])
    r1m = pn.P.loc[last] / pn.P.shift(21).loc[last] - 1

    out = {}
    for level, col, minm in (("sectors", "sector", 3), ("industries", "industry", 3)):
        groups = meta[col]
        comp, bench = composite(pn, groups, minm)
        comp = comp.loc[pn.start:]
        bench = bench.loc[pn.start:]
        idx = (1 + comp.fillna(0)).cumprod().where(comp.notna().cumsum() > 0)
        bidx = (1 + bench.fillna(0)).cumprod()
        wk = idx.resample("W-FRI").last()
        bwk = bidx.resample("W-FRI").last()
        rows = []
        for g in comp.columns:
            members = [s for s in groups[groups == g].index if u_now.get(s, False)]
            if len(members) < minm:
                continue
            row = {"id": g, "n": len(members), **period_returns(idx[g])}
            row["b50"] = float(above50[members].mean())
            row["b200"] = float(above200[members].mean())
            lead = r1m[members].dropna().sort_values(ascending=False)
            row["best"] = lead.index[:3].tolist()
            row["worst"] = lead.index[-3:][::-1].tolist()
            if level == "sectors":
                tail = rrg(wk[g], bwk)
                row["rrg"] = tail
                row["quad"] = quadrant(tail[-1][1], tail[-1][2]) if tail else None
                rel = wk[g] / bwk
                first = rel.first_valid_index()
                rel = rel / rel.loc[first] if first is not None else rel
                row["rel"] = [None if np.isnan(v) else round(float(v), 4) for v in rel.values]
                mret = (idx[g].resample("ME").last().pct_change() - bidx.resample("ME").last().pct_change()).iloc[-24:]
                row["mex"] = [None if np.isnan(v) else round(float(v), 4) for v in mret.values]
                row["members"] = sorted(members)
            else:
                row["sector"] = meta.loc[members[0], "sector"]
                row["members"] = sorted(members)
            rows.append(row)
        rows.sort(key=lambda r: -(r.get("r1m") or -9))
        out[level] = rows
        if level == "sectors":
            out["rel_dates"] = [d.strftime("%Y-%m-%d") for d in bwk.index]
            out["mex_months"] = [d.strftime("%Y-%m") for d in bidx.resample("ME").last().index[-24:]]
            out["bench"] = period_returns(bidx)
    print(f"  {len(out['sectors'])} sectors, {len(out['industries'])} industries")
    return out
