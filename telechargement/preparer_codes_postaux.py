"""Construit des contours de codes postaux hybrides (union de communes + partition BAN).

Remplace les « contours calculés des zones codes postaux » de data.gouv (millésime 2021,
des enveloppes convexes par adresse qui se chevauchent et débordent largement — p.ex. le
33000 englobant toute l'agglo bordelaise). Méthode :

  a) Code postal couvrant des communes entières -> **union des polygones communaux**
     IGN (contours_communes_{dept}.parquet, geo.api, figés par preparer_communes). Exact,
     sans chevauchement.
  b) Commune découpée en plusieurs codes postaux (grandes villes) -> **partition adaptative
     par plus proche adresse BAN** : chaque cellule est rattachée au CP du point BAN le plus
     proche, puis l'ensemble est découpé à la commune. C'est une approximation maîtrisée du
     diagramme de Voronoï complet, beaucoup plus rapide à calculer et sans perte de relation
     CP <-> commune.

Données :
  - Polygones de communes : contours_communes_{dept}.parquet (geo.api, local).
  - Correspondance CP <-> commune + points d'adresses : BAN locale matérialisée
    (data/interim/ban_{dept}.parquet).

Produit data/interim/contours_codes_postaux.parquet (codePostal, nb_points, is_split +
géométrie WGS84 en WKB). Traite les départements présents dans data/interim (ban_*.parquet)
disposant de leurs contours_communes. À lancer après preparer_communes.

Usage : uv run python -m telechargement.preparer_codes_postaux
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
INTERIM = ROOT / "data" / "interim"
MIN_CELL_DEG = 0.00035  # ~25-30 m en Gironde : précis sans exploser le nombre de cellules.
MAX_SUBDIVISION_DEPTH = 11


@dataclass(frozen=True)
class BanPoint:
    lon: float
    lat: float
    code_postal: str


@dataclass
class KdNode:
    point: BanPoint
    axis: int
    left: KdNode | None = None
    right: KdNode | None = None


def departements() -> list[str]:
    return sorted(
        m.group(1)
        for p in INTERIM.glob("ban_*.parquet")
        if (m := re.fullmatch(r"ban_(\d{2,3}|2[AB])", p.stem))
    )


def _xy(point: BanPoint | tuple[float, float], cos_lat: float) -> tuple[float, float]:
    lon, lat = (point.lon, point.lat) if isinstance(point, BanPoint) else point
    return lon * cos_lat, lat


def build_kdtree(points: list[BanPoint], cos_lat: float, depth: int = 0) -> KdNode | None:
    if not points:
        return None
    axis = depth % 2
    points.sort(key=lambda p: _xy(p, cos_lat)[axis])
    mid = len(points) // 2
    return KdNode(
        point=points[mid],
        axis=axis,
        left=build_kdtree(points[:mid], cos_lat, depth + 1),
        right=build_kdtree(points[mid + 1:], cos_lat, depth + 1),
    )


def nearest_postcode(node: KdNode, lon: float, lat: float, cos_lat: float) -> str:
    target = _xy((lon, lat), cos_lat)
    best_point = node.point
    best_dist = float("inf")

    def visit(current: KdNode | None) -> None:
        nonlocal best_point, best_dist
        if current is None:
            return
        px, py = _xy(current.point, cos_lat)
        dist = (px - target[0]) ** 2 + (py - target[1]) ** 2
        if dist < best_dist:
            best_point = current.point
            best_dist = dist
        delta = target[current.axis] - (px if current.axis == 0 else py)
        near, far = (current.left, current.right) if delta < 0 else (current.right, current.left)
        visit(near)
        if delta * delta < best_dist:
            visit(far)

    visit(node)
    return best_point.code_postal


def rect_wkt(minlon: float, minlat: float, maxlon: float, maxlat: float) -> str:
    return (
        f"POLYGON(({minlon} {minlat},{maxlon} {minlat},{maxlon} {maxlat},"
        f"{minlon} {maxlat},{minlon} {minlat}))"
    )


def adaptive_cells(
    tree: KdNode,
    points: list[BanPoint],
    bbox: tuple[float, float, float, float],
    cos_lat: float,
) -> list[tuple[str, str]]:
    cells: list[tuple[str, str]] = []

    def split(minlon: float, minlat: float, maxlon: float, maxlat: float, depth: int, local_points: list[BanPoint]) -> None:
        midlon = (minlon + maxlon) / 2
        midlat = (minlat + maxlat) / 2
        samples = [
            (minlon, minlat),
            (maxlon, minlat),
            (minlon, maxlat),
            (maxlon, maxlat),
            (midlon, midlat),
        ]
        labels = {nearest_postcode(tree, lon, lat, cos_lat) for lon, lat in samples}
        labels.update(point.code_postal for point in local_points)
        if len(labels) == 1 or depth >= MAX_SUBDIVISION_DEPTH or max(maxlon - minlon, maxlat - minlat) <= MIN_CELL_DEG:
            code_postal = nearest_postcode(tree, midlon, midlat, cos_lat)
            cells.append((code_postal, rect_wkt(minlon, minlat, maxlon, maxlat)))
            return
        buckets = [[], [], [], []]
        for point in local_points:
            east = point.lon >= midlon
            north = point.lat >= midlat
            buckets[(2 if north else 0) + (1 if east else 0)].append(point)
        split(minlon, minlat, midlon, midlat, depth + 1, buckets[0])
        split(midlon, minlat, maxlon, midlat, depth + 1, buckets[1])
        split(minlon, midlat, midlon, maxlat, depth + 1, buckets[2])
        split(midlon, midlat, maxlon, maxlat, depth + 1, buckets[3])

    split(*bbox, 0, points)
    return cells


def build_split_cells(con: duckdb.DuckDBPyConnection) -> int:
    con.execute("CREATE OR REPLACE TEMP TABLE split_cells (code_commune VARCHAR, code_postal VARCHAR, wkt VARCHAR)")
    communes = con.execute(
        """
        SELECT s.code_commune, ST_XMin(c.geom), ST_YMin(c.geom), ST_XMax(c.geom), ST_YMax(c.geom)
        FROM shared s
        JOIN communes c ON c.insee = s.code_commune
        ORDER BY s.code_commune
        """
    ).fetchall()
    total_cells = 0
    for code_commune, minlon, minlat, maxlon, maxlat in communes:
        rows = con.execute(
            """
            SELECT lon, lat, code_postal
            FROM pts
            WHERE code_commune = ?
            ORDER BY code_postal, lon, lat
            """,
            [code_commune],
        ).fetchall()
        if not rows:
            continue
        points = [BanPoint(float(lon), float(lat), code_postal) for lon, lat, code_postal in rows]
        cos_lat = math_cos_lat((minlat + maxlat) / 2)
        tree = build_kdtree(points, cos_lat)
        if tree is None:
            continue
        cells = adaptive_cells(tree, points, (minlon, minlat, maxlon, maxlat), cos_lat)
        con.executemany("INSERT INTO split_cells VALUES (?, ?, ?)", [(code_commune, cp, wkt) for cp, wkt in cells])
        total_cells += len(cells)
        print(f"    commune {code_commune}: {len(points)} points BAN -> {len(cells)} cellules")
    return total_cells


def math_cos_lat(lat: float) -> float:
    import math

    return max(math.cos(math.radians(lat)), 0.01)


def build_dept(con: duckdb.DuckDBPyConnection, dept: str) -> int:
    """Insère les contours du département `dept` dans la table `final`."""
    ban = (INTERIM / f"ban_{dept}.parquet").as_posix()
    # Contours communaux IGN locaux (geo.api, figés par preparer_communes).
    communes = (INTERIM / f"contours_communes_{dept}.parquet").as_posix()
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE communes AS
        SELECT insee, ST_MakeValid(ST_GeomFromWKB(geom_wkb)) AS geom
        FROM read_parquet('{communes}')
        """
    )
    # Relation postale de référence locale : CP <-> commune depuis la BAN.
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE cp_communes AS
        SELECT DISTINCT code_insee AS code_commune, code_postal
        FROM read_parquet('{ban}')
        WHERE code_insee IS NOT NULL AND code_postal IS NOT NULL
        """
    )
    # Une coordonnée -> un seul code postal (le plus fréquent à ce point), avec sa commune.
    # Évite les chevauchements dus aux adresses étiquetées de deux codes postaux.
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE pts AS
        WITH raw AS (
            SELECT round(TRY_CAST(lon AS DOUBLE), 6) AS lon,
                   round(TRY_CAST(lat AS DOUBLE), 6) AS lat,
                   code_insee AS code_commune, code_postal, count(*) AS n
            FROM read_parquet('{ban}')
            WHERE lon IS NOT NULL AND lat IS NOT NULL
              AND code_insee IS NOT NULL AND code_postal IS NOT NULL
            GROUP BY 1, 2, 3, 4
        ),
        ranked AS (
            SELECT *, row_number() OVER (PARTITION BY lon, lat ORDER BY n DESC, code_postal) AS rn
            FROM raw
        )
        SELECT lon, lat, code_commune, code_postal FROM ranked WHERE rn = 1
        """
    )
    # Communes découpées en plusieurs codes postaux (cas partition BAN).
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE shared AS
        SELECT code_commune FROM cp_communes GROUP BY 1 HAVING count(DISTINCT code_postal) > 1
        """
    )
    n_cells = build_split_cells(con)
    # Pièces : communes entières (mono-CP) + pièces de partition BAN (communes partagées).
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE pieces AS
        WITH whole AS (
            SELECT m.code_postal, c.geom
            FROM cp_communes m
            JOIN communes c ON c.insee = m.code_commune
            WHERE m.code_commune NOT IN (SELECT code_commune FROM shared)
        ),
        vor_pieces AS (
            SELECT sc.code_postal,
                   ST_Intersection(ST_Union_Agg(ST_GeomFromText(sc.wkt)), comm.geom) AS geom
            FROM split_cells sc
            JOIN communes comm ON comm.insee = sc.code_commune
            GROUP BY sc.code_postal, sc.code_commune, comm.geom
        )
        SELECT code_postal, geom FROM whole
        UNION ALL
        SELECT code_postal, geom FROM vor_pieces
        """
    )
    # Union finale par code postal. `is_split` = le CP touche une commune découpée en
    # plusieurs codes postaux : sa géométrie vient de la partition BAN et doit être servie telle
    # quelle. Sinon, la géométrie est l'union des contours communaux IGN précis.
    con.execute(
        """
        INSERT INTO final
        SELECT pc.code_postal AS codePostal,
               COALESCE(cnt.nb_points, 0) AS nb_points,
               (pc.code_postal IN (
                   SELECT DISTINCT code_postal FROM pts
                   WHERE code_commune IN (SELECT code_commune FROM shared)
               )) AS is_split,
               ST_MakeValid(ST_Union_Agg(pc.geom)) AS geom
        FROM pieces pc
        LEFT JOIN (SELECT code_postal, count(*) AS nb_points FROM pts GROUP BY 1) cnt
          ON cnt.code_postal = pc.code_postal
        GROUP BY pc.code_postal, COALESCE(cnt.nb_points, 0)
        """
    )
    return n_cells


def main() -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    depts = departements()
    if not depts:
        print("Aucun ban_*.parquet dans data/interim — lance preparer_donnees d'abord.")
        return
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE TEMP TABLE final (codePostal VARCHAR, nb_points BIGINT, is_split BOOLEAN, geom GEOMETRY)")
    for dept in depts:
        if not (INTERIM / f"contours_communes_{dept}.parquet").exists():
            print(f"  dept {dept} : contours_communes manquant — lance preparer_communes {dept}. Ignoré.")
            continue
        n_vor = build_dept(con, dept)
        n_cp = con.execute("SELECT count(*) FROM final").fetchone()[0]
        print(f"  dept {dept} : {n_cp} codes postaux cumulés ({n_vor} cellules en communes découpées)")
    dest = INTERIM / "contours_codes_postaux.parquet"
    # Un code postal à cheval sur plusieurs départements traités produit une ligne par
    # département dans `final` (chacune ne couvrant que sa part). On agrège ici par
    # codePostal — union des géométries — pour qu'un CP n'ait qu'UN contour complet,
    # sinon un consommateur (LIMIT 1) prendrait une part arbitraire (ex. 33220 Sainte-Foy
    # côté Gironde vs Dordogne).
    con.execute(
        f"""
        COPY (
            SELECT codePostal,
                   sum(nb_points) AS nb_points,
                   bool_or(is_split) AS is_split,
                   ST_AsWKB(ST_MakeValid(ST_Union_Agg(geom))) AS geom_wkb
            FROM final
            GROUP BY codePostal
            ORDER BY codePostal
        )
        TO '{dest.as_posix()}' (FORMAT PARQUET)
        """
    )
    print(f"\n✓ {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo) — départements : {', '.join(depts)}")


if __name__ == "__main__":
    main()
