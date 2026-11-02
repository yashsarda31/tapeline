"""Factor monitor: which styles the NSE market is paying for, and since when.

Each factor sorts the liquid universe into quintiles at every month-end; the
quintiles are held equal-weight through the next month. The headline series is
top-minus-bottom quintile (Q5 - Q1), gross of costs. Value and quality are left
out on purpose: the warehouse has no point-in-time fundamentals before 2023,
and a backtest on today's ratios would be look-ahead.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from signals import month_ends

FACTORS = [
    dict(id="momentum", name="Momentum", desc="12-month return excluding the latest month. Long winners, short losers."),
    dict(id="trend", name="Trend", desc="Distance above the 200-day average. Long most extended, short most broken."),
    dict(id="high52", name="52-week-high proximity", desc="Price as a fraction of its 52-week high. Long names near highs."),
    dict(id="lowvol", name="Low volatility", desc="60-day realised volatility, inverted. Long the calmest names, short the wildest."),
    dict(id="size", name="Small size", desc="60-day median traded value, inverted (a liquidity proxy for size). Long the smallest."),
    dict(id="reversal", name="Short-term reversal", desc="Last month's return, inverted. Long last month's losers."),
    dict(id="delivery", name="Delivery", desc="20-day average delivery %. Long the highest delivery names. Data from 2021."),
]


def scores(pn, ind) -> dict[str, pd.DataFrame]:
    P, C, R = pn.P, pn.C, pn.R
    return {
        "momentum": ind.mom12_1,
        "trend": C / ind.ma200 - 1,
        "high52": C / C.rolling(252, min_periods=240).max(),
        "lowvol": -R.rolling(60, min_periods=50).std(),
        "size": -np.log(pn.TV.rolling(60, min_periods=40).median().where(lambda x: x > 0)),
        "reversal": -(P / P.shift(21) - 1),
        "delivery": pn.D.rolling(20, min_periods=12).mean(),
    }


def quintile_returns(pn, score: pd.DataFrame, rebal: pd.DatetimeIndex) -> pd.DataFrame:
    s = score.where(pn.U).loc[rebal]
    q = np.ceil(s.rank(axis=1, pct=True) * 5)
    q = q.reindex(pn.dates).ffill().shift(1)       # formed at the close, held from the next session
    out = {}
    R = pn.R
    for k in range(1, 6):
        w = (q == k) & R.notna()
        n = w.sum(axis=1)
        out[f"q{k}"] = (R.where(w).sum(axis=1) / n).where(n >= 10)
    df = pd.DataFrame(out)
    df["ls"] = df["q5"] - df["q1"]
    return df


def stats(r: pd.Series) -> dict:
    r = r.dropna()
    if len(r) < 60:
        return {}
    ann = r.mean() * 252
    vol = r.std() * np.sqrt(252)
    eq = (1 + r).cumprod()
    dd = (eq / eq.cummax() - 1).min()
    m = (1 + r).resample("ME").prod() - 1
    t = r.mean() / r.std() * np.sqrt(len(r)) if r.std() > 0 else np.nan

    def trail(n):
        return float((1 + r.iloc[-n:]).prod() - 1) if len(r) >= n else None

    years = ((1 + r).groupby(r.index.year).prod() - 1)
    return {
        "ann": float(ann), "vol": float(vol), "sharpe": float(ann / vol) if vol else None, "t": float(t),
        "maxdd": float(dd), "hit_m": float((m > 0).mean()),
        "r1m": trail(21), "r3m": trail(63), "r6m": trail(126), "r1y": trail(252),
        "years": [[int(y), float(v)] for y, v in years.items()],
        "start": r.index[0].strftime("%Y-%m-%d"),
    }


def build(pn, ind):
    rebal = month_ends(pn.dates[pn.dates >= pn.start])
    if rebal[-1] != pn.dates[-1]:
        rebal = rebal[:-1]          # the running month's rebalance hasn't happened yet
    S = scores(pn, ind)
    out = []
    corr_input = {}
    last = pn.dates[-1]
    for spec in FACTORS:
        df = quintile_returns(pn, S[spec["id"]], rebal).loc[pn.start:]
        df = df.dropna(subset=["ls"])
        if df.empty:
            continue
        eq = (1 + df.fillna(0)).cumprod()
        wk = eq.resample("W-FRI").last()
        st = stats(df["ls"])
        # rolling 12-month spread, so you can see regimes rather than one average
        roll = ((1 + df["ls"]).rolling(252).apply(np.prod, raw=True) - 1).resample("W-FRI").last()
        # who is in the top and bottom quintile right now
        cur = S[spec["id"]].loc[last].where(pn.U.loc[last]).dropna()
        qs = cur.rank(pct=True)
        out.append({
            **spec,
            "stats": st,
            "q_ann": [float(df[f"q{k}"].mean() * 252) for k in range(1, 6)],
            "dates": [d.strftime("%Y-%m-%d") for d in wk.index],
            "ls": np.round(wk["ls"].values, 4).tolist(),
            "q": {f"q{k}": np.round(wk[f"q{k}"].values, 4).tolist() for k in range(1, 6)},
            "roll12": [None if np.isnan(v) else round(float(v), 4) for v in roll.reindex(wk.index).values],
            "top": qs[qs > 0.8].sort_values(ascending=False).index.tolist()[:40],
            "bottom": qs[qs <= 0.2].sort_values().index.tolist()[:40],
        })
        corr_input[spec["id"]] = df["ls"]
        print(f"  {spec['id']:10s} ann {100 * st.get('ann', 0):+6.1f}%  t={st.get('t', 0):5.2f}  "
              f"1y {100 * (st.get('r1y') or 0):+6.1f}%  3m {100 * (st.get('r3m') or 0):+6.1f}%")
    cm = pd.DataFrame(corr_input).dropna().iloc[-756:].corr()
    corr = {"ids": list(cm.columns), "m": np.round(cm.values, 2).tolist()}
    return {"factors": out, "corr": corr}
