/**
 * map.js — myNAS Map
 * Core map logic: initialisation, marker rendering, clustering, info card, Near Me.
 * Depends on filters.js being loaded first.
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const UAE_CENTER = { lat: 24.47, lng: 54.37 };
const PROVIDERS_URL = "public/providers.json";

// Pin colours  (must match pipeline/build_json.py + css vars)
const PIN_COLORS = {
  "Hospital":           "#E63946",
  "Clinic":             "#4361EE",
  "Day Surgery Center": "#F4A261",
};
const DEFAULT_COLOR = "#6c757d";

// ── Module state ───────────────────────────────────────────────────────────────
let map;
let allProviders   = [];
let allMarkers     = [];       // { marker, provider } pairs
let activeInfoSidebar = null;     // currently displayed provider
let userMarker        = null;     // blue dot for "Near Me"

// MarkerClusterer (loaded from CDN)
let clusterer;

// ── SVG Pin Factory ────────────────────────────────────────────────────────────
function makePinSVG(color) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <filter id="f1" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${color}" flood-opacity="0.35"/>
      </filter>
      <path
        d="M14 0C6.27 0 0 6.27 0 14c0 9.75 14 22 14 22S28 23.75 28 14C28 6.27 21.73 0 14 0z"
        fill="${color}"
        filter="url(#f1)"
      />
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.92"/>
    </svg>
  `.trim();
}

// ── Map Initialisation (called by Google Maps JS API callback) ─────────────────
async function initMap() {
  // Dark map style
  const mapStyle = [
    { elementType: "geometry",        stylers: [{ color: "#1a1d2e" }] },
    { elementType: "labels.text.fill",stylers: [{ color: "#8b92a9" }] },
    { elementType: "labels.text.stroke",stylers:[{ color: "#151724" }] },
    { featureType: "road",            elementType: "geometry",      stylers: [{ color: "#2a2d3e" }] },
    { featureType: "road",            elementType: "geometry.stroke",stylers:[{ color: "#212131" }] },
    { featureType: "road.highway",    elementType: "geometry",      stylers: [{ color: "#344070" }] },
    { featureType: "water",           elementType: "geometry",      stylers: [{ color: "#0f1520" }] },
    { featureType: "poi",             stylers: [{ visibility: "off" }] },
    { featureType: "transit",         stylers: [{ visibility: "off" }] },
    { featureType: "administrative.country", elementType:"geometry.stroke", stylers:[{color:"#3a4060"},{weight:1}] },
    { featureType: "administrative.locality",elementType:"labels.text.fill",stylers:[{color:"#7a85b0"}] },
  ];

  map = new google.maps.Map(document.getElementById("map"), {
    center:            UAE_CENTER,
    zoom:              8,
    disableDefaultUI:  true,
    zoomControl:       true,
    zoomControlOptions:{ position: google.maps.ControlPosition.RIGHT_BOTTOM },
    gestureHandling:   "greedy",
    clickableIcons:    false,
    mapTypeId:         "roadmap",
  });

  // Close info sidebar on map click
  map.addListener("click", hideInfoSidebar);

  // Load MarkerClusterer
  await loadClusterer();

  // Load providers + render
  await loadAndRenderProviders();

  // Boot filters
  FiltersModule.init();
  FiltersModule.onChange(applyFilters);
  
  // Render initial list and markers
  applyFilters(FiltersModule.getFilters());

  // Near Me button
  document.getElementById("btn-near-me").addEventListener("click", findNearMe);

  // Info card close button
  document.getElementById("info-sidebar-close").addEventListener("click", hideInfoSidebar);

  // Hide loading overlay — always, even if providers.json isn't ready yet
  const overlay = document.getElementById("loading-overlay");
  overlay.classList.add("hide");
  setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 600);
}

// ── Load MarkerClusterer from CDN ──────────────────────────────────────────────
function loadClusterer() {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// ── Load providers.json and render all markers ─────────────────────────────────
async function loadAndRenderProviders() {
  try {
    const res = await fetch(PROVIDERS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    allProviders = JSON.parse(text);
  } catch (e) {
    console.warn("providers.json not ready yet:", e.message);
    const countEl = document.getElementById("filter-count");
    if (countEl) countEl.textContent = "⏳ Provider data loading — geocoding in progress...";
    return;
  }

  renderMarkers(allProviders);
  FiltersModule.setResultCount(allProviders.length, allProviders.length);
}

// ── Render markers for a given provider list ───────────────────────────────────
function renderMarkers(providers) {
  // Clear existing
  if (clusterer) clusterer.clearMarkers();
  allMarkers.forEach(({ marker }) => marker.setMap(null));
  allMarkers = [];

  const markers = providers.map((provider) => {
    const color = PIN_COLORS[provider.type] || DEFAULT_COLOR;

    // Use classic Marker (no Map ID required)
    const marker = new google.maps.Marker({
      position: { lat: provider.lat, lng: provider.lng },
      map,
      icon: {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(makePinSVG(color)),
        scaledSize: new google.maps.Size(28, 36),
        anchor: new google.maps.Point(14, 36),
      },
      title: provider.name,
    });
    marker.providerType = provider.type;
    marker.addListener("click", () => showInfoSidebar(provider));

    allMarkers.push({ marker, provider });
    return marker;
  });

  // Cluster
  if (window.markerClusterer) {
    clusterer = new markerClusterer.MarkerClusterer({
      map,
      markers,
      renderer: {
        render: ({ count, position, markers }) => {
          // Smart Cluster Colouring
          let clusterColor = "#4361EE";
          if (markers && markers.length > 0) {
            const types = new Set(markers.map(m => m.providerType));
            if (types.size === 1) {
              clusterColor = PIN_COLORS[Array.from(types)[0]] || clusterColor;
            } else {
              clusterColor = "#4a4e69"; // Mixed colored cluster
            }
          }

          const el = document.createElement("div");
          el.style.cssText = `
            background: ${clusterColor}dd; /* slightly transparent hex */
            color: white;
            border-radius: 50%;
            width: 40px; height: 40px;
            display: flex; align-items: center; justify-content: center;
            font-size: 13px; font-weight: 700;
            font-family: Inter, sans-serif;
            border: 2px solid rgba(255,255,255,0.4);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: transform 0.2s;
          `;
          el.onmouseenter = () => el.style.transform = "scale(1.1)";
          el.onmouseleave = () => el.style.transform = "scale(1)";
          el.textContent = count > 999 ? "999+" : count;

          if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
            return new google.maps.marker.AdvancedMarkerElement({ position, content: el });
          }
          return new google.maps.Marker({
            position,
            icon: { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
                <circle cx="20" cy="20" r="19" fill="${clusterColor}"/>
                <text x="20" y="25" text-anchor="middle" font-size="13" font-weight="700" fill="white" font-family="Inter,sans-serif">${count}</text>
              </svg>`
            ), scaledSize: new google.maps.Size(40, 40) }
          });
        }
      },
      onClusterClick: (event, cluster, map) => {
        // Smart Zoom
        map.fitBounds(cluster.bounds, { padding: 50 });
      }
    });
  }
}

// ── Apply filters from FiltersModule ──────────────────────────────────────────
function applyFilters(filters) {
  const visible = allProviders.filter((p) => FiltersModule.matchesFilters(p));
  renderMarkers(visible);
  FiltersModule.setResultCount(visible.length, allProviders.length);
  FiltersModule.renderProviderList(visible, showInfoSidebar);

  // Close info sidebar if the current provider is now filtered out
  if (activeInfoSidebar && !FiltersModule.matchesFilters(activeInfoSidebar)) {
    hideInfoSidebar();
  }
}

// ── Info Sidebar ──────────────────────────────────────────────────────────────
function showInfoSidebar(provider) {
  activeInfoSidebar = provider;

  // Badge class
  const typeMap = {
    "Hospital": "hospital",
    "Clinic": "clinic",
    "Day Surgery Center": "day-surgery",
  };
  const badge = document.getElementById("info-type-badge");
  badge.textContent = provider.type;
  badge.className = "info-sidebar-type-badge " + (typeMap[provider.type] || "clinic");

  document.getElementById("info-name").textContent    = provider.name;
  document.getElementById("info-region").textContent  = provider.region + ", UAE";
  document.getElementById("info-address").textContent = provider.address || "Address not available";

  const phoneEl = document.getElementById("info-phone");
  if (provider.phone) {
    phoneEl.textContent = provider.phone;
    phoneEl.href        = `tel:${provider.phone}`;
    document.getElementById("info-phone-row").style.display = "flex";
  } else {
    document.getElementById("info-phone-row").style.display = "none";
  }

  // Benefits
  const benefitsEl = document.getElementById("info-benefits");
  benefitsEl.innerHTML = (provider.benefits || [])
    .map((b) => `<span class="benefit-tag">${b}</span>`)
    .join("");

  // Directions
  const directionsEl = document.getElementById("info-directions");
  directionsEl.href = `https://www.google.com/maps/dir/?api=1&destination=${provider.lat},${provider.lng}`;

  // Show sidebar
  const sidebar = document.getElementById("info-sidebar");
  sidebar.classList.add("open");

  // Smart Pan & Zoom
  const targetZoom = map.getZoom() < 13 ? 14 : map.getZoom();
  map.setZoom(targetZoom);
  
  // Pan to item. Then adjust slightly left so the pin is not covered by the right sidebar
  map.panTo({ lat: provider.lat, lng: provider.lng });
  
  // Only pan offset fully on desktop width
  if (window.innerWidth > 768) {
    setTimeout(() => {
      map.panBy(-180, 0); 
    }, 100); // Wait for the initial panTo to resolve
  }
}

function hideInfoSidebar() {
  activeInfoSidebar = null;
  const sidebar = document.getElementById("info-sidebar");
  if (sidebar) sidebar.classList.remove("open");
}

// ── Near Me ───────────────────────────────────────────────────────────────────
function findNearMe() {
  const btn = document.getElementById("btn-near-me");

  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  btn.classList.add("locating");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove("locating");
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;

      // Place/update user dot
      if (userMarker) userMarker.setMap(null);
      userMarker = new google.maps.Marker({
        position: { lat: userLat, lng: userLng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#4361EE",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
        title: "Your location",
        zIndex: 1000,
      });

      // Sort visible markers by distance
      const sorted = allMarkers
        .filter(({ marker }) => marker.getMap() !== null)
        .map(({ marker, provider }) => ({
          provider,
          dist: haversine(userLat, userLng, provider.lat, provider.lng),
        }))
        .sort((a, b) => a.dist - b.dist);

      if (sorted.length > 0) {
        // Pan & zoom to nearest
        map.panTo({ lat: sorted[0].provider.lat, lng: sorted[0].provider.lng });
        map.setZoom(13);
        showInfoSidebar(sorted[0].provider);
      } else {
        map.panTo({ lat: userLat, lng: userLng });
        map.setZoom(12);
      }
    },
    (err) => {
      btn.classList.remove("locating");
      alert("Could not get your location. Please allow location access and try again.");
      console.warn("Geolocation error:", err);
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
