/* api.js — appels réseau purs : backend FastAPI (/api/*) + BAN (api-adresse).
   Chaque fonction renvoie une promesse de JSON (ou null en cas d'échec). */

const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const q = (params) => new URLSearchParams(params).toString();

export const estimate = (params) => j("/api/estimate?" + q(params));
export const market = (params) => j("/api/market?" + q(params));
export const parcelles = (params) => j("/api/parcelles?" + q(params));
export const batiments = (params) => j("/api/batiments?" + q(params));
export const dpe = (params) => j("/api/dpe?" + q(params));
export const adresses = (params) => j("/api/parcelle-adresses?" + q(params));
export const lieudit = (params) => j("/api/lieudit?" + q(params));
export const codepostal = (code) => j("/api/codepostal?code=" + encodeURIComponent(code));
export const commune = (code) => j("/api/commune?code=" + encodeURIComponent(code));
export const scopeCommunes = (params) => j("/api/scope-communes?" + q(params));

export const banSearch = (text) => j("https://api-adresse.data.gouv.fr/search/?q=" + encodeURIComponent(text) + "&limit=5&autocomplete=1");
export const banReverse = (lon, lat) => j("https://api-adresse.data.gouv.fr/reverse/?lon=" + lon + "&lat=" + lat + "&limit=1");
