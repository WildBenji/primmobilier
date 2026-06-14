/* detail.js — détail déplié d'un comparable : rendu + chargements asynchrones
   (cadastre/bâti via /api/batiments, DPE via /api/dpe, adresses, lieu-dit). */
import { euro, int, esc, dpeBadge } from "./format.js";
import * as api from "./api.js";
import { S, currentDept } from "./state.js";
import { setParcelleDetail, setBatiHover } from "./map.js";

const DPE_LIENS = {
  ademe: null,
  cle_ban: "rattaché par clé d'adresse BAN (fiable, adresse mono-bâtiment)",
  spatial: "rattaché par proximité (bâtiment ≤ 15 m du géocodage) — vérifier l'adresse",
};

// Infobulles d'aide : sur les libellés (FIELD_HINTS) et les en-têtes de sections.
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
const DPE_HINT = "Diagnostic de performance énergétique du BÂTIMENT, rattaché via son identifiant RNB. Un bâtiment porte un DPE par logement : on affiche celui dont la surface est la plus proche de la vente (le lot le plus probable), mais ce n'est pas une certitude en copropriété. Étiquettes énergie + GES (A-G), type d'énergie de chauffage et date d'établissement (validité 10 ans).";
const COPRO_HINT = "Copropriété immatriculée au Registre National (RNIC, ANAH), rattachée par sa référence cadastrale = la parcelle de la vente. Donne la taille réelle de la copropriété (lots), sa période de construction déclarée au règlement et son mode de gestion. Données déclarées par les syndics — fiables sur la structure, parfois datées.";
const ADRESSES_PARCELLE_HINT = "Adresse(s) officielle(s) rattachée(s) à la parcelle. Intérêt : l'adresse de la vente (DVF) affichée plus haut est souvent imprécise ou incomplète ; celle-ci est l'adresse réelle du bien, sert de point de contact probable du propriétaire (sans révéler son identité), et fait apparaître toutes les entrées d'une parcelle qui en compte plusieurs. En copropriété, plusieurs adresses possibles sans désigner un logement précis.";
const BATI_HEAD_HINT = "Somme des empreintes au sol des bâtiments de la parcelle (aire au sol) — différente de la surface habitable DVF et de l'emprise BDNB, qui viennent d'autres sources.";

const dHint = (txt, mark) => ' <span class="hint" data-tip="' + esc(txt) + '">' + (mark || "?") + "</span>";
const dField = (label, value) => '<div class="detail-field"><span>' + esc(label) + (FIELD_HINTS[label] ? dHint(FIELD_HINTS[label]) : "") + "</span><b>" + (value == null || value === "" ? "—" : value) + "</b></div>";
const dSection = (title, fields) => fields.replace(/—/g, "").trim() ? '<div class="detail-section"><h4>' + esc(title) + '</h4><div class="detail-grid">' + fields + "</div></div>" : "";
const dCollap = (title, body, hint) => '<details class="collapsible"><summary>' + esc(title) + (hint ? dHint(hint) : "") + '</summary><div class="collapsible-body">' + body + "</div></details>";
const fill = (box, sel, html) => { const el = box.querySelector(sel); if (el) el.innerHTML = html; };
const stillSelected = (row) => S.selectedComparableUid === Number(row.uid);
const formatPeriodeCopro = (p) => String(p).toLowerCase().replaceAll("_", " ").replace(" a ", " à ");

export function renderDetail(row, box) {
  const sim = row.similarity != null ? dField("Similarité", int(row.similarity) + " %") : "";
  const main = [dField("Date", row.date_mutation), dField("Distance", row.distance_m != null ? int(row.distance_m) + " m" : "—"),
    dField("Type", row.type_local), dField("Surface", row.surface != null ? row.surface + " m²" : "—"),
    dField("Pièces", row.pieces || "—"), sim].join("");
  const cad = [dField("Nature", row.nature_mutation), dField("Mutation", row.id_mutation), dField("Parcelle", row.id_parcelle), dField("Commune", row.code_commune)].join("");
  const resolution = (row.resolution_statut === "rnb_resolu" || row.resolution_statut === "bdnb_groupe_resolu")
    ? dField("Résolution", row.resolution_statut === "rnb_resolu" ? "bâtiment identifié" : "groupe bâtiment identifié") : "";
  const bdnb = [resolution, row.rnb_id ? dField("Bâtiment RNB", row.rnb_id) : "", row.batiment_groupe_id ? dField("Groupe BDNB", row.batiment_groupe_id) : "",
    row.usage_principal_bdnb_open ? dField("Usage BDNB", row.usage_principal_bdnb_open) : "", row.nb_log != null ? dField("Logements BDNB", int(row.nb_log)) : "",
    row.nb_niveau != null ? dField("Niveaux", int(row.nb_niveau)) : "",
    row.hauteur_mean != null ? dField("Hauteur", int(row.hauteur_mean) + " m") : "",
    row.surface_emprise_sol != null ? dField("Emprise", int(row.surface_emprise_sol) + " m²") : "",
    row.annee_construction ? dField("Construction", row.annee_construction) : ""].join("");
  // Commune fusionnée/recodée depuis la vente : on trace l'origine + la date.
  const communeModif = row.commune_modif_origine
    ? '<p class="detail-note">⚠ Commune modifiée' + (row.commune_modif_date ? " le " + esc(row.commune_modif_date) : "") +
      " — vendue sous " + esc(row.commune_modif_origine) + ", rattachée aujourd'hui à " + esc(row.commune || "") + " (" + esc(row.code_commune || "") + ").</p>"
    : "";
  // Sous-section Copropriété (RNIC, lien cadastral direct par parcelle).
  const copro = [
    row.copro_lots_habitation != null ? dField("Lots habitation", int(row.copro_lots_habitation)) : "",
    row.copro_lots_total != null ? dField("Lots total", int(row.copro_lots_total)) : "",
    row.copro_lots_stationnement != null ? dField("Lots stationnement", int(row.copro_lots_stationnement)) : "",
    row.copro_periode_construction ? dField("Période copro", formatPeriodeCopro(row.copro_periode_construction)) : "",
    row.copro_type_syndic ? dField("Syndic", row.copro_type_syndic) : "",
    (row.copro_residence_service && String(row.copro_residence_service).toLowerCase() === "oui") ? dField("Résidence services", "oui") : "",
    row.copro_qpv ? dField("Quartier prioritaire", row.copro_qpv) : "",
  ].join("");
  const coproNote = Number(row.copro_n_sur_parcelle) > 1
    ? '<p class="detail-note">' + int(row.copro_n_sur_parcelle) + " copropriétés immatriculées sur la parcelle — affichée : la plus grande (lots habitation).</p>"
    : "";
  box.innerHTML =
    '<div class="detail-title"><strong>' + int(row.prix_m2) + " €/m² · " + euro(row.prix) + "</strong>" +
    "<span>" + esc(row.adresse || "Adresse DVF non renseignée") + "</span>" +
    "<span>" + esc(row.code_postal || "") + " " + esc(row.commune || "") + "</span></div>" +
    communeModif +
    '<div class="detail-grid">' + main + "</div>" +
    dSection("Cadastre", cad) +
    dCollap("Bâti cadastral", '<div class="detail-batiments dt-bati"><span class="street-muted">Lecture du cadastre…</span></div>') +
    dSection("Bâtiment (RNB / BDNB)", bdnb) +
    (copro ? dCollap("Copropriété (RNIC)", '<div class="detail-grid">' + copro + "</div>" + coproNote, COPRO_HINT) : "") +
    dCollap("DPE (énergie)", '<div class="detail-dpe dt-dpe"><span class="street-muted">Lecture du DPE…</span></div>', DPE_HINT) +
    dCollap("Adresses (lien parcellaire)", '<div class="detail-adresses dt-adr"><span class="street-muted">Lecture du lien parcelle↔adresse…</span></div>', ADRESSES_PARCELLE_HINT);
}

function renderBatimentsList(bats) {
  if (!bats.length) return '<span class="street-muted">Pas d\'empreinte bâtie sur cette parcelle. Possible terrain nu, mais aussi micro-parcelle de copropriété ou de volume dont le bâtiment est porté par une parcelle voisine.</span>';
  const total = bats.reduce((s, b) => s + (b.properties.surface_m2 || 0), 0);
  const items = bats.map((b) => {
    const p = b.properties, surf = p.surface_m2 != null ? int(p.surface_m2) + " m²" : "—";
    const maj = p.annee ? " Entré au cadastre en " + p.annee + " (date de relevé, pas l'année de construction)." : "";
    const hint = "Empreinte au sol du bâtiment (aire au sol, pas la surface habitable)." + maj;
    return '<div class="detail-field bati-item" data-bati-idx="' + p.idx + '"><span>' + esc(p.type_label) + dHint(hint) + "</span><b>" + surf + "</b></div>";
  }).join("");
  return '<div class="batiments-head">' + bats.length + " bâtiment" + (bats.length > 1 ? "s" : "") + " · emprise au sol " + int(total) + " m²" + dHint(BATI_HEAD_HINT) + '</div><div class="detail-grid">' + items + "</div>";
}
function renderRnbVoisin(d) {
  const v = d.features.filter((f) => f.properties.kind === "batiment_rnb_voisin");
  const pid = d.parcelle_porteuse || "voisine";
  const total = v.reduce((s, b) => s + (b.properties.surface_m2 || 0), 0);
  const info = "Cette parcelle ne porte aucune empreinte bâtie : c'est une parcelle de référence de copropriété ou de division en volumes — le cadastre y rattache le lot et l'adresse, mais le bâtiment est physiquement sur une parcelle voisine. Le bâti ci-dessous est celui identifié pour ce bien par le Référentiel National des Bâtiments (RNB), porté par la parcelle " + pid + ". On l'affiche pour ne pas laisser croire à un terrain nu ; il ne désigne pas un logement précis.";
  return '<div class="batiments-head">Bâti rattaché via RNB · parcelle voisine ' + esc(pid) + dHint(info, "i") + '</div><div class="detail-grid"><div class="detail-field"><span>' + v.length + " bâtiment" + (v.length > 1 ? "s" : "") + " (sur " + esc(pid) + ")</span><b>" + int(total) + " m²</b></div></div>";
}
function renderAdressesList(adr) {
  if (!adr || !adr.length) return '<span class="street-muted">Aucune adresse rattachée à la parcelle dans l\'open data.</span>';
  const SRC = { cadastre: "Cadastre", ban: "BAN" };
  const items = adr.map((a) => {
    const l1 = ((a.numero || "") + " " + (a.voie || "")).trim() || "Adresse sans voie";
    const l2 = ((a.code_postal || "") + " " + (a.ville || "")).trim();
    const tags = [SRC[a.source] || a.source, a.destination].filter(Boolean).join(" · ");
    return '<div class="detail-field"><span>' + esc(l1) + (l2 ? '<span class="street-muted">, ' + esc(l2) + "</span>" : "") + '</span><b class="adresse-tag">' + esc(tags) + "</b></div>";
  }).join("");
  return '<div class="batiments-head">' + adr.length + " adresse" + (adr.length > 1 ? "s" : "") + ' rattachée(s)</div><div class="detail-grid">' + items + "</div>";
}
function renderDpePanel(d) {
  const list = d.dpe, m = list[d.matched != null ? d.matched : 0];
  const conso = m.conso_ep_m2 != null ? Math.round(m.conso_ep_m2) + " kWh/m²/an" : null;
  const ges = m.emission_ges_m2 != null ? Math.round(m.emission_ges_m2) + " kg CO₂/m²/an" : null;
  const validite = m.fin_validite ? (m.expire ? "expiré (" + m.fin_validite + ")" : "jusqu'au " + m.fin_validite) : null;
  const fields = [conso ? dField("Consommation", conso) : "", ges ? dField("Émissions GES", ges) : "",
    dField("Énergie chauffage", m.type_energie ? m.type_energie.replace(/_/g, " ") : "—"),
    m.surface != null ? dField("Surface DPE", Math.round(m.surface) + " m²") : "",
    m.etage != null ? dField("Étage", m.etage === 0 ? "RDC" : m.etage) : "",
    m.date ? dField("Établi le", m.date) : "",
    validite ? dField("Validité", validite) : "",
    m.periode ? dField("Construction", m.periode) : "",
    dField("Millésime", m.source === "pre_2021" ? "avant 2021" : "depuis 2021")].join("");
  const head = '<div class="dpe-panel-head"><span class="dpe-pair">Énergie' + (dpeBadge(m.etiquette_energie) || ' <span class="street-muted">n.c.</span>') +
    '</span><span class="dpe-pair">GES' + (dpeBadge(m.etiquette_ges) || ' <span class="street-muted">n.c.</span>') + "</span>" +
    (m.expire ? '<span class="dpe-expire">expiré</span>' : "") + "</div>" +
    '<div class="detail-grid">' + fields + "</div>";
  const lien = DPE_LIENS[m.rnb_lien] ? '<p class="detail-note">Lien au bâtiment : ' + DPE_LIENS[m.rnb_lien] + ".</p>" : "";
  if (list.length === 1) return head + lien + '<p class="detail-note">DPE du bâtiment via RNB — ne désigne pas le lot exact.</p>';
  // Bâtiment à N DPE : distribution par classe plutôt qu'une liste de badges.
  const counts = {};
  for (const x of list) counts[x.etiquette_energie || "?"] = (counts[x.etiquette_energie || "?"] || 0) + 1;
  const distrib = ["A", "B", "C", "D", "E", "F", "G", "?"].filter((k) => counts[k]).map((k) =>
    '<span class="dpe-distrib-item">' + (k === "?" ? '<span class="street-muted">n.c.</span>' : dpeBadge(k)) + "<small>×" + counts[k] + "</small></span>").join("");
  return head + lien +
    '<p class="detail-note">' + list.length + " DPE sur ce bâtiment (RNB) — affiché : surface la plus proche de la vente.</p>" +
    '<div class="dpe-distrib">' + distrib + "</div>";
}

export function loadComparableBatiments(row, box) {
  const dept = currentDept();
  if (!dept || !row.id_parcelle) return fill(box, ".dt-bati", '<span class="street-muted">Parcelle non renseignée.</span>');
  const p = { dept, parcelle: row.id_parcelle };
  if (row.rnb_id && row.confiance === "haute") p.rnb_id = row.rnb_id;
  api.batiments(p).then((d) => {
    if (!stillSelected(row)) return;
    if (!d || !d.features) return fill(box, ".dt-bati", '<span class="street-muted">Lecture du plan cadastral momentanément indisponible. Re-sélectionnez le bien pour réessayer.</span>');
    if (!d.features.length) return fill(box, ".dt-bati", '<span class="street-muted">Parcelle absente du plan cadastral Etalab (couverture incomplète ici). Son identifiant vient de la vente DVF, mais le cadastre n\'en fournit pas la géométrie.</span>');
    setParcelleDetail(d);  // pose la parcelle + empreintes bâties sur la carte
    fill(box, ".dt-bati", d.fallback_rnb ? renderRnbVoisin(d) : renderBatimentsList(d.features.filter((f) => f.properties.kind === "batiment")));
  });
}
export function loadComparableAdresses(row, box) {
  const dept = currentDept();
  if (!dept || !row.id_parcelle) return fill(box, ".dt-adr", '<span class="street-muted">Parcelle non renseignée.</span>');
  api.adresses({ dept, parcelle: row.id_parcelle }).then((d) => {
    if (stillSelected(row)) fill(box, ".dt-adr", renderAdressesList(d ? d.adresses : []));
  });
}
export function loadComparableDpe(row, box) {
  const dept = currentDept();
  if (!dept || !row.rnb_id) return fill(box, ".dt-dpe", '<span class="street-muted">Pas de bâtiment RNB identifié — DPE non rattachable.</span>');
  const p = { dept, rnb_id: row.rnb_id };
  if (row.surface != null) p.surface = row.surface;
  api.dpe(p).then((d) => {
    if (stillSelected(row)) fill(box, ".dt-dpe", (!d || !d.dpe || !d.dpe.length) ? '<span class="street-muted">Aucun DPE rattaché à ce bâtiment.</span>' : renderDpePanel(d));
  });
}
export function loadComparableLieuDit(row, box) {
  if (row.lon == null || row.lat == null) return;
  const dept = currentDept(); if (!dept) return;
  api.lieudit({ dept, lon: row.lon, lat: row.lat }).then((d) => {
    if (!stillSelected(row) || !d || !d.nom) return;
    const t = box.querySelector(".detail-title");
    if (t) { const s = document.createElement("span"); s.className = "detail-lieudit"; s.textContent = "Lieu-dit : " + d.nom; t.appendChild(s); }
  });
}

// Infobulle flottante (rattachée au body) : immédiate et jamais rognée par le
// panneau détail en overflow:auto, contrairement à l'attribut `title` natif.
// Délégation globale sur [.hint] -> positionnée au survol. Posée une seule fois.
(function setupHintTip() {
  if (typeof document === "undefined" || document.querySelector(".hint-tip")) return;
  const tip = document.createElement("div");
  tip.className = "hint-tip"; tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener("mouseover", (e) => {
    const hint = e.target.closest && e.target.closest(".hint");
    if (!hint || !hint.dataset.tip) return;
    tip.textContent = hint.dataset.tip; tip.hidden = false;
    const r = hint.getBoundingClientRect();
    let left = r.left + r.width / 2 - tip.offsetWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tip.offsetWidth - 8));
    let top = r.top - tip.offsetHeight - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest && e.target.closest(".hint")) tip.hidden = true;
  });
  // Survol d'une box bâti <-> empreinte sur la carte (bidirectionnel).
  document.addEventListener("mouseover", (e) => { const it = e.target.closest && e.target.closest("[data-bati-idx]"); if (it) setBatiHover(it.dataset.batiIdx); });
  document.addEventListener("mouseout", (e) => { const it = e.target.closest && e.target.closest("[data-bati-idx]"); if (it && !it.contains(e.relatedTarget)) setBatiHover(null); });
})();
