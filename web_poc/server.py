"""Serveur local du POC web d'estimation par comparables.

Usage:
    uv run python web_poc/server.py
"""
from __future__ import annotations

import json
import math
import mimetypes
import urllib.request
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import median, pstdev
from urllib.parse import parse_qs, urlparse

import duckdb

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent / "static"
INTERIM = ROOT / "data" / "interim"
HOST = "127.0.0.1"
PORT = 8765
MIN_COMPARABLES = 5
DEFAULT_RADIUS_M = 1500
MIN_RADIUS_M = 100
MAX_RADIUS_M = 20_000
DEFAULT_HISTORY_YEARS = 5
MIN_HISTORY_YEARS = 1
MAX_HISTORY_YEARS = 5
PANORAMAX_ENDPOINT = "https://panoramax.openstreetmap.fr"


def available_departements() -> list[str]:
    return sorted(
        p.stem.removeprefix("comparables_")
        for p in INTERIM.glob("comparables_*.parquet")
        if (INTERIM / f"dvf_{p.stem.removeprefix('comparables_')}.parquet").exists()
    )


def as_float(values: dict[str, list[str]], key: str, default: float | None = None) -> float | None:
    try:
        value = values.get(key, [""])[0]
        return float(value) if value != "" else default
    except ValueError:
        return default


def as_int(values: dict[str, list[str]], key: str, default: int | None = None) -> int | None:
    value = as_float(values, key)
    return int(value) if value is not None else default


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return ordered[lo]
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def trim_extremes(rows: list[dict]) -> list[dict]:
    if len(rows) < 10:
        return rows
    prices = [r["prix_m2"] for r in rows]
    low = quantile(prices, 0.01)
    high = quantile(prices, 0.99)
    trimmed = [r for r in rows if low <= r["prix_m2"] <= high]
    return trimmed if len(trimmed) >= 3 else rows


def confidence(n: int, dispersion_pct: float | None) -> str:
    if n >= 20 and dispersion_pct is not None and dispersion_pct <= 20:
        return "forte"
    if n >= 10 and dispersion_pct is not None and dispersion_pct <= 35:
        return "moyenne"
    return "prudente"


def radius_label(radius_m: int) -> str:
    if radius_m >= 1000:
        return f"rayon {radius_m / 1000:g} km".replace(".", ",")
    return f"rayon {radius_m} m"


def history_label(years: int) -> str:
    return f"{years} an" if years == 1 else f"{years} ans"


def latest_mutation_date(rows: list[dict]) -> date | None:
    dates = []
    for row in rows:
        try:
            dates.append(date.fromisoformat(row["date_mutation"]))
        except (TypeError, ValueError):
            pass
    return max(dates) if dates else None


def filter_history(rows: list[dict], years: int, reference_date: date | None) -> list[dict]:
    dated_rows = []
    for row in rows:
        try:
            dated_rows.append((row, date.fromisoformat(row["date_mutation"])))
        except (TypeError, ValueError):
            pass
    if not dated_rows or reference_date is None:
        return rows
    try:
        cutoff = date(reference_date.year - years, reference_date.month, reference_date.day)
    except ValueError:
        cutoff = date(reference_date.year - years, 2, 28)
    return [row for row, row_date in dated_rows if row_date >= cutoff]


def similarity_score(row: dict, target_surface: float, target_rooms: int | None, max_distance: float) -> float:
    surface_gap = abs(row["surface"] - target_surface) / target_surface if target_surface else 1
    surface_score = max(0, 1 - surface_gap / 0.30)
    rooms_score = 1
    if target_rooms and row["pieces"]:
        rooms_score = max(0, 1 - abs(row["pieces"] - target_rooms) / 3)
    distance_score = max(0, 1 - row["distance_m"] / max(max_distance, 1))
    return round((0.50 * surface_score + 0.25 * rooms_score + 0.25 * distance_score) * 100, 1)


def comparable_rows(params: dict[str, list[str]]) -> dict:
    dept = params.get("dept", [""])[0]
    scope_mode = params.get("scope_mode", ["radius"])[0]
    target_type = params.get("type", ["Appartement"])[0]
    postcode = params.get("postcode", [""])[0] or None
    citycode = params.get("citycode", [""])[0] or None
    lon = as_float(params, "lon")
    lat = as_float(params, "lat")
    surface = as_float(params, "surface")
    rooms = as_int(params, "rooms")
    asked_price = as_float(params, "asked_price")
    history_years = as_int(params, "history_years", DEFAULT_HISTORY_YEARS) or DEFAULT_HISTORY_YEARS
    history_years = min(MAX_HISTORY_YEARS, max(MIN_HISTORY_YEARS, history_years))
    radius_m = as_int(params, "radius_m", DEFAULT_RADIUS_M) or DEFAULT_RADIUS_M
    radius_m = min(MAX_RADIUS_M, max(MIN_RADIUS_M, radius_m))
    if scope_mode not in {"radius", "cadastre", "postcode", "city"}:
        scope_mode = "radius"
    if scope_mode == "cadastre":
        # TODO: activer quand les géométries cadastrales seront ingérées :
        # - contours de sections cadastrales ou parcelles (GeoParquet/PMTiles) ;
        # - résolution point adresse -> section/parcelle ;
        # - filtre spatial ou jointure id_parcelle -> géométrie de section.
        return {
            "error": "Emprise cadastrale à brancher quand les géométries cadastrales seront disponibles.",
            "count": 0,
            "scope": "cadastre",
        }

    if dept not in available_departements():
        return {
            "error": f"Département {dept or 'inconnu'} indisponible dans data/interim.",
            "available_departements": available_departements(),
        }
    if lon is None or lat is None or surface is None or surface <= 0:
        return {"error": "Adresse résolue et surface cible sont requises."}

    con = duckdb.connect()
    comp = INTERIM / f"comparables_{dept}.parquet"
    dvf = INTERIM / f"dvf_{dept}.parquet"
    room_filter = "AND pieces = ?" if rooms else ""
    args: list[object] = [lat, lat, lon, target_type, surface * 0.7, surface * 1.3]
    if rooms:
        args.append(rooms)

    rows = con.execute(
        f"""
        WITH coords AS (
            SELECT id_mutation, id_parcelle,
                   any_value(code_postal) AS code_postal,
                   any_value(TRY_CAST(longitude AS DOUBLE)) AS lon,
                   any_value(TRY_CAST(latitude AS DOUBLE)) AS lat
            FROM read_parquet(?)
            WHERE longitude IS NOT NULL AND latitude IS NOT NULL
            GROUP BY 1, 2
        ),
        base AS (
            SELECT c.id_mutation, c.date_mutation, c.nature_mutation,
                   c.code_departement, c.code_commune, c.nom_commune,
                   coords.code_postal, c.id_parcelle, c.adresse_dvf, c.type_local,
                   TRY_CAST(c.surface_reelle_bati AS DOUBLE) AS surface,
                   TRY_CAST(c.nombre_pieces_principales AS INTEGER) AS pieces,
                   TRY_CAST(c.valeur_fonciere AS DOUBLE) AS prix,
                   coords.lon, coords.lat, c.rnb_id, c.confiance, c.source,
                   c.flag_multi_bien, c.flag_multi_adresse
            FROM read_parquet(?) c
            JOIN coords USING (id_mutation, id_parcelle)
        )
        SELECT *,
               prix / surface AS prix_m2,
               2 * 6371000 * asin(sqrt(
                   power(sin(radians(lat - ?) / 2), 2)
                   + cos(radians(?)) * cos(radians(lat))
                   * power(sin(radians(lon - ?) / 2), 2)
               )) AS distance_m
        FROM base
        WHERE type_local = ?
          AND surface BETWEEN ? AND ?
          {room_filter}
          AND prix > 0 AND surface > 0
          AND prix / surface BETWEEN 500 AND 20000
          AND flag_multi_bien = false
          AND flag_multi_adresse = false
        ORDER BY distance_m ASC, date_mutation DESC
        """,
        [str(dvf), str(comp), *args],
    ).fetchall()
    columns = [c[0] for c in con.description]
    all_rows = [dict(zip(columns, row)) for row in rows]
    if len(all_rows) < MIN_COMPARABLES:
        return {
            "error": "Pas assez de ventes comparables dans les données locales avec ces critères.",
            "count": len(all_rows),
            "available_departements": available_departements(),
        }
    reference_date = latest_mutation_date(all_rows)

    if scope_mode == "postcode":
        scope = f"code postal {postcode}" if postcode else "code postal"
        cohort = [r for r in all_rows if postcode and r["code_postal"] == postcode]
    elif scope_mode == "city":
        scope = "commune entière"
        cohort = [r for r in all_rows if citycode and r["code_commune"] == citycode]
    else:
        scope = radius_label(radius_m)
        cohort = [r for r in all_rows if r["distance_m"] <= radius_m]
    if len(cohort) < MIN_COMPARABLES:
        return {
            "error": f"Seulement {len(cohort)} comparables dans l'emprise « {scope} ». Minimum requis : {MIN_COMPARABLES}. Élargis ou change d'emprise.",
            "count": len(cohort),
            "scope": scope,
        }

    cohort = filter_history(cohort, history_years, reference_date)
    if len(cohort) < MIN_COMPARABLES:
        return {
            "error": f"Seulement {len(cohort)} comparables sur {history_label(history_years)} dans l'emprise « {scope} ». Minimum requis : {MIN_COMPARABLES}. Augmente l'historique ou change d'emprise.",
            "count": len(cohort),
            "scope": scope,
        }

    cohort = trim_extremes(cohort)
    prices_m2 = [r["prix_m2"] for r in cohort]
    median_m2 = median(prices_m2)
    q10 = quantile(prices_m2, 0.10)
    q90 = quantile(prices_m2, 0.90)
    std = pstdev(prices_m2) if len(prices_m2) > 1 else 0
    dispersion_pct = (std / median_m2 * 100) if median_m2 else None
    estimated = median_m2 * surface
    asked_position = None
    if asked_price and asked_price > 0:
        asked_m2 = asked_price / surface
        asked_position = sum(1 for p in prices_m2 if p <= asked_m2) / len(prices_m2) * 100

    shown = sorted(cohort, key=lambda item: item["distance_m"])[:80]
    max_distance = max(r["distance_m"] for r in shown) if shown else 1

    return {
        "target": {
            "dept": dept,
            "lon": lon,
            "lat": lat,
            "type": target_type,
            "surface": surface,
            "rooms": rooms,
            "postcode": postcode,
            "citycode": citycode,
            "scope_mode": scope_mode,
            "radius_m": radius_m,
            "history_years": history_years,
        },
        "summary": {
            "scope": scope,
            "history": history_label(history_years),
            "count": len(cohort),
            "median_m2": round(median_m2),
            "q10_m2": round(q10) if q10 is not None else None,
            "q90_m2": round(q90) if q90 is not None else None,
            "estimated_price": round(estimated, -3),
            "low_price": round((q10 or median_m2) * surface, -3),
            "high_price": round((q90 or median_m2) * surface, -3),
            "dispersion_pct": round(dispersion_pct, 1) if dispersion_pct is not None else None,
            "confidence": confidence(len(cohort), dispersion_pct),
            "asked_position_pct": round(asked_position, 1) if asked_position is not None else None,
        },
        "comparables": [
            {
                "uid": i,
                "id_mutation": r["id_mutation"],
                "date_mutation": r["date_mutation"],
                "nature_mutation": r["nature_mutation"],
                "code_departement": r["code_departement"],
                "code_commune": r["code_commune"],
                "code_postal": r["code_postal"],
                "adresse": r["adresse_dvf"],
                "commune": r["nom_commune"],
                "id_parcelle": r["id_parcelle"],
                "type_local": r["type_local"],
                "surface": r["surface"],
                "pieces": r["pieces"],
                "prix": r["prix"],
                "prix_m2": round(r["prix_m2"]),
                "distance_m": round(r["distance_m"]),
                "lon": r["lon"],
                "lat": r["lat"],
                "rnb_id": r["rnb_id"],
                "confiance": r["confiance"],
                "source": r["source"],
                "similarity": similarity_score(r, surface, rooms, max_distance),
            }
            for i, r in enumerate(shown)
        ],
    }


def panoramax_rows(params: dict[str, list[str]]) -> dict:
    lon = as_float(params, "lon")
    lat = as_float(params, "lat")
    if lon is None or lat is None:
        return {"features": []}
    radius_m = 60
    d_lat = radius_m / 111_320
    d_lon = radius_m / (111_320 * math.cos(math.radians(lat)))
    bbox = f"{lon - d_lon},{lat - d_lat},{lon + d_lon},{lat + d_lat}"
    url = f"{PANORAMAX_ENDPOINT}/api/search?bbox={bbox}&limit=12"
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return {"features": []}


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        rel = "index.html" if parsed.path in ("", "/") else parsed.path.removeprefix("/")
        file_path = (STATIC / rel).resolve()
        if STATIC.resolve() not in file_path.parents and file_path != STATIC.resolve():
            self.send_error(404)
            return
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file_path)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/departements":
            self.json({"departements": available_departements()})
            return
        if parsed.path == "/api/estimate":
            self.json(comparable_rows(parse_qs(parsed.query)))
            return
        if parsed.path == "/api/panoramax":
            self.json(panoramax_rows(parse_qs(parsed.query)))
            return
        self.static_file(parsed.path)

    def json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def static_file(self, path: str) -> None:
        rel = "index.html" if path in ("", "/") else path.removeprefix("/")
        file_path = (STATIC / rel).resolve()
        if STATIC.resolve() not in file_path.parents and file_path != STATIC.resolve():
            self.send_error(404)
            return
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file_path)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    print(f"POC web: http://{HOST}:{PORT}")
    print(f"Départements disponibles: {', '.join(available_departements())}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
