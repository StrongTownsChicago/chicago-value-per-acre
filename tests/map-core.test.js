// Unit tests for MapCore.tileUrl — the local/remote tile resolver. The default
// must stay remote (production and shared links are unaffected); only an exact
// ?tiles=local opts into dev-server tiles.
//
// Run: node --test 'tests/*.test.js'

const test = require("node:test");
const assert = require("node:assert/strict");
const MapCore = require("../web/js/map-core.js");

test("tileUrl: default resolves to the remote CDN base", () => {
  global.location = { search: "", origin: "http://localhost:8000" };
  assert.equal(
    MapCore.tileUrl("chicago_parcels.pmtiles"),
    "pmtiles://https://tiles.open-advocacy.com/chicago_parcels.pmtiles"
  );
});

test("tileUrl: ?tiles=local resolves to the dev server /tiles dir", () => {
  global.location = { search: "?tiles=local", origin: "http://localhost:8000" };
  assert.equal(
    MapCore.tileUrl("chicago_parcels_hq.pmtiles"),
    "pmtiles://http://localhost:8000/tiles/chicago_parcels_hq.pmtiles"
  );
});

test("tileUrl: unrelated query params stay remote", () => {
  global.location = { search: "?foo=bar&x=1", origin: "http://localhost:8000" };
  assert.match(
    MapCore.tileUrl("cook_county_parcels.pmtiles"),
    /^pmtiles:\/\/https:\/\/tiles\.open-advocacy\.com\/cook_county_parcels\.pmtiles$/
  );
});

test("tileUrl: only exact tiles=local triggers local", () => {
  global.location = { search: "?tiles=localx", origin: "http://localhost:8000" };
  assert.match(MapCore.tileUrl("a.pmtiles"), /tiles\.open-advocacy\.com/);
});
