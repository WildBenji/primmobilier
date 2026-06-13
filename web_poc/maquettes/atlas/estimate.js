/* estimate.js — flux estimation : /api/estimate -> prix médian + comparables. */
import * as api from "./api.js";
import { S, byId, currentDept, radiusM, setBusy, setStatus } from "./state.js";
import { euro, nf } from "./format.js";
import { paintMap } from "./map.js";
import { renderComparables } from "./comparables.js";
import { timelineSetData } from "./timeline.js";

const fr1 = (v) => String(Math.round(v * 10) / 10).replace(".", ",");  // 1 décimale, virgule FR

export function estimate() {
  const dept = currentDept(); if (!dept) return;
  const seq = ++S.runSeq;
  const c = S.selectedAddress.geometry.coordinates, p = S.selectedAddress.properties;
  setBusy(true);
  api.estimate({
    dept, lon: c[0], lat: c[1], postcode: p.postcode || "", citycode: p.citycode || "",
    type: byId("type").value, surface: byId("surface").value || "", rooms: byId("rooms").value || "", asked_price: byId("askedPrice").value || "",
    scope_mode: S.scopeMode, radius_m: radiusM(), history_min_years: S.histMin, history_max_years: S.histMax, sort_key: S.sortKey, sort_dir: S.sortDir,
  }).then((data) => {
    if (seq !== S.runSeq) return;
    setBusy(false);
    if (!data || data.error) {
      const rs = byId("result"); if (rs) rs.hidden = true;
      const sd = byId("scopeDetails"); if (sd) { sd.hidden = true; sd.innerHTML = ""; }
      renderComparables([]);
      timelineSetData([]);
      setStatus((data && data.error) || "Erreur réseau. Réessayez.");
      return;
    }
    S.lastTarget = data.target || null; S.lastPoints = data.points || [];
    renderResult(data.summary || {});
    renderComparables(data.comparables || [], (data.summary || {}).count);
    paintMap();
    timelineSetData(S.lastPoints);
  });
}

function renderResult(s) {
  const rs = byId("result"); if (rs) rs.hidden = false;  // révélé seulement après une recherche
  const ms = byId("marketStats"); if (ms) ms.innerHTML = "";  // pas de grille catégories en estimation
  if (byId("resultLabel")) byId("resultLabel").textContent = "Prix médian estimé";
  if (byId("salesChipWrap")) byId("salesChipWrap").hidden = false;
  byId("estimatedPrice").textContent = euro(s.estimated_price);
  if (byId("medianM2")) byId("medianM2").textContent = nf(s.median_m2);
  if (byId("count")) byId("count").textContent = nf(s.count);
  if (byId("scopeChip")) byId("scopeChip").textContent = s.scope || "—";
  if (byId("range")) byId("range").textContent = (s.low_price != null)
    ? "Fourchette observée " + euro(s.low_price) + " à " + euro(s.high_price) + " · " + (s.scope || "") + (s.history ? " · " + s.history : "") + " · confiance " + (s.confidence || "—")
    : "Pas assez de ventes pour une fourchette fiable.";
  if (byId("askedPosition")) byId("askedPosition").textContent = (s.asked_position_pct == null) ? "" : "Prix soumis : percentile " + s.asked_position_pct + " des comparables";
  if (byId("loyerContext")) byId("loyerContext").textContent = s.loyer
    ? "Loyer de référence commune : " + fr1(s.loyer.loyer_m2) + " €/m²" +
      (s.loyer.loyer_m2_bas != null && s.loyer.loyer_m2_haut != null ? " (" + fr1(s.loyer.loyer_m2_bas) + " à " + fr1(s.loyer.loyer_m2_haut) + ")" : "") +
      (s.loyer.rendement_brut_pct != null ? " · rendement brut ≈ " + fr1(s.loyer.rendement_brut_pct) + " %" : "")
    : "";
  S.configureScopeChip();
}
