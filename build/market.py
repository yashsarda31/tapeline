"""Market page: indices, breadth history, and what breadth/VIX have meant for forward returns.

The conditional tables use overlapping daily observations, so the number of
independent periods is roughly days / horizon. t-stats are clustered on
non-overlapping horizon blocks for the same reason as in signals.py.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from data import INDICES
from signals import _cluster_t
from util import ret, ytd



def index_cards(pn) -> list:
    cards = []
    for key, (tk, label, group) in INDICES.items():
        s = pn.idx.get(key)
        if s is None or s.empty:
            continue
        s = s.dropna()
        cards.append({
            "id": key, "label": label, "group": group, "last": float(s.iloc[-1]),
            "date": s.index[-1].strftime("%Y-%m-%d"),
            "r1d": ret(s, 1), "r1w": ret(s, 5), "r1m": ret(s, 21), "r3m": ret(s, 63), "ytd": ytd(s), "r1y": ret(s, 252),
            "spark": np.round(s.iloc[-90:].values, 2).tolist(),
        })
    return cards


def breadth(pn, ind) -> pd.DataFrame:
    U = pn.U
    C = pn.C
    n = U.sum(axis=1)
    b = pd.DataFrame(index=pn.dates)
    b["n"] = n
    ok50 = U & ind.ma50.notna()
    ok200 = U & ind.ma200.notna()
    b["p50"] = (U & (C > ind.ma50)).sum(axis=1) / ok50.sum(axis=1)
    b["p200"] = (U & (C > ind.ma200)).sum(axis=1) / ok200.sum(axis=1)
    b["nh"] = (U & (C > ind.hc252)).sum(axis=1)
    b["nl"] = (U & (C < ind.lc252)).sum(axis=1)
    b["adv"] = (U & (pn.R > 0)).sum(axis=1)
    b["dec"] = (U & (pn.R < 0)).sum(axis=1)
    net = (b["adv"] - b["dec"]) / (b["adv"] + b["dec"]).replace(0, np.nan)
    b["mcc"] = 1000 * (net.ewm(span=19).mean() - net.ewm(span=39).mean())
    b["ad"] = (b["adv"] - b["dec"]).cumsum()
    b["ew"] = (1 + pn.R.where(U).mean(axis=1).fillna(0)).cumprod()
    return b


def conditional(state: pd.Series, fwd: dict[int, pd.Series], bins, labels, current) -> dict:
    """Bucketed forward returns. A bucket's t-stat tests its mean against the all-days mean."""
    cat = pd.cut(state, bins=bins, labels=labels, include_lowest=True)
    mu = {h: f[state.notna() & f.notna()].mean() for h, f in fwd.items()}
    rows = []
    allrow = {"label": "All days"}
    for lab in list(labels) + [None]:
        sel = state.notna() if lab is None else (cat == lab)
        row = {"label": lab or "All days", "days": int(sel.sum())}
        for h, f in fwd.items():
            x = f[sel & f.notna()]
            if len(x) < 30:
                row[f"m{h}"] = row[f"hit{h}"] = row[f"t{h}"] = None
                continue
            pos = np.searchsorted(f.index, x.index)
            t = _cluster_t(x.values if lab is None else x.values - mu[h], pos // h)
            row[f"m{h}"] = float(x.mean())
            row[f"med{h}"] = float(x.median())
            row[f"hit{h}"] = float((x > 0).mean())
            row[f"t{h}"] = None if np.isnan(t) else float(t)
            row[f"ind{h}"] = int(len(x) // h)
        if lab is None:
            allrow = row
        else:
            rows.append(row)
    cur_lab = None
    if current is not None and not np.isnan(current):
        cur_lab = str(pd.cut(pd.Series([current]), bins=bins, labels=labels, include_lowest=True).iloc[0])
    return {"rows": rows, "all": allrow, "current": cur_lab, "value": current}


def build(pn, ind):
    b = breadth(pn, ind)
    BREADTH_START = pn.start
    bb = b.loc[BREADTH_START:]
    last = b.iloc[-1]
    nifty = pn.nifty
    fwd = {h: (nifty.shift(-h) / nifty - 1) for h in (20, 60)}
    fwd_b = {h: f.loc[BREADTH_START:] for h, f in fwd.items()}

    regimes = {
        "p200": {"title": "Share of stocks above their 200-day average",
                 **conditional(b["p200"].loc[BREADTH_START:], fwd_b, [0, .2, .4, .6, .8, 1.0001],
                               ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"], float(last["p200"]))},
        "p50": {"title": "Share of stocks above their 50-day average",
                **conditional(b["p50"].loc[BREADTH_START:], fwd_b, [0, .2, .4, .6, .8, 1.0001],
                              ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"], float(last["p50"]))},
    }
    if "vix" in pn.idx:
        vix = pn.idx["vix"].reindex(pn.dates).ffill()
        regimes["vix"] = {"title": "India VIX level",
                          **conditional(vix.loc["2009-01-01":], {h: f.loc["2009-01-01":] for h, f in fwd.items()},
                                        [0, 12, 15, 20, 25, 200], ["< 12", "12–15", "15–20", "20–25", "> 25"],
                                        float(vix.iloc[-1]))}

    vix_d = pn.idx["vix"].reindex(bb.index).ffill() if "vix" in pn.idx else None
    hist = {
        "dates": [d.strftime("%Y-%m-%d") for d in bb.index],
        "nifty": np.round(nifty.loc[bb.index].values, 2).tolist(),
        "ew": np.round(bb["ew"] / bb["ew"].iloc[0] * 100, 2).tolist(),
        "p50": np.round(bb["p50"].values, 4).tolist(),
        "p200": np.round(bb["p200"].values, 4).tolist(),
        "nh": bb["nh"].astype(int).tolist(),
        "nl": bb["nl"].astype(int).tolist(),
        "mcc": np.round(bb["mcc"].values, 1).tolist(),
        "ad": bb["ad"].astype(int).tolist(),
        "vix": None if vix_d is None else np.round(vix_d.values, 2).tolist(),
    }
    pct_rank = lambda s, v: float((s.dropna() <= v).mean())
    summary = {
        "date": pn.dates[-1].strftime("%Y-%m-%d"),
        "since": pn.start.strftime("%Y-%m-%d"),
        "n": int(last["n"]), "adv": int(last["adv"]), "dec": int(last["dec"]),
        "p50": float(last["p50"]), "p200": float(last["p200"]),
        "p50_rank": pct_rank(bb["p50"], last["p50"]), "p200_rank": pct_rank(bb["p200"], last["p200"]),
        "nh": int(last["nh"]), "nl": int(last["nl"]), "mcc": float(last["mcc"]),
        "ew1d": float(pn.R.where(pn.U).iloc[-1].mean()),
        "ew_med1d": float(pn.R.where(pn.U).iloc[-1].median()),
    }
    print(f"  breadth {summary['date']}: {summary['adv']}/{summary['dec']}  >50dma {summary['p50']:.0%}  "
          f">200dma {summary['p200']:.0%}  NH {summary['nh']} NL {summary['nl']}")
    return {"indices": index_cards(pn), "summary": summary, "history": hist, "regimes": regimes}
