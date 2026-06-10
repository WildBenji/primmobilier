"""Télécharge le cadastre Etalab (parcelles + sections) d'un département et le convertit en GeoParquet.

Source : https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements/{dept}/
Produit (idempotent) :
  data/raw/      cadastre-{dept}-parcelles.json.gz, cadastre-{dept}-sections.json.gz
  data/interim/  cadastre_parcelles_{dept}.parquet, cadastre_sections_{dept}.parquet
                 (attributs + géométrie WGS84 stockée en WKB ; relire avec ST_GeomFromWKB(geom_wkb))

Clés de jointure : `id` parcelle == DVF `id_parcelle` ; `id` section == substr(id_parcelle, 1, 10).

Usage : uv run python -m telechargement.preparer_cadastre [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
BASE = "https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements"


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"✓ déjà là : {dest.name}")
        return dest
    print(f"⤓ {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def convertir(src_gz: Path, dest: Path, con: duckdb.DuckDBPyConnection) -> None:
    if dest.exists():
        print(f"✓ {dest.name}")
        return
    con.execute(
        f"""
        COPY (
            SELECT * EXCLUDE (geom),
                   ST_X(ST_Centroid(geom)) AS clon,
                   ST_Y(ST_Centroid(geom)) AS clat,
                   ST_AsWKB(geom) AS geom_wkb
            FROM ST_Read('/vsigzip/{src_gz.as_posix()}')
        ) TO '{dest.as_posix()}' (FORMAT PARQUET)
        """
    )
    print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")


def main(dept: str) -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    for layer in ("sections", "parcelles"):
        src = download(f"{BASE}/{dept}/cadastre-{dept}-{layer}.json.gz",
                       RAW / f"cadastre-{dept}-{layer}.json.gz")
        convertir(src, INTERIM / f"cadastre_{layer}_{dept}.parquet", con)
    print(f"\n✓ Cadastre {dept} prêt.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
