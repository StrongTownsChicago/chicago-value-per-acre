// Vacant land tax page wiring. Shared map machinery lives in map-core.js; the
// two-scheme color/legend logic lives in scales.js.

let extent = "chicago";
let vacantOnly = false;

function getCurrentTileUrl() {
  // Use HQ tiles for both extents so every parcel's tax-change color is exact
  // (the standard tiles coalesce features at low zoom, approximating colors).
  return extent === "chicago"
    ? MapCore.tileUrl("chicago_parcels_hq.pmtiles")
    : MapCore.tileUrl("cook_county_parcels_hq.pmtiles");
}

function updateLegend() {
  document.querySelector("#legend").innerHTML = vacantLegendHtml(vacantOnly);
}

function signedDollar(n) {
  return (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
}

function buildVacantPopupHtml(p) {
  const cur = p.vacant_tax_cur != null ? Number(p.vacant_tax_cur) : null;
  const neu = p.vacant_tax_new != null ? Number(p.vacant_tax_new) : null;
  if (cur == null || neu == null) {
    return `<div class="popup-details">
      <div style="color:#999">No tax-scenario data for this parcel.</div>
      ${p.full_address ? `<div><strong>Address:</strong> ${p.full_address}</div>` : ""}
      <div><strong>PIN:</strong> ${p.pin_10 || "N/A"}</div>
    </div>`;
  }
  const change = neu - cur;
  const pct = cur > 0 ? (100 * change) / cur : null;
  const isVac = String(p.vacant) === "1";
  return `
  <div class="popup-details">
    ${p.full_address ? `<div><strong>Address:</strong> ${p.full_address}</div>` : ""}
    <div><strong>Tax change:</strong> ${signedDollar(change)}${
      pct != null ? ` (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)` : ""
    }</div>
    <div><strong>Current bill (2024):</strong> ${signedDollar(cur)}</div>
    <div><strong>Modeled bill (25%):</strong> ${signedDollar(neu)}</div>
    <div><strong>Vacant lot:</strong> ${isVac ? "Yes (class 1-00/1-90)" : "No"}</div>
    <div><strong>Area:</strong> ${p.acres ? Number(p.acres).toFixed(3) + " acres" : "N/A"}</div>
    <div><strong>Type:</strong> ${getClassDescription(p.class)}</div>
    <div><strong>PIN:</strong> ${p.pin_10 || "N/A"}</div>
    ${
      p.pin_14
        ? `<div><a href="https://www.cookcountyassessor.com/pin/${p.pin_14}" target="_blank">Source →</a></div>`
        : ""
    }
  </div>`;
}

function loadStats() {
  fetch("vacant_aggregates.json")
    .then((r) => r.json())
    .then((data) => {
      document.querySelector("#vacant-stats").innerHTML = vacantStatsHtml(
        data.cook_county
      );
    })
    .catch(() => {});
}

const api = MapCore.init({
  promoteId: "pin_10",
  getTileUrl: getCurrentTileUrl,
  getColorExpression: () => vacantColorExpression(),
  getHeightExpression: () => vacantHeightExpression(),
  getFilter: () => (vacantOnly ? vacantOnlyFilter() : null),
  buildPopupHtml: buildVacantPopupHtml,
  onLoad: () => {
    updateLegend();
    loadStats();
    MapSearch.setup(api);

    document.getElementById("toggle-3d").addEventListener("click", () => {
      const is3D = api.toggle3D();
      document.getElementById("toggle-3d").textContent = is3D
        ? "Disable 3D View"
        : "Enable 3D View";
    });
  },
});

// Extent toggle (Chicago vs Cook County, both HQ)
document.getElementById("toggle-extent").addEventListener("click", () => {
  extent = extent === "chicago" ? "county" : "chicago";
  api.reloadParcels();
  document.getElementById("toggle-extent").textContent =
    extent === "chicago" ? "Show All Cook County" : "Show Chicago Only";
  document.getElementById("extent-note").textContent =
    extent === "county" ? "All Cook County parcels — may be slow to load." : "";
});

// Vacant-only toggle: filter the map (and legend) down to just the vacant lots.
document.getElementById("toggle-vacant-only").addEventListener("click", (e) => {
  vacantOnly = !vacantOnly;
  api.refreshFilter();
  updateLegend();
  e.currentTarget.textContent = vacantOnly
    ? "Show All Parcels"
    : "Show Only Vacant Lots";
});
