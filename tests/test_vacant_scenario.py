"""Correctness gate for the PTAXSIM vacancy-tax model output.

Validates ``data/processed/vacant_scenario_2023.csv`` (produced by
``scripts/model_vacant_scenario.R``) against:
  - structural invariants (no nulls, valid flags, non-negative bills, 10-digit PINs)
  - Stephen Hoskins' published one-pager figures (Progress and Poverty Institute)
  - the per-parcel distribution visible on his Felt map's two-scheme legend

The dollar/relief targets carry tolerances: this is an independent reproduction,
so it tracks the published numbers without claiming to match them to the dollar.

Run: .venv/Scripts/python -m pytest tests/test_vacant_scenario.py -v
"""

import os

import numpy as np
import pandas as pd
import pytest

CSV = os.path.join("data", "processed", "vacant_scenario_2023.csv")

pytestmark = pytest.mark.skipif(
    not os.path.exists(CSV),
    reason=f"{CSV} not present; run scripts/model_vacant_scenario.R first",
)


@pytest.fixture(scope="module")
def df():
    d = pd.read_csv(CSV, dtype={"pin_10": str})
    d["pct"] = np.where(
        d["tax_current"] > 0,
        100 * (d["tax_vacant25"] - d["tax_current"]) / d["tax_current"],
        np.nan,
    )
    return d


@pytest.fixture(scope="module")
def vacant(df):
    return df[df["vacant"] == 1]


@pytest.fixture(scope="module")
def developed(df):
    return df[df["vacant"] == 0]


# ---- structural invariants ----

def test_schema_and_no_nulls(df):
    assert set(df.columns) >= {"pin_10", "tax_current", "tax_vacant25", "vacant"}
    for col in ("pin_10", "tax_current", "tax_vacant25", "vacant"):
        assert df[col].notna().all(), f"{col} has nulls"


def test_pin10_is_ten_digit_strings(df):
    assert (df["pin_10"].str.len() == 10).all(), "pin_10 must stay zero-padded 10 chars"
    assert df["pin_10"].is_unique, "one row per pin_10"


def test_flags_and_bills_well_formed(df):
    assert set(df["vacant"].unique()) <= {0, 1}
    assert (df["tax_current"] >= 0).all()
    assert (df["tax_vacant25"] >= 0).all()


# ---- aggregate gate vs the one-pager ----

def test_vacant_parcel_count(vacant):
    # one-pager: 63,200 (1-00 + 1-90); pin_10 aggregation gives ~63,084
    assert 62_000 <= len(vacant) <= 64_000


def test_vacant_current_tax_near_114M(vacant):
    assert 108e6 <= vacant["tax_current"].sum() <= 122e6  # target ~$114M


def test_vacant_new_tax_near_269M(vacant):
    # target ~$269M; this reproduction lands ~$282M, so allow a band around it
    assert 250e6 <= vacant["tax_vacant25"].sum() <= 300e6


def test_vacant_bill_roughly_doubles(vacant):
    ratio = vacant["tax_vacant25"].sum() / vacant["tax_current"].sum()
    assert 2.0 <= ratio <= 2.6  # ~2.4x: 2.5x assessment minus the rate cut


def test_average_vacant_bill(vacant):
    assert 1_600 <= vacant["tax_current"].mean() <= 2_000  # ~$1,800
    assert 4_000 <= vacant["tax_vacant25"].mean() <= 4_800  # ~$4,300


def test_developed_relief_in_band(developed):
    total_cur = developed["tax_current"].sum()
    total_new = developed["tax_vacant25"].sum()
    relief_pct = 100 * (total_new - total_cur) / total_cur
    # one-pager ~-0.85%; both modeling variants fall in this band
    assert -1.5 <= relief_pct <= -0.3


def test_revenue_roughly_neutral(df):
    total_cur = df["tax_current"].sum()
    total_new = df["tax_vacant25"].sum()
    assert abs(total_new - total_cur) / total_cur < 0.02  # within 2%


def test_vacant_share_of_base(df, vacant):
    cur_share = 100 * vacant["tax_current"].sum() / df["tax_current"].sum()
    new_share = 100 * vacant["tax_vacant25"].sum() / df["tax_vacant25"].sum()
    assert 0.4 <= cur_share <= 0.8  # ~0.6%
    assert 1.2 <= new_share <= 1.8  # ~1.5%


# ---- per-parcel distribution vs the Felt map legend ----

def test_vacant_median_increase(vacant):
    # Felt map vacant bins top out near +150%; recorded target ~+143%
    assert 130 <= vacant["pct"].median() <= 160


def test_developed_distribution_matches_legend(developed):
    pct = developed["pct"].dropna()
    # almost everyone pays less, by a small amount (his -0.15% to -5% bands)
    assert (pct < 0).mean() > 0.95
    assert -6 <= np.percentile(pct, 5) <= -1
    assert -1.0 <= np.percentile(pct, 95) <= 0


def test_directionality(vacant, developed):
    assert (vacant["tax_vacant25"] >= vacant["tax_current"]).mean() > 0.98
    assert (developed["tax_vacant25"] <= developed["tax_current"]).mean() > 0.95
