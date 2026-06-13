/* controls.js — câblage du panneau gauche : mode, emprise, curseurs, menus
   carte/cadastre, zone. Appelle S.run() (le dispatcher défini dans atlas.js). */
import { S, byId, radiusM, setStatus } from "./state.js";
import { applyBasemap, setCadastreMode, applyMapMode, drawZone, setZoneVisibility, applyZoneColor, clearMap } from "./map.js";
import { setSort, renderComparables } from "./comparables.js";
import { toggleMarketType, syncMarketTypeMenu, resetMarketFiltersForScope, syncMarketFilterAvailability, wireMarketSliders } from "./explore.js";

const radiusLabel = (m) => m >= 1000 ? (m / 1000).toString().replace(".", ",") + " km" : m + " m";

export function applyMode() {
  const explore = S.selectedMode === "exploration";
  if (byId("estimate")) byId("estimate").textContent = explore ? "Explorer" : "Estimer";
  const grid = document.querySelector(".panel .grid"); if (grid) grid.style.display = explore ? "none" : "";
  const ef = byId("explorationFilters"); if (ef) ef.hidden = !explore;
  ["priceControl", "surfaceControl", "roomsControl"].forEach((id) => { const el = byId(id); if (el) el.hidden = !explore; });
  const lbl = document.querySelector(".search-field span"); if (lbl) lbl.textContent = explore ? "Adresse, code postal ou commune" : "Adresse, zone ou ville";
  const rs = byId("result"); if (rs) rs.hidden = true;
  // Tri par défaut selon le mode : les biens marché n'ont pas de similarité.
  if (explore) { S.sortKey = null; if (byId("sortLabel")) byId("sortLabel").textContent = "Par défaut"; }
  else { S.sortKey = "similarity"; S.sortDir = "desc"; if (byId("sortLabel")) byId("sortLabel").textContent = "Similarité"; }
  document.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("active", !explore && b.dataset.sort === "similarity"));
  syncMarketFilterAvailability();
  applyMapMode();
  if (S.selectedAddress) S.run();
}

// Reset complet : remet TOUS les champs/états à leur valeur initiale (cf. POC resetAll).
export function resetAll() {
  byId("address").value = ""; S.selectedAddress = null;
  const sg = byId("suggestions"); if (sg) { sg.innerHTML = ""; sg.hidden = true; }
  byId("type").value = "Maison"; byId("surface").value = "92"; byId("rooms").value = "4"; byId("askedPrice").value = "";
  S.radiusIdx = 4; byId("radius").value = "4"; byId("radiusValue").textContent = radiusLabel(radiusM());
  S.histMin = 0; S.histMax = 5; byId("historyMin").value = "0"; byId("historyMax").value = "5"; byId("historyValue").textContent = "0 – 5 ans";
  S.sortKey = "similarity"; S.sortDir = "desc"; if (byId("sortLabel")) byId("sortLabel").textContent = "Similarité";
  document.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("active", b.dataset.sort === "similarity"));
  S.scopeMode = "radius";
  document.querySelectorAll(".scope-control button").forEach((b) => b.classList.toggle("active", b.dataset.scope === "radius"));
  byId("radiusControl").style.display = "";
  const zt = document.querySelector(".zone-toggle input"); if (zt) zt.checked = true; setZoneVisibility(true);
  S.selectedMarketTypes.clear(); syncMarketTypeMenu(); resetMarketFiltersForScope();
  setCadastreMode("none");
  clearMap();
  renderComparables([]);
  const tw = document.querySelector(".table-wrap"); if (tw) tw.classList.add("collapsed");
  if (byId("result")) byId("result").hidden = true;
  setStatus("");
  S.selectedMode = "estimation";
  document.querySelectorAll(".mode-control button").forEach((b) => b.classList.toggle("active", (b.dataset.mode || "estimation") === "estimation"));
  applyMode();
}

export function wire() {
  byId("estimate").addEventListener("click", () => S.run());
  byId("reset").addEventListener("click", resetAll);
  ["type", "surface", "rooms", "askedPrice"].forEach((id) => byId(id).addEventListener("change", () => S.run()));
  const panel = document.querySelector(".panel");
  if (panel) panel.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id !== "address" && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) { e.preventDefault(); S.run(); } });

  document.querySelectorAll(".scope-control button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".scope-control button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.scopeMode = b.dataset.scope;
      byId("radiusControl").style.display = S.scopeMode === "radius" ? "" : "none";
      S.fitPending = true;
      resetMarketFiltersForScope();
      S.run();
    });
  });

  const radius = byId("radius");
  radius.addEventListener("input", () => { S.radiusIdx = +radius.value; byId("radiusValue").textContent = radiusLabel(radiusM()); drawZone(); });
  radius.addEventListener("change", () => { if (S.scopeMode === "radius") { S.fitPending = true; resetMarketFiltersForScope(); S.run(); } });

  const hMin = byId("historyMin"), hMax = byId("historyMax");
  const onHist = () => { S.histMin = Math.min(+hMin.value, +hMax.value); S.histMax = Math.max(+hMin.value, +hMax.value); byId("historyValue").textContent = S.histMin + " – " + S.histMax + " ans"; };
  [hMin, hMax].forEach((el) => { el.addEventListener("input", onHist); el.addEventListener("change", () => { resetMarketFiltersForScope(); S.run(); }); });

  document.querySelectorAll(".mode-control button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode-control button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.selectedMode = b.dataset.mode || "estimation";
      applyMode();
    });
  });

  const blm = byId("baseLayerMenu"), cdm = byId("cadastreMenu");
  document.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => { applyBasemap(b.dataset.layer); if (blm) blm.classList.add("just-picked"); b.blur(); }));
  document.querySelectorAll("[data-cadastre]").forEach((b) => b.addEventListener("click", () => { setCadastreMode(b.dataset.cadastre); if (cdm) cdm.classList.add("just-picked"); b.blur(); }));
  if (blm) blm.addEventListener("mouseleave", () => blm.classList.remove("just-picked"));
  if (cdm) cdm.addEventListener("mouseleave", () => cdm.classList.remove("just-picked"));

  const sm = byId("sortMenu");
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { setSort(b.dataset.sort); if (sm) sm.classList.add("just-picked"); b.blur(); }));
  if (sm) sm.addEventListener("mouseleave", () => sm.classList.remove("just-picked"));

  // Menu Type (exploration) : multi-sélection, le menu RESTE ouvert (pas de just-picked).
  document.querySelectorAll("[data-market-type]").forEach((b) => b.addEventListener("click", () => toggleMarketType(b.dataset.marketType || "")));
  const mtm = byId("marketTypeMenu");
  if (mtm) mtm.addEventListener("mouseleave", () => mtm.classList.remove("just-picked"));
  syncMarketTypeMenu();
  wireMarketSliders();
  syncMarketFilterAvailability();

  const zt = document.querySelector(".zone-toggle input");
  if (zt) zt.addEventListener("change", () => setZoneVisibility(zt.checked));
  const zc = document.querySelector(".zone-color");
  if (zc) zc.addEventListener("input", () => { S.zoneHue = Number(zc.value); applyZoneColor(); });
}
