// Mapbox access token (starts with pk...)
mapboxgl.accessToken =
  "pk.eyJ1Ijoid3ludGVyMTIxMyIsImEiOiJjbWtjbGVjN20wMjd0M2ZzOW5xb2R5aG12In0.RDwM-94xlou8G7YF9ObDxA";

// Create the map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/wynter1213/cmkmo2eli003f01sf084zfxtt"
});

// Wait for the style to load before adding sources/layers and wiring events
map.on("load", () => {
  // ----------------------------
  // 1) HOVER OUTLINE SOURCE/LAYER
  // ----------------------------
  map.addSource("hover", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });

  map.addLayer({
    id: "dz-hover",
    type: "line",
    source: "hover",
    layout: {},
    paint: {
      "line-color": "black",
      "line-width": 4
    }
  });

  // ----------------------------
  // 2) HOVER INTERACTION
  // ----------------------------
  map.on("mousemove", (event) => {
    const dzone = map.queryRenderedFeatures(event.point, {
      layers: ["glasgow-simd"]
    });

    // Update hover info panel (div#pd)
    document.getElementById("pd").innerHTML = dzone.length
      ? `<h3>${dzone[0].properties.DZName}</h3>
         <p>Rank: <strong>${dzone[0].properties.Percentv2}</strong> %</p>`
      : `<p>Hover over a data zone!</p>`;

    // Update hover outline GeoJSON safely
    const hoverSource = map.getSource("hover");
    if (!hoverSource) return;

    hoverSource.setData({
      type: "FeatureCollection",
      features: dzone.map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {}
      }))
    });
  });

  // Optional: clear outline when leaving the layer
  map.on("mouseleave", "glasgow-simd", () => {
    const hoverSource = map.getSource("hover");
    if (!hoverSource) return;

    hoverSource.setData({
      type: "FeatureCollection",
      features: []
    });

    const pd = document.getElementById("pd");
    if (pd) pd.innerHTML = `<p>Hover over a data zone!</p>`;
  });

  // ----------------------------
  // 3) LEGEND
  // ----------------------------
  const legend = document.getElementById("legend");
  if (legend) {
    const labels = [
      "<10",
      "20",
      "30",
      "40",
      "50",
      "60",
      "70",
      "80",
      "90",
      "100"
    ];
    const colors = [
      "#a50026",
      "#d73027",
      "#f46d43",
      "#fdae61",
      "#fee08b",
      "#d9ef8b",
      "#a6d96a",
      "#66bd63",
      "#1a9850",
      "#006837"
    ];

    // Clear existing legend items (in case of re-runs)
    legend.innerHTML = "<div>Legend</div>";

    labels.forEach((label, i) => {
      const item = document.createElement("div");
      item.className = "legend-key";
      item.style.backgroundColor = colors[i];
      // Optional text color tweak for dark colors
      if (i <= 1 || i >= 8) item.style.color = "white";
      item.innerHTML = label;
      legend.appendChild(item);
    });
  }

  // ----------------------------
  // 4) CONTROLS
  // ----------------------------
  map.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }),
    "top-left"
  );

  const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    marker: false,
    placeholder: "Search for places in Glasgow",
    // NOTE: proximity should be { longitude, latitude } (lon first!)
    proximity: { longitude: -4.2518, latitude: 55.8642 }
  });
  map.addControl(geocoder, "top-left");
});