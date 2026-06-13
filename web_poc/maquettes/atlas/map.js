/* map.js — MapLibre : fonds de carte (bascule de visibilité), zone d'emprise,
   grille cadastre, marqueur cible, couche comparables. Les clics carte sont
   délégués via les callbacks passés à initMap() (anti-cycles d'import). */
import { S, byId, isDark, fc, currentDept, radiusM } from "./state.js";
import * as api from "./api.js";

const carto = (path) => ["a", "b", "c"].map((s) => "https://" + s + ".basemaps.cartocdn.com/" + path + "/{z}/{x}/{y}.png");
const BASEMAPS = {
  carto: { tiles: carto("light_all"), attr: "© OpenStreetMap © CARTO" },
  cartodark: { tiles: carto("dark_all"), attr: "© OpenStreetMap © CARTO", paint: { "raster-brightness-min": 0.22, "raster-contrast": 0.08, "raster-saturation": 0.15 } },
  voyager: { tiles: carto("rastertiles/voyager"), attr: "© OpenStreetMap © CARTO" },
  ignplan: { tiles: ["https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"], attr: "© IGN / cartes.gouv.fr" },
  stadiasat: { tiles: ["https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg"], attr: "© Stadia Maps © OpenStreetMap" },
  osm: { tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], attr: "© OpenStreetMap" },
};
const BASE_LAYERS = ["carto", "cartodark", "voyager", "ignplan", "stadiasat", "osm"];
const BASE_TONE = { carto: "light", cartodark: "dark", voyager: "light", ignplan: "light", stadiasat: "dark", osm: "light" };
const BASE_LABEL = { carto: "Positron", cartodark: "Dark Matter", voyager: "Voyager", ignplan: "IGN Plan", stadiasat: "Stadia Satellite", osm: "OSM standard" };
const CAD_LABEL = { none: "Masquée", biens: "Biens affichés", all: "Tout (zoom ≥ 14)" };

let handlers = {};

function buildStyle() {
  const sources = {}, layers = [];
  BASE_LAYERS.forEach((id) => {
    const b = BASEMAPS[id];
    sources["base-" + id] = { type: "raster", tiles: b.tiles, tileSize: 256, attribution: b.attr };
    layers.push({ id: "base-" + id, type: "raster", source: "base-" + id, layout: { visibility: id === S.currentBase ? "visible" : "none" }, paint: b.paint || {} });
  });
  return { version: 8, sources, layers };
}
export function applyBasemap(id) {
  S.currentBase = id;
  BASE_LAYERS.forEach((b) => { if (S.map.getLayer("base-" + b)) S.map.setLayoutProperty("base-" + b, "visibility", b === id ? "visible" : "none"); });
  applyZoneColor();
  markBasemap();
}
export function applyZoneColor() {
  if (!S.mapReady) return;
  const dark = (BASE_TONE[S.currentBase] || "dark") === "dark";
  let line, fill;
  if (S.zoneHue == null) {
    line = dark ? "#5eead4" : "#0d9488";
    fill = dark ? "rgba(45,212,191,0.08)" : "rgba(13,148,136,0.08)";
  } else {
    const hsl = S.zoneHue + (dark ? ", 72%, 62%" : ", 75%, 36%");
    line = "hsl(" + hsl + ")"; fill = "hsla(" + hsl + ", 0.1)";
  }
  if (S.map.getLayer("zone-line")) S.map.setPaintProperty("zone-line", "line-color", line);
  if (S.map.getLayer("zone-fill")) S.map.setPaintProperty("zone-fill", "fill-color", fill);
  if (S.map.getLayer("cadastre-lines")) S.map.setPaintProperty("cadastre-lines", "line-color", dark ? "#a78bfa" : "#7048e8");
  const zc = document.querySelector(".zone-color"); if (zc) zc.style.setProperty("--zone-color", line);
}
export function markBasemap() {
  document.querySelectorAll("[data-layer]").forEach((b) => b.classList.toggle("active", b.dataset.layer === S.currentBase));
  if (byId("baseLayerLabel")) byId("baseLayerLabel").textContent = BASE_LABEL[S.currentBase] || S.currentBase;
}

function addDataLayers() {
  S.map.addSource("zone", { type: "geojson", data: fc([]) });
  S.map.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "rgba(13,148,136,0.08)" } });
  S.map.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#0d9488", "line-width": 1.4, "line-opacity": 0.85 } });
  S.map.addSource("cadastre", { type: "geojson", data: fc([]) });
  S.map.addLayer({ id: "cadastre-lines", type: "line", source: "cadastre", paint: { "line-color": "#7048e8", "line-width": 0.7, "line-opacity": 0.55 } });
  // Parcelle + empreintes bâties du comparable sélectionné (sous les points ; survol bidirectionnel).
  S.map.addSource("parcelleDetail", { type: "geojson", data: fc([]), promoteId: "idx" });
  S.map.addLayer({ id: "parcelle-detail-outline", type: "line", source: "parcelleDetail", filter: ["==", ["get", "kind"], "parcelle"], paint: { "line-color": "#7048e8", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.9 } });
  S.map.addLayer({ id: "parcelle-detail-bati-fill", type: "fill", source: "parcelleDetail", filter: ["==", ["get", "kind"], "batiment"], paint: { "fill-color": ["case", ["boolean", ["feature-state", "hover"], false], "#ffd24a", ["match", ["get", "type"], "02", "#f0a020", "#e0533d"]], "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.8, 0.5] } });
  S.map.addLayer({ id: "parcelle-detail-bati-line", type: "line", source: "parcelleDetail", filter: ["==", ["get", "kind"], "batiment"], paint: { "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#b06a00", ["match", ["get", "type"], "02", "#b8741a", "#a83523"]], "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 1.2] } });
  S.map.addLayer({ id: "parcelle-detail-porteuse-outline", type: "line", source: "parcelleDetail", filter: ["==", ["get", "kind"], "parcelle_porteuse"], paint: { "line-color": "#1f8a8a", "line-width": 1.6, "line-dasharray": [1, 2], "line-opacity": 0.75 } });
  S.map.addLayer({ id: "parcelle-detail-voisin-fill", type: "fill", source: "parcelleDetail", filter: ["==", ["get", "kind"], "batiment_rnb_voisin"], paint: { "fill-color": "#1f8a8a", "fill-opacity": 0.28 } });
  S.map.addLayer({ id: "parcelle-detail-voisin-line", type: "line", source: "parcelleDetail", filter: ["==", ["get", "kind"], "batiment_rnb_voisin"], paint: { "line-color": "#176b6b", "line-width": 1.2, "line-dasharray": [2, 1], "line-opacity": 0.85 } });
  S.map.on("mousemove", "parcelle-detail-bati-fill", (e) => { S.map.getCanvas().style.cursor = "pointer"; if (e.features[0]) setBatiHover(e.features[0].id); });
  S.map.on("mouseleave", "parcelle-detail-bati-fill", () => { S.map.getCanvas().style.cursor = ""; setBatiHover(null); });
  S.map.addSource("comparables", { type: "geojson", data: fc([]) });
  S.map.addLayer({
    id: "comparables-points", type: "circle", source: "comparables",
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 12, ["boolean", ["feature-state", "hover"], false], 10, ["interpolate", ["linear"], ["get", "similarity"], 0, 5, 100, 11]],
      "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], "#0f6f9f", ["interpolate", ["linear"], ["get", "similarity"], 0, "#c4472f", 60, "#eeb552", 100, "#176b5b"]],
      "circle-stroke-color": "#fff", "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1], "circle-opacity": 0.92,
    },
  });
  S.map.on("click", "comparables-points", (e) => handlers.onSelectComparable && handlers.onSelectComparable(e.features[0].properties.uid));
  S.map.on("mousemove", "comparables-points", (e) => { S.map.getCanvas().style.cursor = "pointer"; if (handlers.onHover && e.features[0]) handlers.onHover(e.features[0].properties.uid); });
  S.map.on("mouseleave", "comparables-points", () => { S.map.getCanvas().style.cursor = ""; if (handlers.onHover) handlers.onHover(null); });
  S.map.on("dblclick", "comparables-points", (e) => {
    const f = e.features && e.features[0]; if (!f) return;
    if (handlers.onSelectComparable) handlers.onSelectComparable(f.properties.uid);
    S.map.easeTo({ center: f.geometry.coordinates, zoom: 16.5 });
  });
}

export function initMap(h) {
  handlers = h || {};
  S.currentBase = isDark() ? "cartodark" : "carto";
  S.map = new maplibregl.Map({ container: "map", style: buildStyle(), center: [-1.426, 46.670], zoom: 11, attributionControl: false });
  S.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
  S.map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  S.map.doubleClickZoom.disable();
  S.map.on("load", () => { S.mapReady = true; addDataLayers(); applyZoneColor(); paintMap(); markBasemap(); });
  let cadTimer;
  S.map.on("moveend", () => { clearTimeout(cadTimer); cadTimer = setTimeout(loadCadastreViewport, 250); });
  S.map.on("dblclick", (e) => {
    if (S.map.queryRenderedFeatures(e.point, { layers: ["comparables-points"] }).length) return;
    if (handlers.onMapDblClick) handlers.onMapDblClick(e.lngLat.lng, e.lngLat.lat);
  });
}

export function setTargetMarker(lon, lat) {
  if (!S.targetMarker) {
    const el = document.createElement("div"); el.className = "map-target";
    S.targetMarker = new maplibregl.Marker({ element: el });
  }
  S.targetMarker.setLngLat([lon, lat]).addTo(S.map);
}
function circlePolygon(lon, lat, r) {
  const pts = [], n = 80, dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [pts] }, properties: {} };
}
export function paintMap() {
  if (!S.mapReady || !S.map.getSource("comparables")) return;
  S.hoveredComparableUid = null;  // setData efface les feature-states : on repart propre
  S.map.getSource("comparables").setData(fc(S.lastPoints.map((p) => ({
    type: "Feature", id: p.uid, geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    properties: { uid: p.uid, similarity: p.similarity == null ? 50 : p.similarity, ts: Date.parse(p.date_mutation) || 0, categorie: p.type_local || "" },
  }))));
  drawZone();
}
export function setZoneVisibility(show) {
  ["zone-fill", "zone-line"].forEach((l) => { if (S.map.getLayer(l)) S.map.setLayoutProperty(l, "visibility", show ? "visible" : "none"); });
}
// Vide toutes les couches de données + retire le marqueur cible (utilisé par Reset).
export function clearMap() {
  if (!S.mapReady) return;
  ["zone", "cadastre", "comparables", "parcelleDetail"].forEach((s) => { if (S.map.getSource(s)) S.map.getSource(s).setData(fc([])); });
  if (S.targetMarker) { try { S.targetMarker.remove(); } catch (e) {} S.targetMarker = null; }
}

// Empreintes bâties du comparable sélectionné + survol bidirectionnel liste<->carte.
let hoveredBatiId = null;
export function setParcelleDetail(d) {
  if (!S.mapReady || !S.map.getSource("parcelleDetail")) return;
  S.map.getSource("parcelleDetail").setData(d && d.type ? d : fc([]));
  hoveredBatiId = null;  // setData réinitialise les feature-states
}
export function setBatiHover(id) {
  if (!S.mapReady || !S.map.getSource("parcelleDetail")) return;
  id = id == null ? null : Number(id);
  if (id === hoveredBatiId) return;
  if (hoveredBatiId != null) {
    try { S.map.setFeatureState({ source: "parcelleDetail", id: hoveredBatiId }, { hover: false }); } catch (e) {}
    document.querySelectorAll('[data-bati-idx="' + hoveredBatiId + '"]').forEach((el) => el.classList.remove("bati-hover"));
  }
  hoveredBatiId = id;
  if (id != null) {
    try { S.map.setFeatureState({ source: "parcelleDetail", id }, { hover: true }); } catch (e) {}
    document.querySelectorAll('[data-bati-idx="' + id + '"]').forEach((el) => { el.classList.add("bati-hover"); const c = el.closest("details"); if (c) c.open = true; });
  }
}
// Paliers de zoom (POC) pour qu'un rayon donné tienne dans l'écran.
function zoomForRadius(m) {
  if (m <= 100) return 17.3; if (m <= 150) return 16.9; if (m <= 200) return 16.6;
  if (m <= 300) return 16.1; if (m <= 400) return 15.8; if (m <= 500) return 15.5;
  if (m <= 1000) return 14.7; if (m <= 1500) return 14.2; if (m <= 2000) return 13.8;
  if (m <= 3000) return 13.2; if (m <= 4000) return 12.8; if (m <= 5000) return 12.4;
  if (m <= 10000) return 11.4; return 10.4;
}
// Recadre la carte sur une géométrie nue ou une FeatureCollection.
function fitGeo(g) {
  const bounds = new maplibregl.LngLatBounds();
  const extend = (co) => { if (typeof co[0] === "number") bounds.extend(co); else for (const x of co) extend(x); };
  const feats = g.type === "FeatureCollection" ? (g.features || []) : [g.type === "Feature" ? g : { geometry: g }];
  for (const f of feats) { if (f.geometry) extend(f.geometry.coordinates); }
  if (!bounds.isEmpty()) S.map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 500 });
}
export function drawZone() {
  if (!S.mapReady || !S.map.getSource("zone") || !S.selectedAddress) return;
  const c = S.selectedAddress.geometry.coordinates;
  const fit = S.fitPending; S.fitPending = false;  // recadrer une seule fois (changement d'emprise/adresse)
  if (S.scopeMode === "radius") {
    S.map.getSource("zone").setData(fc([circlePolygon(c[0], c[1], radiusM())]));
    if (fit) S.map.easeTo({ center: c, zoom: zoomForRadius(radiusM()), duration: 450 });
  } else if (S.scopeMode === "cadastre" && S.lastTarget && S.lastTarget.section && S.lastTarget.section.geojson) {
    // section.geojson est une GÉOMÉTRIE nue (MultiPolygon) ; setData veut une Feature.
    const g = S.lastTarget.section.geojson;
    S.map.getSource("zone").setData((g.type === "Feature" || g.type === "FeatureCollection") ? g : { type: "Feature", geometry: g, properties: {} });
    if (fit) fitGeo(g);
  } else if (S.scopeMode === "postcode" || S.scopeMode === "city") {
    const addr = S.selectedAddress, mode = S.scopeMode;  // garde anti-réponse-périmée
    const p = (S.scopeMode === "postcode") ? api.codepostal(S.selectedAddress.properties.postcode || "") : api.commune(S.selectedAddress.properties.citycode || "");
    p.then((d) => {
      if (S.selectedAddress !== addr || S.scopeMode !== mode || !d || !d.type) return;
      S.map.getSource("zone").setData(d);
      if (fit) fitGeo(d);
    });
  } else {
    S.map.getSource("zone").setData(fc([]));
  }
}

// Grille cadastre — modes du POC : none / biens / all (zoom >= 14).
export function setCadastre(data) { if (S.map.getSource("cadastre")) S.map.getSource("cadastre").setData(data || fc([])); }
export function applyCadastre() {
  if (S.cadastreMode === "all") loadCadastreViewport();
  else if (S.cadastreMode === "biens") loadCadastreBiens();
  else setCadastre(null);
}
export function loadCadastreViewport() {
  if (!S.mapReady || S.cadastreMode !== "all") return;
  const dept = currentDept();
  if (!dept || S.map.getZoom() < 14) { setCadastre(null); return; }
  const b = S.map.getBounds(), bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
  api.parcelles({ dept, bbox }).then((d) => { if (d && d.type && S.cadastreMode === "all") setCadastre(d); });
}
export function loadCadastreBiens() {
  const dept = currentDept();
  const ids = [...new Set(S.lastComparables.map((r) => r.id_parcelle).filter(Boolean))];
  if (!dept || !ids.length) { setCadastre(null); return; }
  api.parcelles({ dept, ids: ids.join(",") }).then((d) => { if (d && d.type && S.cadastreMode === "biens") setCadastre(d); });
}
export function setCadastreMode(mode) {
  S.cadastreMode = mode;
  document.querySelectorAll("[data-cadastre]").forEach((b) => b.classList.toggle("active", b.dataset.cadastre === mode));
  if (byId("cadastreLabel")) byId("cadastreLabel").textContent = CAD_LABEL[mode] || mode;
  applyCadastre();
}

// Couleur des points : par similarité (estimation) ou par catégorie (exploration).
export function applyMapMode() {
  if (!S.mapReady || !S.map.getLayer("comparables-points")) return;
  if (S.selectedMode === "exploration") {
    S.map.setPaintProperty("comparables-points", "circle-color", ["match", ["get", "categorie"], "Maison", "#176b5b", "Appartement", "#2457c5", "Terrain", "#8a6d1f", "Dépendance", "#9a5b9a", "Local", "#c4472f", "#66736d"]);
    S.map.setPaintProperty("comparables-points", "circle-radius", ["case", ["boolean", ["feature-state", "selected"], false], 11, ["boolean", ["feature-state", "hover"], false], 9, 6]);
  } else {
    S.map.setPaintProperty("comparables-points", "circle-color", ["case", ["boolean", ["feature-state", "selected"], false], "#0f6f9f", ["interpolate", ["linear"], ["get", "similarity"], 0, "#c4472f", 60, "#eeb552", 100, "#176b5b"]]);
    S.map.setPaintProperty("comparables-points", "circle-radius", ["case", ["boolean", ["feature-state", "selected"], false], 12, ["boolean", ["feature-state", "hover"], false], 10, ["interpolate", ["linear"], ["get", "similarity"], 0, 5, 100, 11]]);
  }
}
