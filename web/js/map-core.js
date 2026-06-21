// Shared MapLibre + PMTiles map machinery used by every page.
//
// A page calls MapCore.init(config) with callbacks describing its tiles, paint,
// and popup; MapCore owns the map, the parcel layers, the 2D/3D toggle, the
// click popup, the CTA overlay, and the info-panel toggle. The returned api lets
// the page reload the source, refresh paint, and flip 3D in response to its own
// controls.
//
// config: {
//   container, style, center, zoom, promoteId,
//   getTileUrl()           -> pmtiles url for the current view
//   getColorExpression()   -> MapLibre color expression for the current view
//   getHeightExpression()  -> MapLibre fill-extrusion-height expression
//   buildPopupHtml(props)  -> html string (or falsy to skip the popup)
//   onLoad(api)            -> page-specific wiring after the map loads
// }

const MapCore = (function () {
  const POSITRON =
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
  const REMOTE_TILE_BASE = "https://tiles.open-advocacy.com";

  // Register the PMTiles protocol once, at module load. Guarded so the module can
  // also be required in Node for unit tests (where pmtiles/maplibregl are absent).
  if (typeof pmtiles !== "undefined" && typeof maplibregl !== "undefined") {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }

  // Resolve a tile filename to a pmtiles:// URL. With `?tiles=local`, tiles are
  // served from the dev server's /tiles directory (for previewing freshly built
  // tiles); by default they come from the remote CDN, so production and shared
  // links are unaffected. The CDN host lives here, in exactly one place.
  function tileUrl(name) {
    const local = new URLSearchParams(location.search).get("tiles") === "local";
    const base = local ? `${location.origin}/tiles` : REMOTE_TILE_BASE;
    return `pmtiles://${base}/${name}`;
  }

  const state = {
    map: null,
    cfg: null,
    is3D: false,
    ctaVisible: true,
  };

  function wirePanelToggle() {
    const panel = document.getElementById("info-panel");
    const panelToggle = document.getElementById("panel-toggle");
    const showPanelBtn = document.getElementById("show-panel-btn");
    if (!panel || !panelToggle || !showPanelBtn) return;

    panelToggle.addEventListener("click", () => {
      panel.classList.add("collapsed");
      showPanelBtn.classList.add("visible");
    });
    showPanelBtn.addEventListener("click", () => {
      panel.classList.remove("collapsed");
      showPanelBtn.classList.remove("visible");
    });
  }

  function addOutlineLayer() {
    state.map.addLayer({
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

  function addFillLayer(beforeId) {
    state.map.addLayer(
      {
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        "source-layer": "parcels",
        paint: {
          "fill-color": state.cfg.getColorExpression(),
          "fill-opacity": 0.7,
        },
      },
      beforeId
    );
  }

  function add3DLayer(beforeId) {
    state.map.addLayer(
      {
        id: "parcels-3d",
        type: "fill-extrusion",
        source: "parcels",
        "source-layer": "parcels",
        paint: {
          "fill-extrusion-color": state.cfg.getColorExpression(),
          "fill-extrusion-height": state.cfg.getHeightExpression(),
          "fill-extrusion-opacity": 0.8,
        },
      },
      beforeId
    );
  }

  // (Re)create the parcels source and its layers for the current tile URL.
  function reloadParcels() {
    const m = state.map;
    if (state.is3D && m.getLayer("parcels-3d")) m.removeLayer("parcels-3d");
    if (!state.is3D && m.getLayer("parcels-fill")) m.removeLayer("parcels-fill");
    if (m.getLayer("parcels-outline")) m.removeLayer("parcels-outline");
    if (m.getSource("parcels")) m.removeSource("parcels");

    m.addSource("parcels", {
      type: "vector",
      url: state.cfg.getTileUrl(),
      promoteId: state.cfg.promoteId || "pin_10",
    });

    if (state.is3D) {
      add3DLayer();
    } else {
      addFillLayer();
    }
    addOutlineLayer();
  }

  // Re-apply the current color (and height, in 3D) without rebuilding the source.
  function refreshPaint() {
    const m = state.map;
    if (state.is3D) {
      m.setPaintProperty(
        "parcels-3d",
        "fill-extrusion-color",
        state.cfg.getColorExpression()
      );
      m.setPaintProperty(
        "parcels-3d",
        "fill-extrusion-height",
        state.cfg.getHeightExpression()
      );
    } else {
      m.setPaintProperty("parcels-fill", "fill-color", state.cfg.getColorExpression());
    }
  }

  // Flip between 2D fill and 3D extrusion. Returns the new is3D state so the
  // caller can update its button.
  function toggle3D() {
    const m = state.map;
    state.is3D = !state.is3D;

    if (state.is3D) {
      m.removeLayer("parcels-fill");
      add3DLayer("parcels-outline");
      m.easeTo({ pitch: 45, bearing: -17.6, duration: 1000 });
    } else {
      m.removeLayer("parcels-3d");
      addFillLayer("parcels-outline");
      m.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
    }
    return state.is3D;
  }

  function setupInteractions() {
    const m = state.map;

    m.on("click", (e) => {
      const layerId = state.is3D ? "parcels-3d" : "parcels-fill";
      const features = m.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (features.length > 0) {
        const html = state.cfg.buildPopupHtml(features[0].properties);
        if (html) {
          new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(m);
        }
      }
    });

    m.on("mousemove", (e) => {
      const layerId = state.is3D ? "parcels-3d" : "parcels-fill";
      const features = m.queryRenderedFeatures(e.point, { layers: [layerId] });
      m.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    });
  }

  function setupCta() {
    const m = state.map;

    fetch("https://data.cityofchicago.org/resource/xbyr-jnvx.geojson")
      .then((r) => r.json())
      .then((data) => {
        m.addSource("cta-lines", { type: "geojson", data });
        m.addLayer({
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

    fetch("https://data.cityofchicago.org/resource/3tzw-cg4m.geojson")
      .then((r) => r.json())
      .then((data) => {
        m.addSource("cta-stations", { type: "geojson", data });
        m.addLayer({
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

    const btn = document.getElementById("toggle-cta");
    if (btn) {
      btn.addEventListener("click", () => {
        state.ctaVisible = !state.ctaVisible;
        const visibility = state.ctaVisible ? "visible" : "none";
        if (m.getLayer("cta-lines"))
          m.setLayoutProperty("cta-lines", "visibility", visibility);
        if (m.getLayer("cta-stations"))
          m.setLayoutProperty("cta-stations", "visibility", visibility);
        btn.textContent = state.ctaVisible ? "Hide CTA Lines" : "Show CTA Lines";
      });
    }
  }

  function init(cfg) {
    state.cfg = cfg;
    wirePanelToggle();

    const map = new maplibregl.Map({
      container: cfg.container || "map",
      style: cfg.style || POSITRON,
      center: cfg.center || [-87.6298, 41.8781],
      zoom: cfg.zoom != null ? cfg.zoom : 11,
    });
    state.map = map;
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    const api = {
      map,
      reloadParcels,
      refreshPaint,
      toggle3D,
      get is3D() {
        return state.is3D;
      },
    };

    map.on("load", () => {
      const spinner = document.getElementById("loading-spinner");
      if (spinner) spinner.style.display = "none";

      reloadParcels();
      setupCta();
      setupInteractions();

      if (cfg.onLoad) cfg.onLoad(api);
    });

    return api;
  }

  return { init, tileUrl };
})();

// Expose for Node unit tests; inert in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = MapCore;
}
