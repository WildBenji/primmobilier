"""Télécharge les contours communaux officiels (IGN) d'un département via geo.api.gouv.fr.

geo.api sert les limites administratives détaillées — qui suivent les axes réels (routes,
rues) — en un seul appel par département. On les fige en local pour ne plus dépendre de
l'API au runtime, et pour que la zone dessinée, le filtrage des biens et la construction
des contours codes postaux partagent exactement la même géométrie.

Produit :
  data/raw/      communes_{dept}.geojson
  data/interim/  contours_communes_{dept}.parquet
                 (insee, nom + géométrie WGS84 en WKB ; relire avec ST_GeomFromWKB(geom_wkb))

Clé de service : `insee` == DVF `code_commune` == citycode BAN.

Usage : uv run python -m telechargement.preparer_communes [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb

from telechargement._telechargement import download

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"


def _geoapi_url(dept: str) -> str:
    return (
        "https://geo.api.gouv.fr/communes"
        f"?codeDepartement={dept}&fields=code,nom&format=geojson&geometry=contour"
    )


def preparer_communes(dept: str) -> None:
    dest = INTERIM / f"contours_communes_{dept}.parquet"
    if dest.exists():
        print(f"✓ contours_communes {dept}")
        return
    src = download(_geoapi_url(dept), RAW / f"communes_{dept}.geojson")
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute(
        f"""
        COPY (
            SELECT code AS insee, nom, ST_AsWKB(ST_MakeValid(geom)) AS geom_wkb
            FROM ST_Read('{src.as_posix()}')
        ) TO '{dest.as_posix()}' (FORMAT PARQUET)
        """
    )
    n = con.execute(f"SELECT count(*) FROM read_parquet('{dest.as_posix()}')").fetchone()[0]
    con.close()
    print(f"  → {dest.name} ({n} communes, {dest.stat().st_size / 1e6:.1f} Mo)")


def main(dept: str) -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    preparer_communes(dept)
    print(f"\n✓ Contours communes {dept} prêts.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
