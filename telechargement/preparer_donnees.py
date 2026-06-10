"""Télécharge et prépare les artefacts d'un département pour le pipeline comparables.

Reprend l'acquisition du notebook spike sous forme réutilisable. Produit (idempotent) :
  data/raw/      dvf_{dept}_{annee}.csv.gz, RNB_{dept}.csv.zip, ban_{dept}.csv.gz
  data/interim/  dvf_{dept}.parquet, rnb_plots_{dept}.parquet, rnb_adr_{dept}.parquet

(Le DPE n'est pas requis par le pipeline comparables ; il reste géré par le notebook.)

Usage : uv run python -m telechargement.preparer_donnees [DEPT]   (défaut 33)
"""
from __future__ import annotations

import sys
import urllib.request
import zipfile
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
YEARS = range(2021, 2026)  # geo-dvf latest : 2021-2025


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
    pl.concat(frames, how="diagonal_relaxed").write_parquet(cache)
    print(f"  → {cache.name}")


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
    download(f"https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-{dept}.csv.gz",
             RAW / f"ban_{dept}.csv.gz")


def main(dept: str) -> None:
    preparer_dvf(dept)
    preparer_rnb(dept)
    preparer_ban(dept)
    print(f"\n✓ Données {dept} prêtes pour le pipeline.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
