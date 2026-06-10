"""Récupération des non-matchs résiduels via le géocodeur BAN (api-adresse).

Les ~10% de non-matchs restants après `recuperation_non_match.py` (clé adresse +
pont BAN + spatial) sont des ventes DVF dont l'adresse n'est pas exploitable telle
quelle (lieu-dit, numéro fictif, pas de coords). On interroge le **géocodeur BAN**
(fuzzy text -> coords + clé + score) et on ne retient un résultat que s'il est
**fiable** :

    result_score >= SEUIL_SCORE  ET  result_type précis (housenumber/street)
    ET un bâtiment RNB existe à <= DIST_MAX des coords renvoyées.

En dessous du seuil de score, **on jette l'adresse** : la ligne DVF est considérée
**perdue / inexploitable** (un faux rattachement vaut moins qu'une perte assumée).

Sorties :
  data/interim/recup_liens_final_{dept}.parquet  liens A/B/C + ban_geocode (autorité)
  data/interim/pertes_{dept}.parquet             ventes non rattachables + raison

Usage : uv run python -m pipeline.geocodage_residuel [DEPT] [SEUIL_SCORE]
        (défauts : 33  0.95)
"""
from __future__ import annotations

import io
import sys

import duckdb
import polars as pl
import requests

from pipeline.commun import INTERIM, _exiger, points_rnb, preparer_mutations
from pipeline.recuperation_non_match import charger, preparer_recuperation

API = "https://api-adresse.data.gouv.fr/search/csv/"
SEUIL_SCORE = 0.95          # en deçà : adresse jetée, ligne DVF perdue
DIST_MAX = 50.0             # distance max coords BAN -> bâtiment RNB pour rattacher
TYPES_PRECIS = ("housenumber", "street")


def adresses_residuelles(con: duckdb.DuckDBPyConnection, dept: str) -> pl.DataFrame:
    """Une ligne par mutation résiduelle (non rattachée par A/B/C) : adresse à géocoder."""
    src = _exiger(INTERIM / f"recup_liens_{dept}.parquet")  # lancer recuperation_non_match.py d'abord
    con.execute(f"CREATE OR REPLACE TEMP TABLE liens AS SELECT * FROM read_parquet('{src}')")
    return con.sql(
        """
        WITH res AS (
            SELECT DISTINCT n.id_mutation FROM nm_lignes n
            LEFT JOIN liens l ON n.id_mutation = l.id_mutation
            WHERE l.id_mutation IS NULL
        )
        SELECT DISTINCT ON (d.id_mutation)
               d.id_mutation,
               trim(concat_ws(' ',
                   CASE WHEN TRY_CAST(d.adresse_numero AS INT) < 9000
                        THEN d.adresse_numero END,
                   d.adresse_suffixe, d.adresse_nom_voie)) AS adresse,
               d.code_postal AS postcode,
               d.code_commune AS citycode
        FROM res JOIN dvf d ON res.id_mutation = d.id_mutation
        WHERE d.type_local IN ('Maison', 'Appartement')
          AND d.adresse_nom_voie IS NOT NULL
        ORDER BY d.id_mutation, (d.longitude IS NOT NULL) DESC
        """
    ).pl()


def geocoder(df: pl.DataFrame) -> pl.DataFrame:
    """Géocode en masse via l'API CSV de la BAN (filtre par citycode)."""
    buf = io.BytesIO()
    df.select("id_mutation", "adresse", "postcode", "citycode").write_csv(buf)
    resp = requests.post(
        API,
        files={"data": ("res.csv", buf.getvalue(), "text/csv")},
        data={"columns": "adresse", "citycode": "citycode"},
        timeout=120,
    )
    resp.raise_for_status()
    return pl.read_csv(io.BytesIO(resp.content), infer_schema_length=0)


def geocoder_et_rattacher(con: duckdb.DuckDBPyConnection, dept: str) -> None:
    """Géocode les résiduels et crée la table `geo_eval` (1 ligne / mutation) :
    type, score, clé BAN, bâtiment RNB le plus proche des coords renvoyées + distance.
    """
    res = adresses_residuelles(con, dept)
    print(f"Résiduels à géocoder : {len(res)}")
    con.register("geo", geocoder(res))
    con.register("pts", points_rnb(dept))
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE geo_eval AS
        WITH q AS (
            SELECT id_mutation, result_type AS type, TRY_CAST(result_score AS DOUBLE) AS score,
                   result_id AS cle_ban, result_label,
                   TRY_CAST(longitude AS DOUBLE) AS lon, TRY_CAST(latitude AS DOUBLE) AS lat
            FROM geo
        ),
        qc AS (SELECT * FROM q WHERE lon IS NOT NULL),
        qg AS (SELECT *, CAST(floor(lon*1000) AS INT) gx, CAST(floor(lat*1000) AS INT) gy FROM qc),
        p AS (SELECT rnb_id, lon, lat, CAST(floor(lon*1000) AS INT) gx, CAST(floor(lat*1000) AS INT) gy FROM pts),
        cand AS (
            SELECT qg.id_mutation, p.rnb_id,
                   2*6371000*asin(sqrt(power(sin(radians(p.lat-qg.lat)/2),2)
                     + cos(radians(qg.lat))*cos(radians(p.lat))*power(sin(radians(p.lon-qg.lon)/2),2))) AS d
            FROM qg JOIN p ON p.gx BETWEEN qg.gx-1 AND qg.gx+1 AND p.gy BETWEEN qg.gy-1 AND qg.gy+1
        ),
        nn AS (SELECT id_mutation, arg_min(rnb_id, d) AS rnb_id, min(d) AS dist_m FROM cand GROUP BY id_mutation)
        SELECT q.id_mutation, q.type, q.score, q.cle_ban, q.result_label,
               nn.rnb_id, nn.dist_m
        FROM q LEFT JOIN nn ON q.id_mutation = nn.id_mutation
        """
    )


def main(dept: str, seuil: float) -> None:
    con = charger(dept)
    preparer_mutations(con)
    preparer_recuperation(con)
    geocoder_et_rattacher(con, dept)

    print("\n=== Qualité du géocodage BAN (par type) ===")
    con.sql(
        f"""
        SELECT coalesce(type, 'aucun_resultat') AS type, count(*) AS n,
               count(*) FILTER (WHERE score >= {seuil}) AS score_ok,
               round(median(score), 2) AS score_median
        FROM geo_eval GROUP BY 1 ORDER BY n DESC
        """
    ).show()

    # liens BAN retenus : score >= seuil + type précis + bâtiment proche
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE liens_ban AS
        SELECT id_mutation, rnb_id, 'ban_geocode' AS methode,
               CASE WHEN dist_m <= 25 THEN 'moyenne' ELSE 'basse' END AS confiance,
               round(dist_m, 1) AS dist_m
        FROM geo_eval
        WHERE score >= {seuil} AND type IN {TYPES_PRECIS} AND dist_m <= {DIST_MAX}
        """
    )
    print(f"=== Récupération BAN retenue (score >= {seuil}, type précis, bâtiment <= {DIST_MAX:.0f}m) ===")
    con.sql("SELECT count(*) AS recup_ban, "
            "count(*) FILTER (WHERE confiance='moyenne') AS dont_moyenne, "
            "count(*) FILTER (WHERE confiance='basse') AS dont_basse FROM liens_ban").show()

    # table de liens finale = A/B/C  U  ban_geocode
    final = con.sql(
        """
        SELECT id_mutation, rnb_id, methode, confiance, dist_m FROM liens
        UNION ALL
        SELECT id_mutation, rnb_id, methode, confiance, dist_m FROM liens_ban
        """
    ).pl()
    final.write_parquet(INTERIM / f"recup_liens_final_{dept}.parquet")
    con.register("final", final)

    # pertes : non-matchs sans aucun rattachement, avec la raison
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE pertes AS
        WITH res AS (
            SELECT DISTINCT n.id_mutation FROM nm_lignes n
            LEFT JOIN final f ON n.id_mutation = f.id_mutation
            WHERE f.id_mutation IS NULL
        )
        SELECT r.id_mutation, g.result_label, g.score, g.type, round(g.dist_m, 1) AS dist_m,
               CASE
                   WHEN g.id_mutation IS NULL THEN 'pas_d_adresse_dvf'
                   WHEN g.score IS NULL THEN 'aucun_resultat_ban'
                   WHEN g.type NOT IN {TYPES_PRECIS} THEN 'geocodage_imprecis'
                   WHEN g.score < {seuil} THEN 'score_insuffisant'
                   WHEN g.dist_m IS NULL OR g.dist_m > {DIST_MAX} THEN 'aucun_batiment_proche'
                   ELSE 'autre'
               END AS raison
        FROM res r LEFT JOIN geo_eval g ON r.id_mutation = g.id_mutation
        """
    )
    pertes = con.sql("SELECT * FROM pertes").pl()
    pertes.write_parquet(INTERIM / f"pertes_{dept}.parquet")

    print("\n=== Pertes (lignes DVF non rattachables) par raison ===")
    con.sql("SELECT raison, count(*) AS n FROM pertes GROUP BY 1 ORDER BY n DESC").show()

    print("=== Entonnoir final (ventes de logement) ===")
    con.sql(
        f"""
        WITH t AS (SELECT count(*) AS log FROM mut),
             nm AS (SELECT count(*) AS n FROM mut WHERE matched = 0)
        SELECT (SELECT log FROM t) AS mutations_log,
               (SELECT log FROM t) - (SELECT n FROM nm) AS match_direct,
               (SELECT count(*) FROM final) AS recuperees,
               (SELECT count(*) FROM pertes) AS perdues,
               round(100.0 * ((SELECT log FROM t) - (SELECT count(*) FROM pertes))
                     / (SELECT log FROM t), 2) AS pct_exploitable
        """
    ).show()
    print(f">>> écrit : recup_liens_final_{dept}.parquet ({len(final)}) + pertes_{dept}.parquet ({len(pertes)})")


if __name__ == "__main__":
    dept = sys.argv[1] if len(sys.argv) > 1 else "33"
    seuil = float(sys.argv[2]) if len(sys.argv) > 2 else SEUIL_SCORE
    pl.Config.set_tbl_rows(20)
    pl.Config.set_fmt_str_lengths(45)
    main(dept, seuil)
