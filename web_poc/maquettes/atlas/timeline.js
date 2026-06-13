/* timeline.js — frise temporelle réelle : histogramme des ventes par mois +
   sélection libre [début, fin] par deux poignées (de quelques mois à tout
   l'historique). La lecture (play) fait glisser la sélection en gardant sa
   largeur. Le filtrage se fait côté carte (setFilter sur `ts`), sans re-requête.
   Porté du POC web_poc/static/timeline.js — alimenté par estimate()/runMarket(). */

const FILTERED_LAYERS = ["comparables-points"];  // la maquette n'a que cette couche
const PLAY_WIDTH_MONTHS = 12;
const PLAY_STEP_MS = 420;

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc."];

let map = null;
let root, playBtn, allBtn, startInput, endInput, canvas, windowLabel, ticker;

let buckets = [];   // [{ts0, ts1, count}] — un par mois, ordre chronologique
let points = [];
let startIdx = 0;
let endIdx = 0;
let playTimer = null;

export function initTimeline(mapInstance) {
  map = mapInstance;
  root = document.querySelector("#timeline");
  if (!root) return;  // DOM frise absent : on n'arme rien
  playBtn = document.querySelector("#timelinePlay");
  allBtn = document.querySelector("#timelineAll");
  startInput = document.querySelector("#timelineStart");
  endInput = document.querySelector("#timelineEnd");
  canvas = document.querySelector("#timelineCanvas");
  windowLabel = document.querySelector("#timelineWindow");
  ticker = document.querySelector("#timelineTicker");

  const onScrub = () => {
    stopPlay();
    let lo = Number(startInput.value);
    let hi = Number(endInput.value);
    if (lo > hi) { if (document.activeElement === startInput) hi = lo; else lo = hi; }
    startIdx = lo;
    endIdx = hi;
    sync();
  };
  startInput.addEventListener("input", onScrub);
  endInput.addEventListener("input", onScrub);

  // Glisser-déplacer la fenêtre de sélection (à largeur constante).
  let drag = null;
  const idxAt = (event) => {
    const rect = canvas.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(buckets.length - 1, Math.floor(ratio * buckets.length)));
  };
  const inWindow = (idx) => !fullSpan() && idx >= startIdx && idx <= endIdx;
  canvas.addEventListener("pointerdown", (event) => {
    if (!buckets.length || !inWindow(idxAt(event))) return;
    stopPlay();
    drag = { anchor: idxAt(event), start0: startIdx, width: endIdx - startIdx };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!buckets.length) return;
    if (!drag) { canvas.style.cursor = inWindow(idxAt(event)) ? "grab" : ""; return; }
    const delta = idxAt(event) - drag.anchor;
    const start = Math.max(0, Math.min(buckets.length - 1 - drag.width, drag.start0 + delta));
    if (start === startIdx) return;
    startIdx = start;
    endIdx = start + drag.width;
    sync();
  });
  const endDrag = () => { drag = null; canvas.style.cursor = ""; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  playBtn.addEventListener("click", () => {
    if (playTimer) { stopPlay(); return; }
    const width = fullSpan() ? Math.min(PLAY_WIDTH_MONTHS - 1, buckets.length - 1) : endIdx - startIdx;
    if (fullSpan() || endIdx >= buckets.length - 1) { startIdx = 0; endIdx = width; }
    sync();
    root.classList.add("playing");
    playTimer = setInterval(() => {
      if (endIdx >= buckets.length - 1) { stopPlay(); return; }
      startIdx += 1;
      endIdx += 1;
      sync();
    }, PLAY_STEP_MS);
  });

  allBtn.addEventListener("click", () => {
    stopPlay();
    startIdx = 0;
    endIdx = buckets.length - 1;
    sync();
  });

  root.addEventListener("dblclick", (event) => {
    if (event.target.closest("input")) return;
    root.classList.toggle("minimized");
  });

  window.addEventListener("themechange", draw);  // shell.js émet sur window
  new ResizeObserver(draw).observe(canvas);
}

// Appelé par estimate()/runMarket() à chaque nouveau jeu de points.
export function timelineSetData(rawPoints) {
  if (!root) return;
  stopPlay();
  points = (rawPoints || [])
    .map((p) => ({ ts: Date.parse(p.date_mutation) || 0, prix_m2: Number(p.prix_m2) || 0 }))
    .filter((p) => p.ts > 0);
  buckets = buildMonthBuckets(points);
  startIdx = 0;
  endIdx = Math.max(0, buckets.length - 1);
  applyFilter();  // repartir sans filtre sur de nouvelles données

  if (buckets.length < 3 || points.length < 10) { root.hidden = true; return; }

  for (const input of [startInput, endInput]) { input.min = "0"; input.max = String(buckets.length - 1); }
  startInput.value = "0";
  endInput.value = String(endIdx);
  root.hidden = false;
  updateReadout();
  draw();
}

function buildMonthBuckets(pts) {
  if (!pts.length) return [];
  let min = Infinity, max = -Infinity;
  for (const p of pts) { if (p.ts < min) min = p.ts; if (p.ts > max) max = p.ts; }
  const start = new Date(min), end = new Date(max);
  const result = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) { const ts0 = d.getTime(); d.setMonth(d.getMonth() + 1); result.push({ ts0, ts1: d.getTime(), count: 0 }); }
  for (const p of pts) { const idx = monthIndex(result, p.ts); if (idx >= 0) result[idx].count += 1; }
  return result;
}

function monthIndex(result, ts) {
  let lo = 0, hi = result.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts < result[mid].ts0) hi = mid - 1;
    else if (ts >= result[mid].ts1) lo = mid + 1;
    else return mid;
  }
  return -1;
}

function fullSpan() { return startIdx <= 0 && endIdx >= buckets.length - 1; }

function windowRange() {
  if (!buckets.length || fullSpan()) return null;
  return { ts0: buckets[startIdx].ts0, ts1: buckets[endIdx].ts1 };
}

function sync() {
  startInput.value = String(startIdx);
  endInput.value = String(endIdx);
  applyFilter();
  updateReadout();
  draw();
}

function applyFilter() {
  if (!map) return;
  const range = windowRange();
  const filter = range ? ["all", [">=", ["get", "ts"], range.ts0], ["<", ["get", "ts"], range.ts1]] : null;
  for (const layer of FILTERED_LAYERS) { if (map.getLayer(layer)) map.setFilter(layer, filter); }
}

function updateReadout() {
  if (!buckets.length) return;
  const range = windowRange();
  allBtn.hidden = !range;
  const inWindow = range ? points.filter((p) => p.ts >= range.ts0 && p.ts < range.ts1) : points;
  const median = medianOf(inWindow.map((p) => p.prix_m2).filter((v) => v > 0));
  windowLabel.textContent = range
    ? monthLabel(range.ts0) + " – " + monthLabel(range.ts1 - 1)
    : new Date(buckets[0].ts0).getFullYear() + " – " + new Date(buckets[buckets.length - 1].ts0).getFullYear() + " · tout";
  ticker.textContent = inWindow.length
    ? fmtInt(inWindow.length) + " ventes · " + (median ? fmtInt(median) + " €/m² médian" : "€/m² n.c.")
    : "Aucune vente sur la période";
}

function monthLabel(ts) { const d = new Date(ts); return MONTHS_FR[d.getMonth()] + " " + d.getFullYear(); }

function medianOf(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtInt(value) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value); }

/* ---- Histogramme (canvas) ---- */
function draw() {
  if (!canvas || root.hidden || !buckets.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const faint = style.getPropertyValue("--text-faint").trim() || "#667182";
  const accent = style.getPropertyValue("--accent").trim() || "#2dd4bf";

  const labelZone = 11;
  const chartH = h - labelZone;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const slot = w / buckets.length;
  const barW = Math.max(1, Math.min(slot - 1.2, 7));
  const all = fullSpan();

  buckets.forEach((b, i) => {
    const barH = Math.max(1.5, Math.sqrt(b.count / maxCount) * (chartH - 4));
    const x = i * slot + (slot - barW) / 2;
    const selected = all || (i >= startIdx && i <= endIdx);
    ctx.fillStyle = selected ? accent : faint;
    ctx.globalAlpha = all ? 0.6 : selected ? 0.95 : 0.32;
    roundedBar(ctx, x, chartH - barH, barW, barH);
  });
  ctx.globalAlpha = 1;

  ctx.fillStyle = faint;
  ctx.globalAlpha = 0.8;
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "center";
  buckets.forEach((b, i) => {
    const d = new Date(b.ts0);
    if (d.getMonth() !== 0) return;
    const x = i * slot + slot / 2;
    ctx.fillText(String(d.getFullYear()), Math.min(Math.max(x, 12), w - 12), h - 1.5);
  });
  ctx.globalAlpha = 1;
}

function roundedBar(ctx, x, y, w, h) {
  const r = Math.min(w / 2, 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (root) root.classList.remove("playing");
}
