// Unit tests for the shared scale/legend/class helpers extracted in the Phase 1
// refactor. These functions build the MapLibre paint expressions that drive the
// entire choropleth, so a regression here silently miscolors the map.
//
// Run: node --test tests/

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SCALES,
  buildColorExpression,
  buildHeightExpression,
  buildLegendHtml,
  getClassDescription,
  VACANT_VIEWS,
  vacantValueExpr,
  vacantColorExpression,
  vacantHeightExpression,
  vacantLegendHtml,
  vacantStatsHtml,
} = require("../web/js/scales.js");

const SAMPLE_AGG = {
  n_total: 1_416_810,
  n_vacant: 61_623,
  sum_current: 19_192_000_000,
  sum_vacant_current: 139_100_000,
  sum_vacant_new: 335_800_000,
  vacant_increase: 196_700_000,
  avg_nonvacant_change_pct: -1.21,
  by_category: {
    "Vacant land": { n: 61_623, avg_change_pct: 141.3 },
    "Single-family / townhome": { n: 738_147, avg_change_pct: -1.2 },
    "Commercial / retail": { n: 70_964, avg_change_pct: -1.4 },
  },
};

// Thresholds in a MapLibre ["step", input, base, t1, c1, t2, c2, ...] expression.
function stepThresholds(stepExpr) {
  const out = [];
  for (let i = 3; i < stepExpr.length; i += 2) out.push(stepExpr[i]);
  return out;
}

test("buildColorExpression: leads with a gray fallback for the missing field", () => {
  const expr = buildColorExpression(SCALES.value);
  assert.equal(expr[0], "case");
  assert.deepEqual(expr[1], ["!", ["has", "value_per_acre"]]);
  assert.equal(expr[2], "#cccccc");
});

test("buildColorExpression: one condition/color pair per finite band, bare default last", () => {
  const scale = SCALES.value;
  const expr = buildColorExpression(scale);
  const finite = scale.colors.filter((c) => c.threshold !== Infinity);
  const hasInfinity = scale.colors.some((c) => c.threshold === Infinity);
  assert.equal(hasInfinity, true, "value scale should have an Infinity catch-all");

  // 1 (case) + 2 (has-guard pair) + 2*finite (condition/color) + 1 (default color)
  assert.equal(expr.length, 1 + 2 + 2 * finite.length + 1);

  // Final element is the Infinity band's color, emitted as a bare default.
  const infColor = scale.colors.find((c) => c.threshold === Infinity).color;
  assert.equal(expr[expr.length - 1], infColor);
  assert.equal(typeof expr[expr.length - 1], "string");
});

test("buildColorExpression: each finite band emits the correct '<' threshold test", () => {
  const scale = SCALES.tax;
  const expr = buildColorExpression(scale);
  for (const { threshold, color } of scale.colors) {
    if (threshold === Infinity) continue;
    const idx = expr.findIndex(
      (el) =>
        Array.isArray(el) &&
        el[0] === "<" &&
        Array.isArray(el[1]) &&
        el[1][0] === "get" &&
        el[1][1] === scale.field &&
        el[2] === threshold
    );
    assert.notEqual(idx, -1, `missing test for threshold ${threshold}`);
    assert.equal(expr[idx + 1], color, `wrong color after threshold ${threshold}`);
  }
});

test("buildHeightExpression: linear interpolation over the flattened stops", () => {
  const scale = SCALES.value;
  const expr = buildHeightExpression(scale);
  assert.equal(expr[0], "interpolate");
  assert.deepEqual(expr[1], ["linear"]);
  assert.deepEqual(expr[2], ["get", "value_per_acre"]);

  const stops = expr.slice(3);
  assert.deepEqual(stops, scale.heights.flat());
  assert.equal(stops.length % 2, 0, "stops must be input/output pairs");
});

test("buildLegendHtml: titled and ordered high value first", () => {
  const scale = SCALES.value;
  const html = buildLegendHtml(scale);
  assert.match(html, new RegExp(`<h3>${scale.title}</h3>`));
  // Reversed: the top ($50M+) band appears before the bottom ($0) band.
  assert.ok(
    html.indexOf("$50M+") < html.indexOf("$0"),
    "legend should list the highest band first"
  );
  // Renders each band's swatch color.
  assert.match(html, /background: #006400/);
});

test("getClassDescription: known, numeric, unknown, and empty inputs", () => {
  assert.equal(getClassDescription("100"), "Vacant land");
  assert.equal(getClassDescription("190"), "Vacant land with minor improvement");
  assert.equal(getClassDescription("299"), "Residential condominium");
  assert.equal(getClassDescription(299), "Residential condominium"); // numeric coerced
  assert.equal(getClassDescription("EX"), "Exempt property");
  assert.equal(getClassDescription("99999"), "Class 99999"); // unknown -> labeled
  assert.equal(getClassDescription(null), "Unknown");
  assert.equal(getClassDescription(undefined), "Unknown");
  assert.equal(getClassDescription(""), "Unknown");
});

test("vacantValueExpr: pct is a percentage, dollar is the raw change", () => {
  const pct = JSON.stringify(vacantValueExpr("pct"));
  assert.match(pct, /"\*"/); // scaled by 100
  assert.match(pct, /vacant_tax_new/);
  assert.match(pct, /vacant_tax_cur/);

  const dollar = vacantValueExpr("dollar");
  assert.deepEqual(dollar, [
    "-",
    ["coalesce", ["get", "vacant_tax_new"], 0],
    ["coalesce", ["get", "vacant_tax_cur"], 0],
  ]);
});

test("vacantColorExpression: gray no-data, then warm (vacant) and cool (developed) steps", () => {
  const expr = vacantColorExpression("pct");
  assert.equal(expr[0], "case");
  // no-data fallback first
  assert.equal(expr[2], "#cccccc");
  // branch on the baked vacant flag, not class
  assert.deepEqual(expr[3], ["==", ["get", "vacant"], 1]);
  const vacantStep = expr[4];
  const developedStep = expr[5];
  assert.equal(vacantStep[0], "step");
  assert.equal(developedStep[0], "step");
  // vacant thresholds are positive increases, ascending
  assert.deepEqual(stepThresholds(vacantStep), [50, 100, 150]);
  // developed thresholds are negative (relief), ascending
  const dev = stepThresholds(developedStep);
  assert.deepEqual(dev, [-2, -1, -0.5, -0.15]);
  for (let i = 1; i < dev.length; i++) assert.ok(dev[i] > dev[i - 1]);
});

test("vacantColorExpression: dollar view uses dollar thresholds", () => {
  const expr = vacantColorExpression("dollar");
  assert.deepEqual(stepThresholds(expr[4]), [1000, 3000, 7000]);
  assert.deepEqual(stepThresholds(expr[5]), [-1000, -300, -50, -1]);
});

test("vacantHeightExpression: interpolates on absolute dollar change", () => {
  const expr = vacantHeightExpression();
  assert.equal(expr[0], "interpolate");
  assert.deepEqual(expr[1], ["linear"]);
  assert.equal(expr[2][0], "abs");
  const stops = expr.slice(3);
  assert.equal(stops.length % 2, 0);
  assert.equal(stops[0], 0); // change 0 -> height 0
  assert.equal(stops[1], 0);
});

test("vacantLegendHtml: titled with both vacant and developed blocks", () => {
  const html = vacantLegendHtml("pct");
  assert.match(html, /Tax change \(%\)/);
  assert.match(html, /Vacant lots \(pay more\)/);
  assert.match(html, /Developed parcels \(pay less\)/);
  assert.match(html, /\+150% or more/);
  assert.match(html, /≈ no change/);
});

test("vacantStatsHtml: headline figures and per-category rows", () => {
  const html = vacantStatsHtml(SAMPLE_AGG);
  assert.match(html, /Who pays what/);
  assert.match(html, /61,623/); // vacant count
  assert.match(html, /\$197M/); // vacant increase rounded to millions
  assert.match(html, /\$2,257/); // avg vacant current = 139.1M / 61,623
  assert.match(html, /\$5,449/); // avg vacant new = 335.8M / 61,623
  assert.match(html, /1\.2%/); // non-vacant relief (abs)
  // category rows, sorted with the vacant increase first
  assert.match(html, /Vacant land/);
  assert.match(html, /\+141\.3%/);
  assert.match(html, /Commercial \/ retail/);
  assert.ok(html.indexOf("Vacant land") < html.indexOf("Single-family"));
});

test("vacantStatsHtml: empty for missing/zero aggregates", () => {
  assert.equal(vacantStatsHtml(null), "");
  assert.equal(vacantStatsHtml({}), "");
  assert.equal(vacantStatsHtml({ n_vacant: 0 }), "");
});

test("VACANT_VIEWS integrity: ascending step thresholds, hex colors, legends", () => {
  for (const [view, cfg] of Object.entries(VACANT_VIEWS)) {
    assert.ok(cfg.title, `${view} needs a title`);
    for (const key of ["vacant", "developed"]) {
      const s = cfg[key];
      assert.match(s.base, /^#/, `${view}.${key} base hex`);
      const thr = s.stops.map((p) => p[0]);
      for (let i = 1; i < thr.length; i++) {
        assert.ok(thr[i] > thr[i - 1], `${view}.${key} stops must ascend`);
      }
      assert.ok(
        s.stops.every((p) => typeof p[1] === "string" && p[1].startsWith("#")),
        `${view}.${key} stop colors hex`
      );
      assert.ok(s.legend.length > 0, `${view}.${key} legend non-empty`);
    }
  }
});

test("SCALES integrity: ascending thresholds ending in Infinity, ascending heights", () => {
  for (const [name, scale] of Object.entries(SCALES)) {
    assert.ok(scale.title && scale.field, `${name} needs title + field`);
    assert.ok(Array.isArray(scale.colors) && scale.colors.length > 1, `${name} colors`);
    assert.ok(Array.isArray(scale.heights) && scale.heights.length > 1, `${name} heights`);

    const thresholds = scale.colors.map((c) => c.threshold);
    for (let i = 1; i < thresholds.length; i++) {
      assert.ok(thresholds[i] > thresholds[i - 1], `${name} thresholds must ascend`);
    }
    assert.equal(thresholds[thresholds.length - 1], Infinity, `${name} ends in Infinity`);
    assert.ok(
      scale.colors.every((c) => typeof c.color === "string" && c.color.startsWith("#")),
      `${name} every band has a hex color`
    );

    const inputs = scale.heights.map((h) => h[0]);
    for (let i = 1; i < inputs.length; i++) {
      assert.ok(inputs[i] > inputs[i - 1], `${name} height stops must ascend`);
    }
  }
});
