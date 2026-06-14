/* address.js — recherche d'adresse (BAN) : autocomplétion, sélection, reverse. */
import * as api from "./api.js";
import { S, byId, setStatus } from "./state.js";
import { setTargetMarker } from "./map.js";

const suggestions = () => byId("suggestions");
const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

function showSuggestions(features) {
  const box = suggestions();
  box.innerHTML = "";
  if (!features.length) { box.hidden = true; return; }
  features.forEach((f) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "suggestion"; b.textContent = f.properties.label;
    b.addEventListener("click", () => selectAddress(f));
    box.appendChild(b);
  });
  box.hidden = false;
}

export function selectAddress(feature) {
  S.selectedAddress = feature;
  byId("address").value = feature.properties.label;
  suggestions().innerHTML = ""; suggestions().hidden = true;
  const c = feature.geometry.coordinates;
  setTargetMarker(c[0], c[1]);
  S.map.flyTo({ center: c, zoom: 14 });
  setStatus(feature.properties.postcode + " · " + feature.properties.city);
  S.fitPending = true;
  S.resetMarketFilters();
  S.run();
}

export function reverseGeocodeAndSelect(lon, lat) {
  api.banReverse(lon, lat).then((d) => { const f = d && d.features && d.features[0]; if (f) selectAddress(f); });
}

export function wireAddress() {
  const input = byId("address");
  const doSearch = debounce(() => {
    const q = input.value.trim();
    if (q.length < 3) { suggestions().innerHTML = ""; suggestions().hidden = true; return; }
    api.banSearch(q).then((d) => showSuggestions((d && d.features) || []));
  }, 250);
  input.addEventListener("input", () => { S.selectedAddress = null; doSearch(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); S.run(); } });
  document.addEventListener("click", (e) => { if (!suggestions().contains(e.target) && e.target !== input) suggestions().hidden = true; });
}
