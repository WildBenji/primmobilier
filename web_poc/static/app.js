const addressInput = document.querySelector("#address");
const suggestions = document.querySelector("#suggestions");
const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const targetStreetView = document.querySelector("#targetStreetView");
const estimateBtn = document.querySelector("#estimate");
const resetBtn = document.querySelector("#reset");
const estimationPanel = document.querySelector("#estimationPanel");
const toggleEstimation = document.querySelector("#toggleEstimation");
const expandEstimation = document.querySelector("#expandEstimation");
const baseLayerMenu = document.querySelector("#baseLayerMenu");
const baseLayerLabel = document.querySelector("#baseLayerLabel");
const cadastreMenu = document.querySelector("#cadastreMenu");
const cadastreLabel = document.querySelector("#cadastreLabel");
const comparablesList = document.querySelector("#comparablesList");
const tableMeta = document.querySelector("#tableMeta");
const comparableDetail = document.querySelector("#comparableDetail");
const detailBody = document.querySelector("#detailBody");
const closeDetail = document.querySelector("#closeDetail");
const streetViewPanel = document.querySelector("#streetViewPanel");
const streetViewBody = document.querySelector("#streetViewBody");
const closeStreetView = document.querySelector("#closeStreetView");
const tableWrap = document.querySelector(".table-wrap");
const toggleComparables = document.querySelector("#toggleComparables");
const expandComparables = document.querySelector("#expandComparables");
const sortMenu = document.querySelector(".sort-menu");
const sortToggle = document.querySelector("#sortToggle");
const sortOptions = document.querySelector("#sortOptions");
const sortButtons = document.querySelectorAll("#sortOptions button");
const radiusSlider = document.querySelector("#radiusSlider");
const radiusLabel = document.querySelector("#radiusLabel");
const radiusControl = document.querySelector("#radiusControl");
const historySlider = document.querySelector("#historySlider");
const historyLabel = document.querySelector("#historyLabel");
const scopeButtons = document.querySelectorAll(".scope-control button");
const zoneToggle = document.querySelector("#zoneToggle");
const modeButtons = document.querySelectorAll(".mode-control button");
const estimationFields = document.querySelector("#estimationFields");
const explorationFilters = document.querySelector("#explorationFilters");
const typeChips = document.querySelectorAll("#explorationFilters button");
const marketResult = document.querySelector("#marketResult");
const marketStats = document.querySelector("#marketStats");
const marketCount = document.querySelector("#marketCount");
const marketScope = document.querySelector("#marketScope");
const addressLabel = document.querySelector("#addressLabel");
const maxComparablesInput = document.querySelector("#maxComparables");
const limitControl = document.querySelector("#limitControl");
const radiusSteps = [100, 150, 200, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000, 10000, 20000];
const MARKET_CATEGORIES = ["Maison", "Appartement", "Terrain", "Dépendance", "Local"];
const CATEGORY_COLORS = {
  Maison: "#176b5b",
  Appartement: "#2457c5",
  Terrain: "#8a6d1f",
  "Dépendance": "#9a5b9a",
  Local: "#c4472f"
};
const PANORAMAX_ENDPOINT = "https://panoramax.openstreetmap.fr";
const streetViewCache = new Map();

let selectedAddress = null;
let targetMarker = null;
let currentComparables = [];
let searchTimer = null;
let radiusTimer = null;
let historyTimer = null;
let selectedScope = "radius";
let showZone = true;
let scopeDrawSeq = 0;
let selectedRadius = 1500;
let selectedHistoryYears = 5;
let selectedComparableUid = null;
let lastSelectedUid = null;
let selectedAddressSeq = 0;
let comparableSortKey = "similarity";
let comparableSortDirection = "desc";
let selectedMode = "estimation";
let activeCategories = new Set(MARKET_CATEGORIES);
let runSeq = 0;

const map = new maplibregl.Map({
  container: "map",
  center: [-0.5792, 44.8378],
  zoom: 12,
  style: {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO"
      },
      voyager: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO"
      },
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      },
      ignplan: {
        type: "raster",
        tiles: [
          "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
        ],
        tileSize: 256,
        attribution: "© IGN / cartes.gouv.fr"
      },
      ign: {
        type: "raster",
        tiles: [
          "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
        ],
        tileSize: 256,
        attribution: "© IGN / cartes.gouv.fr"
      },
      // Stadia : clé non requise en local (auth par domaine, OK sur 127.0.0.1/localhost).
      // Un déploiement sur un vrai domaine renverra 401 sans compte Stadia (gratuit). Voir docs/SOURCES_DONNEES.md §8.
      stadiasat: {
        type: "raster",
        tiles: ["https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg"],
        tileSize: 256,
        maxzoom: 20,
        attribution: "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors"
      },
      comparables: {
        type: "geojson",
        data: emptyFeatureCollection()
      },
      targetRadius: {
        type: "geojson",
        data: emptyFeatureCollection()
      },
      cadastre: {
        type: "geojson",
        data: emptyFeatureCollection()
      },
      parcelleDetail: {
        type: "geojson",
        data: emptyFeatureCollection()
      }
    },
    layers: [
      { id: "base-carto", type: "raster", source: "carto", layout: { visibility: "none" } },
      { id: "base-voyager", type: "raster", source: "voyager", layout: { visibility: "none" } },
      { id: "base-osm", type: "raster", source: "osm", layout: { visibility: "none" } },
      { id: "base-ignplan", type: "raster", source: "ignplan" },
      { id: "base-ign", type: "raster", source: "ign", layout: { visibility: "none" } },
      { id: "base-stadiasat", type: "raster", source: "stadiasat", layout: { visibility: "none" } },
      {
        id: "cadastre-lines",
        type: "line",
        source: "cadastre",
        paint: { "line-color": "#7048e8", "line-width": 1.2, "line-opacity": 0.85 }
      },
      {
        id: "target-radius-fill",
        type: "fill",
        source: "targetRadius",
        paint: {
          "fill-color": "rgba(36, 87, 197, 0.10)",
          "fill-outline-color": "rgba(36, 87, 197, 0.35)"
        }
      },
      {
        id: "target-radius-line",
        type: "line",
        source: "targetRadius",
        paint: {
          "line-color": "#2457c5",
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.75
        }
      },
      {
        id: "parcelle-detail-outline",
        type: "line",
        source: "parcelleDetail",
        filter: ["==", ["get", "kind"], "parcelle"],
        paint: { "line-color": "#7048e8", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.9 }
      },
      {
        id: "parcelle-detail-bati-fill",
        type: "fill",
        source: "parcelleDetail",
        filter: ["==", ["get", "kind"], "batiment"],
        paint: {
          "fill-color": ["case", ["boolean", ["feature-state", "hover"], false],
            "#ffd24a",
            ["match", ["get", "type"], "02", "#f0a020", "#e0533d"]],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.8, 0.5]
        }
      },
      {
        id: "parcelle-detail-bati-line",
        type: "line",
        source: "parcelleDetail",
        filter: ["==", ["get", "kind"], "batiment"],
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "hover"], false],
            "#b06a00",
            ["match", ["get", "type"], "02", "#b8741a", "#a83523"]],
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 1.2]
        }
      },
      {
        id: "comparables-heat",
        type: "heatmap",
        source: "comparables",
        maxzoom: 16,
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "similarity"],
            0, 0.18,
            60, 0.7,
            100, 1
          ],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 15, 1.25],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 14, 15, 30],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.78, 17, 0.25],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(23, 107, 91, 0)",
            0.25, "rgba(70, 155, 132, 0.45)",
            0.55, "rgba(238, 181, 82, 0.72)",
            0.85, "rgba(196, 71, 47, 0.86)"
          ]
        }
      },
      {
        id: "comparables-halo",
        type: "circle",
        source: "comparables",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "similarity"],
            0, 10,
            60, 20,
            100, 34
          ],
          "circle-color": [
            "interpolate", ["linear"], ["get", "similarity"],
            0, "rgba(196, 71, 47, 0.22)",
            60, "rgba(238, 181, 82, 0.28)",
            100, "rgba(23, 107, 91, 0.34)"
          ],
          "circle-blur": 0.65,
          // Le halo (glow d'aperçu) disparaît au zoom rapproché pour ne pas voiler le cadastre.
          // `zoom` doit être l'entrée de premier niveau d'interpolate (pas d'imbrication).
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 15.5, 0.68, 17, 0]
        }
      },
      {
        id: "comparables-points",
        type: "circle",
        source: "comparables",
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            12,
            ["interpolate", ["linear"], ["get", "similarity"], 0, 5, 60, 8, 100, 13]
          ],
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#0f6f9f",
            ["interpolate", ["linear"], ["get", "similarity"], 0, "#c4472f", 60, "#eeb552", 100, "#176b5b"]
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.8],
          // Au zoom rapproché, le remplissage s'efface : le point devient un anneau
          // qui encadre le bâtiment au lieu de le masquer (le contour blanc reste).
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0.92, 17.2, 0.1]
        }
      }
    ]
  }
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
map.doubleClickZoom.disable();

const BASE_LAYERS = ["carto", "voyager", "osm", "ignplan", "ign", "stadiasat"];
for (const button of baseLayerMenu.querySelectorAll("[data-layer]")) {
  button.addEventListener("click", () => {
    const value = button.dataset.layer;
    for (const id of BASE_LAYERS) {
      map.setLayoutProperty(`base-${id}`, "visibility", id === value ? "visible" : "none");
    }
    baseLayerLabel.textContent = button.textContent;
    for (const other of baseLayerMenu.querySelectorAll("[data-layer]")) {
      other.classList.toggle("active", other === button);
    }
    // Le menu reste en hover : on le referme une fois le fond choisi.
    baseLayerMenu.classList.add("just-picked");
  });
}
// On réactive le hover dès que la souris quitte le menu.
baseLayerMenu.addEventListener("mouseleave", () => {
  baseLayerMenu.classList.remove("just-picked");
});

let cadastreTimer = null;
let cadastreMode = "none";

function setCadastreMode(value, { apply = false } = {}) {
  cadastreMode = value;
  for (const button of cadastreMenu.querySelectorAll("[data-cadastre]")) {
    const on = button.dataset.cadastre === value;
    button.classList.toggle("active", on);
    if (on) cadastreLabel.textContent = button.textContent;
  }
  if (apply) applyCadastre();
}

for (const button of cadastreMenu.querySelectorAll("[data-cadastre]")) {
  button.addEventListener("click", () => {
    setCadastreMode(button.dataset.cadastre, { apply: true });
    cadastreMenu.classList.add("just-picked");
  });
}
cadastreMenu.addEventListener("mouseleave", () => {
  cadastreMenu.classList.remove("just-picked");
});

map.on("moveend", () => {
  if (cadastreMode !== "all") return;
  clearTimeout(cadastreTimer);
  cadastreTimer = setTimeout(loadCadastreViewport, 250);
});

function currentDept() {
  if (!selectedAddress) return null;
  const cc = selectedAddress.properties.citycode || "";
  return cc.startsWith("97") ? cc.slice(0, 3) : cc.slice(0, 2);
}

function setCadastre(featureCollection) {
  const source = map.getSource("cadastre");
  if (source) source.setData(featureCollection || emptyFeatureCollection());
}

function setParcelleDetail(featureCollection) {
  const source = map.getSource("parcelleDetail");
  if (source) source.setData(featureCollection || emptyFeatureCollection());
  hoveredBatiId = null; // setData réinitialise les feature-states
}

// Survol d'un bâtiment dans la liste -> illumine son empreinte sur la carte.
let hoveredBatiId = null;

function setBatiHover(id) {
  if (id === hoveredBatiId) return;
  if (hoveredBatiId !== null) {
    map.setFeatureState({ source: "parcelleDetail", id: hoveredBatiId }, { hover: false });
  }
  hoveredBatiId = id;
  if (id !== null) {
    map.setFeatureState({ source: "parcelleDetail", id }, { hover: true });
  }
}

// Dessine la parcelle + ses bâtiments cadastraux du comparable sélectionné et
// remplit la sous-section « Bâti cadastral » du détail.
async function loadComparableBatiments(row) {
  const container = document.querySelector("#detailBatiments");
  const dept = currentDept();
  if (!dept || !row.id_parcelle) {
    setParcelleDetail(null);
    if (container) container.innerHTML = `<span class="street-muted">Parcelle non renseignée.</span>`;
    return;
  }
  const url = new URL("/api/batiments", window.location.origin);
  url.searchParams.set("dept", dept);
  url.searchParams.set("parcelle", row.id_parcelle);
  let data = null;
  try {
    const response = await fetch(url);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  if (selectedComparableUid !== row.uid) return; // sélection changée entre-temps
  if (!data || !data.features.length) {
    setParcelleDetail(null);
    if (container) container.innerHTML = `<span class="street-muted">Cadastre indisponible pour cette parcelle.</span>`;
    return;
  }
  // Id stable par bâtiment (= idx) pour piloter le feature-state au survol de la liste.
  for (const f of data.features) {
    if (f.properties.kind === "batiment") f.id = f.properties.idx;
  }
  setParcelleDetail(data);
  const batiments = data.features.filter((f) => f.properties.kind === "batiment");
  if (container) container.innerHTML = renderBatimentsList(batiments);
}

function renderBatimentsList(batiments) {
  if (!batiments.length) {
    return `<span class="street-muted">Aucun bâti cadastral sur la parcelle (terrain nu / jardin).</span>`;
  }
  const total = batiments.reduce((sum, b) => sum + (b.properties.surface_m2 || 0), 0);
  const items = batiments.map((b) => {
    const p = b.properties;
    const surf = p.surface_m2 != null ? `${int(p.surface_m2)} m²` : "-";
    const maj = p.annee ? ` Entré au cadastre en ${p.annee} (date de relevé, pas l'année de construction).` : "";
    const hint = `Empreinte au sol du bâtiment (aire au sol, pas la surface habitable).${maj}`;
    return `<div class="detail-field bati-item" data-bati-idx="${p.idx}"><span>${escapeHtml(p.type_label)} <span class="hint" data-tip="${escapeHtml(hint)}">?</span></span><b>${surf}</b></div>`;
  }).join("");
  const plural = batiments.length > 1 ? "s" : "";
  const headHint = "Somme des empreintes au sol des bâtiments de la parcelle (aire au sol) — différente de la surface habitable DVF et de l'emprise BDNB, qui viennent d'autres sources.";
  return `
    <div class="batiments-head">${batiments.length} bâtiment${plural} · emprise au sol ${int(total)} m² <span class="hint" data-tip="${escapeHtml(headHint)}">?</span></div>
    <div class="detail-grid">${items}</div>
  `;
}

function applyCadastre() {
  const mode = cadastreMode;
  if (mode === "biens") {
    loadCadastreBiens();
  } else if (mode === "all") {
    loadCadastreViewport();
  } else {
    setCadastre(null);
  }
}

async function loadCadastreBiens() {
  const dept = currentDept();
  const ids = [...new Set(currentComparables.map((r) => r.id_parcelle).filter(Boolean))];
  if (!dept || !ids.length) {
    setCadastre(null);
    setStatus("Cadastre « Biens » : lance d'abord une estimation ou une exploration.");
    return;
  }
  const url = new URL("/api/parcelles", window.location.origin);
  url.searchParams.set("dept", dept);
  url.searchParams.set("ids", ids.join(","));
  const response = await fetch(url);
  setCadastre(await response.json());
}

async function loadCadastreViewport() {
  if (cadastreMode !== "all") return;
  const dept = currentDept();
  if (!dept) {
    setCadastre(null);
    setStatus("Cadastre « Tout » : sélectionne d'abord une adresse (pour connaître le département).");
    return;
  }
  if (map.getZoom() < 14) {
    setCadastre(null);
    setStatus("Cadastre « Tout » : zoome (niveau 14+) pour afficher les parcelles.");
    return;
  }
  const b = map.getBounds();
  const url = new URL("/api/parcelles", window.location.origin);
  url.searchParams.set("dept", dept);
  url.searchParams.set("bbox", [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(","));
  const response = await fetch(url);
  setCadastre(await response.json());
}

const appEl = document.querySelector(".app");

// `positionedEls` move together (open panel + its collapsed button share a position);
// `sourceEl` is the currently visible element measured for clamping and start offset.
function makeDraggable(positionedEls, handle, sourceEl) {
  if (!handle || !sourceEl) return;
  handle.classList.add("drag-handle");
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let dragging = false;
  let moved = false;

  const setPosition = (left, top) => {
    for (const el of positionedEls) {
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    }
  };

  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const interactive = event.target.closest("button, input, select, a");
    if (interactive && interactive !== handle) return;
    const rect = sourceEl.getBoundingClientRect();
    const base = appEl.getBoundingClientRect();
    startLeft = rect.left - base.left;
    startTop = rect.top - base.top;
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    moved = false;
    document.body.classList.add("dragging");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    moved = true;
    const base = appEl.getBoundingClientRect();
    const maxLeft = Math.max(base.width - sourceEl.offsetWidth, 0);
    const maxTop = Math.max(base.height - sourceEl.offsetHeight, 0);
    const left = Math.min(Math.max(startLeft + event.clientX - startX, 0), maxLeft);
    const top = Math.min(Math.max(startTop + event.clientY - startY, 0), maxTop);
    setPosition(left, top);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("dragging");
  });

  // Swallow the click that ends a drag so dragging a collapsed button doesn't toggle it.
  handle.addEventListener("click", (event) => {
    if (!moved) return;
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);

  handle.addEventListener("dblclick", (event) => {
    const interactive = event.target.closest("button, input, select, a");
    if (interactive && interactive !== handle) return;
    for (const el of positionedEls) {
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
    }
  });
}

const mapControls = appEl.querySelector(".map-controls");
makeDraggable([estimationPanel, expandEstimation], estimationPanel.querySelector(".brand"), estimationPanel);
makeDraggable([estimationPanel, expandEstimation], expandEstimation, expandEstimation);
makeDraggable([mapControls], mapControls, mapControls);
makeDraggable([tableWrap], tableWrap.querySelector(".list-panel .table-head"), tableWrap);
makeDraggable([tableWrap], expandComparables, tableWrap);
makeDraggable([streetViewPanel], streetViewPanel.querySelector(".table-head"), streetViewPanel);

addressInput.addEventListener("input", () => {
  selectedAddress = null;
  targetStreetView.hidden = true;
  streetViewPanel.hidden = true;
  clearTimeout(searchTimer);
  const q = addressInput.value.trim();
  if (q.length < 3) {
    suggestions.hidden = true;
    return;
  }
  searchTimer = setTimeout(() => searchAddress(q), 250);
});

estimationPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const tag = event.target.tagName;
  if (!["INPUT", "SELECT"].includes(tag)) return;
  event.preventDefault();
  run();
});

estimateBtn.addEventListener("click", run);
resetBtn.addEventListener("click", resetAll);

// Le type (Appartement / Maison) est pris en compte immédiatement à la sélection.
document.querySelector("#type").addEventListener("change", () => {
  if (selectedAddress) run();
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    for (const other of modeButtons) {
      other.classList.toggle("active", other === button);
    }
    applyMode();
    if (selectedAddress) run();
  });
}

for (const chip of typeChips) {
  chip.addEventListener("click", () => {
    const cat = chip.dataset.cat;
    if (cat === "all") {
      activeCategories = new Set(MARKET_CATEGORIES);
    } else if (activeCategories.size === MARKET_CATEGORIES.length) {
      activeCategories = new Set([cat]);
    } else if (activeCategories.has(cat)) {
      activeCategories.delete(cat);
      if (activeCategories.size === 0) activeCategories = new Set(MARKET_CATEGORIES);
    } else {
      activeCategories.add(cat);
    }
    updateChips();
    if (selectedAddress) runMarket();
  });
}

for (const button of scopeButtons) {
  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }
    selectedScope = button.dataset.scope;
    for (const other of scopeButtons) {
      other.classList.toggle("active", other === button);
    }
    radiusControl.hidden = selectedScope !== "radius";
    if (selectedAddress) {
      updateScopeGeometry();
      run();
    }
  });
}

zoneToggle.addEventListener("change", () => {
  showZone = zoneToggle.checked;
  setZoneVisibility(showZone);
});

radiusSlider.addEventListener("input", () => {
  selectedRadius = radiusSteps[Number(radiusSlider.value)];
  radiusLabel.textContent = formatRadius(selectedRadius);
  clearTimeout(radiusTimer);
  if (selectedAddress && selectedScope === "radius") {
    const [lon, lat] = selectedAddress.geometry.coordinates;
    setRadiusGeojson(lon, lat, selectedRadius);
    map.easeTo({ center: [lon, lat], zoom: zoomForRadius(selectedRadius), duration: 250 });
    radiusTimer = setTimeout(run, 300);
  }
});

maxComparablesInput.addEventListener("change", () => {
  if (selectedAddress) run();
});

maxComparablesInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  // On retire le focus : le `change` déclenché par le blur relance une seule fois,
  // ça enlève le caret et évite le double-run (glitch) au clic à côté.
  maxComparablesInput.blur();
});

historySlider.addEventListener("input", () => {
  selectedHistoryYears = Number(historySlider.value);
  historyLabel.textContent = formatHistory(selectedHistoryYears);
  clearTimeout(historyTimer);
  if (selectedAddress) {
    historyTimer = setTimeout(run, 300);
  }
});

closeDetail.addEventListener("click", () => {
  comparableDetail.hidden = true;
  tableWrap.classList.remove("detail-open");
  selectComparable(null, { fit: false });
});

toggleComparables.addEventListener("click", () => {
  selectedComparableUid = null;
  comparableDetail.hidden = true;
  tableWrap.classList.remove("detail-open");
  tableWrap.classList.add("collapsed");
});

expandComparables.addEventListener("click", () => {
  tableWrap.classList.remove("collapsed");
});

sortToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  sortMenu.classList.add("open");
  sortToggle.setAttribute("aria-expanded", "true");
});

for (const button of sortButtons) {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const key = button.dataset.sort;
    if (comparableSortKey === key) {
      comparableSortDirection = comparableSortDirection === "desc" ? "asc" : "desc";
    } else {
      comparableSortKey = key;
      comparableSortDirection = "desc";
    }
    sortMenu.classList.remove("open");
    sortToggle.setAttribute("aria-expanded", "false");
    updateSortControl();
    renderComparableList();
  });
}

document.addEventListener("click", () => {
  sortMenu.classList.remove("open");
  sortToggle.setAttribute("aria-expanded", "false");
});

toggleEstimation.addEventListener("click", () => {
  estimationPanel.classList.add("collapsed");
});

expandEstimation.addEventListener("click", () => {
  estimationPanel.classList.remove("collapsed");
});

closeStreetView.addEventListener("click", () => {
  streetViewPanel.hidden = true;
});

map.on("click", "comparables-points", (event) => {
  const feature = event.features && event.features[0];
  if (!feature) return;
  // Les points hors liste (au-delà du « Max ») n'ont que les champs allégés : on bâtit
  // un détail minimal depuis les propriétés de la feature (+ coords de la géométrie).
  const fallbackRow = { ...feature.properties, lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] };
  selectComparable(Number(feature.properties.uid), { fit: false }, fallbackRow);
});

map.on("mouseenter", "comparables-points", () => {
  map.getCanvas().style.cursor = "pointer";
});

map.on("mouseleave", "comparables-points", () => {
  map.getCanvas().style.cursor = "";
});

// Double-clic SUR un comparable : zoom rapproché (pas au max) + ouverture du détail.
map.on("dblclick", "comparables-points", (event) => {
  const feature = event.features && event.features[0];
  if (!feature) return;
  const fallbackRow = { ...feature.properties, lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] };
  selectComparable(Number(feature.properties.uid), { force: true }, fallbackRow);
  map.easeTo({ center: feature.geometry.coordinates, zoom: 16.5, duration: 600 });
});

// Double-clic ailleurs : on garde le recentrage + géocodage inverse (nouvelle adresse cible).
map.on("dblclick", async (event) => {
  const onComparable = map.queryRenderedFeatures(event.point, { layers: ["comparables-points"] });
  if (onComparable.length) return; // géré par le handler dédié ci-dessus
  const { lng, lat } = event.lngLat;
  await reverseGeocodeAndSelect(lng, lat);
});

async function searchAddress(q) {
  setStatus("Recherche d'adresse...");
  const url = new URL("https://api-adresse.data.gouv.fr/search/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("autocomplete", "1");
  const response = await fetch(url);
  const data = await response.json();
  showSuggestions(data.features || []);
  setStatus("Choisis une adresse puis lance l'estimation.");
}

async function reverseGeocodeAndSelect(lon, lat) {
  setStatus("Recherche de l'adresse la plus proche...");
  const url = new URL("https://api-adresse.data.gouv.fr/reverse/");
  url.searchParams.set("lon", lon);
  url.searchParams.set("lat", lat);
  url.searchParams.set("limit", "1");
  try {
    const response = await fetch(url);
    const data = await response.json();
    const feature = data.features && data.features[0];
    if (!feature) {
      setStatus("Aucune adresse trouvée à cet endroit.");
      return;
    }
    selectAddress(feature);
  } catch {
    setStatus("Impossible de retrouver une adresse à cet endroit.");
  }
}

function showSuggestions(features) {
  suggestions.innerHTML = "";
  if (!features.length) {
    suggestions.hidden = true;
    return;
  }
  for (const feature of features) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = feature.properties.label;
    button.addEventListener("click", () => selectAddress(feature));
    suggestions.append(button);
  }
  suggestions.hidden = false;
}

function selectAddress(feature) {
  selectedAddress = feature;
  selectedAddressSeq += 1;
  const addressSeq = selectedAddressSeq;
  addressInput.value = feature.properties.label;
  suggestions.hidden = true;
  const [lon, lat] = feature.geometry.coordinates;
  setTargetMarker(lon, lat);
  updateScopeGeometry();
  map.flyTo({ center: [lon, lat], zoom: selectedScope === "radius" ? zoomForRadius(selectedRadius) : 13.4 });
  setStatus(`${feature.properties.postcode || ""} ${feature.properties.city || ""}`.trim());
  loadTargetStreetView(lon, lat, feature.properties.label, addressSeq);
  run();
}

function run() {
  if (selectedMode === "exploration") {
    runMarket();
  } else {
    estimate();
  }
}

function resetAll() {
  // Formulaire -> valeurs initiales
  addressInput.value = "";
  suggestions.hidden = true;
  document.querySelector("#type").value = "Appartement";
  document.querySelector("#surface").value = "65";
  document.querySelector("#rooms").value = "3";
  document.querySelector("#askedPrice").value = "";
  maxComparablesInput.value = "200";
  radiusSlider.value = "7";
  selectedRadius = radiusSteps[7];
  radiusLabel.textContent = formatRadius(selectedRadius);
  historySlider.value = "5";
  selectedHistoryYears = 5;
  historyLabel.textContent = formatHistory(selectedHistoryYears);

  // Emprise -> rayon
  selectedScope = "radius";
  for (const b of scopeButtons) {
    b.classList.toggle("active", b.dataset.scope === "radius");
  }
  radiusControl.hidden = false;

  // Zone affichée par défaut
  showZone = true;
  zoneToggle.checked = true;
  setZoneVisibility(true);

  // Mode -> estimation, chips -> tous
  selectedMode = "estimation";
  for (const b of modeButtons) {
    b.classList.toggle("active", b.dataset.mode === "estimation");
  }
  activeCategories = new Set(MARKET_CATEGORIES);
  updateChips();

  // Adresse / marqueur / géométries
  selectedAddress = null;
  selectedAddressSeq += 1;
  if (targetMarker) {
    targetMarker.remove();
    targetMarker = null;
  }
  clearScopeGeojson();
  setCadastreMode("none");
  setCadastre(null);
  setParcelleDetail(null);

  // Vide la carte, les résultats et les comparables (via applyMode), puis les panneaux annexes
  applyMode();
  targetStreetView.hidden = true;
  streetViewPanel.hidden = true;

  map.flyTo({ center: [-0.5792, 44.8378], zoom: 12 });
  setStatus("Sélectionne une adresse en Gironde ou Lot-et-Garonne.");
}

function applyMode() {
  const explore = selectedMode === "exploration";
  estimationFields.hidden = explore;
  explorationFilters.hidden = !explore;
  limitControl.hidden = false;
  addressLabel.textContent = explore ? "Adresse, code postal ou commune" : "Adresse";
  estimateBtn.textContent = explore ? "Explorer" : "Estimer";
  resultEl.hidden = true;
  marketResult.hidden = true;
  comparableDetail.hidden = true;
  tableWrap.classList.remove("detail-open");
  currentComparables = [];
  comparablesList.innerHTML = "";
  setComparableGeojson([]);
  tableMeta.textContent = "Aucun calcul";
  tableWrap.classList.add("collapsed");
  applyMapMode();
}

function applyMapMode() {
  const explore = selectedMode === "exploration";
  map.setLayoutProperty("comparables-heat", "visibility", explore ? "none" : "visible");
  map.setLayoutProperty("comparables-halo", "visibility", explore ? "none" : "visible");
  if (explore) {
    map.setPaintProperty("comparables-points", "circle-color", [
      "match", ["get", "categorie"],
      "Maison", CATEGORY_COLORS.Maison,
      "Appartement", CATEGORY_COLORS.Appartement,
      "Terrain", CATEGORY_COLORS.Terrain,
      "Dépendance", CATEGORY_COLORS["Dépendance"],
      "Local", CATEGORY_COLORS.Local,
      "#66736d"
    ]);
    map.setPaintProperty("comparables-points", "circle-radius",
      ["case", ["boolean", ["feature-state", "selected"], false], 11, 6]);
    map.setPaintProperty("comparables-points", "circle-stroke-width",
      ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.4]);
  } else {
    map.setPaintProperty("comparables-points", "circle-color", [
      "case", ["boolean", ["feature-state", "selected"], false], "#0f6f9f",
      ["interpolate", ["linear"], ["get", "similarity"], 0, "#c4472f", 60, "#eeb552", 100, "#176b5b"]
    ]);
    map.setPaintProperty("comparables-points", "circle-radius", [
      "case", ["boolean", ["feature-state", "selected"], false], 12,
      ["interpolate", ["linear"], ["get", "similarity"], 0, 5, 60, 8, 100, 13]
    ]);
    map.setPaintProperty("comparables-points", "circle-stroke-width",
      ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.8]);
  }
}

function updateChips() {
  const allActive = activeCategories.size === MARKET_CATEGORIES.length;
  for (const chip of typeChips) {
    const cat = chip.dataset.cat;
    if (cat === "all") {
      chip.classList.toggle("active", allActive);
    } else {
      chip.classList.toggle("active", !allActive && activeCategories.has(cat));
    }
  }
}

async function runMarket() {
  if (!selectedAddress) {
    setStatus("Choisis une adresse, un code postal ou une commune.");
    return;
  }
  const props = selectedAddress.properties;
  const [lon, lat] = selectedAddress.geometry.coordinates;
  const dept = currentDept() || "";
  const types = activeCategories.size === MARKET_CATEGORIES.length ? "" : [...activeCategories].join(",");
  const seq = ++runSeq;

  const params = new URLSearchParams({
    dept,
    lon,
    lat,
    postcode: props.postcode || "",
    citycode: props.citycode || "",
    scope_mode: selectedScope,
    radius_m: String(selectedRadius),
    history_years: String(selectedHistoryYears),
    max_comparables: maxComparablesInput.value || "200",
    types
  });

  updateScopeGeometry();
  resultEl.hidden = true;
  setStatus("Lecture du marché local...");
  const data = await fetchJson(`/api/market?${params}`);
  if (seq !== runSeq) return;
  if (data.error) {
    marketResult.hidden = true;
    setComparableGeojson([]);
    comparableDetail.hidden = true;
    tableWrap.classList.remove("detail-open");
    currentComparables = [];
    comparablesList.innerHTML = "";
    tableMeta.textContent = "Aucun résultat";
    tableWrap.classList.add("collapsed");
    map.flyTo({ center: [lon, lat], zoom: selectedScope === "radius" ? zoomForRadius(selectedRadius) : 13.4 });
    setStatus(data.error);
    return;
  }
  renderMarket(data);
  drawScope(data.target);
  if (cadastreMode === "biens") loadCadastreBiens();
  setStatus(`Marché local — ${data.summary.scope}, ${data.summary.history}.`);
}

function renderMarket(data) {
  marketResult.hidden = false;
  marketCount.textContent = int(data.summary.count);
  marketScope.textContent = data.summary.scope;
  marketStats.innerHTML = "";
  for (const t of data.summary.types) {
    const row = document.createElement("div");
    row.className = `market-row${t.qualite === "indicatif" ? " indicatif" : ""}`;
    row.innerHTML = `
      <span class="cat"><span class="dot" style="background:${CATEGORY_COLORS[t.categorie] || "#66736d"}"></span>${escapeHtml(String(t.categorie || ""))}</span>
      <span class="sub">${int(t.count)} ventes · ${euro(t.median_prix)} médian${t.qualite === "indicatif" ? " · indicatif" : ""}</span>
      <span class="m2">${int(t.median_m2)} €/m²</span>
    `;
    marketStats.append(row);
  }
  renderComparables(data.biens, data.points, data.summary.count);
}

async function estimate() {
  if (!selectedAddress) {
    setStatus("Sélectionne d'abord une adresse dans la liste.");
    return;
  }
  const props = selectedAddress.properties;
  const [lon, lat] = selectedAddress.geometry.coordinates;
  const dept = currentDept() || "";
  const seq = ++runSeq;

  const params = new URLSearchParams({
    dept,
    lon,
    lat,
    postcode: props.postcode || "",
    citycode: props.citycode || "",
    type: document.querySelector("#type").value,
    surface: document.querySelector("#surface").value,
    rooms: document.querySelector("#rooms").value,
    asked_price: document.querySelector("#askedPrice").value,
    scope_mode: selectedScope,
    radius_m: String(selectedRadius),
    history_years: String(selectedHistoryYears),
    max_comparables: maxComparablesInput.value || "200"
  });

  updateScopeGeometry();
  setStatus("Calcul des comparables...");
  const data = await fetchJson(`/api/estimate?${params}`);
  if (seq !== runSeq) return;
  if (data.error) {
    resultEl.hidden = true;
    targetStreetView.hidden = true;
    setComparableGeojson([]);
    comparableDetail.hidden = true;
    tableWrap.classList.remove("detail-open");
    currentComparables = [];
    comparablesList.innerHTML = "";
    tableMeta.textContent = "Aucun résultat";
    tableWrap.classList.add("collapsed");
    map.flyTo({ center: [lon, lat], zoom: selectedScope === "radius" ? zoomForRadius(selectedRadius) : 13.4 });
    setStatus(data.error);
    return;
  }
  renderResult(data);
  renderComparables(data.comparables, data.points, data.summary.count);
  drawScope(data.target);
  if (cadastreMode === "biens") loadCadastreBiens();
  setStatus("");
}

function renderResult(data) {
  const summary = data.summary;
  resultEl.hidden = false;
  marketResult.hidden = true;
  document.querySelector("#estimatedPrice").textContent = euro(summary.estimated_price);
  document.querySelector("#medianM2").textContent = int(summary.median_m2);
  document.querySelector("#count").textContent = summary.count;
  document.querySelector("#scope").textContent = summary.scope;
  document.querySelector("#range").textContent =
    `Fourchette observée: ${euro(summary.low_price)} à ${euro(summary.high_price)} pour ${summary.scope} · ${summary.history} · confiance ${summary.confidence}`;
  document.querySelector("#askedPosition").textContent = summary.asked_position_pct === null
    ? ""
    : `Prix soumis: percentile ${summary.asked_position_pct} des comparables`;
}

function renderComparables(rows, points, total) {
  currentComparables = rows;
  setComparableGeojson(points || rows);
  selectedComparableUid = null;
  lastSelectedUid = null;
  comparableDetail.hidden = true;
  tableWrap.classList.remove("detail-open");
  tableWrap.classList.remove("collapsed");
  setParcelleDetail(null);
  tableMeta.textContent = `${rows.length}/${total ?? rows.length} affichés`;
  // Si on a demandé plus de comparables qu'il n'en existe, on ramène le champ « Max » au réel disponible.
  if (total != null) {
    maxComparablesInput.value = String(Math.min(Number(maxComparablesInput.value) || 200, total));
  }
  updateSortControl();
  renderComparableList();
  if (selectedAddress) {
    updateScopeGeometry();
  }
}

function renderComparableList() {
  comparablesList.innerHTML = "";
  for (const row of sortedComparables()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "comparable";
    item.dataset.uid = row.uid;
    item.classList.toggle("selected", row.uid === selectedComparableUid);
    item.innerHTML = `
      <b>${int(row.prix_m2)} €/m²</b>
      <b>${euro(row.prix)}</b>
      <span>${escapeHtml(row.commune || "")} · ${int(row.distance_m)} m · ${escapeHtml(String(row.surface ?? "-"))} m² · ${escapeHtml(String(row.pieces || "-"))} p.</span>
      <span>${escapeHtml(row.date_mutation || "")}</span>
    `;
    item.addEventListener("click", () => selectComparable(row.uid, { fit: true }));
    comparablesList.append(item);
  }
}

function sortedComparables() {
  if (!comparableSortKey) {
    return currentComparables;
  }
  const direction = comparableSortDirection === "desc" ? -1 : 1;
  return [...currentComparables].sort((a, b) => {
    const left = comparableSortValue(a);
    const right = comparableSortValue(b);
    if (left === right) return a.distance_m - b.distance_m;
    return left > right ? direction : -direction;
  });
}

function comparableSortValue(row) {
  if (comparableSortKey === "similarity") return Number(row.similarity) || 0;
  if (comparableSortKey === "price") return Number(row.prix) || 0;
  if (comparableSortKey === "date") return Date.parse(row.date_mutation) || 0;
  if (comparableSortKey === "surface") return Number(row.surface) || 0;
  return Number(row.distance_m) || 0;
}

function updateSortControl() {
  const arrow = comparableSortDirection === "desc" ? "↑" : "↓";
  const labels = {
    similarity: `Similarité ${arrow}`,
    price: `Prix ${arrow}`,
    date: `Date ${arrow}`,
    surface: `m² ${arrow}`
  };
  sortToggle.textContent = comparableSortKey ? labels[comparableSortKey] : "Trier";
  for (const button of sortButtons) {
    button.classList.toggle("active", button.dataset.sort === comparableSortKey);
    button.textContent = button.dataset.sort === comparableSortKey
      ? `${sortLabel(button.dataset.sort)} ${arrow}`
      : sortLabel(button.dataset.sort);
  }
}

function sortLabel(key) {
  if (key === "similarity") return "Similarité";
  if (key === "price") return "Prix";
  if (key === "date") return "Date";
  return "m²";
}

async function loadTargetStreetView(lon, lat, label, addressSeq) {
  targetStreetView.hidden = false;
  targetStreetView.innerHTML = `<span class="street-muted">Recherche d'une vue rue ouverte...</span>`;
  const view = await findPanoramaxImage(lon, lat);
  if (!selectedAddress || selectedAddressSeq !== addressSeq) return;
  if (!view) {
    targetStreetView.innerHTML = `<span class="street-muted">Aucune vue rue ouverte à proximité.</span>`;
    return;
  }
  targetStreetView.innerHTML = `
    <div class="street-action">
      <span>Vue rue trouvée à ${int(view.distance_m)} m</span>
      <button type="button">Vue rue</button>
    </div>
  `;
  targetStreetView.querySelector("button").addEventListener("click", () => {
    openStreetView(view, label || "Adresse cible");
  });
}

function setTargetMarker(lon, lat) {
  if (targetMarker) targetMarker.remove();
  const el = document.createElement("div");
  el.className = "marker target";
  targetMarker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
}

function setRadiusGeojson(lon, lat, radiusM) {
  const source = map.getSource("targetRadius");
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circleCoordinates(lon, lat, radiusM)] },
      properties: { radius_m: radiusM }
    }]
  });
}

function setScopePolygon(geometry) {
  const source = map.getSource("targetRadius");
  if (source) {
    source.setData({ type: "Feature", geometry, properties: {} });
  }
}

function fitToGeometry(geometry) {
  const bounds = new maplibregl.LngLatBounds();
  const extend = (coords) => {
    if (typeof coords[0] === "number") {
      bounds.extend(coords);
    } else {
      for (const c of coords) extend(c);
    }
  };
  extend(geometry.coordinates);
  map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 500 });
}

// L'emprise section est un polygone résolu côté serveur : on le dessine depuis la réponse.
function drawScope(target) {
  if (target && target.section) {
    setScopePolygon(target.section.geojson);
    fitToGeometry(target.section.geojson);
  }
}

function updateScopeGeometry() {
  if (!selectedAddress) return;
  const [lon, lat] = selectedAddress.geometry.coordinates;
  if (selectedScope === "radius") {
    setRadiusGeojson(lon, lat, selectedRadius);
    map.easeTo({ center: [lon, lat], zoom: zoomForRadius(selectedRadius), duration: 450 });
    return;
  }
  if (selectedScope === "cadastre") {
    return; // polygone dessiné par drawScope() depuis la réponse serveur
  }
  // Code postal / commune : contours administratifs réels via geo.api.gouv.fr.
  drawAdminScope(lon, lat);
}

// Contours commune (citycode) ou code postal (union des communes) en GeoJSON.
async function drawAdminScope(lon, lat) {
  const addr = selectedAddress;
  const seq = ++scopeDrawSeq;
  const props = addr.properties;
  // Code postal : contours réels (zones BAN, servis en local) — les grandes villes
  // sont découpées par CP. Commune : limites administratives via geo.api.gouv.fr.
  const url = selectedScope === "postcode" && props.postcode
    ? `/api/codepostal?code=${encodeURIComponent(props.postcode)}`
    : selectedScope === "city" && props.citycode
      ? `https://geo.api.gouv.fr/communes/${encodeURIComponent(props.citycode)}?format=geojson&geometry=contour`
      : null;
  if (!url) {
    clearScopeGeojson();
    map.easeTo({ center: [lon, lat], zoom: 12.8, duration: 450 });
    return;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`geo.api ${response.status}`);
    const data = await response.json();
    // Adresse ou emprise changée pendant la requête : on ignore une réponse périmée.
    if (selectedAddress !== addr || seq !== scopeDrawSeq) return;
    const fc = data.type === "FeatureCollection" ? data : { type: "FeatureCollection", features: [data] };
    const source = map.getSource("targetRadius");
    if (source) source.setData(fc);
    if (fc.features && fc.features.length) {
      fitToFeatureCollection(fc);
    } else {
      map.easeTo({ center: [lon, lat], zoom: 12.8, duration: 450 });
    }
  } catch {
    if (selectedAddress !== addr || seq !== scopeDrawSeq) return;
    clearScopeGeojson();
    map.easeTo({ center: [lon, lat], zoom: 12.8, duration: 450 });
  }
}

function fitToFeatureCollection(fc) {
  const bounds = new maplibregl.LngLatBounds();
  const extend = (coords) => {
    if (typeof coords[0] === "number") {
      bounds.extend(coords);
    } else {
      for (const c of coords) extend(c);
    }
  };
  for (const feature of fc.features || []) {
    if (feature.geometry) extend(feature.geometry.coordinates);
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 500 });
  }
}

function setZoneVisibility(visible) {
  const value = visible ? "visible" : "none";
  for (const id of ["target-radius-fill", "target-radius-line"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value);
  }
}

function clearScopeGeojson() {
  const source = map.getSource("targetRadius");
  if (source) {
    source.setData(emptyFeatureCollection());
  }
}

function circleCoordinates(lon, lat, radiusM) {
  const points = [];
  const earthRadius = 6371000;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const angularDistance = radiusM / earthRadius;
  for (let i = 0; i <= 96; i += 1) {
    const bearing = i / 96 * Math.PI * 2;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance)
      + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLon = lonRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
    );
    points.push([pointLon * 180 / Math.PI, pointLat * 180 / Math.PI]);
  }
  return points;
}

function zoomForRadius(radiusM) {
  if (radiusM <= 100) return 17.3;
  if (radiusM <= 150) return 16.9;
  if (radiusM <= 200) return 16.6;
  if (radiusM <= 300) return 16.1;
  if (radiusM <= 400) return 15.8;
  if (radiusM <= 500) return 15.5;
  if (radiusM <= 1000) return 14.7;
  if (radiusM <= 1500) return 14.2;
  if (radiusM <= 2000) return 13.8;
  if (radiusM <= 3000) return 13.2;
  if (radiusM <= 4000) return 12.8;
  if (radiusM <= 5000) return 12.4;
  if (radiusM <= 10000) return 11.4;
  return 10.4;
}

function formatRadius(radiusM) {
  if (radiusM >= 1000) {
    return `${String(radiusM / 1000).replace(".", ",")} km`;
  }
  return `${radiusM} m`;
}

function formatHistory(years) {
  return years === 1 ? "12 mois" : `${years} ans`;
}

function setComparableGeojson(points) {
  const source = map.getSource("comparables");
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      id: p.uid,
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        uid: p.uid,
        prix_m2: p.prix_m2,
        prix: p.prix,
        surface: p.surface,
        pieces: p.pieces,
        commune: p.commune,
        code_postal: p.code_postal,
        distance_m: p.distance_m,
        date_mutation: p.date_mutation,
        type_local: p.type_local || "",
        similarity: p.similarity ?? 0,
        categorie: p.type_local || ""
      }
    }))
  });
}

function selectComparable(uid, options = { fit: false }, fallbackRow = null) {
  // `force` garde le détail ouvert (pas de bascule) — utile au double-clic.
  if (!options.force && uid !== null && selectedComparableUid === uid) {
    uid = null;
  }
  selectedComparableUid = uid;
  if (lastSelectedUid !== null) {
    map.setFeatureState({ source: "comparables", id: lastSelectedUid }, { selected: false });
  }
  if (uid !== null) {
    map.setFeatureState({ source: "comparables", id: uid }, { selected: true });
  }
  lastSelectedUid = uid;
  for (const item of comparablesList.querySelectorAll(".comparable")) {
    item.classList.toggle("selected", Number(item.dataset.uid) === uid);
  }
  if (uid === null) {
    comparableDetail.hidden = true;
    tableWrap.classList.remove("detail-open");
    setParcelleDetail(null);
    // On rétablit la grille cadastre selon le réglage du menu (haut-droite).
    applyCadastre();
    return;
  }

  const row = currentComparables.find((candidate) => candidate.uid === uid) || fallbackRow;
  if (!row) return;
  tableWrap.classList.remove("collapsed");
  renderDetail(row);
  comparableDetail.hidden = false;
  tableWrap.classList.add("detail-open");
  loadComparableStreetView(row);
  // Focus sur la parcelle : on n'affiche que sa grille cadastre (via loadComparableBatiments)
  // et on retire les autres parcelles de l'overlay général.
  setCadastre(null);
  loadComparableBatiments(row);
  if (options.fit) {
    map.flyTo({ center: [row.lon, row.lat], zoom: Math.max(map.getZoom(), 16) });
  }
}

function renderDetail(row) {
  const similarityField = row.similarity != null ? detailField("Similarité", `${int(row.similarity)} %`) : "";
  const resolutionField = row.resolution_statut === "rnb_resolu" || row.resolution_statut === "bdnb_groupe_resolu"
    ? detailField("Résolution", row.resolution_statut === "rnb_resolu" ? "bâtiment identifié" : "groupe bâtiment identifié")
    : "";

  // Infos principales : toujours visibles.
  const mainFields = [
    detailField("Date", row.date_mutation),
    detailField("Distance", `${int(row.distance_m)} m`),
    detailField("Type", row.type_local),
    detailField("Surface", `${row.surface} m²`),
    detailField("Pièces", row.pieces || "-"),
    similarityField,
  ].join("");

  // Sous-section Cadastre / mutation : identifiants moins utiles au 1er coup d'œil.
  const cadastreFields = [
    detailField("Nature", row.nature_mutation),
    detailField("Mutation", row.id_mutation),
    detailField("Parcelle", row.id_parcelle),
    detailField("Commune", row.code_commune),
  ].join("");

  // Sous-section Bâtiment (RNB / BDNB).
  const bdnbFields = [
    resolutionField,
    row.rnb_id ? detailField("Bâtiment RNB", row.rnb_id) : "",
    row.batiment_groupe_id ? detailField("Groupe BDNB", row.batiment_groupe_id) : "",
    row.usage_principal_bdnb_open ? detailField("Usage BDNB", row.usage_principal_bdnb_open) : "",
    row.nb_log != null ? detailField("Logements BDNB", int(row.nb_log)) : "",
    row.nb_niveau != null ? detailField("Niveaux", int(row.nb_niveau)) : "",
    row.hauteur_mean != null ? detailField("Hauteur", `${int(row.hauteur_mean)} m`) : "",
    row.surface_emprise_sol != null ? detailField("Emprise", `${int(row.surface_emprise_sol)} m²`) : "",
    row.annee_construction ? detailField("Construction", row.annee_construction) : "",
  ].join("");

  detailBody.innerHTML = `
    <div class="detail-title">
      <strong>${int(row.prix_m2)} €/m² · ${euro(row.prix)}</strong>
      <span>${escapeHtml(row.adresse || "Adresse DVF non renseignée")}</span>
      <span>${escapeHtml(row.code_postal || "")} ${escapeHtml(row.commune || "")}</span>
    </div>
    <div class="detail-grid">
      ${mainFields}
    </div>
    ${detailSection("Cadastre", cadastreFields)}
    ${collapsible("Bâti cadastral", `<div id="detailBatiments" class="detail-batiments"><span class="street-muted">Lecture du cadastre…</span></div>`)}
    ${detailSection("Bâtiment (RNB / BDNB)", bdnbFields)}
    <div id="detailStreetView" class="detail-street"><span class="street-muted">Recherche d'une vue rue ouverte...</span></div>
  `;
}

async function loadComparableStreetView(row) {
  const container = document.querySelector("#detailStreetView");
  if (!container) return;
  const view = await findPanoramaxImage(row.lon, row.lat);
  if (selectedComparableUid !== row.uid) return;
  if (!view) {
    container.innerHTML = `<span class="street-muted">Aucune vue rue ouverte à proximité.</span>`;
    return;
  }
  container.innerHTML = `
    <div class="street-action">
      <span>Vue rue trouvée à ${int(view.distance_m)} m</span>
      <button type="button">Vue rue</button>
    </div>
  `;
  container.querySelector("button").addEventListener("click", () => {
    openStreetView(view, `${row.adresse || "Comparable"} · ${row.commune || ""}`);
  });
}

async function findPanoramaxImage(lon, lat) {
  const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
  if (streetViewCache.has(key)) {
    return streetViewCache.get(key);
  }
  const url = new URL("/api/panoramax", window.location.origin);
  url.searchParams.set("lon", lon);
  url.searchParams.set("lat", lat);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Panoramax ${response.status}`);
    const data = await response.json();
    const best = (data.features || [])
      .map((feature) => {
        const [picLon, picLat] = feature.geometry.coordinates;
        return {
          id: feature.id,
          collection: feature.collection,
          lon: picLon,
          lat: picLat,
          distance_m: haversineMeters(lon, lat, picLon, picLat),
          sd: feature.assets?.sd?.href,
          hd: feature.assets?.hd?.href,
          thumb: feature.assets?.thumb?.href,
          datetime: feature.properties?.datetimetz || feature.properties?.datetime,
          license: feature.properties?.license,
          producer: feature.properties?.["geovisio:producer"],
          url: `${PANORAMAX_ENDPOINT}/api/collections/${feature.collection}/items/${feature.id}`
        };
      })
      .filter((feature) => feature.sd || feature.hd)
      .sort((a, b) => a.distance_m - b.distance_m)[0] || null;
    streetViewCache.set(key, best);
    return best;
  } catch {
    streetViewCache.set(key, null);
    return null;
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok && !data.error) {
      return { error: "Erreur réseau ou serveur. Réessaie." };
    }
    return data;
  } catch {
    return { error: "Erreur réseau ou serveur. Réessaie." };
  }
}

function openStreetView(view, title) {
  streetViewPanel.hidden = false;
  streetViewBody.innerHTML = `
    <img class="street-photo" src="${escapeHtml(view.sd || view.hd || view.thumb)}" alt="">
    <strong>${escapeHtml(title)}</strong>
    <div class="street-meta">
      <span>${int(view.distance_m)} m</span>
      ${view.datetime ? `<span>${escapeHtml(new Date(view.datetime).toLocaleDateString("fr-FR"))}</span>` : ""}
      ${view.license ? `<span>${escapeHtml(view.license)}</span>` : ""}
      ${view.producer ? `<span>${escapeHtml(view.producer)}</span>` : ""}
    </div>
    <a class="street-link" href="${escapeHtml(view.url)}" target="_blank" rel="noreferrer">Ouvrir la source</a>
  `;
}

function haversineMeters(lon1, lat1, lon2, lat2) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// Définitions rapides affichées au survol du « ? » à côté de chaque label.
const FIELD_HINTS = {
  "Date": "Date de la mutation (vente) enregistrée dans DVF.",
  "Distance": "Distance entre ce comparable et l'adresse estimée.",
  "Type": "Type de local DVF (Maison, Appartement…).",
  "Surface": "Surface habitable déclarée dans l'acte (DVF) — surface réelle bâtie, hors annexes. À ne pas confondre avec l'emprise au sol.",
  "Pièces": "Nombre de pièces principales déclaré dans DVF.",
  "Similarité": "Ressemblance au bien cible (surface, pièces, distance). 100 % = identique.",
  "Nature": "Nature de la mutation DVF (vente, adjudication…).",
  "Mutation": "Identifiant de la mutation DVF (la transaction).",
  "Parcelle": "Identifiant de la parcelle cadastrale (commune + section + numéro).",
  "Commune": "Code INSEE de la commune.",
  "Résolution": "Comment le bien a été rattaché à un bâtiment (RNB ou groupe BDNB).",
  "Bâtiment RNB": "Identifiant du bâtiment au Référentiel National des Bâtiments.",
  "Groupe BDNB": "Identifiant du groupe de bâtiments dans la BDNB.",
  "Usage BDNB": "Usage principal du bâtiment estimé par la BDNB.",
  "Logements BDNB": "Nombre de logements du bâtiment estimé par la BDNB.",
  "Niveaux": "Nombre de niveaux (étages) estimé par la BDNB.",
  "Hauteur": "Hauteur moyenne du bâtiment estimée par la BDNB.",
  "Emprise": "Emprise au sol du bâtiment estimée par la BDNB (aire au sol, pas la surface habitable). Source distincte du cadastre, donc valeur différente.",
  "Construction": "Année de construction estimée du bâtiment (BDNB). C'est la vraie année du bâti, contrairement à la date de relevé cadastral.",
};

function detailField(label, value) {
  const hint = FIELD_HINTS[label];
  const help = hint ? ` <span class="hint" data-tip="${escapeHtml(hint)}">?</span>` : "";
  return `<div class="detail-field"><span>${escapeHtml(label)}${help}</span><b>${escapeHtml(String(value ?? "-"))}</b></div>`;
}

// Infobulle flottante (rattachée au body) : immédiate et jamais rognée par le
// panneau détail en overflow:auto, contrairement à l'attribut `title` natif.
const hintTip = document.createElement("div");
hintTip.className = "hint-tip";
hintTip.hidden = true;
document.body.appendChild(hintTip);

document.addEventListener("mouseover", (event) => {
  const hint = event.target.closest?.(".hint");
  if (!hint || !hint.dataset.tip) return;
  hintTip.textContent = hint.dataset.tip;
  hintTip.hidden = false;
  const r = hint.getBoundingClientRect();
  let left = r.left + r.width / 2 - hintTip.offsetWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - hintTip.offsetWidth - 8));
  let top = r.top - hintTip.offsetHeight - 8;
  if (top < 8) top = r.bottom + 8; // bascule sous le badge si pas de place au-dessus
  hintTip.style.left = `${left}px`;
  hintTip.style.top = `${top}px`;
});

document.addEventListener("mouseout", (event) => {
  if (event.target.closest?.(".hint")) hintTip.hidden = true;
});

// Repli/dépli des blocs collapsibles (délégation : le détail est ré-rendu en innerHTML).
detailBody.addEventListener("click", (event) => {
  const summary = event.target.closest(".collapsible-summary");
  if (summary) summary.parentElement.classList.toggle("open");
});

// Survol d'une box « Bâti cadastral » -> illumine l'empreinte correspondante sur la carte.
detailBody.addEventListener("mouseover", (event) => {
  const item = event.target.closest("[data-bati-idx]");
  if (item) setBatiHover(Number(item.dataset.batiIdx));
});
detailBody.addEventListener("mouseout", (event) => {
  const item = event.target.closest("[data-bati-idx]");
  if (item && !item.contains(event.relatedTarget)) setBatiHover(null);
});

// Bloc repliable animé (grid-template-rows 0fr→1fr) — préféré à <details> qui
// ne peut pas animer sa hauteur (contenu en display:none quand fermé).
function detailSection(title, fieldsHtml) {
  if (!fieldsHtml.trim()) return "";
  return collapsible(title, `<div class="detail-grid">${fieldsHtml}</div>`);
}

function collapsible(title, innerHtml, { id = "" } = {}) {
  const attr = id ? ` id="${id}"` : "";
  return `
    <div class="collapsible"${attr}>
      <button type="button" class="collapsible-summary">${escapeHtml(title)}</button>
      <div class="collapsible-body"><div class="collapsible-inner">${innerHtml}</div></div>
    </div>
  `;
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function euro(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function int(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value || 0);
}
