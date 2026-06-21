"""Pure helpers for the vacancy-tax feature.

No I/O or geospatial dependencies, so they unit-test fast and give a single
source of truth for "what counts as vacant" (CCAO classes 1-00 and 1-90) and the
category buckets used by the stats panel. The class definition here must match
``scripts/model_vacant_scenario.R`` and the client-side check in ``web/js``.
"""

VACANT_CLASSES = ("100", "190")


def normalize_class(class_code):
    """Normalize a raw class value to its CCAO string code.

    Handles ints, floats read from CSV ("100.0"), whitespace, and None.
    """
    if class_code is None:
        return ""
    s = str(class_code).strip()
    if s in ("", "nan", "None"):
        return ""
    if s.endswith(".0"):  # CSV/pandas can read "100" as 100.0
        s = s[:-2]
    return s


def is_vacant(class_code):
    """True only for vacant land (1-00) and minor improvement on vacant (1-90)."""
    return normalize_class(class_code) in VACANT_CLASSES


# Minor-code sets where the major class alone is too coarse for the stats panel.
_CONDO = {"299", "399", "959"}
_SMALL_APT = {"211", "212", "213", "225"}
_OFFICE = {"591", "592", "599", "774", "790", "792", "891", "892"}
_INDUSTRIAL_5 = {"550", "580", "581", "583", "587", "589", "593"}


def property_category(class_code):
    """Coarse category for the equity/stats breakdown. Display only; never feeds
    any tax math (which keys off the exact class)."""
    c = normalize_class(class_code)
    if c == "":
        return "Other"
    if c in VACANT_CLASSES:
        return "Vacant land"
    mc = c[0]
    if c in _CONDO:
        return "Condominium"
    if c in _SMALL_APT:
        return "Small apartments (2-6)"
    if mc == "2":
        return "Single-family / townhome"
    if mc in ("3", "9"):
        return "Apartments (7+ units)"
    if mc == "4":
        return "Non-profit"
    if c in _OFFICE:
        return "Office / multistory"
    if mc == "6" or c in _INDUSTRIAL_5:
        return "Industrial"
    if mc in ("5", "7", "8"):
        return "Commercial / retail"
    if mc == "0" or c in ("EX", "RR"):
        return "Exempt"
    return "Other"
