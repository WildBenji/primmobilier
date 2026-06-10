"""Télécharge les contours calculés des zones codes postaux et les convertit en GeoParquet.

Source : « Contours calculés des zones codes postaux » (adresse.data.gouv.fr), un découpage
**national** dérivé de la BAN. Contrairement aux limites communales, ces zones séparent les
grandes villes par code postal — indispensable pour tracer l'emprise « code postal » du POC.

Référentiel **national et statique** (millésime 2021) : un seul fichier pour toute la France,
acquis une fois (idempotent), hors de la boucle départementale.

Produit :
  data/raw/      contours-codes-postaux.geojson
  data/interim/  contours_codes_postaux.parquet
                 (codePostal, nbNumeros + géométrie WGS84 en WKB ; relire avec ST_GeomFromWKB(geom_wkb))

Clé de service : `codePostal` == BAN/DVF `code_postal`.

Usage : uv run python -m telechargement.preparer_codes_postaux
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
URL = ("https://static.data.gouv.fr/resources/contours-calcules-des-zones-codes-postaux/"
       "20210114-103718/contours-codes-postaux.geojson")


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"✓ déjà là : {dest.name}")
        return dest
    print(f"⤓ {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def convertir(src: Path, dest: Path, con: duckdb.DuckDBPyConnection) -> None:
    if dest.exists():
        print(f"✓ {dest.name}")
        return
    con.execute(
        f"""
        COPY (
            SELECT codePostal, nbNumeros,
                   ST_AsWKB(geom) AS geom_wkb
            FROM ST_Read('{src.as_posix()}')
        ) TO '{dest.as_posix()}' (FORMAT PARQUET)
        """
    )
    print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")


def main() -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    src = download(URL, RAW / "contours-codes-postaux.geojson")
    convertir(src, INTERIM / "contours_codes_postaux.parquet", con)
    print("\n✓ Contours codes postaux prêts.")


if __name__ == "__main__":
    main()
