# Tapeline: NSE market analytics with receipts

A static website for Indian stock market analytics, built from the local bharatiq warehouse. Every screen and factor on it reports its measured track record, not just which stocks match today.

## Pages

| Page | What it shows |
|---|---|
| Market pulse | Indices, breadth (% above 50/200-DMA, highs/lows, McClellan), breadth history, what similar breadth/VIX readings meant for the Nifty's next 20/60 sessions, a market map sized by market cap, movers, and global/macro |
| Signal lab | 13 common screens (52-week high, breakouts, momentum, golden cross, RSI oversold, delivery surge…), each tested on every trigger: excess return vs the universe at 5/20/60 sessions, a cluster-robust t-stat, split-half stability, a by-year breakdown, the outcome distribution, today's matches, and recent triggers with realised outcomes |
| Sector rotation | Relative rotation graph, sector scoreboard, monthly excess-return heatmap, relative strength lines, 54 industries |
| Factor monitor | Momentum, trend, 52w-high, low-vol, size, reversal and delivery quintile spreads: cumulative, rolling 12m, quintile ladder, by-year, correlations, and current members |
| Screener | 750 stocks, 4 column views, 12 presets (those tied to a tested signal show its evidence), custom conditions, CSV export |
| Stock pages | Candles with 50/200-DMA, volume, delivery %, ratio to the Nifty, signal-history markers, performance, risk, technicals, valuation, analyst consensus, promoter holding, seasonality, peers, insider trades and bulk/block deals |
| Watchlist | Stored in the browser only |

## Build and view

The generated data (`site/data/`, about 40 MB) is not committed. Build it locally first.

**Requirements**
- Python 3.10+ with `pip install -r requirements.txt`
- A bharatiq SQLite warehouse (the private companion project that collects NSE bhavcopy, delivery, Yahoo prices and fundamentals). The build reads `%LOCALAPPDATA%\bharatiq\bharatiq.db` by default; set `BHARATIQ_DB` to point elsewhere. Tables used: `prices`, `delivery`, `securities`, `index_membership`, `company_profiles`, `key_stats`, `consensus`, `recommendations`, `shareholding`, `insider_trades`, `bulk_deals`, `block_deals`.

**Run (Windows)**

```bat
refresh.bat      :: refresh the bharatiq warehouse, then rebuild site/data (about 30 s for the build)
serve.bat        :: http://127.0.0.1:8790
```

Both scripts use `%PY%` if set, otherwise a per-user Python 3.11 install, otherwise `python`. Or run the build directly:

```bash
python build/build.py              # full build, refreshes Yahoo index series
python build/build.py --offline    # reuse cached index series
python build/build.py --no-stocks  # skip the 750 per-stock files
python -m http.server 8790 --directory site
```

The build writes `site/data/` atomically. `site/` is plain HTML/CSS/ES modules with ECharts vendored, so there is no npm and no build step for the frontend.

## Hosting

`site/` is fully static (about 40 MB, mostly 750 stock files), so any static host works: Cloudflare Pages, Vercel, Netlify or GitHub Pages. NSE blocks datacenter IPs, but that doesn't matter here: the data is built on this PC, and only the finished files are uploaded.

## Honest limitations

- **Test window.** Most names in the warehouse have prices from mid-2021. Tests need a year of history and a full 500-name liquid universe, so signals, breadth regimes and factors are measured from mid-2022, roughly four years. The VIX regime table uses index history back to 2009.
- **Survivorship.** The universe is today's Nifty Total Market membership. Backfilling bharatiq's `market_history` (full-market bhavcopy back to 1994, including delisted names) would extend every test and remove that bias. This is the single highest-value upgrade.
- **Gross returns.** Only the signal verdict applies a cost hurdle (0.30% round trip).
- Fundamentals and analyst targets are latest snapshots (Yahoo key stats, rolling refresh).

## Data sources and disclaimer

Market data comes from NSE end-of-day files and Yahoo Finance, collected by the warehouse. It is not redistributed in this repository. ECharts (Apache-2.0) is vendored in `site/vendor/`.

This is a research and education tool, not investment advice. Past measured performance does not predict future returns.

## Layout

```
build/   data.py (panel + liquid universe), signals.py, market.py, sectors.py, factors.py, stocks.py, build.py
site/    index.html, css/app.css, js/app.js (router, search), js/lib/*, js/pages/*, vendor/echarts.min.js, data/ (generated)
```
