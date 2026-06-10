"""Analyse de la qualité de jointure DVF -> RNB sur un département.

Lit les artefacts intermédiaires produits par le notebook spike
(`data/interim/{dvf,rnb_plots}_{DEPT}.parquet`) + le zip RNB brut
(`data/raw/RNB_{DEPT}.csv.zip`), mesure le taux de match des ventes de logement
vers le RNB (via la parcelle), **décompose les non-matchs** et teste leur
**récupération spatiale** (coordonnées DVF -> bâtiment RNB le plus proche).

Usage : uv run python -m pipeline.qualite_jointure [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys

import duckdb
import polars as pl

from pipeline.commun import INTERIM, _exiger, points_rnb, preparer_mutations


def charger(dept: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.register("dvf", pl.read_parquet(_exiger(INTERIM / f"dvf_{dept}.parquet")))
    con.register("plots", pl.read_parquet(_exiger(INTERIM / f"rnb_plots_{dept}.parquet")))
    con.register("pts", points_rnb(dept))
    return con


def afficher(titre: str, relation) -> None:
    print(f"\n=== {titre} ===")
    relation.show()


def main(dept: str) -> None:
    con = charger(dept)
    preparer_mutations(con)

    afficher(
        "Vue d'ensemble (ventes de logement)",
        con.sql(
            """
            SELECT count(*) AS mutations_log, sum(matched) AS matchees,
                   count(*) - sum(matched) AS non_matchees,
                   round(100.0 * (count(*) - sum(matched)) / count(*), 2) AS pct_non_match
            FROM mut
            """
        ),
    )

    afficher(
        "Couverture plots du RNB (cause #1 vs #2)",
        con.sql(
            """
            SELECT (SELECT count(*) FROM pts) AS rnb_batiments,
                   (SELECT count(DISTINCT rnb_id) FROM plots) AS avec_plots,
                   round(100.0 * (1 - (SELECT count(DISTINCT rnb_id) FROM plots)::DOUBLE
                                      / (SELECT count(*) FROM pts)), 1) AS pct_plots_vide
            """
        ),
    )

    afficher(
        "Non-matchs : cause sur la parcelle",
        con.sql(
            """
            SELECT CASE
                       WHEN n_parcelle_null = n_lignes THEN 'toutes parcelles NULL'
                       WHEN n_parcelle_null > 0 THEN 'parcelle partiellement NULL'
                       ELSE 'parcelle présente mais absente du RNB'
                   END AS cas,
                   count(*) AS n, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
            FROM mut WHERE matched = 0 GROUP BY 1 ORDER BY n DESC
            """
        ),
    )

    afficher(
        "Récupération spatiale des non-matchs (coord DVF ~ bâtiment RNB)",
        con.sql(
            """
            WITH nm AS (
                SELECT DISTINCT d.id_mutation,
                       round(TRY_CAST(d.longitude AS DOUBLE), 4) AS lon4,
                       round(TRY_CAST(d.latitude  AS DOUBLE), 4) AS lat4,
                       round(TRY_CAST(d.longitude AS DOUBLE), 3) AS lon3,
                       round(TRY_CAST(d.latitude  AS DOUBLE), 3) AS lat3
                FROM dvf d JOIN mut ON d.id_mutation = mut.id_mutation AND mut.matched = 0
                WHERE d.type_local IN ('Maison', 'Appartement')
                  AND TRY_CAST(d.longitude AS DOUBLE) IS NOT NULL
            ),
            g4 AS (SELECT DISTINCT round(lon, 4) AS lon4, round(lat, 4) AS lat4 FROM pts),
            g3 AS (SELECT DISTINCT round(lon, 3) AS lon3, round(lat, 3) AS lat3 FROM pts)
            SELECT count(*) AS nm_avec_coords,
                   count(*) FILTER (WHERE g4.lon4 IS NOT NULL) AS bati_a_environ_11m,
                   round(100.0 * count(*) FILTER (WHERE g4.lon4 IS NOT NULL) / count(*), 1) AS pct_11m,
                   count(*) FILTER (WHERE g3.lon3 IS NOT NULL) AS bati_a_environ_111m,
                   round(100.0 * count(*) FILTER (WHERE g3.lon3 IS NOT NULL) / count(*), 1) AS pct_111m
            FROM nm
            LEFT JOIN g4 ON nm.lon4 = g4.lon4 AND nm.lat4 = g4.lat4
            LEFT JOIN g3 ON nm.lon3 = g3.lon3 AND nm.lat3 = g3.lat3
            """
        ),
    )

    afficher(
        "Non-matchs par année",
        con.sql("SELECT annee, count(*) AS n FROM mut WHERE matched = 0 GROUP BY 1 ORDER BY 1"),
    )

    afficher(
        "Exemples de ventes non matchées",
        con.sql(
            """
            SELECT DISTINCT ON (d.id_mutation)
                   d.id_mutation, d.date_mutation, d.type_local, d.nom_commune,
                   d.adresse_numero, d.adresse_nom_voie, d.id_parcelle, d.valeur_fonciere
            FROM dvf d JOIN mut ON d.id_mutation = mut.id_mutation AND mut.matched = 0
            WHERE d.type_local IN ('Maison', 'Appartement')
            ORDER BY d.id_mutation LIMIT 15
            """
        ),
    )


if __name__ == "__main__":
    dept = sys.argv[1] if len(sys.argv) > 1 else "33"
    pl.Config.set_tbl_rows(20)
    pl.Config.set_fmt_str_lengths(40)
    main(dept)
