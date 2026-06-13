"""« Carte des loyers » (MTE/SDES × ANIL) → loyers_communes.parquet (national).

Indicateurs de loyer d'annonce CHARGES COMPRISES, prédits par commune par un modèle
hédonique calé sur les annonces (leboncoin + SeLoger + PAP), millésime 2025. C'est la seule
référence locative open data couvrant TOUTES les communes — précieuse pour situer un prix
de vente face au marché locatif (rendement brut) côté investisseur, et comme contexte
grand public.

4 segments publiés, chacun son fichier : maison, appartement (tous), appartement 1-2 pièces,
appartement 3 pièces et plus. On les empile en format long avec une colonne `categorie`.
L'intervalle de prédiction (lwr/upr) et le R² ajusté de la maille sont conservés : l'appli
les affiche pour ne jamais vendre une prédiction de modèle comme une observation.

Source : https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025
(URLs stables par resource-id.)

Usage : uv run python -m telechargement.preparer_loyers [--force]
"""
from __future__ import annotations

import sys
from pathlib import Path

import polars as pl

from telechargement._telechargement import download

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"

MILLESIME = "2025"
SEGMENTS = {
    # categorie -> resource-id data.gouv (URL stable)
    "maison": "129f764d-b613-44e4-952c-5ff50a8c9b73",
    "appartement": "55b34088-0964-415f-9df7-d87dd98a09be",
    "appartement_1_2p": "14a1fe11-b2d1-49b3-9f6b-83d12df9482c",
    "appartement_3p_plus": "5e3b28a4-cf56-43a3-ae79-43cceeb27f8c",
}


def preparer_loyers(*, force: bool = False) -> Path:
    dest = INTERIM / "loyers_communes.parquet"
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"✓ {dest.name} (existe déjà — --force pour régénérer)")
        return dest

    # Format SDES : séparateur ';', décimales à VIRGULE, Latin-1 (accents des libellés communes),
    # CRLF. On lit tout en chaîne (utf8-lossy : seuls les libellés, non conservés, sont touchés)
    # et on normalise les décimales avant cast.
    def _num(col: str) -> pl.Expr:
        return pl.col(col).str.replace(",", ".").cast(pl.Float64, strict=False)

    frames = []
    for categorie, rid in SEGMENTS.items():
        brut = download(f"https://www.data.gouv.fr/fr/datasets/r/{rid}",
                        RAW / f"loyers_{MILLESIME}_{categorie}.csv", force=force)
        frames.append(
            pl.read_csv(brut, separator=";", infer_schema=False, encoding="utf8-lossy")
            .select(
                pl.col("INSEE_C").alias("code_insee"),
                pl.lit(categorie).alias("categorie"),
                _num("loypredm2").alias("loyer_m2"),
                _num("lwr.IPm2").alias("loyer_m2_bas"),
                _num("upr.IPm2").alias("loyer_m2_haut"),
                pl.col("TYPPRED").alias("maille_prediction"),
                pl.col("nbobs_com").cast(pl.Int32, strict=False).alias("nb_observations_commune"),
                _num("R2_adj").alias("r2"),
                pl.lit(MILLESIME).alias("millesime"),
            )
        )
    frame = pl.concat(frames, how="vertical").filter(pl.col("loyer_m2").is_not_null())

    INTERIM.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".parquet.tmp")
    frame.sort("code_insee").write_parquet(tmp, compression="zstd")
    tmp.rename(dest)
    print(f"  → {dest.name} : {frame.height:,} lignes "
          f"({frame['code_insee'].n_unique():,} communes × {len(SEGMENTS)} segments, "
          f"{dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def main() -> None:
    preparer_loyers(force="--force" in sys.argv)


if __name__ == "__main__":
    main()
