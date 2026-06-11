"""Réduit les référentiels aux clés réellement utiles au service DVF.

Les fichiers bruts restent des caches reconstructibles. Les artefacts `*_service`
ne gardent que le graphe utile aux ventes DVF : parcelles présentes dans DVF et
bâtiments RNB récupérés par la cascade de rattachement.

Usage : uv run python -m pipeline.reduire_referentiels [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys

import duckdb
import polars as pl

from pipeline.commun import INTERIM, RAW, _exiger, points_rnb


def _dvf_parcelles(dept: str) -> pl.DataFrame:
    return (
        pl.read_parquet(_exiger(INTERIM / f"dvf_{dept}.parquet"), columns=["id_parcelle"])
        .drop_nulls("id_parcelle")
        .unique()
    )


def _recup_rnb(dept: str) -> pl.DataFrame:
    src = INTERIM / f"recup_liens_final_{dept}.parquet"
    if not src.exists():
        return pl.DataFrame({"rnb_id": []}, schema={"rnb_id": pl.String})
    return pl.read_parquet(src, columns=["rnb_id"]).drop_nulls("rnb_id").unique()


def reduire_rnb(dept: str, parcelles: pl.DataFrame, recup: pl.DataFrame) -> set[str]:
    plots = pl.read_parquet(_exiger(INTERIM / f"rnb_plots_{dept}.parquet"))
    plots_service = plots.join(parcelles, on="id_parcelle", how="semi")
    if not recup.is_empty():
        plots_service = pl.concat(
            [plots_service, plots.join(recup, on="rnb_id", how="semi")],
            how="vertical_relaxed",
        ).unique()
    plots_service.write_parquet(INTERIM / f"rnb_plots_service_{dept}.parquet")

    rnb_ids = plots_service.select("rnb_id").unique()
    if not recup.is_empty():
        rnb_ids = pl.concat([rnb_ids, recup], how="vertical_relaxed").unique()

    adr = pl.read_parquet(_exiger(INTERIM / f"rnb_adr_{dept}.parquet"))
    adr_service = adr.join(rnb_ids, on="rnb_id", how="semi")
    adr_service.write_parquet(INTERIM / f"rnb_adr_service_{dept}.parquet")

    pts_service = points_rnb(dept).join(rnb_ids, on="rnb_id", how="semi")
    pts_service.write_parquet(INTERIM / f"rnb_points_service_{dept}.parquet")

    print(
        f"RNB service {dept}: plots {plots.height} -> {plots_service.height}, "
        f"adr {adr.height} -> {adr_service.height}, points -> {pts_service.height}"
    )
    return set(adr_service.get_column("cle_interop_ban").drop_nulls().to_list())


def reduire_ban(dept: str, cles_ban: set[str]) -> None:
    if not cles_ban:
        return
    ban = pl.read_csv(
        _exiger(RAW / f"ban_{dept}.csv.gz"),
        separator=";",
        infer_schema=False,
        columns=["id", "numero", "rep", "nom_voie", "code_postal", "nom_commune", "lon", "lat"],
    )
    service = ban.filter(pl.col("id").is_in(cles_ban))
    service.write_parquet(INTERIM / f"ban_service_{dept}.parquet")
    print(f"BAN service {dept}: {ban.height} -> {service.height}")


def reduire_bdnb(dept: str, parcelles: pl.DataFrame) -> None:
    src = INTERIM / f"bdnb_batiments_{dept}.parquet"
    if not src.exists():
        return
    bdnb = pl.read_parquet(src)
    service = bdnb.join(parcelles.rename({"id_parcelle": "parcelle_id"}), on="parcelle_id", how="semi")
    service.write_parquet(INTERIM / f"bdnb_batiments_service_{dept}.parquet")
    print(f"BDNB service {dept}: {bdnb.height} -> {service.height}")


def reduire_cadastre(dept: str, parcelles: pl.DataFrame) -> None:
    src = INTERIM / f"cadastre_parcelles_{dept}.parquet"
    if not src.exists():
        return
    con = duckdb.connect()
    con.register("dvf_parcelles", parcelles.rename({"id_parcelle": "id"}))
    out = INTERIM / f"cadastre_parcelles_service_{dept}.parquet"
    src_sql = str(src).replace("'", "''")
    out_sql = str(out).replace("'", "''")
    con.execute(
        f"""
        COPY (
            SELECT c.*
            FROM read_parquet('{src_sql}') c
            JOIN dvf_parcelles d USING (id)
        ) TO '{out_sql}' (FORMAT PARQUET)
        """
    )
    before = con.execute("SELECT count(*) FROM read_parquet(?)", [str(src)]).fetchone()[0]
    after = con.execute("SELECT count(*) FROM read_parquet(?)", [str(out)]).fetchone()[0]
    con.close()
    print(f"Cadastre parcelles service {dept}: {before} -> {after}")


def main(dept: str) -> None:
    parcelles = _dvf_parcelles(dept)
    recup = _recup_rnb(dept)
    cles_ban = reduire_rnb(dept, parcelles, recup)
    reduire_ban(dept, cles_ban)
    reduire_bdnb(dept, parcelles)
    reduire_cadastre(dept, parcelles)
    print(f"\n✓ Référentiels service {dept} réduits au graphe DVF.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
