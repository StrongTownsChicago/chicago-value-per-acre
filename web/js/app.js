// Value-per-acre page wiring. Shared map machinery lives in map-core.js; shared
// scales, legend, and class lookup live in scales.js.

let currentExtent = "chicago";
let isHighQuality = false;
let displayMetric = "value";

// Filename-keyed; MapCore.tileUrl() picks remote (default) or local (?tiles=local).
const TILES = {
  chicago: MapCore.tileUrl("chicago_parcels.pmtiles"),
  chicagoHQ: MapCore.tileUrl("chicago_parcels_hq.pmtiles"),
  county: MapCore.tileUrl("cook_county_parcels.pmtiles"),
  countyHQ: MapCore.tileUrl("cook_county_parcels_hq.pmtiles"),
};

function getCurrentTileUrl() {
  const base = currentExtent === "chicago" ? "chicago" : "county";
  return TILES[isHighQuality ? base + "HQ" : base];
}

function updateQualityButtonState() {
  const btn = document.getElementById("toggle-quality");
  const note = document.getElementById("quality-note");

  btn.disabled = false;
  btn.style.opacity = "1";
  btn.style.cursor = "pointer";

  if (isHighQuality) {
    btn.textContent = "Standard Quality (Faster)";
    note.textContent =
      "Showing all parcels at all zoom levels. This may not work on some devices.";
  } else {
    btn.textContent = "Show All Parcels (Slower)";
    note.textContent =
      "Standard quality hides some parcels at low zoom levels for better performance.";
  }
}

function updateLegend() {
  document.querySelector("#legend").innerHTML = buildLegendHtml(
    SCALES[displayMetric]
  );
}

function buildValuePopupHtml(p) {
  const fmt = (val) =>
    val
      ? "$" + Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 })
      : "N/A";
  const fmtAcres = (val) => (val ? Number(val).toFixed(3) + " acres" : "N/A");
  const fmtPct = (val) => (val ? Number(val).toFixed(2) + "%" : "N/A");

  return `
  <div class="popup-details">
    ${
      p.full_address
        ? `<div><strong>Address:</strong> ${p.full_address}</div>`
        : ""
    }
    <div><strong>Value/Acre:</strong> ${fmt(p.value_per_acre)}</div>
    ${
      p.tax_per_acre
        ? `<div><strong>Tax/Acre:</strong> ${fmt(p.tax_per_acre)} (2023)</div>`
        : `<div style="color: #999; font-size: 12px;">Property tax data not available</div>`
    }
    <div><strong>Total Value:</strong> ${fmt(p.market_value)}</div>
    ${
      p.total_tax_2023
        ? `<div><strong>Total Property Tax:</strong> ${fmt(
            p.total_tax_2023
          )} (2023)</div>`
        : ""
    }
    ${
      p.effective_tax_rate
        ? `<div><strong>Effective Property Rate:</strong> ${fmtPct(
            p.effective_tax_rate
          )}</div>`
        : ""
    }
    <div><strong>Area:</strong> ${fmtAcres(p.acres)}</div>
    <div><strong>Type:</strong> ${getClassDescription(p.class)}</div>
    <div><strong>Class:</strong> ${p.class || "N/A"}</div>
    <div><strong>PIN:</strong> ${p.pin_10 || "N/A"}</div>
    ${
      p.pin_14
        ? `<div><a href="https://www.cookcountyassessor.com/pin/${p.pin_14}" target="_blank">Source →</a></div>`
        : ""
    }
  </div>`;
}

const api = MapCore.init({
  promoteId: "pin_10",
  getTileUrl: getCurrentTileUrl,
  getColorExpression: () => buildColorExpression(SCALES[displayMetric]),
  getHeightExpression: () => buildHeightExpression(SCALES[displayMetric]),
  buildPopupHtml: buildValuePopupHtml,
  onLoad: () => {
    updateQualityButtonState();
    updateLegend();

    // Toggle 3D
    document.getElementById("toggle-3d").addEventListener("click", () => {
      const is3D = api.toggle3D();
      document.getElementById("toggle-3d").textContent = is3D
        ? "Disable 3D View"
        : "Enable 3D View";
    });
  },
});

// Toggle metric (value vs tax)
document.getElementById("toggle-metric").addEventListener("click", () => {
  displayMetric = displayMetric === "value" ? "tax" : "value";

  updateLegend();

  document.getElementById("toggle-metric").textContent =
    displayMetric === "value" ? "Show Tax Data" : "Show Value Data";

  document.getElementById("metric-note").textContent =
    displayMetric === "value"
      ? "Currently showing market value data (2024)"
      : "Currently showing property tax data (2023)";

  api.refreshPaint();
});

// Toggle extent (Chicago vs Cook County)
document.getElementById("toggle-extent").addEventListener("click", () => {
  currentExtent = currentExtent === "chicago" ? "county" : "chicago";

  api.reloadParcels();
  updateQualityButtonState();

  document.getElementById("toggle-extent").textContent =
    currentExtent === "chicago" ? "Show All Cook County" : "Show Chicago Only";
});

// Toggle quality (Standard vs High Quality) — available for both extents.
document.getElementById("toggle-quality").addEventListener("click", () => {
  isHighQuality = !isHighQuality;
  api.reloadParcels();
  updateQualityButtonState();
});
