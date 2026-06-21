#!/usr/bin/env python3
"""Build web/vacant_aggregates.json from the PTAXSIM vacancy-model output.

Drives the stats panel on the vacant page without a browser-side sweep over ~1.4M
parcels: a few county-wide headline numbers plus a per-category breakdown. Joins
the model output (pin_10 -> current/new bill) with assessor class to categorize.

Run: .venv/Scripts/python scripts/build_vacant_aggregates.py
"""

import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from vacant import property_category  # noqa: E402

SCENARIO = "data/processed/vacant_scenario_2024.csv"
ASSESSOR = "data/processed/assessor_2024_clean.csv"
OUT = "web/vacant_aggregates.json"


def build():
    if not os.path.exists(SCENARIO):
        sys.exit(f"Missing {SCENARIO}; run scripts/model_vacant_scenario.R first")

    scn = pd.read_csv(SCENARIO, dtype={"pin_10": str})
    assessor = pd.read_csv(ASSESSOR, dtype={"pin_10": str})[["pin_10", "class"]]
    df = scn.merge(assessor, on="pin_10", how="left")

    # Categorize by 2024 assessor class, but the "Vacant land" bucket must equal
    # the scenario flag (2023 tax-year vacancy) exactly, since the bills and the
    # map's warm/cool split follow that flag. The two vintages disagree for ~8k
    # parcels: 2023-vacant ones go to "Vacant land"; 2024-vacant-but-not-2023 ones
    # are pushed out of the vacant bucket so it stays exactly the scenario set.
    cat = df["class"].apply(property_category).to_numpy()
    cat = np.where((df["vacant"] == 0) & (cat == "Vacant land"), "Other", cat)
    df["category"] = np.where(df["vacant"] == 1, "Vacant land", cat)
    df["change"] = df["tax_vacant25"] - df["tax_current"]

    vac = df[df["vacant"] == 1]
    non = df[df["vacant"] == 0]

    def pct(sub):
        cur = sub["tax_current"].sum()
        return float(100 * (sub["tax_vacant25"].sum() - cur) / cur) if cur else 0.0

    by_category = {}
    for cat, sub in df.groupby("category"):
        by_category[cat] = {
            "n": int(len(sub)),
            "avg_change_dollar": float(sub["change"].mean()),
            "total_change_dollar": float(sub["change"].sum()),
            "avg_change_pct": pct(sub),
        }

    agg = {
        "cook_county": {
            "n_total": int(len(df)),
            "n_vacant": int(len(vac)),
            "sum_current": float(df["tax_current"].sum()),
            "sum_vacant_current": float(vac["tax_current"].sum()),
            "sum_vacant_new": float(vac["tax_vacant25"].sum()),
            "vacant_increase": float(vac["change"].sum()),
            "avg_nonvacant_change_pct": pct(non),
            "by_category": by_category,
        }
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(agg, f, indent=2)
    cc = agg["cook_county"]
    print(f"Wrote {OUT}")
    print(f"  vacant {cc['n_vacant']:,}: ${cc['sum_vacant_current']/1e6:.0f}M -> "
          f"${cc['sum_vacant_new']/1e6:.0f}M (+${cc['vacant_increase']/1e6:.0f}M)")
    print(f"  non-vacant avg change: {cc['avg_nonvacant_change_pct']:.2f}%")


if __name__ == "__main__":
    build()
