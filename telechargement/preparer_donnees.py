"""Télécharge et prépare les artefacts d'un département pour le pipeline comparables.

Reprend l'acquisition du notebook spike sous forme réutilisable. Produit (idempotent) :
  data/raw/      dvf_{dept}_{annee}.csv.gz, RNB_{dept}.csv.zip, ban_{dept}.csv.gz
  data/interim/  dvf_{dept}.parquet, rnb_plots_{dept}.parquet, rnb_adr_{dept}.parquet,
                 ban_{dept}.parquet, bdnb_batiments_{dept}.parquet

(Le DPE n'est pas requis par le pipeline comparables ; il reste géré par le notebook.)

Usage : uv run python -m telechargement.preparer_donnees [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys
import io
import urllib.request
import zipfile
from pathlib import Path

import polars as pl

from telechargement.preparer_communes import preparer_communes
from telechargement.preparer_passage_communes import preparer_passage_communes

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
YEARS = range(2021, 2026)  # geo-dvf latest : 2021-2025
BDNB_MILLESIME = "2026-02-a"
BDNB_BASE_URL = f"https://open-data.s3.fr-par.scw.cloud/bdnb_millesime_{BDNB_MILLESIME}"
BDNB_COLUMNS = [
    "batiment_groupe_id",
    "parcelle_id",
    "code_departement_insee",
    "code_commune_insee",
    "usage_principal_bdnb_open",
    "usage_niveau_1_txt",
    "nb_log",
    "nb_log_rnc",
    "nb_lot_garpark_rnc",
    "nb_lot_tertiaire_rnc",
    "surface_emprise_sol",
    "hauteur_mean",
    "nb_niveau",
    "annee_construction",
    "mat_mur_txt",
    "mat_toit_txt",
    "type_batiment_dpe",
    "fiabilite_emprise_sol",
    "fiabilite_hauteur",
    "fiabilite_cr_adr_niv_1",
    "fiabilite_cr_adr_niv_2",
    "s_geom_groupe",
]


def _exiger(chemin: Path) -> Path:
    if not chemin.exists():
        sys.exit(f"Artefact manquant (lancer l'étape amont d'abord) : {chemin}")
    return chemin


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"✓ déjà là : {dest.name}")
        return dest
    print(f"⤓ {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def preparer_dvf(dept: str) -> None:
    cache = INTERIM / f"dvf_{dept}.parquet"
    if cache.exists():
        print(f"✓ {cache.name}")
        return
    frames = []
    for y in YEARS:
        f = download(f"https://files.data.gouv.fr/geo-dvf/latest/csv/{y}/departements/{dept}.csv.gz",
                     RAW / f"dvf_{dept}_{y}.csv.gz")
        frames.append(pl.read_csv(f, separator=",", infer_schema=False))  # tout en String
    cache.parent.mkdir(parents=True, exist_ok=True)
    frame = _normaliser_communes(pl.concat(frames, how="diagonal_relaxed"))
    frame.write_parquet(cache)
    print(f"  → {cache.name}")


def _normaliser_communes(df: pl.DataFrame) -> pl.DataFrame:
    """Aligne `code_commune`/`nom_commune` sur le COG courant (cf. preparer_passage_communes).

    1. Remap des codes **périmés** (communes fusionnées) vers la commune actuelle — sinon
       ni contour ni adresse ne leur correspondent.
    2. Nom **autoritaire** COG par code courant — corrige aussi les codes survivants
       renommés (commune nouvelle reprenant le code d'une fondatrice).
    """
    passage_path = INTERIM / "passage_communes.parquet"
    noms_path = INTERIM / "communes_actuelles.parquet"
    modif_path = INTERIM / "communes_modif.parquet"
    if "code_commune" not in df.columns or not passage_path.exists():
        return df
    # Identité DVF d'origine conservée pour tracer la modification de commune au détail.
    out = df.with_columns(
        pl.col("code_commune").alias("_code_orig"),
        pl.col("nom_commune").alias("_nom_orig"),
    )
    passage = pl.read_parquet(passage_path)  # code_perime, code_actuel, nom_actuel
    out = out.join(passage, left_on="code_commune", right_on="code_perime", how="left")
    n = int(out.select(pl.col("code_actuel").is_not_null().sum()).item())
    if n:
        print(f"  ↻ {n} lignes DVF à code commune périmé remappées vers le COG courant")
    out = out.with_columns(pl.coalesce("code_actuel", "code_commune").alias("code_commune")).drop(
        "code_actuel", "nom_actuel"
    )
    if noms_path.exists():
        noms = pl.read_parquet(noms_path)  # insee, nom_cog
        out = out.join(noms, left_on="code_commune", right_on="insee", how="left").with_columns(
            pl.coalesce("nom_cog", "nom_commune").alias("nom_commune")
        ).drop("nom_cog")
    # Trace : origine « Nom (CODE) » + date, seulement si l'identité a changé ET qu'un
    # mouvement COG daté existe (écarte les écarts de simple formatage).
    date_col = pl.lit(None, dtype=pl.String)
    if modif_path.exists():
        modif = pl.read_parquet(modif_path).with_columns(pl.col("date_effet").cast(pl.String))
        out = out.join(modif, left_on="_code_orig", right_on="code", how="left")
        date_col = pl.col("date_effet")
    traced = (
        (pl.col("_code_orig") != pl.col("code_commune")) | (pl.col("_nom_orig") != pl.col("nom_commune"))
    ) & date_col.is_not_null()
    out = out.with_columns(
        pl.when(traced).then(pl.format("{} ({})", pl.col("_nom_orig"), pl.col("_code_orig")))
        .otherwise(None).alias("commune_modif_origine"),
        pl.when(traced).then(date_col).otherwise(None).alias("commune_modif_date"),
    )
    drop_cols = ["_code_orig", "_nom_orig"] + (["date_effet"] if modif_path.exists() else [])
    return out.drop(drop_cols)


def preparer_rnb(dept: str) -> None:
    pc = INTERIM / f"rnb_plots_{dept}.parquet"
    ac = INTERIM / f"rnb_adr_{dept}.parquet"
    if pc.exists() and ac.exists():
        print(f"✓ rnb_plots/rnb_adr {dept}")
        return
    z = download(f"https://rnb-opendata.s3.fr-par.scw.cloud/files/RNB_{dept}.csv.zip",
                 RAW / f"RNB_{dept}.csv.zip")
    with zipfile.ZipFile(z) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".csv"))
        rnb = pl.read_csv(zf.read(name), separator=";", infer_schema=False,
                          columns=["rnb_id", "plots", "addresses"])

    def jcol(c: str) -> pl.Expr:  # json_decode exige un texte non vide
        col = pl.col(c)
        return pl.when(col.is_null() | (col.str.strip_chars() == "")).then(pl.lit("[]")).otherwise(col)

    plots_t = pl.List(pl.Struct({"id": pl.String, "bdg_cover_ratio": pl.Float64}))
    addr_t = pl.List(pl.Struct({"cle_interop_ban": pl.String}))
    (rnb.select("rnb_id", jcol("plots").str.json_decode(plots_t).alias("p"))
        .explode("p").drop_nulls("p").unnest("p")
        .rename({"id": "id_parcelle"}).select("rnb_id", "id_parcelle", "bdg_cover_ratio")
        .write_parquet(pc))
    (rnb.select("rnb_id", jcol("addresses").str.json_decode(addr_t).alias("a"))
        .explode("a").drop_nulls("a").unnest("a").select("rnb_id", "cle_interop_ban")
        .write_parquet(ac))
    print(f"  → {pc.name}, {ac.name}")


def preparer_ban(dept: str) -> None:
    cache = INTERIM / f"ban_{dept}.parquet"
    if cache.exists():
        print(f"✓ {cache.name}")
        return
    src = download(f"https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-{dept}.csv.gz",
                   RAW / f"ban_{dept}.csv.gz")
    frame = (
        pl.scan_csv(src, separator=";", infer_schema=False)
        .select(
            "code_postal",
            "code_insee",
            "nom_commune",
            pl.col("lon").cast(pl.Float64, strict=False),
            pl.col("lat").cast(pl.Float64, strict=False),
        )
        .filter(pl.col("code_postal").is_not_null() & pl.col("code_insee").is_not_null())
        .collect()
    )
    cache.parent.mkdir(parents=True, exist_ok=True)
    frame.write_parquet(cache)
    print(f"  → {cache.name} ({frame.height} adresses)")


def _bdnb_url(dept: str) -> str:
    return (
        f"{BDNB_BASE_URL}/millesime_{BDNB_MILLESIME}_dep{dept}/"
        f"open_data_millesime_{BDNB_MILLESIME}_dep{dept}_csv.zip"
    )


def _read_bdnb_csv(zf: zipfile.ZipFile, name: str, columns: list[str]) -> pl.DataFrame:
    return pl.read_csv(
        io.BytesIO(zf.read(f"csv/{name}.csv")),
        separator=";",
        columns=columns,
        null_values=[""],
        infer_schema_length=10000,
    )


def _cast_bdnb_numbers(frame: pl.DataFrame) -> pl.DataFrame:
    numeric = [
        "nb_log",
        "nb_log_rnc",
        "nb_lot_garpark_rnc",
        "nb_lot_tertiaire_rnc",
        "surface_emprise_sol",
        "hauteur_mean",
        "nb_niveau",
        "s_geom_groupe",
    ]
    return frame.with_columns(
        pl.col(c).cast(pl.Float64, strict=False)
        for c in numeric
        if c in frame.columns
    )


def preparer_bdnb(dept: str) -> None:
    """Extrait BDNB Open ciblé, par département, depuis le ZIP CSV officiel.

    On garde seulement les colonnes utiles à l'identification et à l'affichage détail.
    Aucune relation RNB ext_ids -> BDNB n'est déduite ici : la clé officielle utilisée est
    `parcelle_id` via la table `rel_batiment_groupe_parcelle`.
    """
    cache = INTERIM / f"bdnb_batiments_{dept}.parquet"
    if cache.exists():
        print(f"✓ {cache.name}")
        return

    z = download(_bdnb_url(dept), RAW / f"open_data_millesime_{BDNB_MILLESIME}_dep{dept}_csv.zip")
    dvf_parcelles = (
        pl.read_parquet(_exiger(INTERIM / f"dvf_{dept}.parquet"), columns=["id_parcelle"])
        .drop_nulls("id_parcelle")
        .unique()
        .rename({"id_parcelle": "parcelle_id"})
    )
    with zipfile.ZipFile(z) as zf:
        rel = _read_bdnb_csv(
            zf,
            "rel_batiment_groupe_parcelle",
            ["batiment_groupe_id", "parcelle_id", "code_departement_insee"],
        ).join(dvf_parcelles, on="parcelle_id", how="semi")
        bg_ids = rel.select("batiment_groupe_id").unique()
        groupe = _read_bdnb_csv(
            zf,
            "batiment_groupe",
            ["batiment_groupe_id", "code_commune_insee", "s_geom_groupe"],
        ).join(bg_ids, on="batiment_groupe_id", how="semi")
        usage = _read_bdnb_csv(
            zf,
            "batiment_groupe_synthese_propriete_usage",
            ["batiment_groupe_id", "usage_principal_bdnb_open"],
        ).join(bg_ids, on="batiment_groupe_id", how="semi")
        ffo = _read_bdnb_csv(
            zf,
            "batiment_groupe_ffo_bat",
            [
                "batiment_groupe_id",
                "nb_niveau",
                "annee_construction",
                "usage_niveau_1_txt",
                "mat_mur_txt",
                "mat_toit_txt",
                "nb_log",
            ],
        ).join(bg_ids, on="batiment_groupe_id", how="semi")
        rnc = _read_bdnb_csv(
            zf,
            "batiment_groupe_rnc",
            ["batiment_groupe_id", "nb_log", "nb_lot_garpark", "nb_lot_tertiaire"],
        ).rename({
            "nb_log": "nb_log_rnc",
            "nb_lot_garpark": "nb_lot_garpark_rnc",
            "nb_lot_tertiaire": "nb_lot_tertiaire_rnc",
        }).join(bg_ids, on="batiment_groupe_id", how="semi")
        geospx = _read_bdnb_csv(
            zf,
            "batiment_groupe_geospx",
            ["batiment_groupe_id", "fiabilite_emprise_sol", "fiabilite_hauteur"],
        ).join(bg_ids, on="batiment_groupe_id", how="semi")
        bdtopo = _read_bdnb_csv(
            zf,
            "batiment_groupe_bdtopo_bat",
            ["batiment_groupe_id", "hauteur_mean"],
        ).join(bg_ids, on="batiment_groupe_id", how="semi")

    frame = (
        rel.join(groupe, on="batiment_groupe_id", how="left")
        .join(usage, on="batiment_groupe_id", how="left")
        .join(ffo, on="batiment_groupe_id", how="left")
        .join(rnc, on="batiment_groupe_id", how="left")
        .join(geospx, on="batiment_groupe_id", how="left")
        .join(bdtopo, on="batiment_groupe_id", how="left")
        .with_columns(
            pl.col("s_geom_groupe").alias("surface_emprise_sol"),
            pl.lit(None, dtype=pl.String).alias("type_batiment_dpe"),
            pl.lit(None, dtype=pl.String).alias("fiabilite_cr_adr_niv_1"),
            pl.lit(None, dtype=pl.String).alias("fiabilite_cr_adr_niv_2"),
        )
        .select(BDNB_COLUMNS)
    )
    frame = _cast_bdnb_numbers(frame)
    cache.parent.mkdir(parents=True, exist_ok=True)
    frame.write_parquet(cache)
    print(f"  → {cache.name} ({frame.height} lignes)")


def main(dept: str) -> None:
    preparer_passage_communes()  # table de passage COG (avant DVF : normalisation des codes périmés)
    preparer_dvf(dept)
    preparer_rnb(dept)
    preparer_bdnb(dept)
    preparer_ban(dept)
    preparer_communes(dept)
    print(f"\n✓ Données {dept} prêtes pour le pipeline.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
