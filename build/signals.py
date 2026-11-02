"""Screens, and the evidence for each one.

Every screen is evaluated on the full history of the point-in-time liquid
universe. For each trigger we take the forward return over 5/20/60 sessions
minus the equal-weight universe's return over the same window ("excess").
t-statistics are cluster-robust over non-overlapping blocks of the horizon, so
a day with fifty simultaneous breakouts counts as one observation, not fifty.

The verdict is a fixed rule on the 20-session horizon, written down before the
numbers are looked at:
  edge      t >= 2, both halves of the sample positive, mean after costs > 0
  negative  t <= -2 and both halves negative
  none      anything else
"""
from __future__ import annotations

import numpy as np
import pandas as pd

HORIZONS = (5, 20, 60)
HEAD = 20                 # headline horizon
COST = 0.003              # round-trip cost assumption for cash delivery trades
DEDUP = 10                # a repeat trigger within 10 sessions is the same event


class Ind:
    """Indicator cache over a Panel, computed lazily."""

    def __init__(self, pn):
        self.pn = pn
        self._c = {}

    def __getattr__(self, k):
        if k.startswith("_") or k == "pn":
            raise AttributeError(k)
        if k not in self._c:
            self._c[k] = getattr(self, "_" + k)()
        return self._c[k]

    def _ma50(self):
        return self.pn.C.rolling(50, min_periods=45).mean()

    def _ma200(self):
        return self.pn.C.rolling(200, min_periods=180).mean()

    def _hc20(self):
        return self.pn.C.shift(1).rolling(20, min_periods=18).max()

    def _hc252(self):
        return self.pn.C.shift(1).rolling(252, min_periods=240).max()

    def _lc252(self):
        return self.pn.C.shift(1).rolling(252, min_periods=240).min()

    def _av50(self):
        return self.pn.V.shift(1).rolling(50, min_periods=40).mean()

    def _volx(self):
        return self.pn.V / self.av50

    def _rsi14(self):
        d = self.pn.C.diff()
        up = d.clip(lower=0).ewm(alpha=1 / 14, min_periods=14).mean()
        dn = (-d.clip(upper=0)).ewm(alpha=1 / 14, min_periods=14).mean()
        return 100 - 100 / (1 + up / dn)

    def _bbw_pct(self):
        m = self.pn.C.rolling(20, min_periods=20).mean()
        s = self.pn.C.rolling(20, min_periods=20).std()
        bbw = 4 * s / m
        lo = bbw.rolling(252, min_periods=200).min()
        hi = bbw.rolling(252, min_periods=200).max()
        return (bbw - lo) / (hi - lo)

    def _mom12_1(self):
        P = self.pn.P
        return P.shift(21) / P.shift(252) - 1

    def _rs(self):
        if self.pn.nifty is None:
            return self.pn.C * np.nan
        return self.pn.C.div(self.pn.nifty, axis=0)

    def _rs_hi252(self):
        return self.rs.shift(1).rolling(252, min_periods=240).max()

    def _dlv60(self):
        return self.pn.D.shift(1).rolling(60, min_periods=30).mean()


def fresh(E: pd.DataFrame, k: int = DEDUP) -> pd.DataFrame:
    prior = E.astype("float32").shift(1).rolling(k, min_periods=1).max().fillna(0) > 0
    return E & ~prior


def month_ends(dates: pd.DatetimeIndex) -> pd.DatetimeIndex:
    s = pd.Series(dates, index=dates)
    return pd.DatetimeIndex(s.groupby([dates.year, dates.month]).max().values)


SIGNALS = [
    dict(id="breakout20", name="20-day breakout on volume", side="long", group="Breakouts",
         rule="Close above the highest close of the prior 20 sessions, on at least 1.5× the 50-day average volume."),
    dict(id="high52", name="New 52-week high", side="long", group="Breakouts",
         rule="Close above the highest close of the prior 252 sessions."),
    dict(id="rs_lead", name="Relative strength leads price", side="long", group="Breakouts",
         rule="The stock's ratio to the Nifty 50 makes a 52-week high while the price itself is still more than 3% below its own 52-week high."),
    dict(id="gap_up", name="Gap-up that holds", side="long", group="Breakouts",
         rule="Opens at least 4% above the prior close, closes above the open, on at least 2× average volume."),
    dict(id="momentum", name="Momentum leaders (top decile 12-1)", side="long", group="Trend",
         rule="Top 10% of the liquid universe by 12-month return excluding the latest month. Measured at each month-end."),
    dict(id="golden_cross", name="Golden cross", side="long", group="Trend",
         rule="50-day average crosses above the 200-day average."),
    dict(id="pullback50", name="Pullback to a rising 50-DMA", side="long", group="Trend",
         rule="Above the 200-DMA, 50-DMA higher than a month ago, was at least 8% above the 50-DMA in the last 20 sessions, now within ±2% of it."),
    dict(id="squeeze", name="Volatility squeeze", side="long", group="Patterns",
         rule="20-day Bollinger band width in the lowest 5% of its one-year range, price above the 200-DMA."),
    dict(id="delivery_surge", name="Delivery surge", side="long", group="Flows",
         rule="Delivery % at least 1.5× its 60-day average and volume at least 2× average, on an up day. Data from 2021."),
    dict(id="oversold", name="RSI oversold (< 30)", side="long", group="Mean reversion",
         rule="14-day RSI falls below 30."),
    dict(id="capitulation", name="Capitulation day", side="long", group="Mean reversion",
         rule="Falls 5% or more in a session on at least 3× average volume."),
    dict(id="death_cross", name="Death cross", side="short", group="Trend",
         rule="50-day average crosses below the 200-day average."),
    dict(id="low52", name="New 52-week low", side="short", group="Breakdowns",
         rule="Close below the lowest close of the prior 252 sessions."),
]


def compute_events(pn, ind: Ind) -> dict[str, pd.DataFrame]:
    C, O, R = pn.C, pn.O, pn.R
    ma50, ma200 = ind.ma50, ind.ma200
    E = {}
    E["breakout20"] = fresh((C > ind.hc20) & (ind.volx >= 1.5))
    E["high52"] = fresh(C > ind.hc252)
    E["rs_lead"] = fresh((ind.rs > ind.rs_hi252) & (C < 0.97 * ind.hc252))
    E["gap_up"] = fresh((O >= 1.04 * C.shift(1)) & (C > O) & (ind.volx >= 2))
    above = ma50 > ma200
    E["golden_cross"] = fresh(above & ~above.shift(1, fill_value=False) & ma200.notna(), 20)
    E["death_cross"] = fresh(~above & above.shift(1, fill_value=False) & ma50.notna() & ma200.notna(), 20)
    stretched = (C / ma50).rolling(20, min_periods=15).max() >= 1.08
    E["pullback50"] = fresh((C > ma200) & (ma50 > ma50.shift(21)) & stretched & ((C / ma50 - 1).abs() <= 0.02))
    E["squeeze"] = fresh((ind.bbw_pct <= 0.05) & (C > ma200))
    dl = pn.D
    E["delivery_surge"] = fresh((dl >= 1.5 * ind.dlv60) & (ind.volx >= 2) & (R > 0))
    rsi = ind.rsi14
    E["oversold"] = fresh((rsi < 30) & (rsi.shift(1) >= 30))
    E["capitulation"] = fresh((R <= -0.05) & (ind.volx >= 3))
    E["low52"] = fresh(C < ind.lc252)

    # momentum: state at month-ends (plus the latest session, so today's list is current)
    mom = ind.mom12_1.where(pn.U)
    pct = mom.rank(axis=1, pct=True)
    top = pct >= 0.9
    me = month_ends(pn.dates)
    sample = pd.Series(False, index=pn.dates)
    sample[me] = True
    sample.iloc[-1] = True
    E["momentum"] = top & pd.DataFrame(np.repeat(sample.values[:, None], top.shape[1], 1), index=top.index, columns=top.columns)
    return {k: v.fillna(False).astype(bool) for k, v in E.items()}


def forward_excess(pn) -> dict[int, tuple[pd.DataFrame, pd.Series]]:
    out = {}
    for h in HORIZONS:
        F = pn.P.shift(-h) / pn.P - 1
        Fu = F.where(pn.U).mean(axis=1)
        out[h] = (F, Fu)
    return out


def _cluster_t(x: np.ndarray, blocks: np.ndarray) -> float:
    n = x.size
    if n < 10:
        return np.nan
    m = x.mean()
    sums = np.bincount(blocks, weights=x - m)
    se = np.sqrt((sums ** 2).sum()) / n
    nb = np.count_nonzero(np.bincount(blocks))
    if se == 0 or nb < 5:
        return np.nan
    return m / se * np.sqrt(nb / (nb - 1))


def measure(pn, E: pd.DataFrame, fx, side: str) -> dict:
    dates = pn.dates
    mask0 = E.values & pn.U.values
    res = {"horizons": {}}
    for h in HORIZONS:
        F, Fu = fx[h]
        X = F.values - Fu.values[:, None]
        m = mask0 & ~np.isnan(X)
        di, si = np.nonzero(m)
        x = X[m]
        raw = F.values[m]
        if x.size == 0:
            res["horizons"][str(h)] = {"n": 0}
            continue
        order = np.argsort(di, kind="stable")
        di, x, raw, si = di[order], x[order], raw[order], si[order]
        blocks = di // h
        t = _cluster_t(x, blocks)
        half = x.size // 2
        st = {
            "n": int(x.size),
            "dates": int(np.unique(di).size),
            "mean": float(x.mean()),
            "median": float(np.median(x)),
            "hit": float((x > 0).mean()),
            "raw": float(raw.mean()),
            "base": float(np.nanmean(Fu.values[np.unique(di)])),
            "t": None if np.isnan(t) else float(t),
            "h1": float(x[:half].mean()) if half else None,
            "h2": float(x[half:].mean()) if half else None,
            "p10": float(np.percentile(x, 10)),
            "p90": float(np.percentile(x, 90)),
        }
        if h == HEAD:
            yrs = dates[di].year
            by = pd.DataFrame({"y": yrs, "x": x}).groupby("y")["x"].agg(["mean", "count"])
            st["years"] = [[int(y), float(r["mean"]), int(r["count"])] for y, r in by.iterrows()]
            edges = np.arange(-0.30, 0.3001, 0.02)
            hist, _ = np.histogram(np.clip(x, -0.2999, 0.2999), bins=edges)
            st["hist"] = {"edges": edges.round(2).tolist(), "counts": hist.tolist()}
            recent = di >= len(dates) - 252 - h
            st["recent"] = {"n": int(recent.sum()), "mean": float(x[recent].mean()) if recent.any() else None}
            # cumulative average-excess curve by event date (monthly), for a "has it decayed?" view
            s = pd.Series(x, index=dates[di]).resample("ME").sum()
            cnt = pd.Series(1, index=dates[di]).resample("ME").sum()
            cum = (s.cumsum() / cnt.cumsum()).dropna()
            st["curve"] = [[d.strftime("%Y-%m"), float(v)] for d, v in cum.items()]
            res["first"] = dates[di[0]].strftime("%Y-%m-%d")
        res["horizons"][str(h)] = st

    hs = res["horizons"].get(str(HEAD), {})
    sign = 1 if side == "long" else -1
    t, mean = hs.get("t"), hs.get("mean")
    verdict = "none"
    if t is not None and hs.get("h1") is not None:
        if sign * t >= 2 and sign * hs["h1"] > 0 and sign * hs["h2"] > 0 and sign * mean - COST > 0:
            verdict = "edge"
        elif sign * t <= -2 and sign * hs["h1"] < 0 and sign * hs["h2"] < 0:
            verdict = "negative"
    res["verdict"] = verdict
    return res


def recent_events(pn, E: pd.DataFrame, fx, n: int = 40) -> list:
    """Latest triggers with their realised 20-session excess where known."""
    F, Fu = fx[HEAD]
    X = F.values - Fu.values[:, None]
    m = E.values & pn.U.values
    di, si = np.nonzero(m)
    order = np.lexsort((si, di))[::-1][:n]
    out = []
    for k in order:
        d, s = di[k], si[k]
        v = X[d, s]
        out.append([pn.dates[d].strftime("%Y-%m-%d"), pn.C.columns[s], None if np.isnan(v) else round(float(v), 4)])
    return out


def build(pn, ind: Ind):
    E = compute_events(pn, ind)
    fx = forward_excess(pn)
    last = pn.dates[-1]
    out = []
    for spec in SIGNALS:
        e = E[spec["id"]]
        stats = measure(pn, e, fx, spec["side"])
        today = e.loc[last] & pn.U.loc[last]
        matches = sorted(today[today].index.tolist())
        out.append({**spec, **stats, "today": matches, "events": recent_events(pn, e, fx)})
        h = stats["horizons"].get(str(HEAD), {})
        print(f"  {spec['id']:15s} n={h.get('n', 0):6d}  20d excess {100 * (h.get('mean') or 0):+.2f}%  "
              f"t={h.get('t') or float('nan'):5.2f}  {stats['verdict']:8s} today={len(matches)}")
    return out, E
