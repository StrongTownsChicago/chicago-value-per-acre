// Address search, shared by every page.
//
// Geocodes a typed street address with the keyless Nominatim (OpenStreetMap)
// geocoder, drops a marker, flies to the point, and opens the parcel popup once
// tiles settle so search lands on the user's own parcel. No API key and no build
// step — works on a fresh clone with zero setup.
//
// Why Nominatim and not the US Census geocoder: the Census onelineaddress API
// returns no CORS headers, so a browser fetch from this static site fails
// ("Failed to fetch"). Nominatim sends CORS headers and works directly from the
// browser. Its usage policy (max ~1 req/sec, identify via Referer — sent
// automatically by the browser) is comfortably met by a user-typed search box.
//
// A page includes this script after map-core.js and calls
// MapSearch.setup(api) inside its onLoad, with an `#address-form`,
// `#address-input`, and `#address-error` in the DOM.

const MapSearch = (function () {
  const ENDPOINT = "https://nominatim.openstreetmap.org/search";

  // Cook County bounding box (west, south, east, north). Matches are rejected
  // outside it so a bare "Main St" doesn't fly the map to another state, and it
  // biases Nominatim toward local results via the viewbox.
  const BBOX = { west: -88.3, south: 41.4, east: -87.5, north: 42.2 };

  // Build the Nominatim request URL. Pure (no I/O) so it's unit-testable. The
  // viewbox softly biases results toward Cook County; countrycodes pins to the
  // US; the inBbox() check below is the hard geographic guard.
  function buildUrl(address) {
    const params = new URLSearchParams({
      q: address,
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      viewbox: `${BBOX.west},${BBOX.north},${BBOX.east},${BBOX.south}`,
    });
    return `${ENDPOINT}?${params.toString()}`;
  }

  // Parse a Nominatim response body into { lngLat, placeName } or null.
  // Nominatim returns an array of { lat, lon (strings), display_name }. Pure, so
  // it's testable without hitting the network.
  function parseResponse(data, fallbackName) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const m = data[0];
    const lng = Number(m.lon);
    const lat = Number(m.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      lngLat: [lng, lat],
      placeName: m.display_name || fallbackName,
    };
  }

  // Whether a [lng, lat] falls inside the Cook County bbox. Pure.
  function inBbox(lngLat) {
    const [lng, lat] = lngLat;
    return (
      lng >= BBOX.west &&
      lng <= BBOX.east &&
      lat >= BBOX.south &&
      lat <= BBOX.north
    );
  }

  // Geocode an address string. Returns { lngLat, placeName } or null; never
  // throws (network/HTTP/parse failures all resolve to null).
  async function geocodeAddress(address) {
    try {
      const res = await fetch(buildUrl(address));
      if (!res.ok) return null;
      const data = await res.json();
      return parseResponse(data, address);
    } catch (e) {
      console.error("Geocoding failed:", e);
      return null;
    }
  }

  // Wire the search form to the map. `api` is the object returned by
  // MapCore.init (needs api.map and api.openPopupAt).
  function setup(api) {
    const form = document.getElementById("address-form");
    const input = document.getElementById("address-input");
    const errEl = document.getElementById("address-error");
    const submit = document.getElementById("address-submit");
    if (!form || !input) return;

    let marker = null;

    function showError(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    function clearError() {
      if (errEl) errEl.hidden = true;
    }
    function setBusy(busy) {
      input.disabled = busy;
      if (submit) {
        submit.disabled = busy;
        submit.textContent = busy ? "…" : "Go";
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();
      const address = input.value.trim();
      if (!address) return;

      setBusy(true);
      const result = await geocodeAddress(address);
      setBusy(false);

      if (!result) {
        showError(
          "Address not found. Try a full street address (e.g. 30 N LaSalle St, Chicago)."
        );
        return;
      }
      if (!inBbox(result.lngLat)) {
        showError("That address is outside Cook County.");
        return;
      }

      if (marker) marker.remove();
      marker = new maplibregl.Marker({ color: "#dc2626" })
        .setLngLat(result.lngLat)
        .addTo(api.map);

      api.map.flyTo({
        center: result.lngLat,
        zoom: Math.max(api.map.getZoom(), 16),
        speed: 1.4,
      });

      // Open the parcel popup once the camera settles — a miss (no rendered
      // parcel under the point) is fine, not an error.
      api.map.once("moveend", () => api.openPopupAt(result.lngLat));
    });
  }

  return { setup, geocodeAddress, buildUrl, parseResponse, inBbox };
})();

// Expose the pure helpers to Node for unit testing; inert in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = MapSearch;
}
