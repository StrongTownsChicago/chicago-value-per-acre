// Initialize PMTiles protocol
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// Create map
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-87.6298, 41.8781],
  zoom: 11,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

let is3D = false;

map.on("load", () => {
  // Add PMTiles source
  map.addSource("parcels", {
    type: "vector",
    url: "pmtiles://tiles/chicago_parcels.pmtiles",
    promoteId: "pin_10",
  });

  // Color expression based on value per acre
  const colorExpression = [
    "case",
    ["!", ["has", "value_per_acre"]],
    "#cccccc",
    ["<=", ["get", "value_per_acre"], 1],
    "#999999",
    ["<", ["get", "value_per_acre"], 500000],
    "#8B0000",
    ["<", ["get", "value_per_acre"], 1000000],
    "#DC143C",
    ["<", ["get", "value_per_acre"], 2000000],
    "#FF6347",
    ["<", ["get", "value_per_acre"], 5000000],
    "#FFA500",
    ["<", ["get", "value_per_acre"], 10000000],
    "#FFFF00",
    ["<", ["get", "value_per_acre"], 50000000],
    "#90EE90",
    "#006400",
  ];

  const heightExpression = [
    "interpolate",
    ["linear"],
    ["get", "value_per_acre"],
    0,
    0,
    1000000,
    20,
    5000000,
    100,
    10000000,
    200,
    50000000,
    500,
    100000000,
    800,
    1000000000,
    1500,
  ];

  // Start with 2D layer
  map.addLayer({
    id: "parcels-fill",
    type: "fill",
    source: "parcels",
    "source-layer": "parcels",
    paint: {
      "fill-color": colorExpression,
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
            "fill-extrusion-color": colorExpression,
            "fill-extrusion-height": heightExpression,
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
            "fill-color": colorExpression,
            "fill-opacity": 0.7,
          },
        },
        "parcels-outline"
      );

      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      document.getElementById("toggle-3d").textContent = "Enable 3D View";
    }
  });

  // Click handler
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

      let propType = "Unknown";
      if (p.class) {
        const majorClass = String(p.class)[0];
        if (["1", "2", "3"].includes(majorClass)) propType = "Residential";
        else if (majorClass === "4") propType = "Not-for-Profit";
        else if (majorClass === "5") propType = "Commercial/Industrial";
      }

      document.getElementById("parcel-details").innerHTML = `
        <div><strong>Value/Acre:</strong> ${fmt(p.value_per_acre)}</div>
        <div><strong>Total Value:</strong> ${fmt(p.market_value)}</div>
        <div><strong>Area:</strong> ${fmtAcres(p.acres)}</div>
        <div><strong>Type:</strong> ${propType}</div>
        <div><strong>Class:</strong> ${p.class || "N/A"}</div>
        <div><strong>PIN:</strong> ${p.pin_10 || "N/A"}</div>
        <div><a href="https://www.cookcountyassessor.com/pin/${
          p.pin_10
        }0000" target="_blank">View on Cook County Assessor →</a></div>
      `;
      document.getElementById("parcel-info").classList.remove("hidden");
    }
  });

  // Hover cursor
  map.on("mousemove", (e) => {
    const layerId = is3D ? "parcels-3d" : "parcels-fill";
    const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });
    map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
  });
});
