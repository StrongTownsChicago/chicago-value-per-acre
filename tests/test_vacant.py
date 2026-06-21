"""Unit tests for the pure vacancy helpers and the aggregates artifact."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from vacant import is_vacant, normalize_class, property_category  # noqa: E402


# ---- normalize_class ----

@pytest.mark.parametrize("raw,expected", [
    ("100", "100"),
    (100, "100"),
    (100.0, "100"),     # ints read from CSV as float
    ("100.0", "100"),   # strings read from CSV as float-text
    ("  190 ", "190"),
    ("EX", "EX"),
    (None, ""),
    ("", ""),
    ("nan", ""),
])
def test_normalize_class(raw, expected):
    assert normalize_class(raw) == expected


# ---- is_vacant: the single source of truth for the policy definition ----

@pytest.mark.parametrize("raw", ["100", "190", 100, 190, "100.0", " 190 "])
def test_is_vacant_true(raw):
    assert is_vacant(raw) is True


@pytest.mark.parametrize("raw", ["200", "299", "1000", "10", "EX", "0", None, "", "900"])
def test_is_vacant_false(raw):
    assert is_vacant(raw) is False


# ---- property_category ----

@pytest.mark.parametrize("raw,cat", [
    ("100", "Vacant land"),
    ("190", "Vacant land"),
    ("203", "Single-family / townhome"),
    ("295", "Single-family / townhome"),
    ("299", "Condominium"),
    ("211", "Small apartments (2-6)"),
    ("391", "Apartments (7+ units)"),
    ("517", "Commercial / retail"),
    ("591", "Office / multistory"),
    ("550", "Industrial"),  # major class 6 is industrial; 5xx retail unless office/industrial
    ("400", "Non-profit"),
    ("0", "Exempt"),
    ("EX", "Exempt"),
    (None, "Other"),
])
def test_property_category(raw, cat):
    assert property_category(raw) == cat


def test_vacant_classes_categorize_as_vacant():
    # is_vacant and property_category must agree on the vacant set
    for c in ("100", "190"):
        assert is_vacant(c)
        assert property_category(c) == "Vacant land"


# ---- aggregates artifact (skips if not built) ----

AGG = os.path.join("web", "vacant_aggregates.json")


@pytest.mark.skipif(not os.path.exists(AGG), reason="run scripts/build_vacant_aggregates.py first")
def test_aggregates_structure_and_headline():
    cc = json.load(open(AGG))["cook_county"]
    for key in ("n_total", "n_vacant", "sum_current", "sum_vacant_current",
                "sum_vacant_new", "vacant_increase", "avg_nonvacant_change_pct", "by_category"):
        assert key in cc, f"missing {key}"

    assert 60_000 <= cc["n_vacant"] <= 63_000
    assert -2.0 <= cc["avg_nonvacant_change_pct"] <= -0.5
    # vacant_increase reconciles with the vacant totals
    assert abs(cc["vacant_increase"] - (cc["sum_vacant_new"] - cc["sum_vacant_current"])) < 1.0

    # The "Vacant land" bucket must match the scenario vacant count (baked flag,
    # not 2024 class), or the map's warm/cool split won't line up with the bills.
    vac = cc["by_category"]["Vacant land"]
    assert vac["n"] == cc["n_vacant"]
    assert vac["avg_change_pct"] > 50  # vacant lots see a large increase
