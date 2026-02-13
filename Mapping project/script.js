/****************************************************
 * UK Earthquake Map - Points Visible on Load!
 ****************************************************/

// Error handling
window.onerror = (msg, src, line, col, err) => {
  console.log("🔥 Error:", msg, "at", src, "line", line);
  console.log(err?.stack || err);
};

window.onunhandledrejection = (e) => {
  console.log("🔥 Unhandled rejection:", e.reason);
};

// Configuration
mapboxgl.accessToken = "pk.eyJ1Ijoid3ludGVyMTIxMyIsImEiOiJjbWxmZjkwdHMwMTVqM2VzYXFneXAwMXl5In0.kc9SNJ4aUn4kgG0d9IsW3w";
const CSV_URL = "https://raw.githubusercontent.com/WynterDai/WanyueDai.github.io/main/Mapping%20project/UK_earthquake_clean.csv";

// Global variables
let allData = [];
let filteredData = [];
let map;
let deckOverlay;
let allDates = [];
let dataBounds;
let initialZoom;
let initialCenter;
const tooltip = document.getElementById("tooltip");

// Tooltip functions
function showTooltip(x, y, d) {
  tooltip.style.display = "block";
  tooltip.style.left = `${x + 10}px`;
  tooltip.style.top = `${y + 10}px`;
  const inducedText = d.induced === 1 ? "Yes" : d.induced === 0 ? "No" : "Unknown";
  
  const cleanLocation = (d.location || "Unknown location").replace(/["']/g, "");
  
  tooltip.innerHTML = `
    <b>${cleanLocation}</b><br/>
    <div class="muted">${d.datetime || ""}</div>
    <hr style="border:none;border-top:1px solid rgba(0,0,0,0.1);margin:8px 0;"/>
    Magnitude: <b>${Number(d.magnitude).toFixed(1)}</b><br/>
    Depth (km): <b>${Number(d.depth).toFixed(1)}</b><br/>
    Induced: <b>${inducedText}</b>
  `;
}

function hideTooltip() {
  tooltip.style.display = "none";
}

// Depth to color
function depthToColor(depth) {
  const d = Number(depth);
  
  if (d < 5) {
    return [255, 235, 59, 200];
  } else if (d < 10) {
    const t = (d - 5) / 5;
    return [255, Math.round(235 - 83 * t), Math.round(59 - 59 * t), 200];
  } else if (d < 20) {
    const t = (d - 10) / 10;
    return [255, Math.round(152 - 65 * t), Math.round(0 + 34 * t), 200];
  } else {
    return [183, 28, 28, 200];
  }
}

// Magnitude to radius
function magToRadius(mag) {
  const m = Math.max(0, Number(mag));
  if (m < 1) return 4;
  if (m < 2) return 6;
  if (m < 3) return 8;
  return 10;
}

// CSV parser
async function loadCSVFixed(url) {
  const text = await (await fetch(url)).text();
  const lines = text.trim().split(/\r?\n/);
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(",").map(s => s.trim());
    if (parts.length < 7) continue;
    
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    const depth = Number(parts[2]);
    const magnitude = Number(parts[3]);
    const inducedRaw = parts[4];
    const induced = inducedRaw === "" || inducedRaw == null ? 0 : Number(inducedRaw);
    const datetime = parts[parts.length - 1];
    const location = parts.slice(5, -1).join(", ").replace(/\s+/g, " ").replace(/["']/g, "").trim();
    
    if ([lat, lon, depth, magnitude].every(Number.isFinite)) {
      data.push({ lat, lon, depth, magnitude, induced, location, datetime });
    }
  }
  
  return data;
}

// Bounds calculation
function computeBounds(data) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const d of data) {
    minLon = Math.min(minLon, d.lon);
    minLat = Math.min(minLat, d.lat);
    maxLon = Math.max(maxLon, d.lon);
    maxLat = Math.max(maxLat, d.lat);
  }
  const lonPadding = (maxLon - minLon) * 0.15;
  const latPadding = (maxLat - minLat) * 0.15;
  return [
    [minLon - lonPadding, minLat - latPadding],
    [maxLon + lonPadding, maxLat + latPadding]
  ];
}

// Update dual range fill
function updateRangeFill(fillId, minVal, maxVal, min, max) {
  const fill = document.getElementById(fillId);
  const percent1 = ((minVal - min) / (max - min)) * 100;
  const percent2 = ((maxVal - min) / (max - min)) * 100;
  fill.style.left = percent1 + '%';
  fill.style.width = (percent2 - percent1) + '%';
}

// Create timeline chart
function createTimelineChart(data) {
  const dates = data.map(d => new Date(d.datetime)).filter(d => !isNaN(d)).sort((a, b) => a - b);
  if (dates.length === 0) return;
  
  allDates = dates;
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  
  const months = [];
  let current = new Date(minDate);
  while (current <= maxDate) {
    months.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }
  
  const counts = months.map(month => {
    const nextMonth = new Date(month);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return data.filter(d => {
      const eqDate = new Date(d.datetime);
      return eqDate >= month && eqDate < nextMonth;
    }).length;
  });
  
  const maxCount = Math.max(...counts, 1);
  
  const chartDiv = document.getElementById('timelineChart');
  chartDiv.innerHTML = '';
  
  counts.forEach(count => {
    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    bar.style.height = `${(count / maxCount) * 100}%`;
    chartDiv.appendChild(bar);
  });
  
  const xAxisDiv = document.getElementById('timelineXAxis');
  const numLabels = 5;
  const labelIndices = [];
  for (let i = 0; i < numLabels; i++) {
    labelIndices.push(Math.floor((months.length - 1) * i / (numLabels - 1)));
  }
  
  xAxisDiv.innerHTML = labelIndices.map(idx => {
    const date = months[idx];
    return `<span>${date.getFullYear()}</span>`;
  }).join('');
  
  const startSlider = document.getElementById('timelineStart');
  const endSlider = document.getElementById('timelineEnd');
  
  startSlider.max = dates.length - 1;
  endSlider.max = dates.length - 1;
  startSlider.value = 0;
  endSlider.value = dates.length - 1;
  
  updateRangeFill('timelineFill', 0, dates.length - 1, 0, dates.length - 1);
  
  const updateTimeline = () => {
    let startIndex = parseInt(startSlider.value);
    let endIndex = parseInt(endSlider.value);
    
    if (startIndex > endIndex) {
      const temp = startIndex;
      startIndex = endIndex;
      endIndex = temp;
      startSlider.value = startIndex;
      endSlider.value = endIndex;
    }
    
    updateRangeFill('timelineFill', startIndex, endIndex, 0, dates.length - 1);
    
    const startDate = dates[startIndex];
    const endDate = dates[endIndex];
    
    const selection = document.getElementById('timelineSelection');
    const startPercent = (startIndex / (dates.length - 1)) * 100;
    const endPercent = (endIndex / (dates.length - 1)) * 100;
    selection.style.left = startPercent + '%';
    selection.style.width = (endPercent - startPercent) + '%';
    
    applyFilters(false);
    
    const startStr = startDate.toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    const endStr = endDate.toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    if (startIndex === 0 && endIndex === dates.length - 1) {
      document.getElementById('timelineDate').textContent = 'All Events';
    } else {
      document.getElementById('timelineDate').textContent = `${startStr} — ${endStr}`;
    }
  };
  
  startSlider.oninput = updateTimeline;
  endSlider.oninput = updateTimeline;
  
  updateTimeline();
}

// Create deck layer
// Create deck layer
function createDeckLayer() {
  return new deck.ScatterplotLayer({
    id: "eq-circles",
    data: filteredData,
    pickable: true,
    opacity: 0.85,
    stroked: false,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 3,  //  确保即使zoom很小，点也至少3像素大
    radiusMaxPixels: 150,  // 放大时最大150像素
    getPosition: d => [d.lon, d.lat],
    getRadius: d => magToRadius(d.magnitude),
    getFillColor: d => depthToColor(d.depth),
    radiusUnits: 'pixels',  //  关键：使用像素单位而不是米
    autoHighlight: true,
    highlightColor: [255, 255, 255, 100],
    updateTriggers: {
      getPosition: filteredData.length,
      getRadius: filteredData.length,
      getFillColor: filteredData.length
    },
    onHover: info => {
      if (!info.object) return hideTooltip();
      showTooltip(info.x, info.y, info.object);
    },
    pickingRadius: 10
  });
}

// Update deck.gl layers
function updateLayers() {
  if (!map || !map.isStyleLoaded()) {
    console.log("⚠️ Map not ready yet");
    return;
  }
  
  const { MapboxOverlay } = deck;
  
  if (deckOverlay) {
    try {
      map.removeControl(deckOverlay);
    } catch (e) {
      console.log("Note: old overlay already removed");
    }
  }
  
  deckOverlay = new MapboxOverlay({
    interleaved: true,
    layers: [createDeckLayer()]
  });
  
  map.addControl(deckOverlay);
  console.log("✅ Layers updated, points visible:", filteredData.length);
}

// Apply filters
function applyFilters(updateFromSliders = true) {
  const magMin = parseFloat(document.getElementById('magMin').value);
  const magMax = parseFloat(document.getElementById('magMax').value);
  const depthMin = parseFloat(document.getElementById('depthMin').value);
  const depthMax = parseFloat(document.getElementById('depthMax').value);
  const inducedOnly = document.getElementById('inducedOnly').checked;
  
  const startIndex = parseInt(document.getElementById('timelineStart').value);
  const endIndex = parseInt(document.getElementById('timelineEnd').value);
  const startDate = allDates[startIndex];
  const endDate = allDates[endIndex];
  
  filteredData = allData.filter(d => {
    const eqDate = new Date(d.datetime);
    return d.magnitude >= magMin &&
           d.magnitude <= magMax &&
           d.depth >= depthMin &&
           d.depth <= depthMax &&
           (!inducedOnly || d.induced === 1) &&
           eqDate >= startDate &&
           eqDate <= endDate;
  });
  
  updateLayers();
}

// Setup UI controls
function setupControls() {
  const magMin = document.getElementById('magMin');
  const magMax = document.getElementById('magMax');
  
  magMin.oninput = () => {
    let min = parseFloat(magMin.value);
    let max = parseFloat(magMax.value);
    if (min > max) {
      magMin.value = max;
      min = max;
    }
    document.getElementById('magMinVal').textContent = min.toFixed(1);
    updateRangeFill('magFill', min, max, 0, 6);
  };
  
  magMax.oninput = () => {
    let min = parseFloat(magMin.value);
    let max = parseFloat(magMax.value);
    if (max < min) {
      magMax.value = min;
      max = min;
    }
    document.getElementById('magMaxVal').textContent = max.toFixed(1);
    updateRangeFill('magFill', min, max, 0, 6);
  };
  
  updateRangeFill('magFill', 0, 6, 0, 6);
  
  const depthMin = document.getElementById('depthMin');
  const depthMax = document.getElementById('depthMax');
  
  depthMin.oninput = () => {
    let min = parseInt(depthMin.value);
    let max = parseInt(depthMax.value);
    if (min > max) {
      depthMin.value = max;
      min = max;
    }
    document.getElementById('depthMinVal').textContent = min;
    updateRangeFill('depthFill', min, max, 0, 30);
  };
  
  depthMax.oninput = () => {
    let min = parseInt(depthMin.value);
    let max = parseInt(depthMax.value);
    if (max < min) {
      depthMax.value = min;
      max = min;
    }
    document.getElementById('depthMaxVal').textContent = max;
    updateRangeFill('depthFill', min, max, 0, 30);
  };
  
  updateRangeFill('depthFill', 0, 30, 0, 30);
  
  document.getElementById('applyFilters').onclick = () => applyFilters(true);
  
  document.getElementById('resetFilters').onclick = () => {
    magMin.value = 0;
    magMax.value = 6;
    depthMin.value = 0;
    depthMax.value = 30;
    document.getElementById('inducedOnly').checked = false;
    document.getElementById('timelineStart').value = 0;
    document.getElementById('timelineEnd').value = allDates.length - 1;
    document.getElementById('timelineDate').textContent = 'All Events';
    document.getElementById('magMinVal').textContent = '0.0';
    document.getElementById('magMaxVal').textContent = '6.0';
    document.getElementById('depthMinVal').textContent = '0';
    document.getElementById('depthMaxVal').textContent = '30';
    
    updateRangeFill('magFill', 0, 6, 0, 6);
    updateRangeFill('depthFill', 0, 30, 0, 30);
    updateRangeFill('timelineFill', 0, allDates.length - 1, 0, allDates.length - 1);
    
    const selection = document.getElementById('timelineSelection');
    selection.style.left = '0%';
    selection.style.width = '100%';
    
    filteredData = [...allData];
    updateLayers();
  };
  
  document.getElementById('resetView').onclick = () => {
    map.flyTo({
      center: initialCenter,
      zoom: initialZoom,
      duration: 2000
    });
  };
  
  document.getElementById('toggleBtn').onclick = () => {
    const panel = document.getElementById('controlPanel');
    const infoPanel = document.getElementById('infoPanel');
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
      infoPanel.classList.remove('active');
    }
  };
  
  document.getElementById('infoBtn').onclick = () => {
    const panel = document.getElementById('controlPanel');
    const infoPanel = document.getElementById('infoPanel');
    infoPanel.classList.toggle('active');
    if (infoPanel.classList.contains('active')) {
      panel.classList.remove('active');
    }
  };
}

// Add data layer
function addDataLayer() {
  if (!window.deck || !map) {
    console.log("⚠️ Deck.gl or map not ready");
    return;
  }
  
  const { MapboxOverlay } = deck;
  
  deckOverlay = new MapboxOverlay({
    interleaved: true,
    layers: [createDeckLayer()]
  });
  
  map.addControl(deckOverlay);
  console.log("✅ DATA VISIBLE! Points displayed:", filteredData.length);
}

// Main initialization
(async () => {
  if (!window.deck || !window.deck.ScatterplotLayer) {
    alert("deck.gl libraries not loaded.");
    return;
  }
  
  console.log("🚀 Loading earthquake data...");
  allData = await loadCSVFixed(CSV_URL);
  filteredData = [...allData];
  dataBounds = computeBounds(allData);
  console.log("✅ Loaded", allData.length, "earthquake events");
  
  console.log("🗺️ Initializing map...");
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: [-2.5, 54.5],
    zoom: 6.2,  // 🔥 INCREASED ZOOM - points will be visible!
    pitch: 0,
    bearing: 0
  });
  
  map.addControl(new mapboxgl.NavigationControl(), "top-left");
  
  map.on("error", (e) => {
    console.error("🔥 Mapbox error:", e?.error);
  });
  
  map.getCanvas().addEventListener("mouseleave", hideTooltip);
  
  let styleLoaded = false;
  let mapIdle = false;
  
  const tryAddData = () => {
    if (styleLoaded && mapIdle) {
      console.log("✅ Map ready - adding data!");
      addDataLayer();
      createTimelineChart(allData);
      setupControls();
    }
  };
  
  map.on("style.load", () => {
    console.log("✅ Style loaded");
    styleLoaded = true;
    tryAddData();
  });
  
  map.on("idle", () => {
    if (!mapIdle) {
      console.log("✅ Map idle");
      mapIdle = true;
      
      initialZoom = map.getZoom();
      initialCenter = map.getCenter();
      
      map.setMinZoom(5);  // Allow zoom out a bit
      map.setMaxZoom(15);
      
      map.setMaxBounds([
        [dataBounds[0][0] - 8, dataBounds[0][1] - 5],
        [dataBounds[1][0] + 8, dataBounds[1][1] + 5]
      ]);
      
      tryAddData();
    }
  });
})();