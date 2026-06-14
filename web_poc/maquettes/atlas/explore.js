/* explore.js — flux exploration : /api/market -> marché local.
   - Menu Type (Set de catégories) + grille #marketStats cliquable, corrélés.
   - Curseurs prix / surface / pièces à deux poignées, bornes dynamiques (issues de
     la réponse), debounce 300 ms. Le filtre « pièces » ne vaut que pour le logement
     (Maison/Appartement) ; sinon il est « Non applicable ». */
import * as api from "./api.js";
import { S, byId, currentDept, radiusM, setBusy, setStatus, MARKET_CATEGORIES, CATEGORY_COLORS } from "./state.js";
import { int, nf, euro, esc } from "./format.js";
import { paintMap } from "./map.js";
import { renderComparables } from "./comparables.js";
import { timelineSetData } from "./timeline.js";

// État local des curseurs marché (miroir des bornes renvoyées par /api/market).
let priceBounds = { min: 0, max: 1000000, step: 10000 };
let surfaceBounds = { min: 0, max: 300, step: 1 };
let roomsBounds = { min: 1, max: 8, step: 1 };
let selPriceMin = 0, selPriceMax = 1000000;
let selSurfaceMin = 0, selSurfaceMax = 300;
let selRoomsMin = 1, selRoomsMax = 8;
let priceTouched = false, surfaceTouched = false, roomsTouched = false;
let filterTimer = null;

export function runMarket() {
  const dept = currentDept(); if (!dept) return;
  const seq = ++S.runSeq;
  const c = S.selectedAddress.geometry.coordinates, p = S.selectedAddress.properties;
  setBusy(true);
  const params = {
    dept, lon: c[0], lat: c[1], postcode: p.postcode || "", citycode: p.citycode || "",
    scope_mode: S.scopeMode, radius_m: radiusM(), history_min_years: S.histMin, history_max_years: S.histMax,
    types: [...S.selectedMarketTypes].join(","), sort_key: "", sort_dir: "asc",
  };
  // Bornes envoyées seulement si l'utilisateur a resserré le curseur.
  if (priceTouched && selPriceMin > priceBounds.min) params.prix_min = selPriceMin;
  if (priceTouched && selPriceMax < priceBounds.max) params.prix_max = selPriceMax;
  if (surfaceTouched && selSurfaceMin > surfaceBounds.min) params.surface_min = selSurfaceMin;
  if (surfaceTouched && selSurfaceMax < surfaceBounds.max) params.surface_max = selSurfaceMax;
  if (roomsFilterApplies() && roomsTouched && selRoomsMin > roomsBounds.min) params.pieces_min = selRoomsMin;
  if (roomsFilterApplies() && roomsTouched && selRoomsMax < roomsBounds.max) params.pieces_max = selRoomsMax;

  api.market(params).then((data) => {
    if (seq !== S.runSeq) return;
    setBusy(false);
    if (!data || data.error) { timelineSetData([]); setStatus((data && data.error) || "Erreur réseau. Réessayez."); return; }
    S.lastTarget = data.target || null; S.lastPoints = data.points || [];
    const s = data.summary || {};
    applyPriceBounds(s.price_bounds);
    applySurfaceBounds(s.surface_bounds);
    applyRoomsBounds(s.pieces_bounds);
    renderMarketResult(s, data.biens || []);
    renderComparables(data.biens || [], (data.summary || {}).count);
    paintMap();
    timelineSetData(S.lastPoints);
  });
}

// Médiane €/m² des ventes de l'emprise (l'API marché ne la donne que par catégorie).
function medianM2(biens) {
  const v = biens.map((b) => b.prix_m2).filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function renderMarketResult(s, biens) {
  const rs = byId("result"); if (rs) rs.hidden = false;
  if (byId("resultLabel")) byId("resultLabel").textContent = "Marché local";
  if (byId("salesChipWrap")) byId("salesChipWrap").hidden = true;
  byId("estimatedPrice").textContent = int(s.count) + " ventes";
  if (byId("medianM2")) byId("medianM2").textContent = nf(medianM2(biens));
  if (byId("count")) byId("count").textContent = int(s.count);
  if (byId("scopeChip")) byId("scopeChip").textContent = s.scope || "—";
  if (byId("range")) byId("range").textContent = "Marché local · " + (s.scope || "");
  if (byId("loyerContext")) byId("loyerContext").textContent = "";
  renderMarketStats(s.types || []);
  S.configureScopeChip();
}

// Grille des catégories : chaque ligne est cliquable et corrélée au menu Type (même bascule).
function renderMarketStats(types) {
  const el = byId("marketStats"); if (!el) return;
  el.innerHTML = "";
  types.forEach((t) => {
    const isSel = S.selectedMarketTypes.has(t.categorie);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "market-row" + (t.qualite === "indicatif" ? " indicatif" : "");
    row.title = isSel ? "Retirer « " + t.categorie + " » de la sélection" : "N'afficher que « " + t.categorie + " »";
    row.innerHTML =
      '<span class="cat"><span class="dot" style="background:' + (CATEGORY_COLORS[t.categorie] || "#66736d") + '"></span>' + esc(String(t.categorie || "")) +
      '<span class="row-toggle ' + (isSel ? "remove" : "focus") + '" aria-hidden="true">' + (isSel ? "×" : "◎") + "</span></span>" +
      '<span class="sub">' + int(t.count) + " ventes · " + euro(t.median_prix) + " médian" + (t.qualite === "indicatif" ? " · indicatif" : "") + "</span>" +
      '<span class="m2">' + int(t.median_m2) + " €/m²</span>";
    row.addEventListener("click", () => toggleMarketType(t.categorie));
    el.appendChild(row);
  });
}

// Bascule d'une catégorie (depuis le menu Type ou la grille). "" = Tous (vide la sélection).
// Changer la catégorie remet les curseurs prix/surface/pièces à plat (les distributions changent).
export function toggleMarketType(value) {
  if (!value) S.selectedMarketTypes.clear();
  else if (S.selectedMarketTypes.has(value)) S.selectedMarketTypes.delete(value);
  else { S.selectedMarketTypes.add(value); if (S.selectedMarketTypes.size === MARKET_CATEGORIES.length) S.selectedMarketTypes.clear(); }
  syncMarketTypeMenu();
  resetMarketFiltersForScope();
  syncMarketFilterAvailability();
  if (S.selectedAddress) runMarket();
}

// Synchronise le libellé + les boutons actifs du menu Type avec le Set.
export function syncMarketTypeMenu() {
  const sel = S.selectedMarketTypes;
  if (byId("marketTypeLabel")) byId("marketTypeLabel").textContent = sel.size === 0 ? "Tous" : MARKET_CATEGORIES.filter((c) => sel.has(c)).join(" + ");
  document.querySelectorAll("[data-market-type]").forEach((b) => {
    const v = b.dataset.marketType || "";
    b.classList.toggle("active", v ? sel.has(v) : sel.size === 0);
  });
}

/* ---- Curseurs prix / surface / pièces -------------------------------------- */

const formatPrice = (v) => v >= 1000000 ? ((v / 1000000 >= 10 ? Math.round(v / 1000000) : Math.round(v / 100000) / 10) + " M€") : (Math.round(v / 1000) + " k€");
const priceText = () => (selPriceMin <= priceBounds.min && selPriceMax >= priceBounds.max) ? "Tous" : (formatPrice(selPriceMin) + " – " + formatPrice(selPriceMax));
const surfaceText = () => (selSurfaceMin <= surfaceBounds.min && selSurfaceMax >= surfaceBounds.max) ? "Toutes" : (int(selSurfaceMin) + " – " + int(selSurfaceMax) + " m²");
const roomsText = () => !roomsFilterApplies() ? "Non applicable" : ((selRoomsMin <= roomsBounds.min && selRoomsMax >= roomsBounds.max) ? "Toutes" : (int(selRoomsMin) + " – " + int(selRoomsMax)));

// Le filtre pièces n'a de sens que si la sélection est entièrement du logement.
function roomsFilterApplies() {
  return S.selectedMarketTypes.size > 0 && [...S.selectedMarketTypes].every((t) => t === "Maison" || t === "Appartement");
}

function scheduleMarketRun() {
  clearTimeout(filterTimer);
  if (S.selectedMode === "exploration" && S.selectedAddress) filterTimer = setTimeout(runMarket, 300);
}

// Poignées qui ne se croisent pas : on garde celle qu'on bouge du bon côté de l'autre.
function onPriceInput() {
  priceTouched = true;
  const lo0 = byId("priceMin"), hi0 = byId("priceMax");
  let lo = Number(lo0.value), hi = Number(hi0.value);
  if (lo > hi) { if (document.activeElement === lo0) hi = lo; else lo = hi; lo0.value = String(lo); hi0.value = String(hi); }
  selPriceMin = lo; selPriceMax = hi;
  byId("priceLabel").textContent = priceText();
  scheduleMarketRun();
}
function onSurfaceInput() {
  surfaceTouched = true;
  const lo0 = byId("surfaceMin"), hi0 = byId("surfaceMax");
  let lo = Number(lo0.value), hi = Number(hi0.value);
  if (lo > hi) { if (document.activeElement === lo0) hi = lo; else lo = hi; lo0.value = String(lo); hi0.value = String(hi); }
  selSurfaceMin = lo; selSurfaceMax = hi;
  byId("surfaceLabel").textContent = surfaceText();
  scheduleMarketRun();
}
function onRoomsInput() {
  const lo0 = byId("roomsMin"), hi0 = byId("roomsMax");
  if (lo0.disabled || hi0.disabled) return;
  roomsTouched = true;
  let lo = Number(lo0.value), hi = Number(hi0.value);
  if (lo > hi) { if (document.activeElement === lo0) hi = lo; else lo = hi; lo0.value = String(lo); hi0.value = String(hi); }
  selRoomsMin = lo; selRoomsMax = hi;
  byId("roomsLabel").textContent = roomsText();
  scheduleMarketRun();
}

// Recale un curseur (bornes/valeurs/échelle/libellé) sur les bornes renvoyées par l'API.
function applyBoundsTo(b, def, ids, getSel, setSel, fmtScale, fmtLabel) {
  if (!b || !Number.isFinite(Number(b.min)) || !Number.isFinite(Number(b.max))) return null;
  const lo = Number(b.min), hi = Number(b.max), step = Math.max(1, Number(b.step) || def.step);
  const mn = byId(ids.min), mx = byId(ids.max);
  if (!mn || !mx) return { min: lo, max: hi, step };
  [mn, mx].forEach((i) => { i.min = String(lo); i.max = String(hi); i.step = String(step); i.disabled = lo === hi; });
  let [sMin, sMax, touched] = getSel();
  if (!touched) { sMin = lo; sMax = hi; }
  else { sMin = Math.min(Math.max(sMin, lo), hi); sMax = Math.min(Math.max(sMax, lo), hi); if (sMin > sMax) { sMin = lo; sMax = hi; } }
  setSel(sMin, sMax);
  mn.value = String(sMin); mx.value = String(sMax);
  if (byId(ids.scaleMin)) byId(ids.scaleMin).textContent = fmtScale(lo);
  if (byId(ids.scaleMax)) byId(ids.scaleMax).textContent = fmtScale(hi);
  if (byId(ids.label)) byId(ids.label).textContent = fmtLabel();
  return { min: lo, max: hi, step };
}

function applyPriceBounds(b) {
  const nb = applyBoundsTo(b, { step: 10000 },
    { min: "priceMin", max: "priceMax", scaleMin: "priceScaleMin", scaleMax: "priceScaleMax", label: "priceLabel" },
    () => [selPriceMin, selPriceMax, priceTouched], (a, c) => { selPriceMin = a; selPriceMax = c; }, formatPrice, priceText);
  if (nb) priceBounds = nb;
}
function applySurfaceBounds(b) {
  const nb = applyBoundsTo(b, { step: 1 },
    { min: "surfaceMin", max: "surfaceMax", scaleMin: "surfaceScaleMin", scaleMax: "surfaceScaleMax", label: "surfaceLabel" },
    () => [selSurfaceMin, selSurfaceMax, surfaceTouched], (a, c) => { selSurfaceMin = a; selSurfaceMax = c; }, (v) => int(v) + " m²", surfaceText);
  if (nb) surfaceBounds = nb;
}
function applyRoomsBounds(b) {
  const ok = roomsFilterApplies() && b && Number.isFinite(Number(b.min)) && Number.isFinite(Number(b.max));
  const rc = byId("roomsControl"); if (rc) rc.classList.toggle("disabled", !ok);
  if (!ok) {
    ["roomsMin", "roomsMax"].forEach((id) => { const el = byId(id); if (el) el.disabled = true; });
    roomsTouched = false;
    if (byId("roomsLabel")) byId("roomsLabel").textContent = "Non applicable";
    if (byId("roomsScaleMin")) byId("roomsScaleMin").textContent = "-";
    if (byId("roomsScaleMax")) byId("roomsScaleMax").textContent = "-";
    return;
  }
  const nb = applyBoundsTo(b, { step: 1 },
    { min: "roomsMin", max: "roomsMax", scaleMin: "roomsScaleMin", scaleMax: "roomsScaleMax", label: "roomsLabel" },
    () => [selRoomsMin, selRoomsMax, roomsTouched], (a, c) => { selRoomsMin = a; selRoomsMax = c; }, (v) => String(int(v)), roomsText);
  if (nb) roomsBounds = nb;
}

// Remet les trois curseurs à plat (au changement d'emprise ou de catégorie).
export function resetMarketFiltersForScope() {
  priceTouched = false; selPriceMin = priceBounds.min; selPriceMax = priceBounds.max;
  if (byId("priceMin")) { byId("priceMin").value = String(selPriceMin); byId("priceMax").value = String(selPriceMax); byId("priceLabel").textContent = priceText(); }
  surfaceTouched = false; selSurfaceMin = surfaceBounds.min; selSurfaceMax = surfaceBounds.max;
  if (byId("surfaceMin")) { byId("surfaceMin").value = String(selSurfaceMin); byId("surfaceMax").value = String(selSurfaceMax); byId("surfaceLabel").textContent = surfaceText(); }
  roomsTouched = false; selRoomsMin = roomsBounds.min; selRoomsMax = roomsBounds.max;
  if (byId("roomsMin")) { byId("roomsMin").value = String(selRoomsMin); byId("roomsMax").value = String(selRoomsMax); byId("roomsLabel").textContent = roomsText(); }
}

// Active/désactive le curseur pièces selon la sélection de catégories.
export function syncMarketFilterAvailability() {
  const ok = roomsFilterApplies();
  const rc = byId("roomsControl"); if (rc) rc.classList.toggle("disabled", !ok);
  ["roomsMin", "roomsMax"].forEach((id) => { const el = byId(id); if (el) el.disabled = !ok; });
  if (byId("roomsLabel")) byId("roomsLabel").textContent = ok ? roomsText() : "Non applicable";
}

// Branche les écouteurs des poignées (appelé une fois au démarrage).
export function wireMarketSliders() {
  const pairs = [["priceMin", "priceMax", onPriceInput], ["surfaceMin", "surfaceMax", onSurfaceInput], ["roomsMin", "roomsMax", onRoomsInput]];
  pairs.forEach(([a, b, fn]) => { const ea = byId(a), eb = byId(b); if (ea) ea.addEventListener("input", fn); if (eb) eb.addEventListener("input", fn); });
}
