"""Load the bharatiq warehouse and Yahoo index series into aligned wide panels.

Everything downstream works on date x symbol DataFrames that share one
trading calendar. Returns are cleaned of corporate-action artifacts with the
traded-value rule calibrated in bharatiq/integrity.py: a split re-denominates
price but leaves traded value continuous (<4.6x its trailing median), a real
repricing spikes it.
"""
from __future__ import annotations

import os
import socket
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

DB = os.environ.get("BHARATIQ_DB", os.path.expandvars(r"%LOCALAPPDATA%\bharatiq\bharatiq.db"))
START = "2010-01-01"
CACHE = Path(__file__).parent / "cache"
LIQUID_N = 500          # point-in-time liquid universe size (NIFTY 500 analogue)
MIN_HISTORY = 252       # sessions of history before a name enters the universe

# Yahoo series shown on the market page. key -> (ticker, label, group)
INDICES = {
    "nifty50": ("^NSEI", "Nifty 50", "india"),
    "nifty500": ("^CRSLDX", "Nifty 500", "india"),
    "bank": ("^NSEBANK", "Nifty Bank", "india"),
    "mid50": ("^NSEMDCP50", "Nifty Midcap 50", "india"),
    "it": ("^CNXIT", "Nifty IT", "india"),
    "vix": ("^INDIAVIX", "India VIX", "india"),
    "spx": ("^GSPC", "S&P 500", "global"),
    "ndx": ("^IXIC", "Nasdaq", "global"),
    "nikkei": ("^N225", "Nikkei 225", "global"),
    "hsi": ("^HSI", "Hang Seng", "global"),
    "usdinr": ("USDINR=X", "USD/INR", "macro"),
    "dxy": ("DX-Y.NYB", "Dollar index", "macro"),
    "us10y": ("^TNX", "US 10Y yield", "macro"),
    "brent": ("BZ=F", "Brent crude", "macro"),
    "gold": ("GC=F", "Gold", "macro"),
    "btc": ("BTC-USD", "Bitcoin", "macro"),
}


@dataclass
class Panel:
    dates: pd.DatetimeIndex
    meta: pd.DataFrame                  # index=symbol: name, sector, industry, fno
    C: pd.DataFrame
    O: pd.DataFrame
    H: pd.DataFrame
    L: pd.DataFrame
    V: pd.DataFrame
    TV: pd.DataFrame                    # traded value, rupees
    R: pd.DataFrame                     # cleaned daily returns
    P: pd.DataFrame                     # cleaned cumulative index (for forward returns)
    U: pd.DataFrame                     # bool: in the liquid universe that day
    D: pd.DataFrame                     # delivery %, 2021+
    start: pd.Timestamp | None = None   # first session with a full liquid universe; tests start here
    idx: dict = field(default_factory=dict)   # key -> pd.Series of closes (own calendar)
    nifty: pd.Series | None = None      # Nifty 50 aligned to `dates`
    artifacts: int = 0


def connect():
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True)


def load_meta(con) -> pd.DataFrame:
    syms = pd.read_sql("SELECT symbol FROM index_membership WHERE index_name='niftytotalmarket'", con)["symbol"]
    sec = pd.read_sql("SELECT symbol, name, is_fno FROM securities", con).set_index("symbol")
    prof = pd.read_sql(
        """SELECT symbol, name AS pname, sector, industry_category AS industry, long_description AS descr,
                  company_url AS url, employees
           FROM company_profiles p
           WHERE as_of = (SELECT MAX(as_of) FROM company_profiles q WHERE q.symbol = p.symbol)""",
        con,
    ).drop_duplicates("symbol").set_index("symbol")
    m = pd.DataFrame(index=pd.Index(sorted(set(syms)), name="symbol"))
    m = m.join(sec).join(prof)
    m["name"] = m["name"].fillna(m["pname"]).fillna(pd.Series(m.index, index=m.index))
    m["sector"] = m["sector"].fillna("Other")
    m["industry"] = m["industry"].fillna("Other")
    m["fno"] = m["is_fno"].fillna(0).astype(int).astype(bool)
    return m.drop(columns=["pname", "is_fno"])


def load_prices(con, syms) -> pd.DataFrame:
    q = f"SELECT symbol, date, open, high, low, close, volume FROM prices WHERE date >= '{START}'"
    df = pd.read_sql(q, con)
    df = df[df["symbol"].isin(set(syms))]
    df["date"] = pd.to_datetime(df["date"])
    return df


def trading_calendar(px: pd.DataFrame) -> pd.DatetimeIndex:
    """Dates with real market-wide coverage. Drops stray holiday rows (e.g. 2026-06-26)."""
    cnt = px.groupby("date")["close"].count().sort_index()
    base = cnt.rolling(21, min_periods=1, center=True).median()
    good = cnt[cnt >= 0.6 * base]
    return pd.DatetimeIndex(good.index)


def load_delivery(con, syms, dates) -> pd.DataFrame:
    df = pd.read_sql(
        "SELECT symbol, date, deliv_per FROM delivery WHERE (series='EQ' OR series IS NULL) AND date >= '2021-01-01'", con
    )
    df = df[df["symbol"].isin(set(syms))]
    df["date"] = pd.to_datetime(df["date"])
    D = df.pivot_table(index="date", columns="symbol", values="deliv_per", aggfunc="last")
    D = D.reindex(index=dates, columns=syms)
    return D.where((D >= 0) & (D <= 100))


def fetch_indices(refresh: bool = True) -> dict[str, pd.Series]:
    """Yahoo closes, cached to CSV so a build still works offline."""
    CACHE.mkdir(exist_ok=True)
    out: dict[str, pd.Series] = {}
    fresh = None
    if refresh:
        try:
            socket.setdefaulttimeout(45)
            import yfinance as yf

            tickers = [t for t, _, _ in INDICES.values()]
            fresh = yf.download(tickers, start="2007-01-01", progress=False, auto_adjust=False, threads=True)["Close"]
        except Exception as e:  # network down -> cache
            print(f"  ! yfinance failed ({e}); using cache")
    for key, (tk, _, _) in INDICES.items():
        path = CACHE / f"idx_{key}.csv"
        s = None
        if fresh is not None and tk in fresh and fresh[tk].dropna().size > 100:
            s = fresh[tk].dropna()
            s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
            s.rename("close").to_csv(path, index_label="date")
        elif path.exists():
            s = pd.read_csv(path, index_col="date", parse_dates=True)["close"]
        if s is not None:
            out[key] = s.astype(float).sort_index()
    return out


def build_panel(refresh_indices: bool = True) -> Panel:
    con = connect()
    meta = load_meta(con)
    px = load_prices(con, meta.index)
    dates = trading_calendar(px)
    px = px[px["date"].isin(dates)]

    def wide(col):
        w = px.pivot_table(index="date", columns="symbol", values=col, aggfunc="last")
        return w.reindex(index=dates, columns=meta.index).astype("float64")

    C, O, H, L, V = (wide(c) for c in ("close", "open", "high", "low", "volume"))
    C = C.where(C > 0)
    O, H, L = (x.where(x > 0).fillna(C) for x in (O, H, L))
    V = V.where(V >= 0)
    TV = C * V

    # cleaned returns: forward-fill short suspensions so the gap move is kept
    Cf = C.ffill(limit=10)
    R_raw = Cf.pct_change(fill_method=None)
    tv_ratio = TV / TV.shift(1).rolling(20, min_periods=5).median()
    art = (R_raw.abs() > 0.35) & ~(tv_ratio >= 4.6)
    R = R_raw.mask(art, 0.0).where(C.notna())
    started = C.notna().cumsum() > 0
    P = (1 + R.fillna(0)).cumprod().where(started & Cf.notna())

    # point-in-time liquid universe: enough history + top-N by 60d median traded value
    hist = C.notna().cumsum()
    tvmed = TV.rolling(60, min_periods=40).median()
    elig = (hist >= MIN_HISTORY) & C.notna() & tvmed.notna()
    rank = tvmed.where(elig).rank(axis=1, ascending=False, method="first")
    U = elig & (rank <= LIQUID_N)
    # Most names only have prices from mid-2021; a handful go back further. Before the
    # universe fills up, "the market" would be a few stocks, so those dates are excluded.
    full = U.sum(axis=1) >= 0.8 * LIQUID_N
    U = U.mul(full.astype(int), axis=0).astype(bool)
    start = full.idxmax() if full.any() else dates[0]

    D = load_delivery(con, list(meta.index), dates)
    con.close()

    idx = fetch_indices(refresh_indices)
    nifty = idx["nifty50"].reindex(dates).ffill() if "nifty50" in idx else None

    meta = meta.copy()
    meta["has_px"] = C.notna().any()
    return Panel(dates, meta, C, O, H, L, V, TV, R, P, U, D, start, idx, nifty, int(art.values.sum()))


def load_snapshots(con=None) -> dict[str, pd.DataFrame]:
    """Latest fundamentals / consensus / ownership tables for the screener and stock pages."""
    own = con is None
    con = con or connect()
    ks = pd.read_sql(
        """SELECT symbol, as_of, current_price, market_cap, trailing_pe, forward_pe, price_to_book, ev_to_ebitda,
                  dividend_yield, beta, roe, roa, profit_margin, operating_margin, debt_to_equity, revenue_ttm,
                  net_income_ttm, financial_currency, price_currency
           FROM key_stats k WHERE as_of = (SELECT MAX(as_of) FROM key_stats j WHERE j.symbol = k.symbol)""",
        con,
    ).drop_duplicates("symbol").set_index("symbol")
    cons = pd.read_sql("SELECT * FROM consensus ORDER BY as_of", con)
    hold = pd.read_sql("SELECT symbol, period, category, pct FROM shareholding WHERE category IN ('promoter','public')", con)
    ins = pd.read_sql(
        "SELECT symbol, date, acquirer, category, txn_type, qty, value, mode FROM insider_trades ORDER BY date DESC", con
    )
    bulk = pd.read_sql("SELECT date, symbol, client, side, qty, price, 'Bulk' AS kind FROM bulk_deals", con)
    block = pd.read_sql("SELECT date, symbol, client, side, qty, price, 'Block' AS kind FROM block_deals", con)
    rec = pd.read_sql(
        """SELECT symbol, strong_buy, buy, hold, sell, strong_sell FROM recommendations r
           WHERE period='0m' AND as_of = (SELECT MAX(as_of) FROM recommendations s WHERE s.symbol=r.symbol)""",
        con,
    ).drop_duplicates("symbol").set_index("symbol")
    if own:
        con.close()
    deals = pd.concat([bulk, block]).sort_values("date", ascending=False)
    return {"ks": ks, "cons": cons, "hold": hold, "insider": ins, "deals": deals, "reco": rec}
