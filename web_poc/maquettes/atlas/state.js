/* state.js — l'« Analyse » courante (état partagé) + utilitaires DOM/géo.
   Singleton importé par tous les modules : on lit/écrit S.xxx. Les créneaux
   fonctions (S.run, S.selectComparable) sont remplis par le point d'entrée
   atlas.js — ça évite les cycles d'import entre modules. */

export const S = {
  map: null, mapReady: false, targetMarker: null,
  selectedAddress: null,         // Feature BAN (ses .properties sont mutées par CP/commune)
  scopeMode: "radius",           // radius | cadastre | postcode | city
  fitPending: false,             // recadrer la carte sur l'emprise au prochain drawZone
  radiusIdx: 4,
  histMin: 0, histMax: 5,
  sortKey: "similarity", sortDir: "desc",
  selectedMode: "estimation",    // estimation | exploration
  currentBase: null,             // fond de carte affiché
  zoneHue: null,                 // teinte de zone (null = teal du ton du fond)
  cadastreMode: "none",          // none | biens | all
  runSeq: 0,                     // garde anti-course (réponses périmées)
  lastTarget: null, lastPoints: [], lastComparables: [],
  selectedComparableUid: null,
  hoveredComparableUid: null,
  selectedMarketTypes: new Set(),   // catégories filtrées en exploration (vide = Tous)
  // créneaux remplis par atlas.js (anti-cycles) :
  run() {},
  selectComparable() {},
  configureScopeChip() {},   // arme/désarme la puce d'emprise (rempli par atlas.js)
  resetMarketFilters() {},   // remet les curseurs marché à plat (rempli par atlas.js)
};

export const RADIUS_STEPS = [100, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 5000, 8000, 12000, 20000];
export const MARKET_CATEGORIES = ["Maison", "Appartement", "Terrain", "Dépendance", "Local"];
export const CATEGORY_COLORS = { Maison: "#176b5b", Appartement: "#2457c5", Terrain: "#8a6d1f", "Dépendance": "#9a5b9a", Local: "#c4472f" };
export const byId = (id) => document.getElementById(id);
export const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
export const fc = (features) => ({ type: "FeatureCollection", features: features || [] });
export const radiusM = () => RADIUS_STEPS[S.radiusIdx];

export function currentDept() {
  if (!S.selectedAddress) return null;
  const cc = S.selectedAddress.properties.citycode || "";
  return cc.startsWith("97") ? cc.slice(0, 3) : cc.slice(0, 2);
}

export function setStatus(t) { const el = byId("statusLine"); if (el) el.textContent = t; }
export function setBusy(b) {
  const btn = byId("estimate");
  if (btn) { btn.disabled = b; btn.textContent = b ? "…" : (S.selectedMode === "exploration" ? "Explorer" : "Estimer"); }
}
