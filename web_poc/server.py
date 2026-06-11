"""Serveur local du POC web d'estimation par comparables.

Usage:
    uv run python web_poc/server.py
"""
from __future__ import annotations

import json
import math
import mimetypes
import re
import tempfile
import urllib.request
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import median, pstdev
from threading import Lock
from urllib.parse import parse_qs, urlparse

import duckdb

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent / "static"
INTERIM = ROOT / "data" / "interim"
HOST = "127.0.0.1"
PORT = 8765
MIN_COMPARABLES = 5
DEFAULT_MAX_COMPARABLES = 200
MAX_COMPARABLES_LIMIT = 1000
# Plafond de sécurité des points carte (payload allégé) : en pratique = « tous les points ».
POINTS_HARD_CAP = 20000
PARCELLE_IDS_CAP = 2000
PARCELLE_BBOX_CAP = 4000
DEFAULT_RADIUS_M = 1500
MIN_RADIUS_M = 100
MAX_RADIUS_M = 20_000
DEFAULT_HISTORY_YEARS = 5
MIN_HISTORY_YEARS = 0
MAX_HISTORY_YEARS = 5
PANORAMAX_ENDPOINT = "https://panoramax.openstreetmap.fr"
SPATIAL_INSTALLED = False
MONO_CACHE: dict[str, Path] = {}
MONO_CACHE_LOCK = Lock()


def available_departements() -> list[str]:
    return sorted(
        p.stem.removeprefix("comparables_")
        for p in INTERIM.glob("comparables_*.parquet")
        if (INTERIM / f"dvf_{p.stem.removeprefix('comparables_')}.parquet").exists()
    )


def load_spatial(con: duckdb.DuckDBPyConnection) -> None:
    global SPATIAL_INSTALLED
    if not SPATIAL_INSTALLED:
        con.execute("INSTALL spatial;")
        SPATIAL_INSTALLED = True
    con.execute("LOAD spatial;")


def mono_mutations_path(dept: str, dvf: Path) -> Path:
    stat = dvf.stat()
    key = f"{dept}:{stat.st_mtime_ns}:{stat.st_size}"
    with MONO_CACHE_LOCK:
        cached = MONO_CACHE.get(key)
        if cached and cached.exists():
            return cached
        path = Path(tempfile.gettempdir()) / f"primmobilier_mono_{dept}_{stat.st_mtime_ns}_{stat.st_size}.parquet"
        if not path.exists():
            con = duckdb.connect()
            try:
                con.execute(
                    """
                    CREATE TEMP TABLE mono_mutations AS
                        SELECT id_mutation
                        FROM read_parquet(?)
                        GROUP BY 1
                        HAVING count(*) = 1
                    """,
                    [str(dvf)],
                )
                con.execute("COPY mono_mutations TO ? (FORMAT PARQUET)", [str(path)])
            finally:
                con.close()
        MONO_CACHE[key] = path
        return path


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
    if years == 0:
        return "0"
    return f"{years} an" if years == 1 else f"{years} ans"


def history_window_label(min_years: int, max_years: int) -> str:
    def part(years: int) -> str:
        if years == 0:
            return "0"
        if years == 1:
            return "12 mois"
        return f"{years} ans"

    if min_years == 0:
        return history_label(max_years)
    if min_years == max_years:
        return part(max_years)
    return f"{part(min_years)} à {part(max_years)}"


def radius_bbox(lon: float, lat: float, radius_m: int) -> tuple[float, float, float, float]:
    d_lat = radius_m / 111_320
    d_lon = radius_m / (111_320 * max(math.cos(math.radians(lat)), 0.01))
    return lon - d_lon, lat - d_lat, lon + d_lon, lat + d_lat


def scope_label(scope_mode: str, radius_m: int, postcode: str | None, section: dict | None) -> str:
    if scope_mode == "postcode":
        return f"code postal {postcode}" if postcode else "code postal"
    if scope_mode == "city":
        return "commune entière"
    if scope_mode == "cadastre" and section:
        return f"section {section['id']}"
    return radius_label(radius_m)


def refine_scope_city(scope: str, scope_mode: str, citycode: str | None, rows: list[dict]) -> str:
    """Emprise commune : affiche « Nom (code INSEE) » plutôt que « commune entière »."""
    if scope_mode != "city" or not rows:
        return scope
    name = rows[0].get("nom_commune")
    if not name:
        return scope
    return f"{name} ({citycode})" if citycode else name


def distance_sql() -> str:
    return """
        2 * 6371000 * asin(sqrt(
            power(sin(radians(lat - ?) / 2), 2)
            + cos(radians(?)) * cos(radians(lat))
            * power(sin(radians(lon - ?) / 2), 2)
        ))
    """


def add_scope_filter(
    filters: list[str],
    args: list[object],
    scope_mode: str,
    *,
    postcode: str | None,
    citycode: str | None,
    section: dict | None,
    lon: float,
    lat: float,
    radius_m: int,
    postcode_expr: str | None = None,
    citycode_expr: str | None = None,
    parcelle_expr: str | None = None,
    lon_expr: str | None = None,
    lat_expr: str | None = None,
) -> None:
    if scope_mode == "postcode" and postcode and postcode_expr:
        filters.append(f"{postcode_expr} = ?")
        args.append(postcode)
    elif scope_mode == "city" and citycode and citycode_expr:
        filters.append(f"{citycode_expr} = ?")
        args.append(citycode)
    elif scope_mode == "cadastre" and section and parcelle_expr:
        filters.append(f"{parcelle_expr} LIKE ?")
        args.append(f"{section['id']}%")
    elif scope_mode == "radius" and lon_expr and lat_expr:
        minlon, minlat, maxlon, maxlat = radius_bbox(lon, lat, radius_m)
        filters.append(f"{lon_expr} BETWEEN ? AND ?")
        filters.append(f"{lat_expr} BETWEEN ? AND ?")
        args.extend([minlon, maxlon, minlat, maxlat])


def latest_mutation_date(rows: list[dict]) -> date | None:
    dates = []
    for row in rows:
        try:
            dates.append(date.fromisoformat(row["date_mutation"]))
        except (TypeError, ValueError):
            pass
    return max(dates) if dates else None


def filter_history(rows: list[dict], years: int, reference_date: date | None) -> list[dict]:
    return filter_history_window(rows, 0, years, reference_date)


def history_window_from_params(params: dict[str, list[str]]) -> tuple[int, int]:
    legacy_years = as_int(params, "history_years", DEFAULT_HISTORY_YEARS)
    max_years = as_int(params, "history_max_years")
    min_years = as_int(params, "history_min_years", 0)
    if max_years is None:
        max_years = legacy_years if legacy_years is not None else DEFAULT_HISTORY_YEARS
    min_years = min(MAX_HISTORY_YEARS, max(MIN_HISTORY_YEARS, min_years if min_years is not None else 0))
    max_years = min(MAX_HISTORY_YEARS, max(MIN_HISTORY_YEARS, max_years))
    if min_years > max_years:
        min_years, max_years = max_years, min_years
    return min_years, max_years


def shift_years(day: date, years: int) -> date:
    try:
        return date(day.year - years, day.month, day.day)
    except ValueError:
        return date(day.year - years, 2, 28)


def filter_history_window(rows: list[dict], min_years: int, max_years: int, reference_date: date | None) -> list[dict]:
    dated_rows = []
    for row in rows:
        try:
            dated_rows.append((row, date.fromisoformat(row["date_mutation"])))
        except (TypeError, ValueError):
            pass
    if not dated_rows or reference_date is None:
        return rows
    oldest = shift_years(reference_date, max_years)
    newest = shift_years(reference_date, min_years)
    return [row for row, row_date in dated_rows if oldest <= row_date <= newest]


def price_step(min_price: float, max_price: float) -> int:
    span = max(0, max_price - min_price)
    if span <= 100_000:
        return 1_000
    if span <= 500_000:
        return 5_000
    if span <= 2_000_000:
        return 10_000
    return 50_000


def price_bounds(rows: list[dict]) -> dict | None:
    prices = [float(row["prix"]) for row in rows if row.get("prix") is not None]
    if not prices:
        return None
    raw_min = min(prices)
    raw_max = max(prices)
    step = price_step(raw_min, raw_max)
    # On aligne les bornes sur le pas du slider : un <input range> ne s'arrête que
    # sur des multiples du step depuis le min. Sans alignement, la poignée max ne
    # peut pas atteindre le prix exact du bien le plus cher, qui se retrouve alors
    # exclu du filtre (« Aucune vente… ») alors qu'il est affiché dans la liste.
    min_price = math.floor(raw_min / step) * step
    max_price = math.ceil(raw_max / step) * step
    return {
        "min": min_price,
        "max": max_price,
        "step": step,
    }


def similarity_score(row: dict, target_surface: float, target_rooms: int | None, max_distance: float) -> float:
    surface_gap = abs(row["surface"] - target_surface) / target_surface if target_surface else 1
    surface_score = max(0, 1 - surface_gap / 0.30)
    rooms_score = 1
    if target_rooms and row["pieces"]:
        rooms_score = max(0, 1 - abs(row["pieces"] - target_rooms) / 3)
    distance_score = max(0, 1 - row["distance_m"] / max(max_distance, 1))
    return round((0.50 * surface_score + 0.25 * rooms_score + 0.25 * distance_score) * 100, 1)


def resolve_section(dept: str, lon: float, lat: float) -> dict | None:
    """Section cadastrale contenant le point (point-dans-polygone). Renvoie id + géométrie GeoJSON."""
    path = INTERIM / f"cadastre_sections_{dept}.parquet"
    if not path.exists():
        return None
    con = duckdb.connect()
    try:
        load_spatial(con)
        row = con.execute(
            """
            SELECT id, ST_AsGeoJSON(ST_GeomFromWKB(geom_wkb))
            FROM read_parquet(?)
            WHERE ST_Contains(ST_GeomFromWKB(geom_wkb), ST_Point(?, ?))
            LIMIT 1
            """,
            [str(path), lon, lat],
        ).fetchone()
    finally:
        con.close()
    if not row:
        return None
    return {"id": row[0], "geojson": json.loads(row[1])}


POSTCODE_CONTOURS_PATH = INTERIM / "contours_codes_postaux.parquet"


def commune_contours_path(dept: str) -> Path:
    return INTERIM / f"contours_communes_{dept}.parquet"


def dept_from_citycode(code: str) -> str:
    return code[:3] if code.startswith("97") else code[:2]


def _read_contour_geojson(path: Path, key_col: str, value: str) -> dict | None:
    """Lit une géométrie de contour (GeoJSON) d'un parquet local filtré par clé."""
    if not path.exists():
        return None
    con = duckdb.connect()
    try:
        load_spatial(con)
        row = con.execute(
            f"SELECT ST_AsGeoJSON(ST_GeomFromWKB(geom_wkb)) FROM read_parquet(?) WHERE {key_col} = ? LIMIT 1",
            [str(path), value],
        ).fetchone()
    finally:
        con.close()
    return json.loads(row[0]) if row and row[0] else None


def _feature_collection(geojson: dict | None, props: dict) -> dict:
    if not geojson:
        return {"type": "FeatureCollection", "features": []}
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": geojson, "properties": props}],
    }


def postcode_rows(params: dict[str, list[str]]) -> dict:
    """Emprise GeoJSON d'un code postal (contours hybrides locaux) pour le tracé carto."""
    code = params.get("code", [""])[0]
    if not re.fullmatch(r"\d{5}", code or ""):
        return {"type": "FeatureCollection", "features": []}
    geojson = _read_contour_geojson(POSTCODE_CONTOURS_PATH, "codePostal", code)
    return _feature_collection(geojson, {"codePostal": code})


def commune_rows(params: dict[str, list[str]]) -> dict:
    """Emprise GeoJSON d'une commune (contour IGN local, geo.api figé) pour le tracé carto."""
    code = params.get("code", [""])[0]
    if not re.fullmatch(r"\d[\dAB]\d{3}", code or ""):
        return {"type": "FeatureCollection", "features": []}
    geojson = _read_contour_geojson(commune_contours_path(dept_from_citycode(code)), "insee", code)
    return _feature_collection(geojson, {"insee": code})


def scope_communes_rows(params: dict[str, list[str]]) -> dict:
    """Communes associées à l'emprise CP/commune affichée dans le POC."""
    dept = params.get("dept", [""])[0]
    scope_mode = params.get("scope_mode", [""])[0]
    postcode = params.get("postcode", [""])[0]
    citycode = params.get("citycode", [""])[0]
    if not re.fullmatch(r"\d{2,3}|2[AB]", dept or ""):
        return {"communes": []}
    ban = INTERIM / f"ban_{dept}.parquet"
    if not ban.exists():
        return {"communes": []}
    con = duckdb.connect()
    try:
        if scope_mode == "postcode" and re.fullmatch(r"\d{5}", postcode or ""):
            rows = con.execute(
                """
                SELECT code_insee, any_value(nom_commune) AS nom
                FROM read_parquet(?)
                WHERE code_postal = ? AND code_insee IS NOT NULL
                GROUP BY 1
                ORDER BY 2
                """,
                [str(ban), postcode],
            ).fetchall()
            return {
                "kind": "communes",
                "title": f"Communes partageant {postcode}",
                "communes": [{"code": code, "nom": nom} for code, nom in rows],
            }
        if scope_mode == "city" and re.fullmatch(r"\d[\dAB]\d{3}", citycode or ""):
            rows = con.execute(
                """
                SELECT code_postal, any_value(nom_commune) AS nom
                FROM read_parquet(?)
                WHERE code_insee = ?
                GROUP BY 1
                ORDER BY 1
                """,
                [str(ban), citycode],
            ).fetchall()
            if rows:
                city_name = rows[0][1]
                return {
                    "kind": "postcodes",
                    "title": f"Codes postaux de {city_name}",
                    "postcodes": [{"code": code, "nom": city_name} for code, _ in rows],
                }
            path = commune_contours_path(dept)
            if path.exists():
                rows = con.execute(
                    "SELECT insee, nom FROM read_parquet(?) WHERE insee = ? LIMIT 1",
                    [str(path), citycode],
                ).fetchall()
            else:
                # Filet de compatibilité uniquement : métierment, DVF ne devrait pas
                # connaître une commune absente de la BAN du même département. Si ce
                # repli sert, c'est probablement que l'artefact BAN local est incomplet
                # ou obsolète et qu'il faut régénérer `ban_{dept}.parquet`.
                dvf = INTERIM / f"dvf_{dept}.parquet"
                rows = [] if not dvf.exists() else con.execute(
                    """
                    SELECT code_commune, any_value(nom_commune) AS nom
                    FROM read_parquet(?)
                    WHERE code_commune = ?
                    GROUP BY 1
                    LIMIT 1
                    """,
                    [str(dvf), citycode],
                ).fetchall()
            return {
                "kind": "postcodes",
                "title": "Commune",
                "postcodes": [],
                "communes": [{"code": code, "nom": nom} for code, nom in rows],
            }
    finally:
        con.close()
    return {"communes": []}


def parcelles_rows(params: dict[str, list[str]]) -> dict:
    """Géométries de parcelles cadastrales en GeoJSON, soit par `ids`, soit par `bbox` (centroïde)."""
    empty = {"type": "FeatureCollection", "features": []}
    dept = params.get("dept", [""])[0]
    if not re.fullmatch(r"\d{2,3}|2[AB]", dept):
        return empty
    path = INTERIM / f"cadastre_parcelles_service_{dept}.parquet"
    if not path.exists():
        path = INTERIM / f"cadastre_parcelles_{dept}.parquet"
    if not path.exists():
        return empty
    ids = [x for x in (params.get("ids", [""])[0] or "").split(",") if x][:PARCELLE_IDS_CAP]
    bbox = params.get("bbox", [""])[0]
    con = duckdb.connect()
    try:
        load_spatial(con)
        if ids:
            placeholders = ",".join(["?"] * len(ids))
            rows = con.execute(
                f"""
                SELECT id, ST_AsGeoJSON(ST_GeomFromWKB(geom_wkb))
                FROM read_parquet(?) WHERE id IN ({placeholders})
                """,
                [str(path), *ids],
            ).fetchall()
        elif bbox:
            try:
                minlon, minlat, maxlon, maxlat = (float(x) for x in bbox.split(","))
            except ValueError:
                return empty
            rows = con.execute(
                """
                SELECT id, ST_AsGeoJSON(ST_GeomFromWKB(geom_wkb))
                FROM read_parquet(?)
                WHERE clon BETWEEN ? AND ? AND clat BETWEEN ? AND ?
                LIMIT ?
                """,
                [str(path), minlon, maxlon, minlat, maxlat, PARCELLE_BBOX_CAP],
            ).fetchall()
        else:
            return empty
    finally:
        con.close()
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": r[0]}, "geometry": json.loads(r[1])}
            for r in rows
        ],
    }


BATIMENT_TYPE_LABELS = {"01": "Bâti en dur", "02": "Bâti léger"}
# Marge du préfiltre bbox des bâtiments (~0,002° ≈ 160-220 m) : couvre tout footprint
# qui intersecte la parcelle même si son centroïde tombe hors de la bbox parcelle.
BATIMENT_BBOX_MARGIN_DEG = 0.002


def batiments_rows(params: dict[str, list[str]]) -> dict:
    """Empreintes des bâtiments cadastraux rattachés à une parcelle (intersection spatiale).

    Renvoie une FeatureCollection : le contour de la parcelle (`kind=parcelle`) + chaque
    bâtiment (`kind=batiment`, `type_label`, `surface_m2`). Permet de dessiner maison /
    garage / annexes distinctement plutôt que le seul contour parcellaire.
    """
    empty = {"type": "FeatureCollection", "features": []}
    dept = params.get("dept", [""])[0]
    parcelle = params.get("parcelle", [""])[0]
    if not re.fullmatch(r"\d{2,3}|2[AB]", dept) or not re.fullmatch(r"[0-9A-Z]{10,16}", parcelle or ""):
        return empty
    parc_path = INTERIM / f"cadastre_parcelles_service_{dept}.parquet"
    if not parc_path.exists():
        parc_path = INTERIM / f"cadastre_parcelles_{dept}.parquet"
    bat_path = INTERIM / f"cadastre_batiments_{dept}.parquet"
    if not parc_path.exists() or not bat_path.exists():
        return empty
    con = duckdb.connect()
    try:
        load_spatial(con)
        # Parcelle lue une seule fois : GeoJSON pour le tracé, WKB + bbox pour la jointure.
        parc = con.execute(
            """
            SELECT ST_AsGeoJSON(g), geom_wkb,
                   ST_XMin(g), ST_YMin(g), ST_XMax(g), ST_YMax(g)
            FROM (SELECT geom_wkb, ST_GeomFromWKB(geom_wkb) AS g
                  FROM read_parquet(?) WHERE id = ? LIMIT 1)
            """,
            [str(parc_path), parcelle],
        ).fetchone()
        if not parc:
            return empty
        parc_geojson, parc_wkb, xmin, ymin, xmax, ymax = parc
        # Préfiltre bbox élargi (clon/clat = centroïde du bâtiment) puis intersection exacte.
        # La marge évite de jeter un bâtiment qui déborde la parcelle (footprint plus grand
        # que la parcelle, mitoyens…) dont le centroïde tombe hors de la bbox parcelle.
        # Le ST_Intersects reste le filtre exact : la marge ne fait qu'élargir les candidats.
        m = BATIMENT_BBOX_MARGIN_DEG
        rows = con.execute(
            """
            SELECT b.type, b.created,
                   ST_AsGeoJSON(ST_GeomFromWKB(b.geom_wkb)),
                   ST_Area_Spheroid(ST_GeomFromWKB(b.geom_wkb))
            FROM read_parquet(?) b
            WHERE b.clon BETWEEN ? AND ?
              AND b.clat BETWEEN ? AND ?
              AND ST_Intersects(ST_GeomFromWKB(b.geom_wkb), ST_GeomFromWKB(?))
            ORDER BY 4 DESC
            """,
            [str(bat_path), xmin - m, xmax + m, ymin - m, ymax + m, parc_wkb],
        ).fetchall()
    finally:
        con.close()
    features = [{
        "type": "Feature",
        "properties": {"kind": "parcelle", "id": parcelle},
        "geometry": json.loads(parc_geojson),
    }]
    for i, (btype, created, geo, surface) in enumerate(rows):
        features.append({
            "type": "Feature",
            "properties": {
                "kind": "batiment",
                "idx": i + 1,
                "type": btype,
                "type_label": BATIMENT_TYPE_LABELS.get(btype, "Bâti"),
                "surface_m2": round(surface) if surface is not None else None,
                "annee": str(created)[:4] if created else None,
            },
            "geometry": json.loads(geo),
        })
    return {"type": "FeatureCollection", "features": features}


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
    history_min_years, history_max_years = history_window_from_params(params)
    radius_m = as_int(params, "radius_m", DEFAULT_RADIUS_M) or DEFAULT_RADIUS_M
    radius_m = min(MAX_RADIUS_M, max(MIN_RADIUS_M, radius_m))
    max_comparables = as_int(params, "max_comparables", DEFAULT_MAX_COMPARABLES) or DEFAULT_MAX_COMPARABLES
    max_comparables = min(MAX_COMPARABLES_LIMIT, max(MIN_COMPARABLES, max_comparables))
    if scope_mode not in {"radius", "cadastre", "postcode", "city"}:
        scope_mode = "radius"

    if dept not in available_departements():
        return {
            "error": f"Département {dept or 'inconnu'} indisponible dans data/interim.",
            "available_departements": available_departements(),
        }
    if lon is None or lat is None or surface is None or surface <= 0:
        return {"error": "Adresse résolue et surface cible sont requises."}

    section = None
    if scope_mode == "cadastre":
        section = resolve_section(dept, lon, lat)
        if not section:
            return {"error": "Aucune section cadastrale trouvée à cette adresse (cadastre du département requis)."}

    con = duckdb.connect()
    comp = INTERIM / f"comparables_{dept}.parquet"
    dvf = INTERIM / f"dvf_{dept}.parquet"
    comp_columns = {
        row[0]
        for row in con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(comp)]).fetchall()
    }
    def optional_comp_col(name: str) -> str:
        return f"c.{name}" if name in comp_columns else f"NULL AS {name}"

    bdnb_select = ", ".join(optional_comp_col(name) for name in [
        "batiment_groupe_id",
        "resolution_statut",
        "usage_principal_bdnb_open",
        "usage_niveau_1_txt",
        "nb_log",
        "nb_lot_garpark_rnc",
        "nb_lot_tertiaire_rnc",
        "surface_emprise_sol",
        "hauteur_mean",
        "nb_niveau",
        "annee_construction",
        "type_batiment_dpe",
        "fiabilite_emprise_sol",
        "fiabilite_hauteur",
    ])
    coords_filters = ["longitude IS NOT NULL", "latitude IS NOT NULL"]
    coords_args: list[object] = []
    add_scope_filter(
        coords_filters,
        coords_args,
        scope_mode,
        postcode=postcode,
        citycode=citycode,
        section=section,
        lon=lon,
        lat=lat,
        radius_m=radius_m,
        postcode_expr="code_postal",
        citycode_expr="code_commune",
        parcelle_expr="id_parcelle",
        lon_expr="TRY_CAST(longitude AS DOUBLE)",
        lat_expr="TRY_CAST(latitude AS DOUBLE)",
    )
    comp_filters = [
        "c.type_local = ?",
        "TRY_CAST(c.surface_reelle_bati AS DOUBLE) BETWEEN ? AND ?",
        "TRY_CAST(c.valeur_fonciere AS DOUBLE) > 0",
        "TRY_CAST(c.surface_reelle_bati AS DOUBLE) > 0",
        "TRY_CAST(c.valeur_fonciere AS DOUBLE) / TRY_CAST(c.surface_reelle_bati AS DOUBLE) BETWEEN 500 AND 20000",
        "c.flag_multi_bien = false",
        "c.flag_multi_adresse = false",
    ]
    comp_args: list[object] = [target_type, surface * 0.7, surface * 1.3]
    if rooms:
        comp_filters.append("TRY_CAST(c.nombre_pieces_principales AS INTEGER) = ?")
        comp_args.append(rooms)
    add_scope_filter(
        comp_filters,
        comp_args,
        scope_mode,
        postcode=postcode,
        citycode=citycode,
        section=section,
        lon=lon,
        lat=lat,
        radius_m=radius_m,
        citycode_expr="c.code_commune",
        parcelle_expr="c.id_parcelle",
    )
    final_filters = ["distance_m <= ?"] if scope_mode == "radius" else []
    final_args: list[object] = [radius_m] if scope_mode == "radius" else []
    scope = scope_label(scope_mode, radius_m, postcode, section)
    args: list[object] = [str(dvf), *coords_args, str(comp), *comp_args, lat, lat, lon, *final_args]

    try:
        rows = con.execute(
            f"""
            WITH coords AS (
                SELECT id_mutation, id_parcelle,
                       any_value(code_postal) AS code_postal,
                       any_value(TRY_CAST(longitude AS DOUBLE)) AS lon,
                       any_value(TRY_CAST(latitude AS DOUBLE)) AS lat
                FROM read_parquet(?)
                WHERE {" AND ".join(coords_filters)}
                GROUP BY 1, 2
            ),
            base AS (
                SELECT c.id_mutation, c.date_mutation, c.nature_mutation,
                       c.code_departement, c.code_commune, c.nom_commune,
                       coords.code_postal, c.id_parcelle, c.adresse_dvf, c.type_local,
                       TRY_CAST(c.surface_reelle_bati AS DOUBLE) AS surface,
                       TRY_CAST(c.nombre_pieces_principales AS INTEGER) AS pieces,
                       TRY_CAST(c.valeur_fonciere AS DOUBLE) AS prix,
                       coords.lon, coords.lat, c.rnb_id, {bdnb_select},
                       c.flag_multi_bien, c.flag_multi_adresse
                FROM read_parquet(?) c
                JOIN coords USING (id_mutation, id_parcelle)
                WHERE {" AND ".join(comp_filters)}
            ),
            scored AS (
                SELECT *,
                       prix / surface AS prix_m2,
                       {distance_sql()} AS distance_m
                FROM base
            )
            SELECT *
            FROM scored
            {"WHERE " + " AND ".join(final_filters) if final_filters else ""}
            ORDER BY distance_m ASC, date_mutation DESC
            """,
            args,
        ).fetchall()
        columns = [c[0] for c in con.description]
    finally:
        con.close()
    all_rows = [dict(zip(columns, row)) for row in rows]
    scope = refine_scope_city(scope, scope_mode, citycode, all_rows)
    if len(all_rows) < MIN_COMPARABLES:
        return {
            "error": "Pas assez de ventes comparables dans les données locales avec ces critères.",
            "count": len(all_rows),
            "available_departements": available_departements(),
        }
    reference_date = latest_mutation_date(all_rows)

    cohort = all_rows
    if len(cohort) < MIN_COMPARABLES:
        return {
            "error": f"Seulement {len(cohort)} comparables dans l'emprise « {scope} ». Minimum requis : {MIN_COMPARABLES}. Élargis ou change d'emprise.",
            "count": len(cohort),
            "scope": scope,
        }

    cohort = filter_history_window(cohort, history_min_years, history_max_years, reference_date)
    if len(cohort) < MIN_COMPARABLES:
        return {
            "error": f"Seulement {len(cohort)} comparables sur {history_window_label(history_min_years, history_max_years)} dans l'emprise « {scope} ». Minimum requis : {MIN_COMPARABLES}. Élargis l'historique ou change d'emprise.",
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

    cohort_sorted = sorted(cohort, key=lambda item: item["distance_m"])
    max_distance = max((r["distance_m"] for r in cohort_sorted), default=1) or 1
    for uid, r in enumerate(cohort_sorted):
        r["uid"] = uid
        r["sim"] = similarity_score(r, surface, rooms, max_distance)
    points = cohort_sorted[:POINTS_HARD_CAP]      # carte : tous les points (allégés)
    detailed = cohort_sorted[:max_comparables]    # liste : plafonnée, détaillée

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
            "history_min_years": history_min_years,
            "history_max_years": history_max_years,
            "section": section,
        },
        "summary": {
            "scope": scope,
            "history": history_window_label(history_min_years, history_max_years),
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
        "points": [
            {
                "uid": r["uid"],
                "lon": r["lon"],
                "lat": r["lat"],
                "type_local": r["type_local"],
                "prix": r["prix"],
                "prix_m2": round(r["prix_m2"]),
                "surface": r["surface"],
                "pieces": r["pieces"],
                "commune": r["nom_commune"],
                "code_postal": r["code_postal"],
                "distance_m": round(r["distance_m"]),
                "date_mutation": r["date_mutation"],
                "similarity": r["sim"],
            }
            for r in points
        ],
        "comparables": [
            {
                "uid": r["uid"],
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
                "batiment_groupe_id": r["batiment_groupe_id"],
                "resolution_statut": r["resolution_statut"],
                "usage_principal_bdnb_open": r["usage_principal_bdnb_open"],
                "usage_niveau_1_txt": r["usage_niveau_1_txt"],
                "nb_log": r["nb_log"],
                "nb_lot_garpark_rnc": r["nb_lot_garpark_rnc"],
                "nb_lot_tertiaire_rnc": r["nb_lot_tertiaire_rnc"],
                "surface_emprise_sol": r["surface_emprise_sol"],
                "hauteur_mean": r["hauteur_mean"],
                "nb_niveau": r["nb_niveau"],
                "annee_construction": r["annee_construction"],
                "type_batiment_dpe": r["type_batiment_dpe"],
                "fiabilite_emprise_sol": r["fiabilite_emprise_sol"],
                "fiabilite_hauteur": r["fiabilite_hauteur"],
                "similarity": r["sim"],
            }
            for r in detailed
        ],
    }


MARKET_CATEGORIES = ["Maison", "Appartement", "Terrain", "Dépendance", "Local"]
# Bornes de €/m² par catégorie pour écarter les valeurs aberrantes (le terrain n'a pas le même ordre de grandeur).
MARKET_BOUNDS = {
    "Maison": (500, 20000),
    "Appartement": (500, 20000),
    "Terrain": (1, 10000),
    "Dépendance": (50, 30000),
    "Local": (100, 30000),
}


def market_rows(params: dict[str, list[str]]) -> dict:
    dept = params.get("dept", [""])[0]
    scope_mode = params.get("scope_mode", ["radius"])[0]
    postcode = params.get("postcode", [""])[0] or None
    citycode = params.get("citycode", [""])[0] or None
    lon = as_float(params, "lon")
    lat = as_float(params, "lat")
    history_min_years, history_max_years = history_window_from_params(params)
    radius_m = as_int(params, "radius_m", DEFAULT_RADIUS_M) or DEFAULT_RADIUS_M
    radius_m = min(MAX_RADIUS_M, max(MIN_RADIUS_M, radius_m))
    max_biens = as_int(params, "max_comparables", DEFAULT_MAX_COMPARABLES) or DEFAULT_MAX_COMPARABLES
    max_biens = min(MAX_COMPARABLES_LIMIT, max(MIN_COMPARABLES, max_biens))
    requested = [c for c in (params.get("types", [""])[0] or "").split(",") if c in MARKET_BOUNDS]
    wanted = set(requested) if requested else set(MARKET_CATEGORIES)

    if scope_mode not in {"radius", "cadastre", "postcode", "city"}:
        scope_mode = "radius"
    if dept not in available_departements():
        return {"error": f"Département {dept or 'inconnu'} indisponible dans data/interim."}
    if lon is None or lat is None:
        return {"error": "Adresse, code postal ou commune résolus sont requis."}

    section = None
    if scope_mode == "cadastre":
        section = resolve_section(dept, lon, lat)
        if not section:
            return {"error": "Aucune section cadastrale trouvée à cette adresse (cadastre du département requis)."}

    con = duckdb.connect()
    comp = str(INTERIM / f"comparables_{dept}.parquet")
    dvf_path = INTERIM / f"dvf_{dept}.parquet"
    dvf = str(dvf_path)
    mono = str(mono_mutations_path(dept, dvf_path))
    comp_columns = {
        row[0]
        for row in con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [comp]).fetchall()
    }
    def optional_comp_col(name: str) -> str:
        return f"c.{name}" if name in comp_columns else f"NULL AS {name}"

    # Traçabilité des fusions/renommages de communes (cf. preparer_passage_communes) :
    # présent seulement si les parquets ont été régénérés avec la normalisation COG.
    dvf_columns = {
        row[0]
        for row in con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [dvf]).fetchall()
    }
    modif_cols = ("commune_modif_origine", "commune_modif_date")
    has_modif = all(c in comp_columns and c in dvf_columns for c in modif_cols)
    modif_logement = ", ".join(f"c.{c}" if has_modif else f"NULL AS {c}" for c in modif_cols)
    modif_autres = ", ".join(f"d.{c}" if has_modif else f"NULL AS {c}" for c in modif_cols)

    bdnb_names = [
        "rnb_id",
        "batiment_groupe_id",
        "resolution_statut",
        "usage_principal_bdnb_open",
        "usage_niveau_1_txt",
        "nb_log",
        "nb_lot_garpark_rnc",
        "nb_lot_tertiaire_rnc",
        "surface_emprise_sol",
        "hauteur_mean",
        "nb_niveau",
        "annee_construction",
        "type_batiment_dpe",
        "fiabilite_emprise_sol",
        "fiabilite_hauteur",
    ]
    bdnb_select = ", ".join(optional_comp_col(name) for name in bdnb_names)
    bdnb_null_select = ", ".join(f"NULL AS {name}" for name in bdnb_names)
    dvf_filters = ["longitude IS NOT NULL", "latitude IS NOT NULL"]
    dvf_args: list[object] = []
    add_scope_filter(
        dvf_filters,
        dvf_args,
        scope_mode,
        postcode=postcode,
        citycode=citycode,
        section=section,
        lon=lon,
        lat=lat,
        radius_m=radius_m,
        postcode_expr="code_postal",
        citycode_expr="code_commune",
        parcelle_expr="id_parcelle",
        lon_expr="TRY_CAST(longitude AS DOUBLE)",
        lat_expr="TRY_CAST(latitude AS DOUBLE)",
    )
    logement_filters = ["c.flag_multi_bien = false", "c.flag_multi_adresse = false"]
    logement_args: list[object] = []
    add_scope_filter(
        logement_filters,
        logement_args,
        scope_mode,
        postcode=postcode,
        citycode=citycode,
        section=section,
        lon=lon,
        lat=lat,
        radius_m=radius_m,
        citycode_expr="c.code_commune",
        parcelle_expr="c.id_parcelle",
    )
    autres_filters = ["d.type_local IS NULL OR d.type_local IN ('Dépendance', 'Local industriel. commercial ou assimilé')"]
    bounds_filters = []
    bounds_args: list[object] = []
    for category in MARKET_CATEGORIES:
        if category not in wanted:
            continue
        low, high = MARKET_BOUNDS[category]
        bounds_filters.append("(categorie = ? AND prix / surface BETWEEN ? AND ?)")
        bounds_args.extend([category, low, high])
    final_filters = ["prix > 0", "surface > 0", f"({' OR '.join(bounds_filters)})"]
    final_args = list(bounds_args)
    # Filtre prix total (€) optionnel — appliqué après calcul des bornes réelles du cohort.
    prix_min = as_float(params, "prix_min")
    prix_max = as_float(params, "prix_max")
    if scope_mode == "radius":
        final_filters.append("distance_m <= ?")
        final_args.append(radius_m)
    # Filtre géométrique commune / code postal : ne garder que les biens DANS le polygone
    # de la zone (le filtre par attribut code_postal/code_commune laisse passer des biens
    # géocodés hors limite). Aligne stats, compteur et carte sur l'emprise réellement tracée.
    scope_contour = (
        (commune_contours_path(dept), "insee", citycode) if scope_mode == "city" and citycode
        else (POSTCODE_CONTOURS_PATH, "codePostal", postcode) if scope_mode == "postcode" and postcode
        else None
    )
    if scope_contour and scope_contour[0].exists():
        path, key_col, value = scope_contour
        row = con.execute(
            f"SELECT geom_wkb FROM read_parquet(?) WHERE {key_col} = ? LIMIT 1",
            [str(path), value],
        ).fetchone()
        if row and row[0] is not None:
            load_spatial(con)
            final_filters.append("ST_Within(ST_Point(lon, lat), ST_GeomFromWKB(?))")
            final_args.append(row[0])
    scope = scope_label(scope_mode, radius_m, postcode, section)
    args: list[object] = [
        dvf,
        *dvf_args,
        comp,
        *logement_args,
        mono,
        lat,
        lat,
        lon,
        *final_args,
    ]
    try:
        rows = con.execute(
            """
            WITH dvf_scoped AS (
                SELECT *
                FROM read_parquet(?)
                WHERE {dvf_where}
            ),
            coords AS (
                SELECT id_mutation, id_parcelle,
                       any_value(code_postal) AS code_postal,
                       any_value(TRY_CAST(longitude AS DOUBLE)) AS lon,
                       any_value(TRY_CAST(latitude AS DOUBLE)) AS lat
                FROM dvf_scoped
                GROUP BY 1, 2
            ),
            logement AS (
                SELECT c.id_mutation, c.date_mutation, c.nature_mutation,
                       c.code_departement, c.code_commune, c.nom_commune, coords.code_postal,
                       c.id_parcelle, c.adresse_dvf AS adresse, c.type_local AS categorie,
                       TRY_CAST(c.surface_reelle_bati AS DOUBLE) AS surface,
                       TRY_CAST(c.nombre_pieces_principales AS INTEGER) AS pieces,
                       TRY_CAST(c.valeur_fonciere AS DOUBLE) AS prix,
                       coords.lon, coords.lat, 'logement' AS qualite,
                       {modif_logement},
                       {bdnb_select}
                FROM read_parquet(?) c
                JOIN coords USING (id_mutation, id_parcelle)
                WHERE {logement_where}
            ),
            autres_candidates AS (
                SELECT d.id_mutation, d.date_mutation, d.nature_mutation,
                       d.code_departement, d.code_commune, d.nom_commune, d.code_postal, d.id_parcelle,
                       trim(concat_ws(' ', CAST(d.adresse_numero AS VARCHAR), d.adresse_nom_voie)) AS adresse,
                       CASE WHEN d.type_local IS NULL THEN 'Terrain'
                            WHEN d.type_local = 'Local industriel. commercial ou assimilé' THEN 'Local'
                            ELSE d.type_local END AS categorie,
                       CASE WHEN d.type_local IS NULL THEN TRY_CAST(d.surface_terrain AS DOUBLE)
                            ELSE TRY_CAST(d.surface_reelle_bati AS DOUBLE) END AS surface,
                       CAST(NULL AS INTEGER) AS pieces,
                       TRY_CAST(d.valeur_fonciere AS DOUBLE) AS prix,
                       TRY_CAST(d.longitude AS DOUBLE) AS lon, TRY_CAST(d.latitude AS DOUBLE) AS lat,
                       'indicatif' AS qualite,
                       {modif_autres},
                       {bdnb_null_select}
                FROM dvf_scoped d
                WHERE {autres_where}
            ),
            mono AS (
                SELECT id_mutation
                FROM read_parquet(?)
                JOIN (SELECT DISTINCT id_mutation FROM autres_candidates) ids USING (id_mutation)
            ),
            autres AS (
                SELECT autres_candidates.*
                FROM autres_candidates
                JOIN mono USING (id_mutation)
            ),
            scored AS (
                SELECT *,
                       prix / surface AS prix_m2,
                       {distance_expr} AS distance_m
                FROM (SELECT * FROM logement UNION ALL SELECT * FROM autres)
            )
            SELECT *
            FROM scored
            WHERE {final_where}
            """.format(
                dvf_where=" AND ".join(dvf_filters),
                logement_where=" AND ".join(logement_filters),
                autres_where=" AND ".join(autres_filters),
                modif_logement=modif_logement,
                modif_autres=modif_autres,
                bdnb_select=bdnb_select,
                bdnb_null_select=bdnb_null_select,
                distance_expr=distance_sql(),
                final_where=" AND ".join(final_filters),
            ),
            args,
        ).fetchall()
        columns = [c[0] for c in con.description]
    finally:
        con.close()
    all_rows = [dict(zip(columns, row)) for row in rows]
    scope = refine_scope_city(scope, scope_mode, citycode, all_rows)
    reference_date = latest_mutation_date(all_rows)

    base_cohort = filter_history_window(all_rows, history_min_years, history_max_years, reference_date)
    bounds = price_bounds(base_cohort)
    if not base_cohort:
        return {
            "error": f"Aucune vente dans l'emprise « {scope} » sur {history_window_label(history_min_years, history_max_years)} pour les types choisis.",
            "summary": {
                "count": 0,
                "scope": scope,
                "history": history_window_label(history_min_years, history_max_years),
                "price_bounds": bounds,
            },
        }
    cohort = [
        r for r in base_cohort
        if (prix_min is None or r["prix"] >= prix_min)
        and (prix_max is None or r["prix"] <= prix_max)
    ]
    if not cohort:
        return {
            "error": f"Aucune vente dans l'emprise « {scope} » sur {history_window_label(history_min_years, history_max_years)} pour cette plage de prix.",
            "summary": {
                "count": 0,
                "scope": scope,
                "history": history_window_label(history_min_years, history_max_years),
                "price_bounds": bounds,
            },
        }

    types_summary = []
    for cat in MARKET_CATEGORIES:
        subset = [r for r in cohort if r["categorie"] == cat]
        if not subset:
            continue
        prices_m2 = [r["prix_m2"] for r in subset]
        prices = [r["prix"] for r in subset]
        types_summary.append({
            "categorie": cat,
            "count": len(subset),
            "median_m2": round(median(prices_m2)),
            "q10_m2": round(quantile(prices_m2, 0.10)),
            "q90_m2": round(quantile(prices_m2, 0.90)),
            "median_prix": round(median(prices), -3),
            "qualite": subset[0]["qualite"],
        })

    cohort.sort(key=lambda r: r["distance_m"])
    for uid, r in enumerate(cohort):
        r["uid"] = uid
    points = cohort[:POINTS_HARD_CAP]      # carte : tous les points (allégés)
    detailed = cohort[:max_biens]          # liste : plafonnée, détaillée

    return {
        "target": {
            "dept": dept, "lon": lon, "lat": lat,
            "postcode": postcode, "citycode": citycode,
            "scope_mode": scope_mode, "radius_m": radius_m,
            "history_min_years": history_min_years, "history_max_years": history_max_years,
            "section": section,
        },
        "summary": {
            "scope": scope,
            "history": history_window_label(history_min_years, history_max_years),
            "count": len(cohort),
            "shown": len(points),
            "list": len(detailed),
            "types": types_summary,
            "price_bounds": bounds,
        },
        "points": [
            {
                "uid": r["uid"],
                "lon": r["lon"],
                "lat": r["lat"],
                "type_local": r["categorie"],
                "prix": r["prix"],
                "prix_m2": round(r["prix_m2"]),
                "surface": round(r["surface"]) if r["surface"] else None,
                "pieces": r["pieces"],
                "commune": r["nom_commune"],
                "code_postal": r["code_postal"],
                "distance_m": round(r["distance_m"]),
                "date_mutation": r["date_mutation"],
            }
            for r in points
        ],
        "biens": [
            {
                "uid": r["uid"],
                "id_mutation": r["id_mutation"],
                "date_mutation": r["date_mutation"],
                "nature_mutation": r["nature_mutation"],
                "code_departement": r["code_departement"],
                "code_commune": r["code_commune"],
                "code_postal": r["code_postal"],
                "adresse": r["adresse"],
                "commune": r["nom_commune"],
                "commune_modif_origine": r.get("commune_modif_origine"),
                "commune_modif_date": r.get("commune_modif_date"),
                "id_parcelle": r["id_parcelle"],
                "type_local": r["categorie"],
                "categorie": r["categorie"],
                "qualite": r["qualite"],
                "surface": round(r["surface"]) if r["surface"] else None,
                "pieces": r["pieces"],
                "prix": r["prix"],
                "prix_m2": round(r["prix_m2"]),
                "distance_m": round(r["distance_m"]),
                "lon": r["lon"],
                "lat": r["lat"],
                "rnb_id": r["rnb_id"],
                "batiment_groupe_id": r["batiment_groupe_id"],
                "resolution_statut": r["resolution_statut"],
                "usage_principal_bdnb_open": r["usage_principal_bdnb_open"],
                "usage_niveau_1_txt": r["usage_niveau_1_txt"],
                "nb_log": r["nb_log"],
                "nb_lot_garpark_rnc": r["nb_lot_garpark_rnc"],
                "nb_lot_tertiaire_rnc": r["nb_lot_tertiaire_rnc"],
                "surface_emprise_sol": r["surface_emprise_sol"],
                "hauteur_mean": r["hauteur_mean"],
                "nb_niveau": r["nb_niveau"],
                "annee_construction": r["annee_construction"],
                "type_batiment_dpe": r["type_batiment_dpe"],
                "fiabilite_emprise_sol": r["fiabilite_emprise_sol"],
                "fiabilite_hauteur": r["fiabilite_hauteur"],
            }
            for r in detailed
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
        api = {
            "/api/departements": lambda _: {"departements": available_departements()},
            "/api/estimate": comparable_rows,
            "/api/market": market_rows,
            "/api/parcelles": parcelles_rows,
            "/api/batiments": batiments_rows,
            "/api/panoramax": panoramax_rows,
            "/api/codepostal": postcode_rows,
            "/api/commune": commune_rows,
            "/api/scope-communes": scope_communes_rows,
        }
        fn = api.get(parsed.path)
        if fn:
            try:
                self.json(fn(parse_qs(parsed.query)))
            except Exception as exc:
                self.json({"error": f"Erreur serveur: {exc}"}, status=500)
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
        # POC servi en local : on évite le cache navigateur pour que les éditions JS/CSS prennent effet.
        # Limité au service local pour ne pas dégrader un éventuel hébergement réel.
        if HOST in ("127.0.0.1", "localhost"):
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    depts = available_departements()
    print(f"POC web: http://{HOST}:{PORT}")
    print(f"Départements disponibles: {', '.join(depts)}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
