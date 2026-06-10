"""Récupération des ventes de logement non rattachées au RNB par la parcelle.

Le socle relie DVF -> RNB via la parcelle (cf. ADR 0003). ~5% des ventes de
logement ont une parcelle valide en DVF mais absente de `RNB.plots`
(cf. `pipeline/qualite_jointure.py`). Ce script **teste plusieurs voies de
récupération** de ces non-matchs et mesure leur taux + leur recouvrement :

  A. Clé d'adresse reconstruite   DVF(insee+code_voie+numero) -> RNB.adresses
  B. Pont parcelle via la BAN     DVF.parcelle -> BAN.cad_parcelles -> clé -> RNB.adr
  C. Plus proche bâtiment         DVF(lon,lat) -> point RNB le plus proche (distance réelle)

Artefacts requis (produits par le notebook spike) :
  data/interim/{dvf,rnb_plots,rnb_adr}_{DEPT}.parquet
  data/interim/rnb_points_{DEPT}.parquet  (sinon reconstruit depuis RNB_{DEPT}.csv.zip)
  data/raw/ban_{DEPT}.csv.gz

Usage : uv run python -m pipeline.recuperation_non_match [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys

import duckdb
import polars as pl

from pipeline.commun import INTERIM, RAW, _exiger, points_rnb, preparer_mutations


def _ban(dept: str) -> pl.DataFrame:
    """BAN départementale : clé d'adresse + parcelles cadastrales rattachées."""
    src = _exiger(RAW / f"ban_{dept}.csv.gz")
    return (
        pl.read_csv(src, separator=";", infer_schema=False,
                    columns=["id", "cad_parcelles"])
        .rename({"id": "cle"})
        .filter(pl.col("cad_parcelles").is_not_null())
    )


def charger(dept: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.register("dvf", pl.read_parquet(_exiger(INTERIM / f"dvf_{dept}.parquet")))
    con.register("plots", pl.read_parquet(_exiger(INTERIM / f"rnb_plots_{dept}.parquet")))
    con.register("adr", pl.read_parquet(_exiger(INTERIM / f"rnb_adr_{dept}.parquet")))
    con.register("pts", points_rnb(dept))
    con.register("ban", _ban(dept))
    return con


def preparer_recuperation(con: duckdb.DuckDBPyConnection) -> None:
    """Une ligne par mutation non matchée, avec un flag par stratégie de récupération."""
    # clé d'adresse RNB unique (existence d'un rnb_id pour une clé)
    con.execute("CREATE OR REPLACE TEMP TABLE adr_cle AS SELECT DISTINCT cle_interop_ban AS cle FROM adr")
    # BAN : une parcelle -> clés d'adresse (cad_parcelles peut lister plusieurs parcelles '|')
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE ban_parc AS
        SELECT DISTINCT unnest(string_split(cad_parcelles, '|')) AS id_parcelle, cle
        FROM ban
        """
    )
    # parcelles BAN dont la clé existe dans le RNB -> récupération par pont parcelle
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE parc_via_ban AS
        SELECT DISTINCT b.id_parcelle
        FROM ban_parc b JOIN adr_cle a ON b.cle = a.cle
        """
    )

    # lignes DVF de logement appartenant aux mutations NON matchées
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE nm_lignes AS
        SELECT d.id_mutation, d.id_parcelle,
               d.code_commune || '_' || lower(d.adresse_code_voie) || '_'
                   || lpad(d.adresse_numero, 5, '0') AS cle_adr,
               TRY_CAST(d.longitude AS DOUBLE) AS lon,
               TRY_CAST(d.latitude  AS DOUBLE) AS lat
        FROM dvf d JOIN mut ON d.id_mutation = mut.id_mutation AND mut.matched = 0
        WHERE d.type_local IN ('Maison', 'Appartement')
        """
    )

    # C : plus proche bâtiment RNB par fenêtre de grille (~111m) puis distance réelle (haversine)
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE spatial AS
        WITH q AS (
            SELECT DISTINCT id_mutation, lon, lat,
                   CAST(floor(lon * 1000) AS INT) gx, CAST(floor(lat * 1000) AS INT) gy
            FROM nm_lignes WHERE lon IS NOT NULL
        ),
        p AS (
            SELECT rnb_id, lon, lat,
                   CAST(floor(lon * 1000) AS INT) gx, CAST(floor(lat * 1000) AS INT) gy
            FROM pts
        ),
        cand AS (
            SELECT q.id_mutation, p.rnb_id,
                   2 * 6371000 * asin(sqrt(
                       power(sin(radians(p.lat - q.lat) / 2), 2)
                       + cos(radians(q.lat)) * cos(radians(p.lat))
                         * power(sin(radians(p.lon - q.lon) / 2), 2))) AS d
            FROM q JOIN p ON p.gx BETWEEN q.gx - 1 AND q.gx + 1
                          AND p.gy BETWEEN q.gy - 1 AND q.gy + 1
        )
        SELECT id_mutation, arg_min(rnb_id, d) AS rnb_id, min(d) AS dist_m
        FROM cand GROUP BY id_mutation
        """
    )

    # synthèse par mutation : un flag par stratégie
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE recup AS
        SELECT n.id_mutation,
               max(CASE WHEN ca.cle IS NOT NULL THEN 1 ELSE 0 END) AS par_adresse,
               max(CASE WHEN pv.id_parcelle IS NOT NULL THEN 1 ELSE 0 END) AS par_parcelle_ban,
               max(CASE WHEN n.lon IS NOT NULL THEN 1 ELSE 0 END) AS a_coords,
               any_value(s.dist_m) AS dist_m
        FROM nm_lignes n
        LEFT JOIN adr_cle ca ON n.cle_adr = ca.cle
        LEFT JOIN parc_via_ban pv ON n.id_parcelle = pv.id_parcelle
        LEFT JOIN spatial s ON n.id_mutation = s.id_mutation
        GROUP BY n.id_mutation
        """
    )


_HAVERSINE = """2 * 6371000 * asin(sqrt(
    power(sin(radians({pt}.lat - {q}.lat) / 2), 2)
    + cos(radians({q}.lat)) * cos(radians({pt}.lat))
      * power(sin(radians({pt}.lon - {q}.lon) / 2), 2)))"""


def materialiser_liens(con: duckdb.DuckDBPyConnection, dept: str) -> pl.DataFrame:
    """Choisit un rnb_id par mutation récupérée (cascade A>B>C) + méthode + confiance.

    Écrit `data/interim/recup_liens_{dept}.parquet`. Une ligne par mutation récupérée.
    """
    hav = _HAVERSINE.format(pt="pt", q="n")
    # A : bâtiment-adresse, le plus proche des coords DVF (distance NULL si pas de coords)
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE a_pick AS
        SELECT id_mutation, rnb_id, d FROM (
            SELECT n.id_mutation, a.rnb_id,
                   CASE WHEN n.lon IS NOT NULL AND pt.lon IS NOT NULL THEN {hav} END AS d,
                   row_number() OVER (PARTITION BY n.id_mutation
                       ORDER BY (CASE WHEN n.lon IS NOT NULL AND pt.lon IS NOT NULL
                                 THEN {hav} END) ASC NULLS LAST) AS rn
            FROM nm_lignes n
            JOIN adr a ON n.cle_adr = a.cle_interop_ban
            LEFT JOIN pts pt ON a.rnb_id = pt.rnb_id
        ) WHERE rn = 1
        """
    )
    # B : bâtiment via pont parcelle->BAN->RNB, le plus proche des coords DVF
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE b_pick AS
        SELECT id_mutation, rnb_id, d FROM (
            SELECT n.id_mutation, a.rnb_id,
                   CASE WHEN n.lon IS NOT NULL AND pt.lon IS NOT NULL THEN {hav} END AS d,
                   row_number() OVER (PARTITION BY n.id_mutation
                       ORDER BY (CASE WHEN n.lon IS NOT NULL AND pt.lon IS NOT NULL
                                 THEN {hav} END) ASC NULLS LAST) AS rn
            FROM nm_lignes n
            JOIN ban_parc bp ON n.id_parcelle = bp.id_parcelle
            JOIN adr a ON bp.cle = a.cle_interop_ban
            LEFT JOIN pts pt ON a.rnb_id = pt.rnb_id
        ) WHERE rn = 1
        """
    )
    liens = con.sql(
        """
        WITH base AS (SELECT DISTINCT id_mutation FROM nm_lignes),
        resolu AS (
            SELECT b.id_mutation,
                   CASE
                       WHEN a.rnb_id IS NOT NULL THEN a.rnb_id
                       WHEN bp.rnb_id IS NOT NULL THEN bp.rnb_id
                       WHEN s.dist_m <= 50 THEN s.rnb_id
                   END AS rnb_id,
                   CASE
                       WHEN a.rnb_id IS NOT NULL THEN 'adresse'
                       WHEN bp.rnb_id IS NOT NULL THEN 'parcelle_ban'
                       WHEN s.dist_m <= 50 THEN 'spatial'
                   END AS methode,
                   CASE
                       WHEN a.rnb_id IS NOT NULL AND a.d <= 25 THEN 'haute'
                       WHEN a.rnb_id IS NOT NULL THEN 'moyenne'
                       WHEN bp.rnb_id IS NOT NULL THEN 'moyenne'
                       WHEN s.dist_m <= 25 THEN 'moyenne'
                       WHEN s.dist_m <= 50 THEN 'basse'
                   END AS confiance,
                   round(COALESCE(a.d, bp.d, s.dist_m), 1) AS dist_m
            FROM base b
            LEFT JOIN a_pick a ON b.id_mutation = a.id_mutation
            LEFT JOIN b_pick bp ON b.id_mutation = bp.id_mutation
            LEFT JOIN spatial s ON b.id_mutation = s.id_mutation
        )
        SELECT * FROM resolu WHERE rnb_id IS NOT NULL
        """
    ).pl()
    out = INTERIM / f"recup_liens_{dept}.parquet"
    liens.write_parquet(out)
    print(f"\n>>> {len(liens)} liens récupérés écrits dans {out}")
    return liens


def afficher(titre: str, relation) -> None:
    print(f"\n=== {titre} ===")
    relation.show()


def main(dept: str) -> None:
    con = charger(dept)
    preparer_mutations(con)
    preparer_recuperation(con)

    afficher(
        "Stratégies de récupération (par mutation non matchée)",
        con.sql(
            """
            WITH t AS (SELECT count(*) AS total FROM recup)
            SELECT 'A. clé adresse -> RNB'        AS strategie, sum(par_adresse)        AS recup,
                   round(100.0 * sum(par_adresse) / any_value(total), 1)        AS pct FROM recup, t
            UNION ALL
            SELECT 'B. parcelle -> BAN -> RNB',   sum(par_parcelle_ban),
                   round(100.0 * sum(par_parcelle_ban) / any_value(total), 1)    FROM recup, t
            UNION ALL
            SELECT 'C. plus proche bati <= 25m',  count(*) FILTER (WHERE dist_m <= 25),
                   round(100.0 * count(*) FILTER (WHERE dist_m <= 25) / any_value(total), 1) FROM recup, t
            UNION ALL
            SELECT 'C. plus proche bati <= 50m',  count(*) FILTER (WHERE dist_m <= 50),
                   round(100.0 * count(*) FILTER (WHERE dist_m <= 50) / any_value(total), 1) FROM recup, t
            ORDER BY strategie
            """
        ),
    )

    afficher(
        "Distance au plus proche bâtiment RNB (mutations avec coords)",
        con.sql(
            """
            SELECT count(*) AS n,
                   count(*) FILTER (WHERE dist_m <= 10)  AS le_10m,
                   count(*) FILTER (WHERE dist_m <= 25)  AS le_25m,
                   count(*) FILTER (WHERE dist_m <= 50)  AS le_50m,
                   count(*) FILTER (WHERE dist_m <= 100) AS le_100m,
                   round(median(dist_m), 1) AS mediane_m,
                   round(quantile_cont(dist_m, 0.9), 1) AS p90_m
            FROM recup WHERE dist_m IS NOT NULL
            """
        ),
    )

    afficher(
        "Couverture combinée et recouvrement",
        con.sql(
            """
            WITH f AS (
                SELECT par_adresse AS A, par_parcelle_ban AS B,
                       CASE WHEN dist_m <= 25 THEN 1 ELSE 0 END AS C
                FROM recup
            )
            SELECT count(*) AS total,
                   sum(greatest(A, B, C)) AS couvert_A_ou_B_ou_C,
                   round(100.0 * sum(greatest(A, B, C)) / count(*), 1) AS pct_couvert,
                   sum(A * B) AS A_et_B, sum(A * C) AS A_et_C, sum(B * C) AS B_et_C,
                   sum(CASE WHEN A = 0 AND B = 0 AND C = 0 THEN 1 ELSE 0 END) AS residuel
            FROM f
            """
        ),
    )

    afficher(
        "Apport marginal (cascade A -> +B -> +C)",
        con.sql(
            """
            WITH f AS (
                SELECT par_adresse AS A, par_parcelle_ban AS B,
                       CASE WHEN dist_m <= 25 THEN 1 ELSE 0 END AS C
                FROM recup
            )
            SELECT sum(A) AS apres_A,
                   sum(CASE WHEN A = 1 OR B = 1 THEN 1 ELSE 0 END) AS apres_A_B,
                   sum(CASE WHEN A = 1 OR B = 1 OR C = 1 THEN 1 ELSE 0 END) AS apres_A_B_C,
                   count(*) AS total
            FROM f
            """
        ),
    )

    materialiser_liens(con, dept)
    afficher(
        "Liens récupérés par méthode et confiance",
        con.sql(
            f"""
            SELECT methode, confiance, count(*) AS n,
                   round(median(dist_m), 1) AS mediane_m
            FROM read_parquet('{INTERIM / f"recup_liens_{dept}.parquet"}')
            GROUP BY methode, confiance ORDER BY methode, confiance
            """
        ),
    )


if __name__ == "__main__":
    dept = sys.argv[1] if len(sys.argv) > 1 else "33"
    pl.Config.set_tbl_rows(20)
    main(dept)
