"""Construit la table de comparables centrée DVF + le pont bâtiment + le ref adresses.

Modèle figé par l'ADR 0005 :
  - grain = bien logement vendu (dédoublonnage des lignes DVF éclatées) ;
  - pont (id_mutation, id_parcelle) -> rnb_id nullable + confiance
    (mono-bâti / adresse-unique = haute ; récupéré = moyenne|basse ; multi ambigu = parcelle) ;
  - valeur_fonciere = total mutation (jamais sommée) + flags multi_bien / multi_adresse ;
  - adresses_ref = BAN/RNB élagué aux rnb_id réellement référencés.

Prérequis : artefacts du spike + `recup_liens_final_{dept}.parquet` (geocodage_residuel.py).
Sorties : data/interim/{comparables,pont_batiment,adresses_ref}_{dept}.parquet

Usage : uv run python -m pipeline.construire_comparables [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys

import duckdb
import polars as pl

from pipeline.commun import INTERIM, RAW, _exiger


def charger(con: duckdb.DuckDBPyConnection, dept: str) -> None:
    con.execute(f"CREATE VIEW dvf AS SELECT * FROM read_parquet('{_exiger(INTERIM / f'dvf_{dept}.parquet')}')")
    con.execute(f"CREATE VIEW plots AS SELECT * FROM read_parquet('{_exiger(INTERIM / f'rnb_plots_{dept}.parquet')}')")
    con.execute(f"CREATE VIEW adr AS SELECT * FROM read_parquet('{_exiger(INTERIM / f'rnb_adr_{dept}.parquet')}')")
    con.execute(f"CREATE VIEW recup AS SELECT * FROM read_parquet('{_exiger(INTERIM / f'recup_liens_final_{dept}.parquet')}')")
    ban = pl.read_csv(_exiger(RAW / f"ban_{dept}.csv.gz"), separator=";", infer_schema=False,
                      columns=["id", "numero", "rep", "nom_voie", "code_postal", "nom_commune", "lon", "lat"])
    con.register("ban", ban)


def construire_pont(con: duckdb.DuckDBPyConnection) -> None:
    """(id_mutation, id_parcelle) -> rnb_id nullable + confiance + source."""
    con.execute(
        """
        CREATE TEMP TABLE pont AS
        WITH sales AS (
            SELECT DISTINCT id_mutation, id_parcelle,
                   code_commune || '_' || lower(adresse_code_voie) || '_'
                       || lpad(adresse_numero, 5, '0') AS cle
            FROM dvf
            WHERE type_local IN ('Maison', 'Appartement') AND id_parcelle IS NOT NULL
        ),
        sp AS (SELECT DISTINCT id_mutation, id_parcelle FROM sales),
        card AS (
            SELECT id_parcelle, count(DISTINCT rnb_id) AS n_bati, any_value(rnb_id) AS rnb_any
            FROM plots GROUP BY 1
        ),
        pb AS (SELECT DISTINCT p.id_parcelle, p.rnb_id, a.cle_interop_ban AS cle
               FROM plots p JOIN adr a ON p.rnb_id = a.rnb_id),
        addr_match AS (
            SELECT s.id_mutation, s.id_parcelle,
                   count(DISTINCT pb.rnb_id) AS n_match, any_value(pb.rnb_id) AS rnb_match
            FROM sales s JOIN pb ON pb.id_parcelle = s.id_parcelle AND pb.cle = s.cle
            GROUP BY 1, 2
        )
        SELECT sp.id_mutation, sp.id_parcelle,
               CASE
                   WHEN c.n_bati = 1 THEN c.rnb_any
                   WHEN am.n_match = 1 THEN am.rnb_match
                   WHEN c.id_parcelle IS NULL AND r.rnb_id IS NOT NULL THEN r.rnb_id
               END AS rnb_id,
               CASE
                   WHEN c.n_bati = 1 THEN 'haute'
                   WHEN am.n_match = 1 THEN 'haute'
                   WHEN c.id_parcelle IS NULL AND r.rnb_id IS NOT NULL THEN r.confiance
                   WHEN c.n_bati > 1 THEN 'parcelle'
                   ELSE 'perdu'
               END AS confiance,
               CASE
                   WHEN c.n_bati = 1 THEN 'parcelle_mono'
                   WHEN am.n_match = 1 THEN 'adresse'
                   WHEN c.id_parcelle IS NULL AND r.rnb_id IS NOT NULL THEN r.methode
                   WHEN c.n_bati > 1 THEN 'multi_ambigu'
                   ELSE 'perdu'
               END AS source
        FROM sp
        LEFT JOIN card c ON sp.id_parcelle = c.id_parcelle
        LEFT JOIN addr_match am ON sp.id_mutation = am.id_mutation AND sp.id_parcelle = am.id_parcelle
        LEFT JOIN recup r ON sp.id_mutation = r.id_mutation
        """
    )


def construire_comparables(con: duckdb.DuckDBPyConnection) -> None:
    """Un bien logement vendu par ligne ; perdus exclus."""
    con.execute(
        """
        CREATE TEMP TABLE biens AS
        SELECT DISTINCT id_mutation, id_parcelle, type_local, lot1_numero,
               surface_reelle_bati, nombre_pieces_principales
        FROM dvf WHERE type_local IS NOT NULL
        """
    )
    con.execute(
        """
        CREATE TEMP TABLE flags AS
        SELECT id_mutation,
               count(*) > 1 AS flag_multi_bien,
               count(DISTINCT id_parcelle) > 1 AS flag_multi_adresse
        FROM biens GROUP BY 1
        """
    )
    con.execute(
        """
        CREATE TEMP TABLE comparables AS
        WITH mut AS (
            SELECT id_mutation, any_value(date_mutation) AS date_mutation,
                   any_value(nature_mutation) AS nature_mutation,
                   any_value(valeur_fonciere) AS valeur_fonciere,
                   any_value(code_departement) AS code_departement
            FROM dvf GROUP BY 1
        ),
        parc AS (
            SELECT id_mutation, id_parcelle,
                   any_value(code_commune) AS code_commune, any_value(nom_commune) AS nom_commune,
                   any_value(trim(concat_ws(' ', adresse_numero, adresse_suffixe, adresse_nom_voie))) AS adresse_dvf
            FROM dvf WHERE type_local IS NOT NULL GROUP BY 1, 2
        )
        SELECT b.id_mutation, m.date_mutation, m.nature_mutation, m.code_departement,
               p.code_commune, p.nom_commune, b.id_parcelle, p.adresse_dvf,
               b.type_local, b.surface_reelle_bati, b.nombre_pieces_principales,
               m.valeur_fonciere,
               pont.rnb_id, pont.confiance, pont.source,
               f.flag_multi_bien, f.flag_multi_adresse
        FROM biens b
        JOIN mut m USING (id_mutation)
        JOIN parc p USING (id_mutation, id_parcelle)
        JOIN flags f USING (id_mutation)
        LEFT JOIN pont USING (id_mutation, id_parcelle)
        WHERE b.type_local IN ('Maison', 'Appartement')
          AND pont.confiance IS DISTINCT FROM 'perdu'
        """
    )


def construire_adresses_ref(con: duckdb.DuckDBPyConnection) -> None:
    """BAN/RNB élagué aux rnb_id référencés par le pont : adresse normalisée + coords."""
    con.execute(
        """
        CREATE TEMP TABLE adresses_ref AS
        SELECT DISTINCT a.rnb_id, a.cle_interop_ban,
               trim(concat_ws(' ', b.numero, b.rep, b.nom_voie)) AS adresse_normalisee,
               b.code_postal, b.nom_commune,
               TRY_CAST(b.lon AS DOUBLE) AS lon, TRY_CAST(b.lat AS DOUBLE) AS lat
        FROM adr a
        LEFT JOIN ban b ON a.cle_interop_ban = b.id
        WHERE a.rnb_id IN (SELECT DISTINCT rnb_id FROM pont WHERE rnb_id IS NOT NULL)
        """
    )


def main(dept: str) -> None:
    con = duckdb.connect()
    charger(con, dept)
    construire_pont(con)
    construire_comparables(con)
    construire_adresses_ref(con)

    for nom in ("comparables", "pont_batiment", "adresses_ref"):
        table = "pont" if nom == "pont_batiment" else nom
        out = INTERIM / f"{nom}_{dept}.parquet"
        con.execute(f"COPY {table} TO '{out}' (FORMAT parquet)")

    print("=== Volumes ===")
    con.sql("""
        SELECT (SELECT count(*) FROM dvf WHERE type_local IN ('Maison','Appartement')) AS lignes_dvf_logement,
               (SELECT count(*) FROM comparables) AS biens_comparables,
               (SELECT count(*) FROM pont) AS lignes_pont,
               (SELECT count(*) FROM adresses_ref) AS adresses_ref,
               (SELECT count(*) FROM read_parquet('""" + str(INTERIM / f"rnb_adr_{dept}.parquet") + """')) AS adresses_rnb_total
    """).show()

    print("=== Comparables par confiance ===")
    con.sql("""
        SELECT confiance, count(*) AS n, round(100.0*count(*)/sum(count(*)) OVER (),1) AS pct
        FROM comparables GROUP BY 1 ORDER BY n DESC
    """).show()

    print("=== Pont par source ===")
    con.sql("SELECT source, count(*) n FROM pont GROUP BY 1 ORDER BY n DESC").show()


if __name__ == "__main__":
    dept = sys.argv[1] if len(sys.argv) > 1 else "33"
    pl.Config.set_tbl_rows(20)
    main(dept)
