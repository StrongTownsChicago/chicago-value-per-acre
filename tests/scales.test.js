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
} = require("../web/js/scales.js");

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
