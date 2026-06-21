"""Correctness gate for the PTAXSIM vacancy-tax model output (tax year 2024).

Validates ``data/processed/vacant_scenario_2024.csv`` (produced by
``scripts/model_vacant_scenario.R`` against the 2024 PTAXSIM database) for:
  - structural invariants (no nulls, valid flags, non-negative bills, 10-digit PINs)
  - the policy mechanics (revenue-neutral, vacant bills ~2.4x, no developed parcel
    harmed) and a per-parcel distribution matching Stephen Hoskins' two-scheme map

The model follows the Progress and Poverty Institute methodology but on 2024 data,
so the dollars differ from Hoskins' published 2023 one-pager (Chicago was
reassessed for the 2024 triennial). Bands are set around the 2024 results to catch
regressions, not to match the 2023 publication.

Run: .venv/Scripts/python -m pytest tests/test_vacant_scenario.py -v
"""

import os

import numpy as np
import pandas as pd
import pytest

CSV = os.path.join("data", "processed", "vacant_scenario_2024.csv")

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


# ---- policy mechanics (2024) ----

def test_vacant_parcel_count(vacant):
    # 2024: classes 1-00 + 1-90 aggregate to ~61,600 pin_10 (2023 ref: ~63,200)
    assert 60_000 <= len(vacant) <= 63_000


def test_vacant_current_tax(vacant):
    assert 130e6 <= vacant["tax_current"].sum() <= 150e6  # 2024 ~$139M


def test_vacant_new_tax(vacant):
    assert 310e6 <= vacant["tax_vacant25"].sum() <= 360e6  # 2024 ~$336M


def test_vacant_bill_roughly_doubles(vacant):
    ratio = vacant["tax_vacant25"].sum() / vacant["tax_current"].sum()
    assert 2.0 <= ratio <= 2.6  # ~2.4x: 2.5x assessment minus the rate cut


def test_average_vacant_bill(vacant):
    assert 2_000 <= vacant["tax_current"].mean() <= 2_600  # 2024 ~$2,258
    assert 5_000 <= vacant["tax_vacant25"].mean() <= 6_000  # 2024 ~$5,449


def test_developed_relief_in_band(developed):
    total_cur = developed["tax_current"].sum()
    total_new = developed["tax_vacant25"].sum()
    relief_pct = 100 * (total_new - total_cur) / total_cur
    assert -2.0 <= relief_pct <= -0.5  # 2024 ~-1.2%


def test_revenue_roughly_neutral(df):
    total_cur = df["tax_current"].sum()
    total_new = df["tax_vacant25"].sum()
    assert abs(total_new - total_cur) / total_cur < 0.02  # within 2%


def test_vacant_share_of_base(df, vacant):
    cur_share = 100 * vacant["tax_current"].sum() / df["tax_current"].sum()
    new_share = 100 * vacant["tax_vacant25"].sum() / df["tax_vacant25"].sum()
    assert 0.5 <= cur_share <= 0.9  # 2024 ~0.7%
    assert 1.5 <= new_share <= 2.1  # 2024 ~1.8%


# ---- per-parcel distribution vs the Felt map two-scheme legend ----

def test_vacant_median_increase(vacant):
    # vacant lots roughly double; tightly clustered near +146%
    assert 130 <= vacant["pct"].median() <= 160


def test_developed_distribution(developed):
    pct = developed["pct"].dropna()  # parcels with a real prior bill
    assert (pct < 0).mean() > 0.95  # nearly all taxpaying developed parcels pay less
    assert -6 <= np.percentile(pct, 5) <= -1
    assert -2 <= np.percentile(pct, 95) <= 0


def test_no_developed_parcel_pays_more(vacant, developed):
    # The policy must not raise any non-vacant bill (relief or flat only).
    assert (developed["tax_vacant25"] <= developed["tax_current"] + 1).all()
    # And vacant parcels all pay more.
    assert (vacant["tax_vacant25"] >= vacant["tax_current"]).mean() > 0.98
