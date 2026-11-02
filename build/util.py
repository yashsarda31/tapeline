"""Small helpers shared by the build steps: JSON output and number hygiene."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd


def num(x, nd: int = 4):
    """Round a scalar for JSON; NaN/inf/None become None."""
    if x is None:
        return None
    if isinstance(x, (np.bool_, bool)):
        return bool(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    try:
        f = float(x)
    except (TypeError, ValueError):
        return x
    if math.isnan(f) or math.isinf(f):
        return None
    r = round(f, nd)
    return int(r) if nd == 0 else r


def arr(values, nd: int = 2):
    """Round a 1-d sequence, NaN -> None. Fast path through numpy."""
    a = np.asarray(values, dtype="float64")
    out = np.round(a, nd).tolist()
    return [None if (v != v or v in (math.inf, -math.inf)) else (int(v) if nd == 0 else v) for v in out]


def clean(o, nd: int = 4):
    """Recursively make an object JSON-safe."""
    if isinstance(o, dict):
        return {str(k): clean(v, nd) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v, nd) for v in o]
    if isinstance(o, (pd.Timestamp,)):
        return o.strftime("%Y-%m-%d")
    if isinstance(o, (float, np.floating, np.integer, np.bool_)):
        return num(o, nd)
    return o


def dump(path: Path, obj, nd: int = 4, already_clean: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = obj if already_clean else clean(obj, nd)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return path.stat().st_size


def ret(series: pd.Series, n: int):
    """Simple n-row return of a price series ending at its last row."""
    s = series.dropna()
    if len(s) <= n:
        return np.nan
    return s.iloc[-1] / s.iloc[-1 - n] - 1


def ytd(series: pd.Series):
    s = series.dropna()
    if s.empty:
        return np.nan
    prev = s[s.index.year < s.index[-1].year]
    if prev.empty:
        return np.nan
    return s.iloc[-1] / prev.iloc[-1] - 1
