"""Condo PIN / tax-bill correctness gate.

Guards the fix for the `paste0(pin_10, "0000")` bug (scripts/extract_tax_bills.R
and scripts/model_vacant_scenario.R): bills must come from the REAL 14-digit leaf
PINs, summed to pin_10. In Cook County the last four PIN digits are the unit
number, so condo units carry non-zero suffixes and never end in 0000 — the old
reconstruction silently dropped every condo.

These invariants are validated directly against the PTAXSIM DB's ground-truth
`tax_bill_total` column (no ptaxsim/R run needed). Skips if no DB is present.

Run: .venv/Scripts/python -m pytest tests/test_condo_bills.py -v
"""

import os
import sqlite3

import numpy as np
import pandas as pd
import pytest

# Prefer the active 2024 DB; fall back to 2023. The bug is year-independent.
_DBS = [
    ("data/raw/tax_data/ptaxsim-2024.0.0.db", 2024),
    ("data/raw/tax_data/ptaxsim.db", 2023),
]
_DB = next(((p, y) for p, y in _DBS if os.path.exists(p)), None)

pytestmark = pytest.mark.skipif(_DB is None, reason="no PTAXSIM DB present")


@pytest.fixture(scope="module")
def pins():
    path, year = _DB
    con = sqlite3.connect(path)
    df = pd.read_sql(
        f"SELECT pin, class, tax_bill_total FROM pin WHERE year = {year}", con
    )
    con.close()
    df["pin_10"] = df["pin"].str[:10]
    df["suffix"] = df["pin"].str[10:]
    return df


def test_condos_have_no_0000_leaf(pins):
    """A multi-unit condo's real leaves never end in 0000, and pin_10+'0000' is
    not a real PIN — so the correct PIN-set builder must select the unit leaves,
    never reconstruct '0000'."""
    counts = pins.groupby("pin_10").size()
    condo_p10 = counts[counts > 1].index
    assert len(condo_p10) > 1000, "expected many multi-unit parcels"

    condo_leaves = pins[pins["pin_10"].isin(condo_p10)]
    # None of a condo's leaves end in 0000.
    assert (condo_leaves["suffix"] != "0000").all()
    # The reconstructed pin_10+'0000' is absent for condos.
    real = set(pins["pin"])
    sample = list(condo_p10[:500])
    assert not any((p10 + "0000") in real for p10 in sample)


def test_standard_parcels_unchanged_by_summing_leaves(pins):
    """For every pin_10 that has a 0000 leaf (standard parcel), the 0000 bill
    equals the sum of all its leaves — so summing leaves does NOT change any
    standard parcel's bill. This is the no-negative-side-effects guarantee."""
    by_p10 = pins.groupby("pin_10")["tax_bill_total"].sum()
    leaf0000 = pins[pins["suffix"] == "0000"].set_index("pin_10")["tax_bill_total"]
    common = leaf0000.index.intersection(by_p10.index)
    assert len(common) > 1_000_000
    same = np.isclose(leaf0000.loc[common].values, by_p10.loc[common].values, atol=1.0)
    assert same.mean() == 1.0  # 100%: no standard parcel changes


def test_0000_lookup_drops_real_tax(pins):
    """The bug is material: many pin_10 have no 0000 leaf but real tax, which the
    old paste0(pin_10,'0000') approach dropped entirely."""
    by_p10 = pins.groupby("pin_10")["tax_bill_total"].sum()
    has_0000 = set(pins.loc[pins["suffix"] == "0000", "pin_10"])
    missed = by_p10[~by_p10.index.isin(has_0000) & (by_p10 > 0)]
    assert len(missed) > 10_000  # ~19.6k condo buildings
    assert missed.sum() > 1e9  # >$1B in tax that the bug dropped


def test_condo_total_is_positive(pins):
    """A known condo's summed leaf bill (the correct value) is positive."""
    counts = pins.groupby("pin_10").size()
    condo_p10 = counts[counts > 5].index[0]
    total = pins.loc[pins["pin_10"] == condo_p10, "tax_bill_total"].sum()
    assert total > 0
