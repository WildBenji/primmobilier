// Frise temporelle du marché : histogramme des ventes par mois + fenêtre
// glissante de 12 mois qu'on fait défiler (ou jouer) sur la carte.
// Le filtrage se fait côté carte (setFilter sur `ts`), sans re-requête serveur.

const FILTERED_LAYERS = ["comparables-points", "comparables-halo", "comparables-heat"];
const WINDOW_MONTHS = 12; // fenêtre glissante : 12 mois échus
const PLAY_STEP_MS = 420; // un mois par pas de lecture

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc."];

let map = null;
let root, playBtn, allBtn, scrub, canvas, windowLabel, ticker;

let buckets = [];      // [{ts0, ts1, count, prixM2: []}] — un par mois, ordre chronologique
let points = [];       // points courants avec ts
let cursor = -1;       // index du mois de fin de fenêtre ; -1 = pas de filtre (tout)
let playTimer = null;

export function initTimeline(mapInstance) {
  map = mapInstance;
  root = document.querySelector("#timeline");
  playBtn = document.querySelector("#timelinePlay");
  allBtn = document.querySelector("#timelineAll");
  scrub = document.querySelector("#timelineScrub");
  canvas = document.querySelector("#timelineCanvas");
  windowLabel = document.querySelector("#timelineWindow");
  ticker = document.querySelector("#timelineTicker");

  scrub.addEventListener("input", () => {
    stopPlay();
    setCursor(Number(scrub.value));
  });

  playBtn.addEventListener("click", () => {
    if (playTimer) {
      stopPlay();
      return;
    }
    // Lecture depuis le début si on est au bout (ou sans filtre), sinon on reprend.
    if (cursor < 0 || cursor >= buckets.length - 1) setCursor(0);
    root.classList.add("playing");
    playTimer = setInterval(() => {
      if (cursor >= buckets.length - 1) {
        stopPlay();
        return;
      }
      setCursor(cursor + 1);
    }, PLAY_STEP_MS);
  });

  allBtn.addEventListener("click", () => {
    stopPlay();
    setCursor(-1);
  });

  document.addEventListener("themechange", draw);
  new ResizeObserver(draw).observe(canvas);
}

// Appelé par app.js à chaque nouveau jeu de points (estimation ou exploration).
export function timelineSetData(rawPoints) {
  stopPlay();
  cursor = -1;
  applyFilter(); // toujours repartir sans filtre sur de nouvelles données

  points = (rawPoints || [])
    .map((p) => ({ ts: Date.parse(p.date_mutation) || 0, prix_m2: Number(p.prix_m2) || 0 }))
    .filter((p) => p.ts > 0);

  buckets = buildMonthBuckets(points);
  if (buckets.length < 3 || points.length < 10) {
    root.hidden = true;
    return;
  }

  scrub.max = String(buckets.length - 1);
  scrub.value = scrub.max;
  root.hidden = false;
  updateReadout();
  draw();
}

function buildMonthBuckets(pts) {
  if (!pts.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.ts < min) min = p.ts;
    if (p.ts > max) max = p.ts;
  }
  const start = new Date(min);
  const end = new Date(max);
  const result = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    const ts0 = d.getTime();
    d.setMonth(d.getMonth() + 1);
    result.push({ ts0, ts1: d.getTime(), count: 0, prixM2: [] });
  }
  for (const p of pts) {
    const idx = monthIndex(result, p.ts);
    if (idx >= 0) {
      result[idx].count += 1;
      if (p.prix_m2 > 0) result[idx].prixM2.push(p.prix_m2);
    }
  }
  return result;
}

function monthIndex(result, ts) {
  let lo = 0;
  let hi = result.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts < result[mid].ts0) hi = mid - 1;
    else if (ts >= result[mid].ts1) lo = mid + 1;
    else return mid;
  }
  return -1;
}

function windowRange() {
  if (cursor < 0) return null;
  const endBucket = buckets[cursor];
  const startIdx = Math.max(0, cursor - (WINDOW_MONTHS - 1));
  return { ts0: buckets[startIdx].ts0, ts1: endBucket.ts1, startIdx, endIdx: cursor };
}

function setCursor(value) {
  cursor = value;
  if (cursor >= 0) scrub.value = String(cursor);
  else scrub.value = scrub.max;
  applyFilter();
  updateReadout();
  draw();
}

function applyFilter() {
  if (!map) return;
  const range = windowRange();
  const filter = range
    ? ["all", [">=", ["get", "ts"], range.ts0], ["<", ["get", "ts"], range.ts1]]
    : null;
  for (const layer of FILTERED_LAYERS) {
    if (map.getLayer(layer)) map.setFilter(layer, filter);
  }
}

function updateReadout() {
  const range = windowRange();
  allBtn.hidden = !range;
  const inWindow = range
    ? points.filter((p) => p.ts >= range.ts0 && p.ts < range.ts1)
    : points;
  const median = medianOf(inWindow.map((p) => p.prix_m2).filter((v) => v > 0));
  if (range) {
    windowLabel.textContent = `${monthLabel(buckets[range.startIdx].ts0)} – ${monthLabel(range.ts1 - 1)}`;
  } else {
    windowLabel.textContent = `${new Date(buckets[0].ts0).getFullYear()} – ${new Date(buckets[buckets.length - 1].ts0).getFullYear()} · tout`;
  }
  ticker.textContent = inWindow.length
    ? `${fmtInt(inWindow.length)} ventes · ${median ? `${fmtInt(median)} €/m² médian` : "€/m² n.c."}`
    : "Aucune vente sur la fenêtre";
}

function monthLabel(ts) {
  const d = new Date(ts);
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function medianOf(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtInt(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

/* ---- Rendu de l'histogramme ---- */
function draw() {
  if (!canvas || root.hidden || !buckets.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const faint = style.getPropertyValue("--text-faint").trim() || "#667182";
  const accent = style.getPropertyValue("--accent").trim() || "#2dd4bf";

  const labelZone = 11; // bande du bas réservée aux années
  const chartH = h - labelZone;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const slot = w / buckets.length;
  const barW = Math.max(1, Math.min(slot - 1.2, 7));
  const range = windowRange();

  buckets.forEach((b, i) => {
    // Échelle racine : les petits mois restent visibles à côté des pics.
    const barH = Math.max(1.5, Math.sqrt(b.count / maxCount) * (chartH - 4));
    const x = i * slot + (slot - barW) / 2;
    const inWindow = range && i >= range.startIdx && i <= range.endIdx;
    ctx.fillStyle = inWindow ? accent : faint;
    ctx.globalAlpha = inWindow ? 0.95 : 0.32;
    roundedBar(ctx, x, chartH - barH, barW, barH);
  });
  ctx.globalAlpha = 1;

  // Marques d'années (janvier).
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
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  root.classList.remove("playing");
}
