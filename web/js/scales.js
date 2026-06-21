// Shared color/height scales, legend, and class-code lookup.
// Used by both the value-per-acre page (app.js) and the vacant land tax page
// (vacant.js). Exposes globals; no build step.

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
      { threshold: 10000, color: "#8B0000", label: "<$10k" }, // matches $500k market value
      { threshold: 20000, color: "#DC143C", label: "$10k-$20k" }, // matches $1M market value
      { threshold: 40000, color: "#FF6347", label: "$20k-$40k" }, // matches $2M market value
      { threshold: 100000, color: "#FFA500", label: "$40k-$100k" }, // matches $5M market value
      { threshold: 200000, color: "#FFFF00", label: "$100k-$200k" }, // matches $10M market value
      { threshold: 1000000, color: "#90EE90", label: "$200k-$1M" }, // matches $50M market value
      { threshold: Infinity, color: "#006400", label: "$1M+" },
    ],
    heights: [
      [0, 0],
      [20000, 15],
      [100000, 60],
      [200000, 120],
      [500000, 250],
      [1000000, 600],
      [2000000, 1500],
      [10000000, 4000],
      [20000000, 6000],
      [40000000, 9000],
      [100000000, 14000],
    ],
  },
};

// Build a MapLibre paint expression that colors a feature by a numeric field
// against a scale's threshold ramp. Features missing the field render gray.
function buildColorExpression(scale) {
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

// Build a MapLibre fill-extrusion height expression from a scale's height stops.
function buildHeightExpression(scale) {
  return [
    "interpolate",
    ["linear"],
    ["get", scale.field],
    ...scale.heights.flat(),
  ];
}

// Build the legend inner HTML for a scale (high values listed first).
function buildLegendHtml(scale) {
  const items = [...scale.colors]
    .reverse()
    .map(
      ({ color, label }) =>
        `<div class="legend-item">
      <span class="legend-color" style="background: ${color}"></span>
      <span>${label}</span>
    </div>`
    )
    .join("");
  return `<h3>${scale.title}</h3>${items}`;
}

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

// ---- Vacant land tax page: two color schemes, shown at once ----
//
// Vacant parcels (the baked `vacant` flag == 1) get a WARM ramp on their large
// increase; every other parcel gets a COOL ramp on its small decrease. The two
// sets are disjoint, so one fill layer carries both ramps without a shared
// diverging scale washing out the tiny developed-parcel relief. Coloring keys off
// the `vacant` flag (the PTAXSIM scenario's own vacancy status), not the 2024
// assessor class, so the warm/cool split matches the modeled bills exactly.
//
// Each view ("pct" or "dollar") defines, per scheme, a `step` config (a base
// color plus ascending [threshold, color] pairs, fed to MapLibre's "step"
// expression) and a `legend` (display order, most extreme first).
const VACANT_VIEWS = {
  pct: {
    title: "Tax change (%)",
    vacant: {
      base: "#fdbb84",
      stops: [[50, "#fc8d59"], [100, "#e34a33"], [150, "#b30000"]],
      legend: [
        ["+150% or more", "#b30000"],
        ["+100% to +150%", "#e34a33"],
        ["+50% to +100%", "#fc8d59"],
        ["+5% to +50%", "#fdbb84"],
      ],
    },
    developed: {
      base: "#08519c",
      stops: [[-2, "#4292c6"], [-1, "#9ecae1"], [-0.5, "#deebf7"], [-0.15, "#f7f7f7"]],
      legend: [
        ["−2% or more", "#08519c"],
        ["−1% to −2%", "#4292c6"],
        ["−0.5% to −1%", "#9ecae1"],
        ["−0.15% to −0.5%", "#deebf7"],
        ["≈ no change", "#f7f7f7"],
      ],
    },
  },
  dollar: {
    title: "Tax change ($)",
    vacant: {
      base: "#fdbb84",
      stops: [[1000, "#fc8d59"], [3000, "#e34a33"], [7000, "#b30000"]],
      legend: [
        ["+$7,000 or more", "#b30000"],
        ["+$3,000 to $7,000", "#e34a33"],
        ["+$1,000 to $3,000", "#fc8d59"],
        ["under +$1,000", "#fdbb84"],
      ],
    },
    developed: {
      base: "#08519c",
      stops: [[-1000, "#4292c6"], [-300, "#9ecae1"], [-50, "#deebf7"], [-1, "#f7f7f7"]],
      legend: [
        ["−$1,000 or more", "#08519c"],
        ["−$300 to $1,000", "#4292c6"],
        ["−$50 to $300", "#9ecae1"],
        ["under −$50", "#deebf7"],
        ["≈ no change", "#f7f7f7"],
      ],
    },
  },
};

// The per-parcel value the active view colors by: % change or $ change.
// current bill = vacant_tax_cur, modeled bill = vacant_tax_new.
function vacantValueExpr(view) {
  const cur = ["coalesce", ["get", "vacant_tax_cur"], 0];
  const neu = ["coalesce", ["get", "vacant_tax_new"], 0];
  const change = ["-", neu, cur];
  if (view === "dollar") return change;
  // % change, floored denominator to avoid divide-by-zero on $0 bills.
  return ["*", 100, ["/", change, ["max", 1, cur]]];
}

// Two-scheme color expression: gray where no scenario data, warm step for vacant
// parcels, cool step for everyone else.
function vacantColorExpression(view) {
  const cfg = VACANT_VIEWS[view];
  const val = vacantValueExpr(view);
  const step = (scheme) => ["step", val, scheme.base, ...scheme.stops.flat()];
  return [
    "case",
    ["any", ["!", ["has", "vacant_tax_new"]], ["!", ["has", "vacant_tax_cur"]]],
    "#cccccc",
    ["==", ["get", "vacant"], 1],
    step(cfg.vacant),
    step(cfg.developed),
  ];
}

// 3D height = magnitude of the dollar change (direction is shown by color). Stops
// are hand-tuned so the residential relief range stays visible while vacant lots
// spike, instead of a few big commercial swings flattening everything.
function vacantHeightExpression() {
  const change = [
    "abs",
    ["-", ["coalesce", ["get", "vacant_tax_new"], 0], ["coalesce", ["get", "vacant_tax_cur"], 0]],
  ];
  return [
    "interpolate", ["linear"], change,
    0, 0, 100, 10, 500, 40, 1000, 80, 2500, 200,
    5000, 500, 10000, 1200, 25000, 3000, 50000, 6000, 100000, 10000,
  ];
}

// Legend HTML for the active view: a "Vacant lots" block and a "Developed" block.
function vacantLegendHtml(view) {
  const cfg = VACANT_VIEWS[view];
  const block = (heading, items) =>
    `<div class="legend-block"><h4>${heading}</h4>` +
    items
      .map(
        ([label, color]) =>
          `<div class="legend-item"><span class="legend-color" style="background: ${color}"></span><span>${label}</span></div>`
      )
      .join("") +
    `</div>`;
  return (
    `<h3>${cfg.title}</h3>` +
    block("Vacant lots (pay more)", cfg.vacant.legend) +
    block("Developed parcels (pay less)", cfg.developed.legend)
  );
}

// Expose the pure helpers to Node for unit testing. Ignored in the browser
// (module is undefined there), so the <script> behavior is unchanged.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SCALES,
    CLASS_DESCRIPTIONS,
    buildColorExpression,
    buildHeightExpression,
    buildLegendHtml,
    getClassDescription,
    VACANT_VIEWS,
    vacantValueExpr,
    vacantColorExpression,
    vacantHeightExpression,
    vacantLegendHtml,
  };
}
