// Initialize PMTiles protocol
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// Info panel toggle
const panel = document.getElementById("info-panel");
const panelToggle = document.getElementById("panel-toggle");
const showPanelBtn = document.getElementById("show-panel-btn");

// Close panel
panelToggle.addEventListener("click", () => {
  panel.classList.add("collapsed");
  showPanelBtn.classList.add("visible");
});

// Restore panel
showPanelBtn.addEventListener("click", () => {
  panel.classList.remove("collapsed");
  showPanelBtn.classList.remove("visible");
});

let tilesLoaded = false;
const spinner = document.getElementById("loading-spinner");

let currentExtent = "chicago";
let isHighQuality = false;
let is3D = false;
let displayMetric = "value";

const TILES = {
  chicago: "pmtiles://https://tiles.open-advocacy.com/chicago_parcels.pmtiles",
  chicagoHQ:
    "pmtiles://https://tiles.open-advocacy.com/chicago_parcels_hq.pmtiles",
  county:
    "pmtiles://https://tiles.open-advocacy.com/cook_county_parcels.pmtiles",
  countyHQ:
    "pmtiles://https://tiles.open-advocacy.com/cook_county_parcels.pmtiles",
};

const SCALES = {
  value: {
    title: "Value Per Acre",
    field: "value_per_acre",
    colors: [
      { threshold: 1, color: "#999999", label: "$0" },
      { threshold: 500000, color: "#8B0000", label: "<$500k" },
      { threshold: 1000000, color: "#DC143C", label: "$500k-$1M" },
      { threshold: 2000000, color: "#FF6347", label: "$1M-$2M" },
      { threshold: 5000000, color: "#FFA500", label: "$2M-$5M" },
      { threshold: 10000000, color: "#FFFF00", label: "$5M-$10M" },
      { threshold: 50000000, color: "#90EE90", label: "$10M-$50M" },
      { threshold: Infinity, color: "#006400", label: "$50M+" },
    ],
    heights: [
      [0, 0],
      [1000000, 15],
      [5000000, 60],
      [10000000, 120],
      [25000000, 250],
      [50000000, 600],
      [100000000, 1500],
      [500000000, 4000],
      [1000000000, 6000],
      [2000000000, 9000],
      [5000000000, 14000],
    ],
  },
  tax: {
    title: "Tax Per Acre (2023)",
    field: "tax_per_acre",
    colors: [
      { threshold: 1, color: "#999999", label: "$0" },
      { threshold: 35000, color: "#8B0000", label: "<$35k" },
      { threshold: 75000, color: "#DC143C", label: "$35k-$75k" },
      { threshold: 150000, color: "#FF6347", label: "$75k-$150k" },
      { threshold: 350000, color: "#FFA500", label: "$150k-$350k" },
      { threshold: 700000, color: "#FFFF00", label: "$350k-$700k" },
      { threshold: 5000000, color: "#90EE90", label: "$700k-$5M" },
      { threshold: Infinity, color: "#006400", label: "$5M+" },
    ],
    heights: [
      [0, 0],
      [75000, 15],
      [350000, 60],
      [700000, 120],
      [2500000, 250],
      [5000000, 600],
      [10000000, 1500],
      [50000000, 4000],
      [100000000, 6000],
      [200000000, 9000],
      [500000000, 14000],
    ],
  },
};

function getCurrentTileUrl() {
  const base = currentExtent === "chicago" ? "chicago" : "county";
  // Force standard quality for county
  if (currentExtent === "county") {
    return TILES.county;
  }
  return TILES[isHighQuality ? base + "HQ" : base];
}

function updateQualityButtonState() {
  const btn = document.getElementById("toggle-quality");
  const note = document.getElementById("quality-note");

  if (currentExtent === "county") {
    // Disable for Cook County
    btn.disabled = true;
    btn.textContent = "High Quality (Chicago Only)";
    note.textContent =
      "High quality mode is only available for Chicago due to file size.";
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  } else {
    // Enable for Chicago
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
}

function updateLegend() {
  const scale = SCALES[displayMetric];
  const legendHTML = [...scale.colors]
    .reverse()
    .map(
      ({ color, label }) =>
        `<div class="legend-item">
      <span class="legend-color" style="background: ${color}"></span>
      <span>${label}</span>
    </div>`
    )
    .join("");

  document.querySelector(
    "#legend"
  ).innerHTML = `<h3>${scale.title}</h3>${legendHTML}`;
}

function reloadParcelsSource() {
  if (is3D && map.getLayer("parcels-3d")) map.removeLayer("parcels-3d");
  if (!is3D && map.getLayer("parcels-fill")) map.removeLayer("parcels-fill");
  if (map.getLayer("parcels-outline")) map.removeLayer("parcels-outline");
  if (map.getSource("parcels")) map.removeSource("parcels");

  map.addSource("parcels", {
    type: "vector",
    url: getCurrentTileUrl(),
    promoteId: "pin_10",
  });

  if (is3D) {
    map.addLayer({
      id: "parcels-3d",
      type: "fill-extrusion",
      source: "parcels",
      "source-layer": "parcels",
      paint: {
        "fill-extrusion-color": getColorExpression(),
        "fill-extrusion-height": getHeightExpression(),
        "fill-extrusion-opacity": 0.8,
      },
    });
  } else {
    map.addLayer({
      id: "parcels-fill",
      type: "fill",
      source: "parcels",
      "source-layer": "parcels",
      paint: {
        "fill-color": getColorExpression(),
        "fill-opacity": 0.7,
      },
    });
  }

  map.addLayer({
    id: "parcels-outline",
    type: "line",
    source: "parcels",
    "source-layer": "parcels",
    paint: {
      "line-color": "#333",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12,
        0,
        14,
        0.5,
        16,
        1,
      ],
      "line-opacity": 0.3,
    },
  });
}

function getColorExpression() {
  const scale = SCALES[displayMetric];
  const expr = ["case", ["!", ["has", scale.field]], "#cccccc"];

  scale.colors.forEach(({ threshold, color }) => {
    if (threshold === Infinity) {
      expr.push(color);
    } else {
      expr.push(["<", ["get", scale.field], threshold], color);
    }
  });

  return expr;
}

function getHeightExpression() {
  const scale = SCALES[displayMetric];
  return [
    "interpolate",
    ["linear"],
    ["get", scale.field],
    ...scale.heights.flat(),
  ];
}

// Create map
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-87.6298, 41.8781],
  zoom: 11,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");

map.on("load", () => {
  // Hide spinner once map loads - tiles will stream in progressively
  spinner.style.display = "none";

  // To load tiles locally, generate them with the scripts in the repo and serve via local server
  map.addSource("parcels", {
    type: "vector",
    url: "pmtiles://tiles/chicago_parcels.pmtiles",
    promoteId: "pin_10",
  });

  // Start with 2D layer
  map.addLayer({
    id: "parcels-fill",
    type: "fill",
    source: "parcels",
    "source-layer": "parcels",
    paint: {
      "fill-color": getColorExpression(),
      "fill-opacity": 0.7,
    },
  });

  // Add outline
  map.addLayer({
    id: "parcels-outline",
    type: "line",
    source: "parcels",
    "source-layer": "parcels",
    paint: {
      "line-color": "#333",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12,
        0,
        14,
        0.5,
        16,
        1,
      ],
      "line-opacity": 0.3,
    },
  });

  // Initialize button state
  updateQualityButtonState();
  updateLegend();

  // Toggle 3D
  document.getElementById("toggle-3d").addEventListener("click", () => {
    is3D = !is3D;

    if (is3D) {
      map.removeLayer("parcels-fill");
      map.addLayer(
        {
          id: "parcels-3d",
          type: "fill-extrusion",
          source: "parcels",
          "source-layer": "parcels",
          paint: {
            "fill-extrusion-color": getColorExpression(),
            "fill-extrusion-height": getHeightExpression(),
            "fill-extrusion-opacity": 0.8,
          },
        },
        "parcels-outline"
      );

      map.easeTo({ pitch: 45, bearing: -17.6, duration: 1000 });
      document.getElementById("toggle-3d").textContent = "Disable 3D View";
    } else {
      map.removeLayer("parcels-3d");
      map.addLayer(
        {
          id: "parcels-fill",
          type: "fill",
          source: "parcels",
          "source-layer": "parcels",
          paint: {
            "fill-color": getColorExpression(),
            "fill-opacity": 0.7,
          },
        },
        "parcels-outline"
      );

      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      document.getElementById("toggle-3d").textContent = "Enable 3D View";
    }
  });

  // Open parcel detail popup on click
  map.on("click", (e) => {
    const layerId = is3D ? "parcels-3d" : "parcels-fill";
    const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });

    if (features.length > 0) {
      const p = features[0].properties;
      const fmt = (val) =>
        val
          ? "$" +
            Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 })
          : "N/A";
      const fmtAcres = (val) =>
        val ? Number(val).toFixed(3) + " acres" : "N/A";
      const fmtPct = (val) => (val ? Number(val).toFixed(2) + "%" : "N/A");

      const html = `
      <div class="popup-details">
        ${
          p.full_address
            ? `<div><strong>Address:</strong> ${p.full_address}</div>`
            : ""
        }
        <div><strong>Value/Acre:</strong> ${fmt(p.value_per_acre)}</div>
        ${
          p.tax_per_acre
            ? `<div><strong>Tax/Acre:</strong> ${fmt(
                p.tax_per_acre
              )} (2023)</div>`
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
        <div><a href="https://www.cookcountyassessor.com/pin/${
          p.pin_14 || p.pin_10 + "0000"
        }" target="_blank">Source →</a></div>
      </div>`;
      new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
    }
  });

  // Hover cursor
  map.on("mousemove", (e) => {
    const layerId = is3D ? "parcels-3d" : "parcels-fill";
    const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });
    map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
  });
});

document.getElementById("toggle-metric").addEventListener("click", () => {
  displayMetric = displayMetric === "value" ? "tax" : "value";

  updateLegend();

  // Update button text
  document.getElementById("toggle-metric").textContent =
    displayMetric === "value" ? "Show Tax Data" : "Show Value Data";

  document.getElementById("metric-note").textContent =
    displayMetric === "value"
      ? "Currently showing market value data (2024)"
      : "Currently showing property tax data (2023)";

  // Update paint properties
  const layer = is3D ? "parcels-3d" : "parcels-fill";
  if (is3D) {
    map.setPaintProperty(layer, "fill-extrusion-color", getColorExpression());
    map.setPaintProperty(layer, "fill-extrusion-height", getHeightExpression());
  } else {
    map.setPaintProperty(layer, "fill-color", getColorExpression());
  }
});

// Toggle extent (Chicago vs Cook County)
document.getElementById("toggle-extent").addEventListener("click", () => {
  currentExtent = currentExtent === "chicago" ? "county" : "chicago";

  // Force back to standard quality when switching to county
  if (currentExtent === "county" && isHighQuality) {
    isHighQuality = false;
  }

  reloadParcelsSource();
  updateQualityButtonState();

  document.getElementById("toggle-extent").textContent =
    currentExtent === "chicago" ? "Show All Cook County" : "Show Chicago Only";
});

// Toggle quality (Standard vs High Quality)
document.getElementById("toggle-quality").addEventListener("click", () => {
  // Only allow toggle for Chicago
  if (currentExtent === "county") {
    return;
  }

  isHighQuality = !isHighQuality;
  reloadParcelsSource();
  updateQualityButtonState();
});

// CTA Lines with colors
fetch("https://data.cityofchicago.org/resource/xbyr-jnvx.geojson")
  .then((r) => r.json())
  .then((data) => {
    map.addSource("cta-lines", { type: "geojson", data });
    map.addLayer({
      id: "cta-lines",
      type: "line",
      source: "cta-lines",
      paint: {
        "line-color": [
          "match",
          ["get", "legend"],
          "RD",
          "#C41E3A",
          "BL",
          "#0066CC",
          "BR",
          "#62361B",
          "GR",
          "#009A44",
          "OR",
          "#F47314",
          "PK",
          "#E7007C",
          "PR",
          "#633893",
          "YL",
          "#F5C300",
          "ML",
          "#a1a1a1ff",
          "#000",
        ],
        "line-width": 3,
      },
    });
  });

// CTA Stations
fetch("https://data.cityofchicago.org/resource/3tzw-cg4m.geojson")
  .then((r) => r.json())
  .then((data) => {
    map.addSource("cta-stations", { type: "geojson", data });
    map.addLayer({
      id: "cta-stations",
      type: "circle",
      source: "cta-stations",
      paint: {
        "circle-radius": 2,
        "circle-color": "#fff",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#000",
      },
    });
  });

let ctaVisible = true;

// After both CTA layers are added, add toggle handler
document.getElementById("toggle-cta").addEventListener("click", () => {
  ctaVisible = !ctaVisible;

  const visibility = ctaVisible ? "visible" : "none";
  map.setLayoutProperty("cta-lines", "visibility", visibility);
  map.setLayoutProperty("cta-stations", "visibility", visibility);

  document.getElementById("toggle-cta").textContent = ctaVisible
    ? "Hide CTA Lines"
    : "Show CTA Lines";
});

// Cook County property class lookup
// https://prodassets.cookcountyassessoril.gov/s3fs-public/form_documents/classcode.pdf
const CLASS_DESCRIPTIONS = {
  // Exempt
  EX: "Exempt property",
  RR: "Railroad",
  0: "Exempt",

  // Class 1 - Vacant
  100: "Vacant land",
  190: "Vacant land with minor improvement",

  // Class 2 - Residential
  200: "Residential land",
  201: "Residential garage",
  202: "One-story residence (under 1,000 sq ft)",
  203: "One-story residence (1,000-1,800 sq ft)",
  204: "One-story residence (1,801+ sq ft)",
  205: "Two+ story residence, 62+ years old (under 2,200 sq ft)",
  206: "Two+ story residence, 62+ years old (2,201-4,999 sq ft)",
  207: "Two+ story residence, newer (under 2,000 sq ft)",
  208: "Two+ story residence, newer (3,801-4,999 sq ft)",
  209: "Two+ story residence (5,000+ sq ft)",
  210: "Row house/townhome, 62+ years old",
  211: "Apartment building (2-6 units)",
  212: "Mixed-use residential/commercial (under 6 units)",
  213: "Cooperative",
  218: "Bed & Breakfast (owner-occupied)",
  219: "Bed & Breakfast (non-owner-occupied)",
  224: "Farm building",
  225: "Single-room occupancy (SRO)",
  234: "Split-level residence",
  236: "Residential area on commercial/industrial parcel",
  239: "Agricultural land (farm pricing)",
  240: "First-time agricultural use",
  241: "Vacant land adjacent to residence",
  278: "Two+ story residence, newer (2,001-3,800 sq ft)",
  288: "Home improvement exemption",
  290: "Minor residential improvement",
  295: "Townhome/row house, newer",
  297: "Special residential improvement",
  299: "Residential condominium",

  // Class 3 - Multi-family
  300: "Multi-family land",
  301: "Multi-family ancillary structures",
  313: "Apartment building, 2-3 stories (7+ units)",
  314: "Apartment, non-fireproof corridor/California type",
  315: "Apartment, 2-3 story corridor",
  318: "Mixed-use commercial/residential (7+ units, under 35% commercial)",
  391: "Apartment building, 3+ stories (7+ units)",
  396: "Rental row houses (7+ units)",
  397: "Special rental structure",
  399: "Rental condominium",

  // Class 4 - Not-for-profit
  400: "Not-for-profit land",
  401: "Not-for-profit ancillary",
  417: "Not-for-profit one-story commercial",
  418: "Not-for-profit mixed-use",
  422: "Not-for-profit garage",
  423: "Not-for-profit gas station",
  426: "Not-for-profit greenhouse",
  427: "Not-for-profit theater",
  428: "Not-for-profit bank",
  429: "Not-for-profit motel",
  430: "Not-for-profit supermarket",
  431: "Not-for-profit shopping center",
  432: "Not-for-profit bowling alley",
  433: "Not-for-profit Quonset hut",
  480: "Not-for-profit industrial minor",
  481: "Not-for-profit industrial ancillary",
  483: "Not-for-profit industrial Quonset",
  487: "Not-for-profit special industrial",
  489: "Not-for-profit industrial condo",
  490: "Not-for-profit commercial minor",
  491: "Not-for-profit 3+ story building",
  492: "Not-for-profit 2-3 story commercial",
  493: "Not-for-profit industrial",
  496: "Not-for-profit rental row houses",
  497: "Not-for-profit special structure",
  499: "Not-for-profit condominium",

  // Class 5 - Commercial/Industrial
  500: "Commercial land",
  501: "Commercial ancillary",
  516: "Hotel/rooming house",
  517: "One-story commercial",
  522: "Public garage",
  523: "Gas station",
  526: "Commercial greenhouse",
  527: "Theater",
  528: "Bank",
  529: "Motel",
  530: "Supermarket",
  531: "Shopping center",
  532: "Bowling alley",
  533: "Quonset hut",
  535: "Golf course",
  550: "Industrial land",
  580: "Industrial minor improvement",
  581: "Industrial ancillary",
  583: "Industrial Quonset hut",
  587: "Special industrial",
  589: "Industrial condominium",
  590: "Commercial minor improvement",
  591: "Commercial 3+ story building",
  592: "Commercial 2-3 story building",
  593: "Industrial building",
  597: "Special commercial structure",
  599: "Commercial condominium",

  // Class 6 - Industrial incentive
  651: "Industrial incentive land",
  663: "Industrial incentive building",
  670: "Industrial incentive minor",
  671: "Industrial incentive ancillary",
  673: "Industrial incentive Quonset",
  677: "Special industrial incentive",
  679: "Industrial incentive condo",
  681: "Industrial incentive ancillary",

  // Class 7 - Commercial incentive
  700: "Commercial incentive land (Class 7a)",
  701: "Commercial incentive ancillary (7a)",
  716: "Hotel incentive (7a)",
  717: "One-story commercial incentive (7a)",
  722: "Garage incentive (7a)",
  723: "Gas station incentive (7a)",
  726: "Greenhouse incentive (7a)",
  727: "Theater incentive (7a)",
  728: "Bank incentive (7a)",
  729: "Motel incentive (7a)",
  730: "Supermarket incentive (7a)",
  731: "Shopping center incentive (7a)",
  732: "Bowling alley incentive (7a)",
  733: "Quonset hut incentive (7a)",
  735: "Golf course incentive (7a)",
  742: "Commercial incentive land (Class 7b)",
  743: "Commercial incentive ancillary (7b)",
  745: "Golf course incentive (7b)",
  746: "Hotel incentive (7b)",
  747: "One-story commercial incentive (7b)",
  748: "Motel incentive (7b)",
  752: "Garage incentive (7b)",
  753: "Gas station incentive (7b)",
  756: "Greenhouse incentive (7b)",
  757: "Theater incentive (7b)",
  758: "Bank incentive (7b)",
  760: "Supermarket incentive (7b)",
  761: "Shopping center incentive (7b)",
  762: "Bowling alley incentive (7b)",
  764: "Quonset hut incentive (7b)",
  765: "Other commercial incentive (7b)",
  767: "Special commercial incentive (7b)",
  772: "Commercial 2-3 story incentive (7b)",
  774: "Office building incentive (7b)",
  790: "Office building incentive (7a)",
  792: "Commercial 2-3 story incentive (7a)",
  797: "Special commercial incentive (7a)",
  798: "Commercial/industrial condo incentive (7b)",
  799: "Commercial/industrial condo incentive (7a)",

  // Class 8 - Commercial/Industrial incentive
  800: "Commercial incentive land",
  801: "Commercial incentive ancillary",
  816: "Hotel incentive",
  817: "One-story commercial incentive",
  822: "Garage incentive",
  823: "Gas station incentive",
  827: "Theater incentive",
  828: "Bank incentive",
  829: "Motel incentive",
  830: "Supermarket incentive",
  831: "Shopping center incentive",
  832: "Bowling alley incentive",
  833: "Quonset hut incentive",
  835: "Golf course incentive",
  880: "Industrial minor incentive",
  881: "Industrial ancillary incentive",
  890: "Industrial minor incentive",
  891: "Office building incentive",
  892: "Commercial 2-3 story incentive",
  893: "Industrial building incentive",
  897: "Special commercial incentive",
  899: "Commercial/industrial condo incentive",

  // Class 9 - Multi-family incentive
  900: "Multi-family incentive land",
  901: "Multi-family incentive ancillary",
  913: "Apartment incentive, 2-3 story (7+ units)",
  914: "Apartment incentive, non-fireproof",
  915: "Apartment incentive, corridor",
  918: "Mixed-use incentive",
  959: "Rental condo incentive",
  990: "Other minor improvements incentive",
  991: "Apartment incentive, 3+ stories",
  996: "Rental row houses incentive",
  997: "Special rental incentive",
};

function getClassDescription(classCode) {
  if (!classCode) return "Unknown";
  const code = String(classCode);
  return CLASS_DESCRIPTIONS[code] || `Class ${code}`;
}
