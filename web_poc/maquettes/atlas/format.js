/* format.js — formatage pur, aucune dépendance. Importé par les autres modules.
   Module ES natif (zéro build, ADR 0008) : `import { euro } from "./atlas/format.js"`. */

export function euro(n) {
  return n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
export function nf(n) {
  return n == null ? "—" : new Intl.NumberFormat("fr-FR").format(Math.round(n));
}
export function int(n) {
  return n == null ? "—" : nf(n);
}
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
export function dpeBadge(e) {
  return e ? '<span class="dpe-badge dpe-' + String(e).toLowerCase() + '">' + e + "</span>" : "";
}
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export function dateLabel(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? "" : MOIS[d.getMonth()] + " " + d.getFullYear();
}
