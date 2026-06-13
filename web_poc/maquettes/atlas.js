/* atlas.js — POINT D'ENTRÉE de la page Atlas du marché.
   Toute la logique vit dans atlas/*.js (modules ES natifs, zéro build, ADR 0008).
   Ici on remplit les créneaux d'état (S.run, S.selectComparable) pour éviter les
   cycles d'import, on branche la carte + le panneau, et on démarre. */
import { S, isDark } from "./atlas/state.js";
import * as map from "./atlas/map.js";
import * as address from "./atlas/address.js";
import { selectComparable, setHover } from "./atlas/comparables.js";
import { estimate } from "./atlas/estimate.js";
import { runMarket, resetMarketFiltersForScope } from "./atlas/explore.js";
import { configureScopeChip } from "./atlas/scope.js";
import { initTimeline } from "./atlas/timeline.js";
import * as controls from "./atlas/controls.js";

// Dispatcher estimation / exploration, appelé depuis address, controls, etc.
S.run = () => {
  if (!S.selectedAddress) return;
  if (S.selectedMode === "exploration") runMarket();
  else estimate();
};
S.selectComparable = selectComparable;
S.configureScopeChip = configureScopeChip;
S.resetMarketFilters = resetMarketFiltersForScope;

if (!window.maplibregl) {
  console.error("MapLibre non chargé");
} else {
  map.initMap({
    onSelectComparable: (uid) => selectComparable(uid, true),  // clic carte
    onMapDblClick: address.reverseGeocodeAndSelect,            // double-clic = nouveau point
    onHover: (uid) => setHover(uid, true),                     // survol carte -> liste
  });
  initTimeline(S.map);                                          // frise temporelle réelle
  address.wireAddress();
  controls.wire();
  // Bascule de thème : si le fond auto (CARTO) est affiché, l'accorder au thème.
  window.addEventListener("themechange", () => {
    if (S.currentBase === "carto" || S.currentBase === "cartodark") map.applyBasemap(isDark() ? "cartodark" : "carto");
  });
}
