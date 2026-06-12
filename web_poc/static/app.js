import { initTheme } from "./theme.js";
import { initTimeline, timelineSetData } from "./timeline.js";

const addressInput = document.querySelector("#address");
const suggestions = document.querySelector("#suggestions");
const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const estimateBtn = document.querySelector("#estimate");
const resetBtn = document.querySelector("#reset");
const estimationPanel = document.querySelector("#estimationPanel");
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
const tableWrap = document.querySelector(".table-wrap");
const expandComparables = document.querySelector("#expandComparables");
const sortMenu = document.querySelector(".sort-menu");
const sortToggle = document.querySelector("#sortToggle");
const sortOptions = document.querySelector("#sortOptions");
const sortButtons = document.querySelectorAll("#sortOptions button");
const radiusSlider = document.querySelector("#radiusSlider");
const radiusLabel = document.querySelector("#radiusLabel");
const radiusControl = document.querySelector("#radiusControl");
const historyMinInput = document.querySelector("#historyMin");
const historyMaxInput = document.querySelector("#historyMax");
const historyLabel = document.querySelector("#historyLabel");
const scopeButtons = document.querySelectorAll(".scope-control button");
const zoneToggle = document.querySelector("#zoneToggle");
const zoneColorSlider = document.querySelector("#zoneColor");
const modeButtons = document.querySelectorAll(".mode-control button");
const estimationFields = document.querySelector("#estimationFields");
const explorationFilters = document.querySelector("#explorationFilters");
const marketTypeMenu = document.querySelector("#marketTypeMenu");
const marketTypeLabel = document.querySelector("#marketTypeLabel");
const marketTypeButtons = document.querySelectorAll("[data-market-type]");
const priceControl = document.querySelector("#priceControl");
const priceMinInput = document.querySelector("#priceMin");
const priceMaxInput = document.querySelector("#priceMax");
const priceLabel = document.querySelector("#priceLabel");
const priceScaleMin = document.querySelector("#priceScaleMin");
const priceScaleMax = document.querySelector("#priceScaleMax");
const surfaceControl = document.querySelector("#surfaceControl");
const surfaceMinInput = document.querySelector("#surfaceMin");
const surfaceMaxInput = document.querySelector("#surfaceMax");
const surfaceLabel = document.querySelector("#surfaceLabel");
const surfaceScaleMin = document.querySelector("#surfaceScaleMin");
const surfaceScaleMax = document.querySelector("#surfaceScaleMax");
const roomsControl = document.querySelector("#roomsControl");
const roomsMinInput = document.querySelector("#roomsMin");
const roomsMaxInput = document.querySelector("#roomsMax");
const roomsLabel = document.querySelector("#roomsLabel");
const roomsScaleMin = document.querySelector("#roomsScaleMin");
const roomsScaleMax = document.querySelector("#roomsScaleMax");
const marketResult = document.querySelector("#marketResult");
const marketStats = document.querySelector("#marketStats");
const estimationStats = document.querySelector("#estimationStats");
const marketCount = document.querySelector("#marketCount");
const marketSalesChip = document.querySelector("#marketSalesChip");
const marketScope = document.querySelector("#marketScope");
const scopeChip = document.querySelector("#scope");
const salesChip = document.querySelector("#salesChip");
const scopeDetails = document.querySelector("#scopeDetails");
const marketScopeDetails = document.querySelector("#marketScopeDetails");
const addressLabel = document.querySelector("#addressLabel");
const MIN_COMPARABLES = 5;
const radiusSteps = [100, 150, 200, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000, 10000, 20000];
const MARKET_CATEGORIES = ["Maison", "Appartement", "Terrain", "Dépendance", "Local"];
const CATEGORY_COLORS = {
  Maison: "#176b5b",
  Appartement: "#2457c5",
  Terrain: "#8a6d1f",
  "Dépendance": "#9a5b9a",
  Local: "#c4472f"
};
let selectedAddress = null;
let targetMarker = null;
let currentComparables = [];
let currentComparablesTotal = null;
// Fenêtrage de la liste : on ne rend dans le DOM qu'une fenêtre [0, renderedCount) de la cohorte
// (qui, elle, est entièrement en mémoire et triée globalement). Rendre des milliers de cartes
// d'un coup fait planter le navigateur (reflow). On remplit le panneau visible puis on charge
// davantage au scroll, via un IntersectionObserver sur une sentinelle en bas de liste.
const SCROLL_BATCH = 20;        // cartes ajoutées à chaque chargement au scroll
const MAX_INITIAL_CARDS = 30;   // plafond du lot initial (sinon = ce que le panneau peut contenir)
let renderedCount = 0;
let measuredCardHeight = 0;     // hauteur réelle d'une carte, mesurée au 1er rendu (auto-fit)
let listSentinel = null;
let listObserver = null;
// Sélection MULTIPLE de catégories en Exploration. Vide = « Tous ».
const selectedMarketTypes = new Set();
let searchTimer = null;
let radiusTimer = null;
let historyTimer = null;
let selectedScope = "radius";
let showZone = true;
let zoneHue = null; // teinte choisie pour la zone, null = couleurs du thème
let scopeDrawSeq = 0;
let selectedRadius = 1500;
let selectedHistoryMinYears = 0;
let selectedHistoryMaxYears = 5;
let selectedComparableUid = null;
let lastSelectedUid = null;
const viewedComparableUids = new Set();
let selectedAddressSeq = 0;
let comparableSortKey = "similarity";
let comparableSortDirection = "desc";
let comparableSortTouched = false;
let selectedMode = "estimation";
let runSeq = 0;
const DEFAULT_PRICE_BOUNDS = { min: 0, max: 1000000, step: 10000 };
const DEFAULT_SURFACE_BOUNDS = { min: 0, max: 300, step: 1 };
const DEFAULT_ROOMS_BOUNDS = { min: 1, max: 8, step: 1 };
let priceBounds = { ...DEFAULT_PRICE_BOUNDS };
let surfaceBounds = { ...DEFAULT_SURFACE_BOUNDS };
let roomsBounds = { ...DEFAULT_ROOMS_BOUNDS };
let selectedPriceMin = priceBounds.min;
let selectedPriceMax = priceBounds.max;
let selectedSurfaceMin = surfaceBounds.min;
let selectedSurfaceMax = surfaceBounds.max;
let selectedRoomsMin = roomsBounds.min;
let selectedRoomsMax = roomsBounds.max;
let priceFilterTouched = false;
let surfaceFilterTouched = false;
let roomsFilterTouched = false;
let marketFilterTimer = null;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
      cartodark: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
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
      {
        id: "base-cartodark",
        type: "raster",
        source: "cartodark",
        // Dark Matter brut est presque noir : on remonte les noirs pour garder
        // rues, fleuve et labels lisibles sous les points de données.
        paint: { "raster-brightness-min": 0.22, "raster-contrast": 0.08, "raster-saturation": 0.15 }
      },
      { id: "base-carto", type: "raster", source: "carto", layout: { visibility: "none" } },
      { id: "base-voyager", type: "raster", source: "voyager", layout: { visibility: "none" } },
      { id: "base-osm", type: "raster", source: "osm", layout: { visibility: "none" } },
      { id: "base-ignplan", type: "raster", source: "ignplan", layout: { visibility: "none" } },
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
        // Repli copropriété : contour de la parcelle PORTEUSE voisine (atténué, distinct du violet parcelle DVF).
        id: "parcelle-detail-porteuse-outline",
        type: "line",
        source: "parcelleDetail",
        filter: ["==", ["get", "kind"], "parcelle_porteuse"],
        paint: { "line-color": "#1f8a8a", "line-width": 1.6, "line-dasharray": [1, 2], "line-opacity": 0.75 }
      },
      {
        // Bâtiment RNB rattaché, porté par la parcelle voisine : teal atténué, ≠ rouge/orange du bâti propre.
        id: "parcelle-detail-voisin-fill",
        type: "fill",
        source: "parcelleDetail",
        filter: ["==", ["get", "kind"], "batiment_rnb_voisin"],
        paint: { "fill-color": "#1f8a8a", "fill-opacity": 0.28 }
      },
      {
        id: "parcelle-detail-voisin-line",
        type: "line",
        source: "parcelleDetail",
        filter: ["==", ["get", "kind"], "batiment_rnb_voisin"],
        paint: { "line-color": "#176b6b", "line-width": 1.2, "line-dasharray": [2, 1], "line-opacity": 0.85 }
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
            ["boolean", ["feature-state", "hover"], false],
            11,
            ["interpolate", ["linear"], ["get", "similarity"], 0, 5, 60, 8, 100, 13]
          ],
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#0f6f9f",
            ["interpolate", ["linear"], ["get", "similarity"], 0, "#c4472f", 60, "#eeb552", 100, "#176b5b"]
          ],
          // Survol d'un résultat dans la liste : anneau doré pour « illuminer » le point sur la carte.
          "circle-stroke-color": ["case", ["boolean", ["feature-state", "hover"], false], "#ffcf3f", "#ffffff"],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            ["boolean", ["feature-state", "hover"], false],
            3.5,
            1.8
          ],
          // Au zoom rapproché, le remplissage s'efface : le point devient un anneau
          // qui encadre le bâtiment au lieu de le masquer (le contour blanc reste).
          // Un point survolé depuis la liste reste pleinement opaque pour rester repérable.
          // `zoom` doit rester l'entrée racine de l'interpolate ; le case hover est dans les sorties.
          "circle-opacity": [
            "interpolate", ["linear"], ["zoom"],
            16, ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.92],
            17.2, ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.1]
          ]
        }
      }
    ]
  }
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
map.doubleClickZoom.disable();

initTheme(map);
initTimeline(map);

const BASE_LAYERS = ["cartodark", "carto", "voyager", "osm", "ignplan", "ign", "stadiasat"];
// Ton clair/sombre de chaque fond : pilote les couleurs de la zone — un teal pâle est
// illisible sur Positron ou IGN Plan, et les photos satellite lisent mieux la variante
// lumineuse. La zone suit donc le fond affiché, pas le thème UI (cf. applyZoneColor).
const BASE_TONE = {
  cartodark: "dark", carto: "light", voyager: "light", osm: "light",
  ignplan: "light", ign: "dark", stadiasat: "dark"
};
let currentBase = "cartodark";
map.once("load", applyZoneColor); // remplace les couleurs bleues du style initial
for (const button of baseLayerMenu.querySelectorAll("[data-layer]")) {
  button.addEventListener("click", () => {
    const value = button.dataset.layer;
    for (const id of BASE_LAYERS) {
      map.setLayoutProperty(`base-${id}`, "visibility", id === value ? "visible" : "none");
    }
    currentBase = value;
    applyZoneColor();
    baseLayerLabel.textContent = button.textContent;
    for (const other of baseLayerMenu.querySelectorAll("[data-layer]")) {
      other.classList.toggle("active", other === button);
    }
    // Le menu reste en hover : on le referme une fois le fond choisi. On retire aussi
    // le focus du bouton, sinon :focus-within rouvrirait le menu au mouseleave.
    baseLayerMenu.classList.add("just-picked");
    button.blur();
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
    button.blur();
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

// Illumine en synchronisation l'empreinte sur la carte (feature-state) ET sa box « Bâti cadastral »
// dans le détail (classe .bati-hover = même rendu que :hover) — dans les DEUX sens de survol.
function setBatiHover(id) {
  if (id === hoveredBatiId) return;
  if (hoveredBatiId !== null) {
    map.setFeatureState({ source: "parcelleDetail", id: hoveredBatiId }, { hover: false });
    document.querySelectorAll(`[data-bati-idx="${hoveredBatiId}"]`).forEach((el) => el.classList.remove("bati-hover"));
  }
  hoveredBatiId = id;
  if (id !== null) {
    map.setFeatureState({ source: "parcelleDetail", id }, { hover: true });
    document.querySelectorAll(`[data-bati-idx="${id}"]`).forEach((el) => {
      el.classList.add("bati-hover");
      // Survol carte alors que « Bâti cadastral » est replié → on l'ouvre pour révéler la box.
      el.closest(".collapsible")?.classList.add("open");
    });
  }
}

// Dessine la parcelle + ses bâtiments cadastraux du comparable sélectionné et
// remplit la sous-section « Bâti cadastral » du détail.
async function loadComparableBatiments(row) {
  const container = document.querySelector(`.comparable-detail[data-uid="${CSS.escape(String(row.uid))}"] #detailBatiments`)
    || document.querySelector("#detailBatiments");
  const dept = currentDept();
  if (!dept || !row.id_parcelle) {
    setParcelleDetail(null);
    if (container) container.innerHTML = `<span class="street-muted">Parcelle non renseignée.</span>`;
    return;
  }
  const url = new URL("/api/batiments", window.location.origin);
  url.searchParams.set("dept", dept);
  url.searchParams.set("parcelle", row.id_parcelle);
  // Garde-fou repli copropriété : on ne transmet le rnb_id (→ bâti de la parcelle voisine) que
  // si l'identification du bâtiment est en confiance HAUTE — pas les rattachements spatiaux
  // faibles, justement ceux où RNB avertit qu'un bâtiment peut viser une mauvaise parcelle.
  if (row.rnb_id && row.confiance === "haute") url.searchParams.set("rnb_id", row.rnb_id);
  let data = null;
  try {
    const response = await fetch(url);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  if (selectedComparableUid !== row.uid) return; // sélection changée entre-temps
  // Deux échecs DISTINCTS, à ne pas confondre (ni avec la section « Cadastre » au-dessus, qui
  // n'affiche que des identifiants issus du texte DVF, sans géométrie) :
  if (!data) {
    // Erreur technique/transitoire de lecture (réseau, serveur) — pas un fait sur le bien.
    setParcelleDetail(null);
    if (container) container.innerHTML = `<span class="street-muted">Lecture du plan cadastral momentanément indisponible. Re-sélectionne le bien pour réessayer.</span>`;
    return;
  }
  if (!data.features.length) {
    // Parcelle introuvable dans le plan cadastral : l'identifiant vient de la vente DVF, mais sa
    // géométrie n'existe pas dans le cadastre Etalab (couverture incomplète sur ce secteur).
    setParcelleDetail(null);
    if (container) container.innerHTML = `<span class="street-muted">Parcelle absente du plan cadastral Etalab (couverture incomplète ici). Son identifiant vient de la vente DVF, mais le cadastre n'en fournit pas la géométrie.</span>`;
    return;
  }
  // Id stable par bâtiment (= idx) pour piloter le feature-state au survol de la liste.
  for (const f of data.features) {
    if (f.properties.kind === "batiment") f.id = f.properties.idx;
  }
  setParcelleDetail(data);
  if (!container) return;
  if (data.fallback_rnb) {
    container.innerHTML = renderRnbVoisinList(data);
  } else {
    container.innerHTML = renderBatimentsList(data.features.filter((f) => f.properties.kind === "batiment"));
  }
}

// Cas copropriété / division en volumes : la parcelle DVF ne porte pas le bâti (parcelle de
// référence), on affiche le bâtiment RNB rattaché, porté par la parcelle voisine, + un « i »
// qui explique pourquoi (sinon « pas d'empreinte » laisserait croire à un terrain nu).
function renderRnbVoisinList(data) {
  const voisins = data.features.filter((f) => f.properties.kind === "batiment_rnb_voisin");
  const pid = data.parcelle_porteuse || "voisine";
  const total = voisins.reduce((sum, b) => sum + (b.properties.surface_m2 || 0), 0);
  const plural = voisins.length > 1 ? "s" : "";
  const info = `Cette parcelle ne porte aucune empreinte bâtie : c'est une parcelle de référence de copropriété ou de division en volumes — le cadastre y rattache le lot et l'adresse, mais le bâtiment est physiquement sur une parcelle voisine. Le bâti ci-dessous est celui identifié pour ce bien par le Référentiel National des Bâtiments (RNB), porté par la parcelle ${pid}. On l'affiche pour ne pas laisser croire à un terrain nu ; il ne désigne pas un logement précis.`;
  return `
    <div class="batiments-head">Bâti rattaché via RNB · parcelle voisine ${escapeHtml(pid)} <span class="hint" data-tip="${escapeHtml(info)}">i</span></div>
    <div class="detail-grid">
      <div class="detail-field"><span>${voisins.length} bâtiment${plural} (sur ${escapeHtml(pid)})</span><b>${int(total)} m²</b></div>
    </div>
  `;
}

function renderBatimentsList(batiments) {
  if (!batiments.length) {
    return `<span class="street-muted">Pas d'empreinte bâtie sur cette parcelle. Possible terrain nu, mais aussi micro-parcelle de copropriété ou de volume dont le bâtiment est porté par une parcelle voisine.</span>`;
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

// Remplit la sous-section « Adresses (lien parcellaire) » : adresses rattachées à la parcelle
// par lien cadastral DIRECT (codesParcelles + BAN cad_parcelles), sans pivot RNB.
async function loadComparableAdresses(row) {
  const container = document.querySelector(`.comparable-detail[data-uid="${CSS.escape(String(row.uid))}"] #detailAdresses`)
    || document.querySelector("#detailAdresses");
  const dept = currentDept();
  if (!dept || !row.id_parcelle) {
    if (container) container.innerHTML = `<span class="street-muted">Parcelle non renseignée.</span>`;
    return;
  }
  const url = new URL("/api/parcelle-adresses", window.location.origin);
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
  if (container) container.innerHTML = renderAdressesList(data ? data.adresses : []);
}

// Panneau DPE du bâtiment du comparable (clé gold rnb_id). Affiche le DPE de surface la plus
// proche de la vente, + le récap des autres DPE du bâtiment.
async function loadComparableDpe(row) {
  const container = document.querySelector(`.comparable-detail[data-uid="${CSS.escape(String(row.uid))}"] #detailDpe`)
    || document.querySelector("#detailDpe");
  if (!container) return;
  const dept = currentDept();
  if (!dept || !row.rnb_id) {
    container.innerHTML = `<span class="street-muted">Pas de bâtiment RNB identifié — DPE non rattachable.</span>`;
    return;
  }
  const url = new URL("/api/dpe", window.location.origin);
  url.searchParams.set("dept", dept);
  url.searchParams.set("rnb_id", row.rnb_id);
  if (row.surface != null) url.searchParams.set("surface", row.surface);
  let data = null;
  try {
    const response = await fetch(url);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  if (selectedComparableUid !== row.uid) return;
  if (!data || !data.dpe.length) {
    container.innerHTML = `<span class="street-muted">Aucun DPE rattaché à ce bâtiment.</span>`;
    return;
  }
  container.innerHTML = renderDpePanel(data);
}

// Libellés du lien DPE→bâtiment (rnb_lien) : on dit à l'utilisateur COMMENT le DPE a été
// rattaché, du plus sûr (identifiant ADEME) au plus interprété (proximité spatiale).
const DPE_LIENS = {
  ademe: null, // rattachement natif ADEME : pas de caveat nécessaire
  cle_ban: "rattaché par clé d'adresse BAN (fiable, adresse mono-bâtiment)",
  spatial: "rattaché par proximité (bâtiment le plus proche à ≤ 15 m du géocodage) — vérifier l'adresse"
};

function renderDpePanel(data) {
  const list = data.dpe;
  const m = list[data.matched != null ? data.matched : 0];
  const energyType = m.type_energie ? m.type_energie.replace(/_/g, " ") : "—";
  const millesime = m.source === "pre_2021" ? "avant 2021" : "depuis 2021";
  const conso = m.conso_ep_m2 != null ? `${Math.round(m.conso_ep_m2)} kWh/m²/an` : null;
  const ges = m.emission_ges_m2 != null ? `${Math.round(m.emission_ges_m2)} kg CO₂/m²/an` : null;
  const validite = m.fin_validite
    ? (m.expire ? `expiré (${m.fin_validite})` : `jusqu'au ${m.fin_validite}`)
    : null;
  const head = `
    <div class="dpe-panel-head">
      <span class="dpe-pair">Énergie${dpeBadge(m.etiquette_energie) || ' <span class="street-muted">n.c.</span>'}</span>
      <span class="dpe-pair">GES${dpeBadge(m.etiquette_ges) || ' <span class="street-muted">n.c.</span>'}</span>
      ${m.expire ? '<span class="dpe-expire">expiré</span>' : ""}
    </div>
    <div class="detail-grid">
      ${conso ? detailField("Consommation", conso) : ""}
      ${ges ? detailField("Émissions GES", ges) : ""}
      ${detailField("Énergie chauffage", energyType)}
      ${m.surface != null ? detailField("Surface DPE", `${Math.round(m.surface)} m²`) : ""}
      ${m.etage != null ? detailField("Étage", m.etage === 0 ? "RDC" : m.etage) : ""}
      ${m.date ? detailField("Établi le", m.date) : ""}
      ${validite ? detailField("Validité", validite) : ""}
      ${m.periode ? detailField("Construction", m.periode) : ""}
      ${detailField("Millésime", millesime)}
    </div>`;
  const lien = DPE_LIENS[m.rnb_lien]
    ? `<p class="detail-note">Lien au bâtiment : ${DPE_LIENS[m.rnb_lien]}.</p>`
    : "";
  if (list.length === 1) {
    return head + lien + `<p class="detail-note">DPE du bâtiment via RNB — ne désigne pas le lot exact.</p>`;
  }
  // Bâtiment à N DPE (jusqu'à des milliers) : distribution par classe, pas une liste de badges.
  const counts = {};
  for (const d of list) counts[d.etiquette_energie || "?"] = (counts[d.etiquette_energie || "?"] || 0) + 1;
  const distrib = ["A", "B", "C", "D", "E", "F", "G", "?"].filter((k) => counts[k]).map((k) =>
    `<span class="dpe-distrib-item">${k === "?" ? '<span class="street-muted">n.c.</span>' : dpeBadge(k)}<small>×${counts[k]}</small></span>`).join("");
  return head + lien
    + `<p class="detail-note">${list.length} DPE sur ce bâtiment (RNB) — affiché : surface la plus proche de la vente.</p>`
    + `<div class="dpe-distrib">${distrib}</div>`;
}

// Description courte affichée à l'utilisateur (le « ? » de l'en-tête). La mécanique de
// construction (sources, fusion, harmonisation) reste dans la doc, pas ici.
const DPE_HINT = "Diagnostic de performance énergétique du BÂTIMENT, rattaché via son identifiant RNB. Un bâtiment porte un DPE par logement : on affiche celui dont la surface est la plus proche de la vente (le lot le plus probable), mais ce n'est pas une certitude en copropriété. Étiquettes énergie + GES (A-G), type d'énergie de chauffage et date d'établissement (validité 10 ans).";

const COPRO_HINT = "Copropriété immatriculée au Registre National (RNIC, ANAH), rattachée par sa référence cadastrale = la parcelle de la vente. Donne la taille réelle de la copropriété (lots), sa période de construction déclarée au règlement et son mode de gestion. Données déclarées par les syndics — fiables sur la structure, parfois datées.";

// Période de construction RNIC ('AVANT_1949', 'DE_1949_A_1960'…) -> libellé lisible.
function formatPeriodeCopro(periode) {
  return String(periode).toLowerCase().replaceAll("_", " ").replace(" a ", " à ");
}

const ADRESSES_PARCELLE_HINT = "Adresse(s) officielle(s) rattachée(s) à la parcelle. Intérêt : l'adresse de la vente (DVF) affichée plus haut est souvent imprécise ou incomplète ; celle-ci est l'adresse réelle du bien, sert de point de contact probable du propriétaire (sans révéler son identité), et fait apparaître toutes les entrées d'une parcelle qui en compte plusieurs. En copropriété, plusieurs adresses possibles sans désigner un logement précis.";

function renderAdressesList(adresses) {
  if (!adresses || !adresses.length) {
    return `<span class="street-muted">Aucune adresse rattachée à la parcelle dans l'open data.</span>`;
  }
  const SRC = { cadastre: "Cadastre", ban: "BAN" };
  const items = adresses.map((a) => {
    const ligne1 = `${a.numero || ""} ${a.voie || ""}`.trim() || "Adresse sans voie";
    const ligne2 = `${a.code_postal || ""} ${a.ville || ""}`.trim();
    const tags = [SRC[a.source] || a.source, a.destination].filter(Boolean).join(" · ");
    return `<div class="detail-field adresse-item"><span>${escapeHtml(ligne1)}${ligne2 ? `<span class="street-muted">, ${escapeHtml(ligne2)}</span>` : ""}</span><b class="adresse-tag">${escapeHtml(tags)}</b></div>`;
  }).join("");
  const plural = adresses.length > 1 ? "s" : "";
  return `
    <div class="batiments-head">${adresses.length} adresse${plural} rattachée${plural}</div>
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

addressInput.addEventListener("input", () => {
  selectedAddress = null;
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

function onMarketTypeChange() {
  resetMarketFiltersForScope();
  syncMarketFilterAvailability();
  if (selectedAddress) runMarket();
}

// Multi-sélection : chaque clic bascule la catégorie (le menu RESTE ouvert pour enchaîner
// les choix — pas de just-picked/blur ici, contrairement aux menus à choix unique).
// « Tous » vide la sélection ; sélectionner les 5 catégories revient à « Tous ».
for (const button of marketTypeButtons) {
  button.addEventListener("click", () => {
    const value = button.dataset.marketType || "";
    if (!value) {
      selectedMarketTypes.clear();
    } else if (selectedMarketTypes.has(value)) {
      selectedMarketTypes.delete(value);
    } else {
      selectedMarketTypes.add(value);
      if (selectedMarketTypes.size === MARKET_CATEGORIES.length) selectedMarketTypes.clear();
    }
    syncMarketTypeMenu();
    onMarketTypeChange();
  });
}

marketTypeMenu.addEventListener("mouseleave", () => {
  marketTypeMenu.classList.remove("just-picked");
});

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
    resetMarketFiltersForScope();
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

zoneColorSlider.addEventListener("input", () => {
  zoneHue = Number(zoneColorSlider.value);
  applyZoneColor();
});

radiusSlider.addEventListener("input", () => {
  selectedRadius = radiusSteps[Number(radiusSlider.value)];
  radiusLabel.textContent = formatRadius(selectedRadius);
  clearTimeout(radiusTimer);
  if (selectedAddress && selectedScope === "radius") {
    const [lon, lat] = selectedAddress.geometry.coordinates;
    setRadiusGeojson(lon, lat, selectedRadius);
    map.easeTo({ center: [lon, lat], zoom: zoomForRadius(selectedRadius), duration: 250 });
    resetMarketFiltersForScope();
    radiusTimer = setTimeout(run, 300);
  }
});

function onHistoryInput() {
  let lo = Number(historyMinInput.value);
  let hi = Number(historyMaxInput.value);
  if (lo > hi) {
    if (document.activeElement === historyMinInput) hi = lo;
    else lo = hi;
    historyMinInput.value = String(lo);
    historyMaxInput.value = String(hi);
  }
  selectedHistoryMinYears = lo;
  selectedHistoryMaxYears = hi;
  historyLabel.textContent = formatHistoryRange(selectedHistoryMinYears, selectedHistoryMaxYears);
  clearTimeout(historyTimer);
  if (selectedAddress) {
    resetMarketFiltersForScope();
    historyTimer = setTimeout(run, 300);
  }
}
historyMinInput.addEventListener("input", onHistoryInput);
historyMaxInput.addEventListener("input", onHistoryInput);

// Slider prix à deux poignées (Exploration). Les poignées ne se croisent pas.
function onPriceInput() {
  priceFilterTouched = true;
  let lo = Number(priceMinInput.value);
  let hi = Number(priceMaxInput.value);
  if (lo > hi) {
    // On garde la poignée qu'on bouge du bon côté de l'autre.
    if (document.activeElement === priceMinInput) hi = lo;
    else lo = hi;
    priceMinInput.value = String(lo);
    priceMaxInput.value = String(hi);
  }
  selectedPriceMin = lo;
  selectedPriceMax = hi;
  priceLabel.textContent = priceText();
  scheduleMarketRun();
}
priceMinInput.addEventListener("input", onPriceInput);
priceMaxInput.addEventListener("input", onPriceInput);

function onSurfaceInput() {
  surfaceFilterTouched = true;
  let lo = Number(surfaceMinInput.value);
  let hi = Number(surfaceMaxInput.value);
  if (lo > hi) {
    if (document.activeElement === surfaceMinInput) hi = lo;
    else lo = hi;
    surfaceMinInput.value = String(lo);
    surfaceMaxInput.value = String(hi);
  }
  selectedSurfaceMin = lo;
  selectedSurfaceMax = hi;
  surfaceLabel.textContent = surfaceText();
  scheduleMarketRun();
}
surfaceMinInput.addEventListener("input", onSurfaceInput);
surfaceMaxInput.addEventListener("input", onSurfaceInput);

function onRoomsInput() {
  if (roomsMinInput.disabled || roomsMaxInput.disabled) return;
  roomsFilterTouched = true;
  let lo = Number(roomsMinInput.value);
  let hi = Number(roomsMaxInput.value);
  if (lo > hi) {
    if (document.activeElement === roomsMinInput) hi = lo;
    else lo = hi;
    roomsMinInput.value = String(lo);
    roomsMaxInput.value = String(hi);
  }
  selectedRoomsMin = lo;
  selectedRoomsMax = hi;
  roomsLabel.textContent = roomsText();
  scheduleMarketRun();
}
roomsMinInput.addEventListener("input", onRoomsInput);
roomsMaxInput.addEventListener("input", onRoomsInput);

function scheduleMarketRun() {
  clearTimeout(marketFilterTimer);
  if (selectedMode === "exploration" && selectedAddress) {
    marketFilterTimer = setTimeout(runMarket, 300);
  }
}

function resetPriceFilterForScope() {
  priceFilterTouched = false;
  selectedPriceMin = priceBounds.min;
  selectedPriceMax = priceBounds.max;
  priceMinInput.value = String(selectedPriceMin);
  priceMaxInput.value = String(selectedPriceMax);
  priceLabel.textContent = priceText();
}

function resetSurfaceFilterForScope() {
  surfaceFilterTouched = false;
  selectedSurfaceMin = surfaceBounds.min;
  selectedSurfaceMax = surfaceBounds.max;
  surfaceMinInput.value = String(selectedSurfaceMin);
  surfaceMaxInput.value = String(selectedSurfaceMax);
  surfaceLabel.textContent = surfaceText();
}

function resetRoomsFilterForScope() {
  roomsFilterTouched = false;
  selectedRoomsMin = roomsBounds.min;
  selectedRoomsMax = roomsBounds.max;
  roomsMinInput.value = String(selectedRoomsMin);
  roomsMaxInput.value = String(selectedRoomsMax);
  roomsLabel.textContent = roomsText();
}

function resetMarketFiltersForScope() {
  resetPriceFilterForScope();
  resetSurfaceFilterForScope();
  resetRoomsFilterForScope();
}

function applyPriceBounds(bounds) {
  if (!bounds || !Number.isFinite(Number(bounds.min)) || !Number.isFinite(Number(bounds.max))) {
    return;
  }
  const nextMin = Number(bounds.min);
  const nextMax = Number(bounds.max);
  const nextStep = Math.max(1, Number(bounds.step) || DEFAULT_PRICE_BOUNDS.step);
  priceBounds = { min: nextMin, max: nextMax, step: nextStep };

  for (const input of [priceMinInput, priceMaxInput]) {
    input.min = String(nextMin);
    input.max = String(nextMax);
    input.step = String(nextStep);
    input.disabled = nextMin === nextMax;
  }

  if (!priceFilterTouched) {
    selectedPriceMin = nextMin;
    selectedPriceMax = nextMax;
  } else {
    selectedPriceMin = Math.min(Math.max(selectedPriceMin, nextMin), nextMax);
    selectedPriceMax = Math.min(Math.max(selectedPriceMax, nextMin), nextMax);
    if (selectedPriceMin > selectedPriceMax) {
      selectedPriceMin = nextMin;
      selectedPriceMax = nextMax;
    }
  }
  priceMinInput.value = String(selectedPriceMin);
  priceMaxInput.value = String(selectedPriceMax);
  priceScaleMin.textContent = formatPrice(nextMin);
  priceScaleMax.textContent = formatPrice(nextMax);
  priceLabel.textContent = priceText();
}

function applySurfaceBounds(bounds) {
  if (!bounds || !Number.isFinite(Number(bounds.min)) || !Number.isFinite(Number(bounds.max))) {
    return;
  }
  const nextMin = Number(bounds.min);
  const nextMax = Number(bounds.max);
  const nextStep = Math.max(1, Number(bounds.step) || DEFAULT_SURFACE_BOUNDS.step);
  surfaceBounds = { min: nextMin, max: nextMax, step: nextStep };

  for (const input of [surfaceMinInput, surfaceMaxInput]) {
    input.min = String(nextMin);
    input.max = String(nextMax);
    input.step = String(nextStep);
    input.disabled = nextMin === nextMax;
  }

  if (!surfaceFilterTouched) {
    selectedSurfaceMin = nextMin;
    selectedSurfaceMax = nextMax;
  } else {
    selectedSurfaceMin = Math.min(Math.max(selectedSurfaceMin, nextMin), nextMax);
    selectedSurfaceMax = Math.min(Math.max(selectedSurfaceMax, nextMin), nextMax);
    if (selectedSurfaceMin > selectedSurfaceMax) {
      selectedSurfaceMin = nextMin;
      selectedSurfaceMax = nextMax;
    }
  }
  surfaceMinInput.value = String(selectedSurfaceMin);
  surfaceMaxInput.value = String(selectedSurfaceMax);
  surfaceScaleMin.textContent = `${int(nextMin)} m²`;
  surfaceScaleMax.textContent = `${int(nextMax)} m²`;
  surfaceLabel.textContent = surfaceText();
}

function applyRoomsBounds(bounds) {
  const enabled = roomsFilterApplies() && bounds
    && Number.isFinite(Number(bounds.min))
    && Number.isFinite(Number(bounds.max));
  roomsControl.classList.toggle("disabled", !enabled);
  for (const input of [roomsMinInput, roomsMaxInput]) {
    input.disabled = !enabled;
  }
  if (!enabled) {
    roomsFilterTouched = false;
    roomsLabel.textContent = "Non applicable";
    roomsScaleMin.textContent = "-";
    roomsScaleMax.textContent = "-";
    return;
  }

  const nextMin = Number(bounds.min);
  const nextMax = Number(bounds.max);
  const nextStep = Math.max(1, Number(bounds.step) || DEFAULT_ROOMS_BOUNDS.step);
  roomsBounds = { min: nextMin, max: nextMax, step: nextStep };
  for (const input of [roomsMinInput, roomsMaxInput]) {
    input.min = String(nextMin);
    input.max = String(nextMax);
    input.step = String(nextStep);
    input.disabled = false;
  }

  if (!roomsFilterTouched) {
    selectedRoomsMin = nextMin;
    selectedRoomsMax = nextMax;
  } else {
    selectedRoomsMin = Math.min(Math.max(selectedRoomsMin, nextMin), nextMax);
    selectedRoomsMax = Math.min(Math.max(selectedRoomsMax, nextMin), nextMax);
    if (selectedRoomsMin > selectedRoomsMax) {
      selectedRoomsMin = nextMin;
      selectedRoomsMax = nextMax;
    }
  }
  roomsMinInput.value = String(selectedRoomsMin);
  roomsMaxInput.value = String(selectedRoomsMax);
  roomsScaleMin.textContent = String(int(nextMin));
  roomsScaleMax.textContent = String(int(nextMax));
  roomsLabel.textContent = roomsText();
}

function priceText() {
  if (selectedPriceMin <= priceBounds.min && selectedPriceMax >= priceBounds.max) return "Tous";
  const lo = formatPrice(selectedPriceMin);
  const hi = formatPrice(selectedPriceMax);
  return `${lo} – ${hi}`;
}

function surfaceText() {
  if (selectedSurfaceMin <= surfaceBounds.min && selectedSurfaceMax >= surfaceBounds.max) return "Toutes";
  return `${int(selectedSurfaceMin)} – ${int(selectedSurfaceMax)} m²`;
}

function roomsText() {
  if (!roomsFilterApplies()) return "Non applicable";
  if (selectedRoomsMin <= roomsBounds.min && selectedRoomsMax >= roomsBounds.max) return "Toutes";
  return `${int(selectedRoomsMin)} – ${int(selectedRoomsMax)}`;
}

function roomsFilterApplies() {
  // Le filtre pièces n'a de sens que si la sélection est entièrement du logement.
  return selectedMarketTypes.size > 0
    && [...selectedMarketTypes].every((t) => t === "Maison" || t === "Appartement");
}

// Aligne le menu (boutons actifs + libellé) sur la sélection courante.
function syncMarketTypeMenu() {
  const tous = selectedMarketTypes.size === 0;
  for (const button of marketTypeButtons) {
    const value = button.dataset.marketType || "";
    button.classList.toggle("active", tous ? !value : Boolean(value) && selectedMarketTypes.has(value));
  }
  marketTypeLabel.textContent = tous
    ? "Tous"
    : MARKET_CATEGORIES.filter((c) => selectedMarketTypes.has(c)).join(" + ");
}

// Bascule une catégorie depuis les lignes de stats du bas — MÊME sémantique que le menu :
// depuis « Tous », cliquer « Maison » filtre sur Maison seule ; re-cliquer la retire
// (dernière retirée -> Set vide -> retour à « Tous »).
function toggleMarketCategory(categorie) {
  if (!MARKET_CATEGORIES.includes(categorie)) return;
  if (selectedMarketTypes.has(categorie)) {
    selectedMarketTypes.delete(categorie);
  } else {
    selectedMarketTypes.add(categorie);
  }
  if (selectedMarketTypes.size === MARKET_CATEGORIES.length) selectedMarketTypes.clear();
  syncMarketTypeMenu();
  onMarketTypeChange();
}

function syncMarketFilterAvailability() {
  applyRoomsBounds(roomsFilterApplies() ? roomsBounds : null);
}

function setResultsAvailable(available) {
  tableWrap.classList.toggle("has-results", Boolean(available));
  syncDrawerTabs();
}

function setStatsPanelOpen(button, panel, open) {
  if (!button || !panel) return;
  panel.hidden = !open;
  button.classList.toggle("open", open);
  button.setAttribute("aria-expanded", String(open));
}

function setCompanionPanelOpen(panel, open) {
  if (panel === marketStats) {
    setStatsPanelOpen(marketSalesChip, marketStats, open);
  } else if (panel === estimationStats) {
    setStatsPanelOpen(salesChip, estimationStats, open);
  } else if (panel) {
    panel.hidden = !open;
  }
}

function syncDrawerTabs() {
  expandEstimation.textContent = estimationPanel.classList.contains("collapsed") ? "›" : "‹";
  expandComparables.textContent = tableWrap.classList.contains("collapsed") ? "‹" : "›";
}

function formatPrice(value) {
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `${millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10} M€`;
  }
  return `${Math.round(value / 1000)} k€`;
}

closeDetail.addEventListener("click", () => selectComparable(null, { fit: false }));

expandComparables.addEventListener("click", () => {
  tableWrap.classList.toggle("collapsed");
  syncDrawerTabs();
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
    comparableSortTouched = true;
    sortMenu.classList.remove("open");
    sortToggle.setAttribute("aria-expanded", "false");
    updateSortControl();
    if (selectedAddress) {
      run();
    } else {
      renderComparableList({ reset: true });
    }
  });
}

document.addEventListener("click", () => {
  sortMenu.classList.remove("open");
  sortToggle.setAttribute("aria-expanded", "false");
});

expandEstimation.addEventListener("click", () => {
  estimationPanel.classList.toggle("collapsed");
  syncDrawerTabs();
});

syncDrawerTabs();

salesChip.addEventListener("click", () => setStatsPanelOpen(salesChip, estimationStats, estimationStats.hidden));
marketSalesChip.addEventListener("click", () => setStatsPanelOpen(marketSalesChip, marketStats, marketStats.hidden));

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

map.on("mousemove", "comparables-points", (event) => {
  const feature = event.features && event.features[0];
  if (!feature) return;
  setComparableHover(Number(feature.properties.uid), true, { fromMap: true });
});

map.on("mouseleave", "comparables-points", () => {
  map.getCanvas().style.cursor = "";
  setComparableHover(hoveredComparableUid, false, { fromMap: true });
});

// Sens inverse : survol d'un bâtiment détecté SUR LA CARTE -> illumine son empreinte + sa box dans
// le détail. La source `parcelleDetail` ne contient que les bâtiments du comparable sélectionné
// (détail ouvert) -> intrinsèquement limité à celui qu'on regarde, pas à tous les bâtiments.
map.on("mousemove", "parcelle-detail-bati-fill", (event) => {
  if (!event.features.length) return;
  map.getCanvas().style.cursor = "pointer";
  setBatiHover(event.features[0].id);
});
map.on("mouseleave", "parcelle-detail-bati-fill", () => {
  map.getCanvas().style.cursor = "";
  setBatiHover(null);
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
  resetMarketFiltersForScope();
  addressInput.value = feature.properties.label;
  suggestions.hidden = true;
  const [lon, lat] = feature.geometry.coordinates;
  setTargetMarker(lon, lat);
  updateScopeGeometry();
  map.flyTo({ center: [lon, lat], zoom: selectedScope === "radius" ? zoomForRadius(selectedRadius) : 13.4 });
  setStatus(`${feature.properties.postcode || ""} ${feature.properties.city || ""}`.trim());
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
  radiusSlider.value = "7";
  selectedRadius = radiusSteps[7];
  radiusLabel.textContent = formatRadius(selectedRadius);
  historyMinInput.value = "0";
  historyMaxInput.value = "5";
  selectedHistoryMinYears = 0;
  selectedHistoryMaxYears = 5;
  historyLabel.textContent = formatHistoryRange(selectedHistoryMinYears, selectedHistoryMaxYears);
  comparableSortTouched = false;
  comparableSortKey = "similarity";
  comparableSortDirection = "desc";
  updateSortControl();

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

  // Mode -> estimation, exploration -> tous
  selectedMode = "estimation";
  for (const b of modeButtons) {
    b.classList.toggle("active", b.dataset.mode === "estimation");
  }
  selectedMarketTypes.clear();
  syncMarketTypeMenu();

  // Filtres de marché -> aucune limite
  priceBounds = { ...DEFAULT_PRICE_BOUNDS };
  surfaceBounds = { ...DEFAULT_SURFACE_BOUNDS };
  roomsBounds = { ...DEFAULT_ROOMS_BOUNDS };
  applyPriceBounds(priceBounds);
  applySurfaceBounds(surfaceBounds);
  applyRoomsBounds(null);
  resetMarketFiltersForScope();

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

  map.flyTo({ center: [-0.5792, 44.8378], zoom: 12 });
  setStatus("");
}

function applyMode() {
  const explore = selectedMode === "exploration";
  applyDefaultSortForMode();
  estimationFields.hidden = explore;
  explorationFilters.hidden = !explore;
  priceControl.hidden = !explore;
  surfaceControl.hidden = !explore;
  roomsControl.hidden = !explore;
  syncMarketFilterAvailability();
  addressLabel.textContent = explore ? "Adresse, code postal ou commune" : "Adresse";
  estimateBtn.textContent = explore ? "Explorer" : "Estimer";
  resultEl.hidden = true;
  marketResult.hidden = true;
  scopeDetails.hidden = true;
  marketScopeDetails.hidden = true;
  comparableDetail.hidden = true;
  tableWrap.classList.remove("detail-open");
  currentComparables = [];
  comparablesList.innerHTML = "";
  setComparableGeojson([]);
  tableMeta.textContent = "Aucun calcul";
  setResultsAvailable(false);
  tableWrap.classList.add("collapsed");
  applyMapMode();
}

function applyDefaultSortForMode() {
  if (selectedMode === "exploration" && !comparableSortTouched) {
    comparableSortKey = null;
    comparableSortDirection = "asc";
  } else if (selectedMode !== "exploration" && !comparableSortTouched) {
    comparableSortKey = "similarity";
    comparableSortDirection = "desc";
  }
  updateSortControl();
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

async function runMarket() {
  if (!selectedAddress) {
    setStatus("Choisis une adresse, un code postal ou une commune.");
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
    scope_mode: selectedScope,
    radius_m: String(selectedRadius),
    history_min_years: String(selectedHistoryMinYears),
    history_max_years: String(selectedHistoryMaxYears),
    types: [...selectedMarketTypes].join(","),
    sort_key: comparableSortKey || "",
    sort_dir: comparableSortDirection
  });
  // Bornes de prix : envoyées seulement si l'utilisateur a resserré le slider.
  if (priceFilterTouched && selectedPriceMin > priceBounds.min) {
    params.set("prix_min", String(selectedPriceMin));
  }
  if (priceFilterTouched && selectedPriceMax < priceBounds.max) {
    params.set("prix_max", String(selectedPriceMax));
  }
  if (surfaceFilterTouched && selectedSurfaceMin > surfaceBounds.min) {
    params.set("surface_min", String(selectedSurfaceMin));
  }
  if (surfaceFilterTouched && selectedSurfaceMax < surfaceBounds.max) {
    params.set("surface_max", String(selectedSurfaceMax));
  }
  if (roomsFilterApplies() && roomsFilterTouched && selectedRoomsMin > roomsBounds.min) {
    params.set("pieces_min", String(selectedRoomsMin));
  }
  if (roomsFilterApplies() && roomsFilterTouched && selectedRoomsMax < roomsBounds.max) {
    params.set("pieces_max", String(selectedRoomsMax));
  }

  updateScopeGeometry();
  resultEl.hidden = true;
  setStatus("Lecture du marché local...");
  const data = await fetchJson(`/api/market?${params}`);
  if (seq !== runSeq) return;
  applyPriceBounds(data.summary?.price_bounds);
  applySurfaceBounds(data.summary?.surface_bounds);
  applyRoomsBounds(data.summary?.pieces_bounds);
  if (data.error) {
    marketResult.hidden = true;
    marketScopeDetails.hidden = true;
    setComparableGeojson([]);
    comparableDetail.hidden = true;
    tableWrap.classList.remove("detail-open");
    currentComparables = [];
    comparablesList.innerHTML = "";
    tableMeta.textContent = "Aucun résultat";
    setResultsAvailable(false);
    tableWrap.classList.add("collapsed");
    map.flyTo({ center: [lon, lat], zoom: selectedScope === "radius" ? zoomForRadius(selectedRadius) : 13.4 });
    setStatus(data.error);
    return;
  }
  renderMarket(data);
  drawScope(data.target);
  if (cadastreMode === "biens") loadCadastreBiens();
  setStatus("");
}

function renderMarket(data) {
  marketResult.hidden = false;
  marketCount.textContent = int(data.summary.count);
  setStatsPanelOpen(marketSalesChip, marketStats, true);
  configureScopeChip(marketScope, marketScopeDetails, data.target, data.summary.scope, marketStats);
  marketStats.innerHTML = "";
  for (const t of data.summary.types) {
    // Ligne cliquable, corrélée au menu Type (même bascule) : depuis « Tous », cliquer
    // filtre sur cette seule catégorie ; si elle est sélectionnée, cliquer la retire.
    const isSelected = selectedMarketTypes.has(t.categorie);
    const row = document.createElement("button");
    row.type = "button";
    row.className = `market-row${t.qualite === "indicatif" ? " indicatif" : ""}`;
    row.title = isSelected
      ? `Retirer « ${t.categorie} » de la sélection`
      : `N'afficher que « ${t.categorie} »`;
    row.innerHTML = `
      <span class="cat"><span class="dot" style="background:${CATEGORY_COLORS[t.categorie] || "#66736d"}"></span>${escapeHtml(String(t.categorie || ""))}<span class="row-toggle ${isSelected ? "remove" : "focus"}" aria-hidden="true">${isSelected ? "×" : "◎"}</span></span>
      <span class="sub">${int(t.count)} ventes · ${euro(t.median_prix)} médian${t.qualite === "indicatif" ? " · indicatif" : ""}</span>
      <span class="m2">${int(t.median_m2)} €/m²</span>
    `;
    row.addEventListener("click", () => toggleMarketCategory(t.categorie));
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
    history_min_years: String(selectedHistoryMinYears),
    history_max_years: String(selectedHistoryMaxYears),
    sort_key: comparableSortKey || "",
    sort_dir: comparableSortDirection
  });

  updateScopeGeometry();
  setStatus("Calcul des comparables...");
  const data = await fetchJson(`/api/estimate?${params}`);
  if (seq !== runSeq) return;
  if (data.error) {
    resultEl.hidden = true;
    scopeDetails.hidden = true;
    setComparableGeojson([]);
    comparableDetail.hidden = true;
    tableWrap.classList.remove("detail-open");
    currentComparables = [];
    comparablesList.innerHTML = "";
    tableMeta.textContent = "Aucun résultat";
    setResultsAvailable(false);
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
  setStatsPanelOpen(salesChip, estimationStats, true);
  configureScopeChip(scopeChip, scopeDetails, data.target, summary.scope, estimationStats);
  document.querySelector("#range").textContent =
    `Fourchette observée: ${euro(summary.low_price)} à ${euro(summary.high_price)} pour ${summary.scope} · ${summary.history} · confiance ${summary.confidence}`;
  renderLoyerContext(summary.loyer);
  document.querySelector("#askedPosition").textContent = summary.asked_position_pct === null
    ? ""
    : `Prix soumis: percentile ${summary.asked_position_pct} des comparables`;
}

// Contexte locatif (« Carte des loyers ») : loyer prédit de la commune + rendement brut.
// Une prédiction de modèle, pas une observation — l'infobulle détaille méthode et intervalle.
const LOYER_SEGMENTS = {
  maison: "maison",
  appartement: "appartement",
  appartement_1_2p: "appartement 1-2 pièces",
  appartement_3p_plus: "appartement 3 pièces et plus"
};

function renderLoyerContext(loyer) {
  const el = document.querySelector("#loyerContext");
  if (!loyer) {
    el.textContent = "";
    return;
  }
  const tip = `Indicateur « Carte des loyers » (SDES × ANIL, millésime ${loyer.millesime}) : loyer d'annonce PRÉDIT par un modèle pour la commune, charges comprises, segment ${LOYER_SEGMENTS[loyer.categorie] || loyer.categorie}.`
    + (loyer.loyer_m2_bas != null ? ` Intervalle de prédiction : ${loyer.loyer_m2_bas} – ${loyer.loyer_m2_haut} €/m².` : "")
    + ` Le rendement brut rapporte 12 loyers au prix médian estimé — avant charges, vacance, travaux et fiscalité.`;
  const rendement = loyer.rendement_brut_pct != null
    ? ` · rendement brut ≈ ${String(loyer.rendement_brut_pct).replace(".", ",")} %`
    : "";
  el.innerHTML = `Loyer de référence commune: ${String(loyer.loyer_m2).replace(".", ",")} €/m²${rendement} <span class="hint" data-tip="${escapeHtml(tip)}">?</span>`;
}

// `companion` = la box des ventes (stats) de la même section, repliée quand on déplie
// le détail d'emprise, et rouverte quand on le referme (accordéon anti-surcharge).
function configureScopeChip(button, panel, target, label, companion) {
  button.textContent = label;
  panel.hidden = true;
  panel.innerHTML = "";
  setCompanionPanelOpen(companion, true); // détail fermé par défaut -> ventes visibles
  button.classList.remove("open");
  button.setAttribute("aria-expanded", "false");
  const interactive = target && ["postcode", "city"].includes(target.scope_mode);
  button.disabled = !interactive;
  button.onclick = interactive
    ? () => toggleScopeDetails(button, panel, target, companion)
    : null;
}

async function toggleScopeDetails(button, panel, target, companion) {
  if (!panel.hidden) {
    panel.hidden = true;
    setCompanionPanelOpen(companion, true); // on referme le détail -> les ventes reviennent
    button.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    return;
  }
  button.classList.add("open");
  button.setAttribute("aria-expanded", "true");
  panel.hidden = false;
  setCompanionPanelOpen(companion, false); // on déplie le détail -> on replie les ventes
  const loadingTimer = setTimeout(() => {
    if (!panel.hidden) panel.innerHTML = `<strong>Chargement...</strong>`;
  }, 120);
  const params = new URLSearchParams({
    dept: target.dept || "",
    scope_mode: target.scope_mode || "",
    postcode: target.postcode || "",
    citycode: target.citycode || ""
  });
  const data = await fetchJson(`/api/scope-communes?${params}`);
  clearTimeout(loadingTimer);
  if (data.error) {
    panel.innerHTML = `<strong>${escapeHtml(data.error)}</strong>`;
    return;
  }
  const isPostcodes = data.kind === "postcodes";
  const items = isPostcodes ? (data.postcodes || []) : (data.communes || []);
  const label = isPostcodes ? "code postal" : "commune";
  const plural = items.length > 1 ? "s" : "";
  panel.innerHTML = `
    <strong>${escapeHtml(data.title || "Communes")} · ${items.length} ${label}${plural}</strong>
    <ul>
      ${items.map((item) => `
        <li>
          <button type="button" data-code="${escapeHtml(item.code || "")}" data-name="${escapeHtml(item.nom || "")}">
            ${isPostcodes ? escapeHtml(item.code || "") : escapeHtml(item.nom || "")}
            ${isPostcodes ? "" : ` <span>${escapeHtml(item.code || "")}</span>`}
          </button>
        </li>
      `).join("")}
    </ul>
  `;
  for (const item of panel.querySelectorAll("button[data-code]")) {
    item.addEventListener("click", () => {
      if (isPostcodes) selectScopePostcode(item.dataset.code);
      else selectScopeCommune(item.dataset.code, item.dataset.name);
    });
  }
}

function selectScopePostcode(postcode) {
  if (!selectedAddress || !postcode) return;
  selectedScope = "postcode";
  for (const button of scopeButtons) {
    button.classList.toggle("active", button.dataset.scope === "postcode");
  }
  radiusControl.hidden = true;
  selectedAddress.properties.postcode = postcode;
  scopeDetails.hidden = true;
  marketScopeDetails.hidden = true;
  resetPriceFilterForScope();
  updateScopeGeometry();
  run();
}

function selectScopeCommune(citycode, city) {
  if (!selectedAddress || !citycode) return;
  selectedScope = "city";
  for (const button of scopeButtons) {
    button.classList.toggle("active", button.dataset.scope === "city");
  }
  radiusControl.hidden = true;
  selectedAddress.properties.citycode = citycode;
  selectedAddress.properties.city = city || selectedAddress.properties.city;
  scopeDetails.hidden = true;
  marketScopeDetails.hidden = true;
  resetPriceFilterForScope();
  updateScopeGeometry();
  run();
}

function renderComparables(rows, points, total) {
  currentComparables = rows;
  currentComparablesTotal = total ?? rows.length;
  viewedComparableUids.clear();
  setComparableGeojson(points || rows);
  selectedComparableUid = null;
  lastSelectedUid = null;
  comparableDetail.hidden = true;
  tableWrap.classList.remove("collapsed");
  setResultsAvailable(rows.length > 0);
  setParcelleDetail(null);
  tableMeta.textContent = `${currentComparablesTotal} comparable${currentComparablesTotal > 1 ? "s" : ""}`;
  updateSortControl();
  renderComparableList({ reset: true });
  if (selectedAddress) {
    updateScopeGeometry();
  }
}

function addComparableToDisplayed(row) {
  if (!row || row.uid == null || currentComparables.some((candidate) => candidate.uid === row.uid)) {
    return;
  }
  currentComparables = [...currentComparables, row];
  currentComparablesTotal = (currentComparablesTotal ?? 0) + 1;
  tableMeta.textContent = `${currentComparablesTotal} comparable${currentComparablesTotal > 1 ? "s" : ""}`;
}

// Badge classe énergie DPE (A-G) rattaché au bâtiment via RNB — vide si pas de DPE joignable.
function dpeBadge(etiquette) {
  if (!etiquette) return "";
  const c = String(etiquette).toLowerCase();
  return ` <span class="dpe-badge dpe-${c}" title="DPE classe ${escapeHtml(String(etiquette))} (bâtiment, via RNB)">${escapeHtml(String(etiquette))}</span>`;
}

function createComparableCard(row) {
  const viewed = viewedComparableUids.has(row.uid);
  const card = document.createElement("article");
  card.className = "comparable-card";
  card.classList.toggle("selected", row.uid === selectedComparableUid);
  card.classList.toggle("viewed", viewed);
  card.dataset.uid = row.uid;

  const item = document.createElement("button");
  item.type = "button";
  item.className = "comparable";
  item.dataset.uid = row.uid;
  item.classList.toggle("selected", row.uid === selectedComparableUid);
  item.innerHTML = `
    <b>${int(row.prix_m2)} €/m²</b>
    <b>${euro(row.prix)}</b>
    <span>${escapeHtml(row.commune || "")} · ${int(row.distance_m)} m · ${escapeHtml(String(row.surface ?? "-"))} m² · ${escapeHtml(String(row.pieces || "-"))} p.${dpeBadge(row.etiquette_dpe)}</span>
    <span class="result-date">${escapeHtml(row.date_mutation || "")}${viewed ? `<span class="viewed-tick" title="Détail consulté" aria-label="Détail consulté">✓</span>` : ""}</span>
  `;
  item.addEventListener("click", () => selectComparable(row.uid, { fit: true }));
  item.addEventListener("mouseenter", () => setComparableHover(row.uid, true));
  item.addEventListener("mouseleave", () => setComparableHover(row.uid, false));
  card.append(item);
  if (row.uid === selectedComparableUid) {
    const detail = document.createElement("div");
    detail.className = "comparable-detail";
    detail.dataset.uid = row.uid;
    card.append(detail);
    renderDetail(row, detail);
  }
  return card;
}

// Nombre de cartes à rendre pour remplir le panneau visible (auto-ajusté à la hauteur de l'écran,
// plafonné à MAX_INITIAL_CARDS). measuredCardHeight est connu dès le 1er rendu ; à défaut on estime.
function initialCardCount() {
  const listHeight = comparablesList.clientHeight || 560;
  const cardHeight = measuredCardHeight || 64;
  return Math.max(MIN_COMPARABLES, Math.min(MAX_INITIAL_CARDS, Math.ceil(listHeight / cardHeight) + 1));
}

function renderComparableList(options = {}) {
  const previousPositions = options.previousPositions || (options.animate ? comparableCardPositions() : null);
  const rows = displayedComparables();
  if (options.reset) renderedCount = 0;
  if (!renderedCount) renderedCount = initialCardCount();
  renderedCount = Math.min(renderedCount, rows.length);

  comparablesList.innerHTML = "";
  for (const row of rows.slice(0, renderedCount)) comparablesList.append(createComparableCard(row));

  if (!measuredCardHeight) {
    const firstCard = comparablesList.querySelector(".comparable-card");
    if (firstCard) measuredCardHeight = firstCard.getBoundingClientRect().height + 6; // + marge inter-cartes
  }
  refreshListSentinel(rows.length);
  animateComparableReorder(previousPositions);
}

// Sentinelle + observer : tant qu'elle est visible (panneau pas plein, ou scroll arrivé en bas),
// on révèle SCROLL_BATCH cartes de plus. Retirée quand toute la cohorte est rendue.
function refreshListSentinel(total) {
  if (!listObserver) {
    listObserver = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) revealMoreComparables(); },
      { root: comparablesList, rootMargin: "300px" },
    );
  }
  if (!listSentinel) {
    listSentinel = document.createElement("div");
    listSentinel.className = "list-sentinel";
    listSentinel.setAttribute("aria-hidden", "true");
  }
  listObserver.unobserve(listSentinel);
  if (renderedCount >= total) {
    listSentinel.remove();
    return;
  }
  comparablesList.append(listSentinel);
  listObserver.observe(listSentinel);
}

function revealMoreComparables() {
  const rows = displayedComparables();
  if (renderedCount >= rows.length) return;
  const from = renderedCount;
  renderedCount = Math.min(rows.length, renderedCount + SCROLL_BATCH);
  const fragment = document.createDocumentFragment();
  for (const row of rows.slice(from, renderedCount)) fragment.append(createComparableCard(row));
  comparablesList.insertBefore(fragment, listSentinel); // append AVANT la sentinelle : scroll préservé
  refreshListSentinel(rows.length);
}

function comparableCardPositions() {
  const positions = new Map();
  for (const card of comparablesList.querySelectorAll(".comparable-card[data-uid]")) {
    positions.set(card.dataset.uid, card.getBoundingClientRect());
  }
  return positions;
}

function animateComparableReorder(previousPositions) {
  if (!previousPositions || reduceMotion.matches) return;
  const movedCards = [];
  for (const card of comparablesList.querySelectorAll(".comparable-card[data-uid]")) {
    const previous = previousPositions.get(card.dataset.uid);
    if (!previous) continue;
    const current = card.getBoundingClientRect();
    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    card.style.transition = "transform 0s";
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    card.style.willChange = "transform";
    movedCards.push(card);
  }
  if (!movedCards.length) return;
  requestAnimationFrame(() => {
    for (const card of movedCards) {
      card.style.transition = "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      card.style.transform = "";
    }
    window.setTimeout(() => {
      for (const card of movedCards) {
        card.style.transition = "";
        card.style.willChange = "";
      }
    }, 220);
  });
}

function scrollComparableToMiddle(uid) {
  requestAnimationFrame(() => {
    const card = comparablesList.querySelector(`.comparable-card[data-uid="${CSS.escape(String(uid))}"]`);
    if (!card) return;
    const listRect = comparablesList.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const top = comparablesList.scrollTop
      + cardRect.top - listRect.top
      - (comparablesList.clientHeight - cardRect.height) / 2;
    comparablesList.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });
}

let hoveredComparableUid = null;
// Illumine (feature-state hover) le point carte correspondant au résultat survolé dans la liste.
function setComparableHover(uid, on, options = {}) {
  if (uid == null) return;
  if (on) {
    const firstMapHover = options.fromMap && hoveredComparableUid !== uid;
    if (hoveredComparableUid !== null && hoveredComparableUid !== uid) {
      map.setFeatureState({ source: "comparables", id: hoveredComparableUid }, { hover: false });
      const previous = comparablesList.querySelector(`.comparable-card[data-uid="${CSS.escape(String(hoveredComparableUid))}"]`);
      if (previous) previous.classList.remove("map-hover");
    }
    hoveredComparableUid = uid;
    map.setFeatureState({ source: "comparables", id: uid }, { hover: true });
    const card = comparablesList.querySelector(`.comparable-card[data-uid="${CSS.escape(String(uid))}"]`);
    if (card) {
      card.classList.toggle("map-hover", Boolean(options.fromMap));
      if (firstMapHover) scrollComparableToMiddle(uid);
    }
  } else if (hoveredComparableUid === uid) {
    hoveredComparableUid = null;
    map.setFeatureState({ source: "comparables", id: uid }, { hover: false });
    const card = comparablesList.querySelector(`.comparable-card[data-uid="${CSS.escape(String(uid))}"]`);
    if (card) card.classList.remove("map-hover");
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

function displayedComparables() {
  const rows = sortedComparables();
  if (selectedComparableUid === null) return rows;
  const selectedIndex = rows.findIndex((row) => row.uid === selectedComparableUid);
  if (selectedIndex <= 0) return rows;
  const selected = rows[selectedIndex];
  return [selected, ...rows.slice(0, selectedIndex), ...rows.slice(selectedIndex + 1)];
}

// Rang DPE : A le plus haut pour que le tri descendant (défaut) mette A en tête.
// Même orientation côté serveur (DPE_SORT_RANK dans server.py).
const DPE_SORT_RANK = { A: 7, B: 6, C: 5, D: 4, E: 3, F: 2, G: 1 };

function comparableSortValue(row) {
  if (comparableSortKey === "similarity") return Number(row.similarity) || 0;
  if (comparableSortKey === "price") return Number(row.prix) || 0;
  if (comparableSortKey === "date") return Date.parse(row.date_mutation) || 0;
  if (comparableSortKey === "surface") return Number(row.surface) || 0;
  if (comparableSortKey === "dpe") {
    // Étiquette absente : toujours en fin de liste, quel que soit le sens.
    return DPE_SORT_RANK[row.etiquette_dpe] || (comparableSortDirection === "desc" ? 0 : 8);
  }
  return Number(row.distance_m) || 0;
}

function updateSortControl() {
  const arrow = comparableSortDirection === "desc" ? "↑" : "↓";
  const labels = {
    similarity: `Similarité ${arrow}`,
    price: `Prix ${arrow}`,
    date: `Date ${arrow}`,
    surface: `m² ${arrow}`,
    dpe: `DPE ${arrow}`
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
  if (key === "dpe") return "DPE";
  return "m²";
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
  // Code postal : contours hybrides (union de communes + Voronoï, /api/codepostal).
  // Commune : limites administratives IGN locales (/api/commune).
  drawAdminScope(lon, lat);
}

// Tracé de la zone administrative depuis les contours locaux servis par le serveur :
// commune -> /api/commune, code postal -> /api/codepostal
// (contours hybrides union de communes + Voronoï). Le serveur a déjà filtré les biens
// sur ce même polygone, donc aucun filtrage géométrique côté front.
async function drawAdminScope(lon, lat) {
  const addr = selectedAddress;
  const seq = ++scopeDrawSeq;
  const props = addr.properties;
  const center = () => map.easeTo({ center: [lon, lat], zoom: 12.8, duration: 450 });

  const url = selectedScope === "city" && props.citycode
    ? `/api/commune?code=${encodeURIComponent(props.citycode)}`
    : selectedScope === "postcode" && props.postcode
      ? `/api/codepostal?code=${encodeURIComponent(props.postcode)}`
      : null;
  if (!url) {
    clearScopeGeojson();
    center();
    return;
  }
  try {
    const data = await (await fetch(url)).json();
    // Adresse ou emprise changée pendant la requête : on ignore une réponse périmée.
    if (selectedAddress !== addr || seq !== scopeDrawSeq) return;
    const fc = data.type === "FeatureCollection" ? data : { type: "FeatureCollection", features: [data] };
    const source = map.getSource("targetRadius");
    if (source) source.setData(fc);
    if (fc.features && fc.features.length) fitToFeatureCollection(fc);
    else center();
  } catch {
    if (selectedAddress !== addr || seq !== scopeDrawSeq) return;
    clearScopeGeojson();
    center();
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

// Peint la zone selon le TON du fond affiché (BASE_TONE) — couleurs teal par défaut,
// ou teinte choisie au curseur. Le thème UI ne pilote pas ces couches : un fond clair
// sous thème sombre rendait le cercle invisible (teal pâle sur carte claire).
function applyZoneColor() {
  const dark = (BASE_TONE[currentBase] || "dark") === "dark";
  let line, fill, outline;
  if (zoneHue === null) {
    line = dark ? "#5eead4" : "#0d9488";
    fill = dark ? "rgba(45, 212, 191, 0.07)" : "rgba(13, 148, 136, 0.08)";
    outline = dark ? "rgba(45, 212, 191, 0.3)" : "rgba(13, 148, 136, 0.35)";
  } else {
    const base = dark ? `${zoneHue}, 72%, 62%` : `${zoneHue}, 75%, 36%`;
    line = `hsl(${base})`;
    fill = `hsla(${base}, ${dark ? 0.07 : 0.08})`;
    outline = `hsla(${base}, ${dark ? 0.3 : 0.35})`;
  }
  if (map.getLayer("target-radius-line")) {
    map.setPaintProperty("target-radius-line", "line-color", line);
  }
  if (map.getLayer("target-radius-fill")) {
    map.setPaintProperty("target-radius-fill", "fill-color", fill);
    map.setPaintProperty("target-radius-fill", "fill-outline-color", outline);
  }
  zoneColorSlider.style.setProperty("--zone-color", line);
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

function formatHistoryRange(minYears, maxYears) {
  const fmt = (years) => years === 0 ? "0" : years === 1 ? "12 mois" : `${years} ans`;
  if (minYears === maxYears) return fmt(maxYears);
  return `${fmt(minYears)} – ${fmt(maxYears)}`;
}

function setComparableGeojson(points) {
  const source = map.getSource("comparables");
  if (!source) return;
  hoveredComparableUid = null; // setData réinitialise les feature-states
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
        ts: Date.parse(p.date_mutation) || 0,
        type_local: p.type_local || "",
        similarity: p.similarity ?? 0,
        categorie: p.type_local || ""
      }
    }))
  });
  timelineSetData(points);
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
  for (const card of comparablesList.querySelectorAll(".comparable-card")) {
    card.classList.toggle("selected", Number(card.dataset.uid) === uid);
  }
  if (uid === null) {
    comparableDetail.hidden = true;
    renderComparableList({ animate: true });
    setParcelleDetail(null);
    // On rétablit la grille cadastre selon le réglage du menu.
    applyCadastre();
    return;
  }

  let row = currentComparables.find((candidate) => candidate.uid === uid) || fallbackRow;
  if (!row) return;
  addComparableToDisplayed(row);
  row = currentComparables.find((candidate) => candidate.uid === uid) || row;
  viewedComparableUids.add(uid);
  tableWrap.classList.remove("collapsed");
  comparableDetail.hidden = true;
  const previousPositions = comparableCardPositions();
  comparablesList.scrollTop = 0;
  renderComparableList({ previousPositions });
  loadComparableLieuDit(row);
  // Focus sur la parcelle : on n'affiche que sa grille cadastre (via loadComparableBatiments)
  // et on retire les autres parcelles de l'overlay général.
  setCadastre(null);
  loadComparableBatiments(row);
  loadComparableAdresses(row);
  loadComparableDpe(row);
  if (options.fit) {
    map.flyTo({ center: [row.lon, row.lat], zoom: Math.max(map.getZoom(), 16) });
  }
}

function renderDetail(row, container = detailBody) {
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

  // La commune de la vente a fusionné / changé de code depuis : on trace l'origine + la date.
  const communeModif = row.commune_modif_origine
    ? `<p class="detail-note">⚠ Commune modifiée${row.commune_modif_date ? ` le ${escapeHtml(row.commune_modif_date)}` : ""} — vendue sous ${escapeHtml(row.commune_modif_origine)}, rattachée aujourd'hui à ${escapeHtml(row.commune || "")} (${escapeHtml(row.code_commune || "")}).</p>`
    : "";

  // Sous-section Copropriété (RNIC, lien cadastral direct par parcelle).
  const coproFields = [
    row.copro_lots_habitation != null ? detailField("Lots habitation", int(row.copro_lots_habitation)) : "",
    row.copro_lots_total != null ? detailField("Lots total", int(row.copro_lots_total)) : "",
    row.copro_lots_stationnement != null ? detailField("Lots stationnement", int(row.copro_lots_stationnement)) : "",
    row.copro_periode_construction ? detailField("Période copro", formatPeriodeCopro(row.copro_periode_construction)) : "",
    row.copro_type_syndic ? detailField("Syndic", row.copro_type_syndic) : "",
    row.copro_residence_service && row.copro_residence_service.toLowerCase() === "oui"
      ? detailField("Résidence services", "oui") : "",
    row.copro_qpv ? detailField("Quartier prioritaire", row.copro_qpv) : "",
  ].join("");
  const coproNote = Number(row.copro_n_sur_parcelle) > 1
    ? `<p class="detail-note">${int(row.copro_n_sur_parcelle)} copropriétés immatriculées sur la parcelle — affichée : la plus grande (lots habitation).</p>`
    : "";

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

  container.innerHTML = `
    <div class="detail-title">
      <strong>${int(row.prix_m2)} €/m² · ${euro(row.prix)}</strong>
      <span>${escapeHtml(row.adresse || "Adresse DVF non renseignée")}</span>
      <span>${escapeHtml(row.code_postal || "")} ${escapeHtml(row.commune || "")}</span>
      <span id="detailLieuDit" class="detail-lieudit" hidden></span>
    </div>
    ${communeModif}
    <div class="detail-grid">
      ${mainFields}
    </div>
    ${detailSection("Cadastre", cadastreFields)}
    ${collapsible("Bâti cadastral", `<div id="detailBatiments" class="detail-batiments"><span class="street-muted">Lecture du cadastre…</span></div>`)}
    ${detailSection("Bâtiment (RNB / BDNB)", bdnbFields)}
    ${coproFields ? collapsible("Copropriété (RNIC)", `<div class="detail-grid">${coproFields}</div>${coproNote}`, { hint: COPRO_HINT }) : ""}
    ${collapsible("DPE (énergie)", `<div id="detailDpe" class="detail-dpe"><span class="street-muted">Lecture du DPE…</span></div>`, { hint: DPE_HINT })}
    ${collapsible("Adresses (lien parcellaire)", `<div id="detailAdresses" class="detail-adresses"><span class="street-muted">Lecture du lien parcelle↔adresse…</span></div>`, { hint: ADRESSES_PARCELLE_HINT })}
  `;
}

// Rattache le bien à sa localité (lieu-dit cadastral) — seule maille nommée infra-communale.
async function loadComparableLieuDit(row) {
  if (row.lon == null || row.lat == null) return;
  const dept = currentDept();
  if (!dept) return;
  const url = new URL("/api/lieudit", window.location.origin);
  url.searchParams.set("dept", dept);
  url.searchParams.set("lon", row.lon);
  url.searchParams.set("lat", row.lat);
  let data = null;
  try {
    const response = await fetch(url);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  if (selectedComparableUid !== row.uid) return; // sélection changée entre-temps
  const el = document.querySelector(`.comparable-detail[data-uid="${CSS.escape(String(row.uid))}"] #detailLieuDit`)
    || document.querySelector("#detailLieuDit");
  if (!el || !data || !data.nom) return;
  el.textContent = `Lieu-dit : ${data.nom}`;
  el.hidden = false;
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
  "Consommation": "Consommation d'énergie primaire du logement, tous usages (chauffage, eau chaude, refroidissement, éclairage, auxiliaires), telle que calculée par le DPE. C'est la valeur chiffrée derrière l'étiquette.",
  "Émissions GES": "Émissions de gaz à effet de serre du logement calculées par le DPE — la valeur chiffrée derrière l'étiquette climat.",
  "Étage": "Étage du logement diagnostiqué, déclaré dans le DPE (0 = rez-de-chaussée). Aide à reconnaître le lot en collectif.",
  "Validité": "Un DPE est valable 10 ans (durées réduites pour les diagnostics 2013-2017 réformés). Un DPE expiré reste un signal, plus une preuve.",
  "Surface DPE": "Surface habitable du logement déclarée dans le diagnostic — à comparer à la surface DVF de la vente pour juger si c'est bien le même lot.",
  "Millésime": "Méthode DPE : depuis juillet 2021 le calcul est opposable et unifié (3CL) ; avant, méthode sur factures, moins fiable.",
  "Énergie chauffage": "Énergie principale de chauffage déclarée dans le DPE.",
  "Lots habitation": "Nombre de lots à usage d'habitation déclaré au registre des copropriétés — la taille réelle de la copropriété, introuvable dans DVF.",
  "Lots total": "Nombre total de lots de la copropriété (habitation, commerces, caves, parkings…).",
  "Lots stationnement": "Lots de stationnement déclarés (aériens, garages, sous-sol).",
  "Période copro": "Période de construction déclarée au règlement de copropriété (RNIC).",
  "Syndic": "Type de représentant légal de la copropriété : professionnel ou bénévole.",
  "Résidence services": "Copropriété en résidence-services (loi de 1965, art. 41-1) : services partagés, charges spécifiques.",
  "Quartier prioritaire": "La copropriété est située dans un quartier prioritaire de la politique de la ville (périmètres 2024).",
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

// Repli/dépli des blocs collapsibles (délégation : le détail inline est ré-rendu en innerHTML).
document.addEventListener("click", (event) => {
  const summary = event.target.closest(".collapsible-summary");
  if (summary) summary.parentElement.classList.toggle("open");
});

// Survol d'une box « Bâti cadastral » -> illumine l'empreinte correspondante sur la carte.
document.addEventListener("mouseover", (event) => {
  const item = event.target.closest("[data-bati-idx]");
  if (item) setBatiHover(Number(item.dataset.batiIdx));
});
document.addEventListener("mouseout", (event) => {
  const item = event.target.closest("[data-bati-idx]");
  if (item && !item.contains(event.relatedTarget)) setBatiHover(null);
});

// Bloc repliable animé (grid-template-rows 0fr→1fr) — préféré à <details> qui
// ne peut pas animer sa hauteur (contenu en display:none quand fermé).
function detailSection(title, fieldsHtml) {
  if (!fieldsHtml.trim()) return "";
  return collapsible(title, `<div class="detail-grid">${fieldsHtml}</div>`);
}

function collapsible(title, innerHtml, { id = "", hint = "" } = {}) {
  const attr = id ? ` id="${id}"` : "";
  const help = hint ? ` <span class="hint" data-tip="${escapeHtml(hint)}">?</span>` : "";
  return `
    <div class="collapsible"${attr}>
      <button type="button" class="collapsible-summary">${escapeHtml(title)}${help}</button>
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
