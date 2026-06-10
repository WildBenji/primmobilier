"""Helpers partagés du pipeline : chemins, garde-fou, points RNB, table mutations.

Importé par toutes les étapes du pipeline. Aucune logique métier ici, seulement
l'infrastructure réutilisée d'une étape à l'autre.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import duckdb
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"


def _exiger(chemin: Path) -> Path:
    """Échoue avec un message clair si un artefact amont manque."""
    if not chemin.exists():
        sys.exit(f"Artefact manquant (lancer l'étape amont d'abord) : {chemin}")
    return chemin


def points_rnb(dept: str) -> pl.DataFrame:
    """Points (rnb_id, lon, lat) de tous les bâtiments RNB du département.

    Mis en cache en parquet ; extrait du zip brut au premier appel (EWKT -> lon/lat).
    """
    cache = INTERIM / f"rnb_points_{dept}.parquet"
    if cache.exists():
        return pl.read_parquet(cache)
    zpath = _exiger(RAW / f"RNB_{dept}.csv.zip")
    with zipfile.ZipFile(zpath) as z:
        nom = next(n for n in z.namelist() if n.endswith(".csv"))
        brut = pl.read_csv(z.read(nom), separator=";", infer_schema=False,
                           columns=["rnb_id", "point"])
    pts = (
        brut.with_columns(
            lon=pl.col("point").str.extract(r"POINT\(([-0-9.]+) ", 1).cast(pl.Float64),
            lat=pl.col("point").str.extract(r" ([-0-9.]+)\)", 1).cast(pl.Float64),
        )
        .select("rnb_id", "lon", "lat")
        .drop_nulls()
    )
    pts.write_parquet(cache)
    return pts


def preparer_mutations(con: duckdb.DuckDBPyConnection) -> None:
    """Table temp `mut` : une ligne par mutation de logement, avec son statut de match RNB.

    Requiert les tables `dvf` et `plots` enregistrées sur la connexion.
    """
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE mut AS
        WITH log AS (
            SELECT id_mutation, id_parcelle, nature_mutation,
                   left(date_mutation, 4) AS annee
            FROM dvf WHERE type_local IN ('Maison', 'Appartement')
        ),
        r AS (SELECT DISTINCT id_parcelle FROM plots)
        SELECT m.id_mutation,
               max(CASE WHEN r.id_parcelle IS NOT NULL THEN 1 ELSE 0 END) AS matched,
               count(*) AS n_lignes,
               sum(CASE WHEN m.id_parcelle IS NULL THEN 1 ELSE 0 END) AS n_parcelle_null,
               any_value(m.annee) AS annee,
               any_value(m.nature_mutation) AS nature
        FROM log m
        LEFT JOIN r ON m.id_parcelle = r.id_parcelle
        GROUP BY m.id_mutation
        """
    )
