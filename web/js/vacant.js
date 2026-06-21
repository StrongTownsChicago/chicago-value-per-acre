// Vacant land tax page wiring. Shared map machinery lives in map-core.js; the
// two-scheme color/legend logic lives in scales.js.

let view = "pct";
let extent = "chicago";

function getCurrentTileUrl() {
  // Default to HQ Chicago so every parcel's tax-change color is exact (the
  // standard tiles coalesce features at low zoom). County uses standard quality.
  return extent === "chicago"
    ? MapCore.tileUrl("chicago_parcels_hq.pmtiles")
    : MapCore.tileUrl("cook_county_parcels.pmtiles");
}

function updateLegend() {
  document.querySelector("#legend").innerHTML = vacantLegendHtml(view);
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
      const cc = data.cook_county;
      if (!cc) return;
      const m = (x) => "$" + Math.round(x / 1e6).toLocaleString("en-US") + "M";
      const headline = `<p>Raising vacant land to 25% makes
        <strong>${cc.n_vacant.toLocaleString("en-US")}</strong> vacant parcels pay
        <strong>${m(cc.vacant_increase)}</strong> more, so the other
        ${(cc.n_total - cc.n_vacant).toLocaleString("en-US")} parcels pay about
        <strong>${cc.avg_nonvacant_change_pct.toFixed(2)}%</strong> less.</p>`;

      const cats = Object.entries(cc.by_category).sort(
        (a, b) => b[1].avg_change_pct - a[1].avg_change_pct
      );
      const maxAbs = Math.max(...cats.map(([, v]) => Math.abs(v.avg_change_pct))) || 1;
      const rows = cats
        .map(([name, v]) => {
          const w = Math.max(2, (Math.abs(v.avg_change_pct) / maxAbs) * 100);
          const pos = v.avg_change_pct >= 0;
          return `<div class="stat-row">
            <span class="stat-name">${name}</span>
            <span class="stat-bar"><span class="stat-fill ${pos ? "pos" : "neg"}" style="width:${w}%"></span></span>
            <span class="stat-val">${pos ? "+" : ""}${v.avg_change_pct.toFixed(1)}%</span>
          </div>`;
        })
        .join("");
      document.querySelector("#vacant-stats").innerHTML =
        `<h3>Who pays what</h3>${headline}${rows}`;
    })
    .catch(() => {});
}

const api = MapCore.init({
  promoteId: "pin_10",
  getTileUrl: getCurrentTileUrl,
  getColorExpression: () => vacantColorExpression(view),
  getHeightExpression: () => vacantHeightExpression(),
  buildPopupHtml: buildVacantPopupHtml,
  onLoad: () => {
    updateLegend();
    loadStats();

    document.getElementById("toggle-3d").addEventListener("click", () => {
      const is3D = api.toggle3D();
      document.getElementById("toggle-3d").textContent = is3D
        ? "Disable 3D View"
        : "Enable 3D View";
    });
  },
});

// View selector (% vs $)
document.getElementById("vacant-view").addEventListener("change", (e) => {
  view = e.target.value;
  updateLegend();
  api.refreshPaint();
});

// Extent toggle (Chicago HQ vs Cook County)
document.getElementById("toggle-extent").addEventListener("click", () => {
  extent = extent === "chicago" ? "county" : "chicago";
  api.reloadParcels();
  document.getElementById("toggle-extent").textContent =
    extent === "chicago" ? "Show All Cook County" : "Show Chicago Only";
  document.getElementById("extent-note").textContent =
    extent === "county" ? "Cook County (standard quality)." : "";
});
