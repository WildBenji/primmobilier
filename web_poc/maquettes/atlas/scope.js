/* scope.js — puce d'emprise interactive (#scopeChip).
   En mode Commune, cliquer la puce déplie les codes postaux de la commune ;
   en mode Code postal, les communes partageant ce code. Cliquer un item bascule
   l'emprise (mute S.selectedAddress.properties) et recharge via S.run() — ce qui
   redessine la zone (map.js drawZone lit le nouveau postcode/citycode).
   Branché à chaque rendu via le créneau S.configureScopeChip (rempli par atlas.js). */
import { S, byId, setStatus } from "./state.js";
import { esc } from "./format.js";
import * as api from "./api.js";

// Appelée après chaque résultat : n'arme la puce que si l'emprise est interactive
// (scope_mode postcode|city). En rayon/section, la puce est inerte.
export function configureScopeChip() {
  const chip = byId("scopeChip"), panel = byId("scopeDetails");
  if (!chip) return;
  if (panel) { panel.hidden = true; panel.innerHTML = ""; }
  chip.classList.remove("open");
  chip.setAttribute("aria-expanded", "false");
  const t = S.lastTarget;
  const interactive = !!t && (t.scope_mode === "postcode" || t.scope_mode === "city");
  chip.disabled = !interactive;
  chip.onclick = interactive ? toggleScopeDetails : null;
}

async function toggleScopeDetails() {
  const chip = byId("scopeChip"), panel = byId("scopeDetails");
  if (!chip || !panel) return;
  if (!panel.hidden) { closeDetails(); return; }   // toggle : déjà ouvert -> referme
  chip.classList.add("open");
  chip.setAttribute("aria-expanded", "true");
  panel.hidden = false;
  const loading = setTimeout(() => { if (!panel.hidden) panel.innerHTML = "<strong>Chargement…</strong>"; }, 120);
  const t = S.lastTarget || {};
  const data = await api.scopeCommunes({ dept: t.dept || "", scope_mode: t.scope_mode || "", postcode: t.postcode || "", citycode: t.citycode || "" });
  clearTimeout(loading);
  if (panel.hidden) return;  // refermé entre-temps
  if (!data || data.error) { panel.innerHTML = "<strong>" + esc((data && data.error) || "Emprise indisponible") + "</strong>"; return; }
  renderScopeList(panel, data);
}

function renderScopeList(panel, data) {
  const isPostcodes = data.kind === "postcodes";
  const items = (isPostcodes ? data.postcodes : data.communes) || [];
  const label = isPostcodes ? "code postal" : "commune";
  const plural = items.length > 1 ? "s" : "";
  panel.innerHTML =
    "<strong>" + esc(data.title || "Emprise") + " · " + items.length + " " + label + plural + "</strong><ul>" +
    items.map((it) =>
      '<li><button type="button" data-code="' + esc(it.code || "") + '" data-name="' + esc(it.nom || "") + '">' +
      (isPostcodes ? esc(it.code || "") : (esc(it.nom || "") + ' <span>' + esc(it.code || "") + "</span>")) +
      "</button></li>").join("") +
    "</ul>";
  panel.querySelectorAll("button[data-code]").forEach((b) => {
    b.addEventListener("click", () => {
      if (isPostcodes) selectScopePostcode(b.dataset.code);
      else selectScopeCommune(b.dataset.code, b.dataset.name);
    });
  });
}

// Bascule l'emprise globale + active le bon bouton scope + masque le rayon.
function activateScope(mode) {
  S.scopeMode = mode;
  document.querySelectorAll(".scope-control button").forEach((b) => b.classList.toggle("active", b.dataset.scope === mode));
  if (byId("radiusControl")) byId("radiusControl").style.display = "none";
}

function selectScopePostcode(postcode) {
  if (!S.selectedAddress || !postcode) return;
  activateScope("postcode");
  S.selectedAddress.properties.postcode = postcode;
  syncAddressLabel();
  closeDetails();
  S.fitPending = true;
  S.resetMarketFilters();
  S.run();
}

function selectScopeCommune(citycode, city) {
  if (!S.selectedAddress || !citycode) return;
  activateScope("city");
  S.selectedAddress.properties.citycode = citycode;
  if (city) S.selectedAddress.properties.city = city;
  syncAddressLabel();
  closeDetails();
  S.fitPending = true;
  S.resetMarketFilters();
  S.run();
}

// Reflète l'emprise naviguée (commune/CP) dans le champ d'adresse + la ligne de
// statut, pour qu'ils ne restent pas figés sur la première saisie.
function syncAddressLabel() {
  const p = S.selectedAddress.properties;
  if (byId("address")) byId("address").value = p.city || byId("address").value;
  setStatus(S.scopeMode === "postcode" ? ((p.postcode || "") + " · " + (p.city || "")) : (p.city || ""));
}

function closeDetails() {
  const chip = byId("scopeChip"), panel = byId("scopeDetails");
  if (panel) panel.hidden = true;
  if (chip) { chip.classList.remove("open"); chip.setAttribute("aria-expanded", "false"); }
}
