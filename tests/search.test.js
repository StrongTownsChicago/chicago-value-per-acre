// Unit tests for MapSearch's pure geocoding helpers — the URL builder, the
// Nominatim response parser, and the Cook County bbox guard. The network call
// itself (geocodeAddress) is thin glue over these and is validated in-browser.
//
// Run: node --test 'tests/*.test.js'

const test = require("node:test");
const assert = require("node:assert/strict");
const MapSearch = require("../web/js/search.js");

test("buildUrl: targets the Nominatim search endpoint, US-scoped with a Cook County viewbox", () => {
  const url = MapSearch.buildUrl("30 N LaSalle St, Chicago, IL");
  assert.match(url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  const qs = new URL(url).searchParams;
  assert.equal(qs.get("format"), "jsonv2");
  assert.equal(qs.get("limit"), "1");
  assert.equal(qs.get("countrycodes"), "us");
  assert.equal(qs.get("q"), "30 N LaSalle St, Chicago, IL");
  // viewbox = west,north,east,south around Cook County
  assert.equal(qs.get("viewbox"), "-88.3,42.2,-87.5,41.4");
});

test("buildUrl: URL-encodes the address (spaces, commas, ampersands)", () => {
  const url = MapSearch.buildUrl("100 W North & Clybourn Ave");
  // Raw spaces/ampersands must not leak into the query string.
  assert.ok(!/ &(?!amp)/.test(url.split("?")[1]));
  assert.equal(
    new URL(url).searchParams.get("q"),
    "100 W North & Clybourn Ave"
  );
});

test("parseResponse: extracts lngLat ([lon, lat]) and display name from a hit", () => {
  const body = [
    {
      lon: "-87.6329140",
      lat: "41.8828458",
      display_name: "30 North LaSalle, Chicago, Cook County, Illinois",
    },
  ];
  const out = MapSearch.parseResponse(body, "fallback");
  assert.deepEqual(out.lngLat, [-87.632914, 41.8828458]);
  assert.equal(out.placeName, "30 North LaSalle, Chicago, Cook County, Illinois");
});

test("parseResponse: falls back to the typed address when no display_name", () => {
  const body = [{ lon: "-87.7", lat: "41.9" }];
  const out = MapSearch.parseResponse(body, "my typed address");
  assert.equal(out.placeName, "my typed address");
});

test("parseResponse: returns null on no matches", () => {
  assert.equal(MapSearch.parseResponse([], "x"), null);
});

test("parseResponse: returns null on a malformed/empty body", () => {
  assert.equal(MapSearch.parseResponse({}, "x"), null);
  assert.equal(MapSearch.parseResponse(null, "x"), null);
  // Match present but coordinates missing/non-numeric → null, not a throw.
  assert.equal(MapSearch.parseResponse([{}], "x"), null);
  assert.equal(MapSearch.parseResponse([{ lon: "abc", lat: "def" }], "x"), null);
});

test("inBbox: accepts points inside Cook County", () => {
  assert.ok(MapSearch.inBbox([-87.6324, 41.8836])); // downtown Chicago
  assert.ok(MapSearch.inBbox([-87.9, 42.0])); // northwest suburbs
});

test("inBbox: rejects points outside Cook County", () => {
  assert.ok(!MapSearch.inBbox([-87.9065, 43.0389])); // Milwaukee
  assert.ok(!MapSearch.inBbox([-73.9857, 40.7484])); // New York
  assert.ok(!MapSearch.inBbox([-87.6298, 39.0])); // too far south
});
