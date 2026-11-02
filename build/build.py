"""Build every JSON file the site reads. Run after the bharatiq daily refresh.

    python build/build.py            # full build, refreshes Yahoo index series
    python build/build.py --offline  # reuse cached index series
    python build/build.py --no-stocks
"""
from __future__ import annotations

import argparse
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import data  # noqa: E402
import factors  # noqa: E402
import market  # noqa: E402
import sectors  # noqa: E402
import signals  # noqa: E402
import stocks  # noqa: E402
from util import dump  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "site" / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--no-stocks", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    tmp = OUT.with_name("data.tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    (tmp / "s").mkdir(parents=True)

    print("loading warehouse ...")
    pn = data.build_panel(refresh_indices=not a.offline)
    print(f"  {len(pn.dates)} sessions {pn.dates[0].date()} -> {pn.dates[-1].date()}, {pn.C.shape[1]} symbols, "
          f"{int(pn.U.iloc[-1].sum())} in liquid universe, {pn.artifacts} return artifacts neutralised  "
          f"[{time.time() - t0:.0f}s]")
    ind = signals.Ind(pn)
    snaps = data.load_snapshots()

    print("signals ...")
    sig, E = signals.build(pn, ind)
    print("market ...")
    mk = market.build(pn, ind)
    print("sectors ...")
    sc = sectors.build(pn, ind)
    print("factors ...")
    fc = factors.build(pn, ind)
    print("screener ...")
    cols, rows, scr = stocks.screener(pn, ind, snaps, E)

    sizes = {
        "signals": dump(tmp / "signals.json", {"cost": signals.COST, "head": signals.HEAD, "signals": sig}),
        "market": dump(tmp / "market.json", mk),
        "sectors": dump(tmp / "sectors.json", sc),
        "factors": dump(tmp / "factors.json", fc),
        "screener": dump(tmp / "screener.json", {"cols": cols, "rows": rows}, already_clean=True),
    }
    cal = None
    if not a.no_stocks:
        print("stock pages ...")
        cal, total = stocks.stock_files(pn, ind, snaps, E, scr, tmp / "s")
        sizes["stocks"] = total
    elif (OUT / "s").exists():
        shutil.rmtree(tmp / "s")
        shutil.copytree(OUT / "s", tmp / "s")

    meta = {
        "asof": pn.dates[-1].strftime("%Y-%m-%d"),
        "built": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "sessions": len(pn.dates),
        "first": pn.dates[0].strftime("%Y-%m-%d"),
        "test_start": pn.start.strftime("%Y-%m-%d"),
        "universe": int(pn.U.iloc[-1].sum()),
        "symbols": int(pn.meta["has_px"].sum()),
        "liquid_n": data.LIQUID_N,
        "artifacts": pn.artifacts,
        "cal": cal if cal is not None else (OUT / "meta.json").exists() and __import__("json").load(open(OUT / "meta.json"))["cal"],
    }
    dump(tmp / "meta.json", meta)

    if OUT.exists():
        shutil.rmtree(OUT)
    tmp.rename(OUT)
    mb = {k: f"{v / 1e6:.1f}MB" for k, v in sizes.items()}
    print(f"done in {time.time() - t0:.0f}s  {mb}")


if __name__ == "__main__":
    main()
