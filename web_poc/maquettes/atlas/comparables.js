/* comparables.js — liste des comparables : tri client-side, survol synchronisé
   avec la carte, sélection (déplie le détail + remonte le bien en tête), et rendu
   FENÊTRÉ (on ne crée le DOM que par paquets au scroll — la cohorte peut faire
   des dizaines de milliers de biens en exploration). */
import { euro, nf, int, dpeBadge, dateLabel } from "./format.js";
import { S, byId } from "./state.js";
import { renderDetail, loadComparableBatiments, loadComparableAdresses, loadComparableDpe, loadComparableLieuDit } from "./detail.js";
import { applyCadastre, setParcelleDetail } from "./map.js";

const DPE_RANK = { A: 7, B: 6, C: 5, D: 4, E: 3, F: 2, G: 1 };
const SORT_LABELS = { similarity: "Similarité", price: "Prix", date: "Date", surface: "Surface", dpe: "DPE", distance: "Distance" };
const INITIAL = 30, BATCH = 20;   // fenêtrage : 1er paquet, puis paquets au scroll

let sortedRows = [];      // ordre d'affichage courant
let renderedCount = 0;    // nb de cartes effectivement dans le DOM
let listObserver = null;  // sentinelle de scroll

function sortValue(r, key) {
  switch (key) {
    case "price": return r.prix;
    case "date": return Date.parse(r.date_mutation) || 0;
    case "surface": return r.surface;
    case "dpe": return DPE_RANK[r.etiquette_dpe] || (S.sortDir === "desc" ? 0 : 8);
    case "similarity": return r.similarity;
    default: return r.distance_m;
  }
}
function sortedComparables() {
  if (S.sortKey == null) return S.lastComparables.slice();  // exploration : ordre serveur (distance)
  const dir = S.sortDir === "asc" ? 1 : -1;
  return S.lastComparables.slice().sort((a, b) => {
    const va = sortValue(a, S.sortKey), vb = sortValue(b, S.sortKey);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return (a.distance_m || 0) - (b.distance_m || 0);  // départage : le plus proche d'abord
    return (va - vb) * dir;
  });
}
// Ordre d'affichage : le bien sélectionné remonte en tête (toujours visible/rendu).
function displayedRows() {
  const sorted = sortedComparables();
  if (S.selectedComparableUid == null) return sorted;
  const sel = sorted.find((r) => Number(r.uid) === S.selectedComparableUid);
  if (!sel) return sorted;
  return [sel].concat(sorted.filter((r) => Number(r.uid) !== S.selectedComparableUid));
}

export function renderComparables(rows, total) {
  S.lastComparables = rows;
  S.selectedComparableUid = null;
  setParcelleDetail(null);
  if (S.cadastreMode === "biens") applyCadastre();
  const tw = document.querySelector(".table-wrap");
  if (tw) { tw.classList.remove("collapsed"); tw.classList.toggle("has-results", rows.length > 0); }
  const n = (total == null ? rows.length : total);
  if (byId("tableCount")) byId("tableCount").textContent = nf(n) + " comparable" + (n > 1 ? "s" : "");
  renderList();
}

function makeCard(r) {
  const card = document.createElement("div");
  card.className = "comparable-card"; card.dataset.uid = r.uid;
  const typ = r.type_local || r.type || "";
  const meta = [typ, (r.surface != null ? r.surface + " m²" : ""), (r.pieces != null ? r.pieces + " pièces" : ""), (r.distance_m != null ? int(r.distance_m) + " m" : "")].filter(Boolean).join(" · ");
  card.innerHTML =
    '<button class="comparable" type="button">' +
    "<b>" + euro(r.prix) + "</b><b>" + nf(r.prix_m2) + " €/m²</b>" +
    "<span>" + meta + " " + dpeBadge(r.etiquette_dpe) + "</span>" +
    '<span class="result-date">' + dateLabel(r.date_mutation) + "</span></button><div class=\"comparable-detail\" hidden></div>";
  card.querySelector("button").addEventListener("click", () => selectComparable(r.uid, false));
  card.addEventListener("mouseenter", () => setHover(r.uid, false));
  card.addEventListener("mouseleave", () => setHover(null, false));
  return card;
}

// Ajoute n cartes à partir de renderedCount (avant la sentinelle si présente).
function appendCards(n) {
  const list = byId("comparablesList");
  const sentinel = list.querySelector(".list-sentinel");
  const frag = document.createDocumentFragment();
  const target = Math.min(renderedCount + n, sortedRows.length);
  for (let i = renderedCount; i < target; i++) frag.appendChild(makeCard(sortedRows[i]));
  if (sentinel) list.insertBefore(frag, sentinel); else list.appendChild(frag);
  renderedCount = target;
}

function renderList() {
  const list = byId("comparablesList");
  if (!list) return;
  if (listObserver) { listObserver.disconnect(); listObserver = null; }
  list.innerHTML = "";
  sortedRows = displayedRows();
  renderedCount = 0;
  if (!sortedRows.length) { list.innerHTML = '<p class="empty-list">Aucun comparable sur cette emprise.</p>'; return; }
  appendCards(Math.min(INITIAL, sortedRows.length));
  if (renderedCount < sortedRows.length) {
    const sentinel = document.createElement("div");
    sentinel.className = "list-sentinel"; sentinel.setAttribute("aria-hidden", "true");
    list.appendChild(sentinel);
    listObserver = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) revealMore(); }, { root: list, rootMargin: "400px" });
    listObserver.observe(sentinel);
  }
}

function revealMore() {
  appendCards(BATCH);
  if (renderedCount >= sortedRows.length && listObserver) {
    listObserver.disconnect(); listObserver = null;
    const s = byId("comparablesList").querySelector(".list-sentinel"); if (s) s.remove();
  }
}

// Tri : re-clic sur la même clé inverse le sens (flèche ↑/↓ dans le libellé).
export function setSort(key) {
  if (key === S.sortKey) S.sortDir = S.sortDir === "asc" ? "desc" : "asc";
  else { S.sortKey = key; S.sortDir = key === "distance" ? "asc" : "desc"; }
  S.selectedComparableUid = null;
  renderList();
  const arrow = S.sortDir === "asc" ? " ↑" : " ↓";
  if (byId("sortLabel")) byId("sortLabel").textContent = (SORT_LABELS[key] || key) + arrow;
  document.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("active", b.dataset.sort === S.sortKey));
}

// Survol synchronisé liste ↔ carte (feature-state hover + classe .hover sur la carte).
export function setHover(uid, fromMap) {
  uid = uid == null ? null : Number(uid);
  if (S.hoveredComparableUid === uid) return;
  if (S.hoveredComparableUid != null) {
    if (S.mapReady) { try { S.map.setFeatureState({ source: "comparables", id: S.hoveredComparableUid }, { hover: false }); } catch (e) {} }
    const prev = document.querySelector('.comparable-card[data-uid="' + S.hoveredComparableUid + '"]'); if (prev) prev.classList.remove("hover");
  }
  S.hoveredComparableUid = uid;
  if (uid != null) {
    if (S.mapReady) { try { S.map.setFeatureState({ source: "comparables", id: uid }, { hover: true }); } catch (e) {} }
    const card = document.querySelector('.comparable-card[data-uid="' + uid + '"]');
    if (card) { card.classList.add("hover"); if (fromMap) card.scrollIntoView({ block: "nearest" }); }
  }
}

export function selectComparable(uid, fromMap) {
  uid = (uid == null ? null : Number(uid));
  if (uid != null && S.selectedComparableUid === uid) uid = null;  // re-clic = referme
  if (S.mapReady && S.map.getSource("comparables")) {
    if (S.selectedComparableUid != null) { try { S.map.setFeatureState({ source: "comparables", id: S.selectedComparableUid }, { selected: false }); } catch (e) {} }
    if (uid != null) { try { S.map.setFeatureState({ source: "comparables", id: uid }, { selected: true }); } catch (e) {} }
  }
  S.selectedComparableUid = uid;
  setParcelleDetail(null);  // efface l'ancienne empreinte ; loadComparableBatiments repose la nouvelle
  renderList();  // re-rend : le sélectionné remonte en tête (donc rendu, même liste fenêtrée)
  if (uid == null) return;
  const row = S.lastComparables.find((r) => Number(r.uid) === uid) || S.lastPoints.find((p) => Number(p.uid) === uid);
  if (!row) return;
  if (!fromMap && S.mapReady && row.lon != null && row.lat != null) S.map.flyTo({ center: [row.lon, row.lat], zoom: Math.max(S.map.getZoom(), 16) });
  const card = document.querySelector('.comparable-card[data-uid="' + uid + '"]');
  if (!card) return;
  card.classList.add("selected");
  const box = card.querySelector(".comparable-detail");
  if (!box) return;
  box.hidden = false;
  renderDetail(row, box);
  if (!fromMap) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  loadComparableLieuDit(row, box);
  loadComparableBatiments(row, box);
  loadComparableAdresses(row, box);
  loadComparableDpe(row, box);
}
