"""Copropriétés du RNIC (registre national, ANAH) rattachées aux parcelles → copro_{dept}.parquet.

Pourquoi : DVF ne dit RIEN de la copropriété d'un appartement vendu (taille, âge, gestion).
Le RNIC publie chaque copropriété immatriculée avec ses références cadastrales — au même
format 14 caractères que `id_parcelle` DVF (insee+prefixe+section+numero) → jointure DIRECTE
par parcelle, sans géocodage ni pivot bâtiment. C'est le seul croisement open data qui donne
le nombre de lots d'habitation (taille de copro = facteur d'appartement), la période de
construction déclarée au règlement, et le type de syndic.

Source : https://www.data.gouv.fr/datasets/registre-national-dimmatriculation-des-coproprietes
(CSV national ~430 Mo, actualisation quotidienne, URL stable par resource-id). Le brut national
est téléchargé une fois et partagé entre départements.

Grain de sortie : une ligne par (id_parcelle, numero_immatriculation) du département.
Une parcelle peut porter plusieurs copropriétés (grands ensembles) ; l'agrégation par
parcelle est faite à la construction des comparables (copro la plus grande + compte).

Usage : uv run python -m telechargement.preparer_copro [DEPT] [--force]
"""
from __future__ import annotations

import sys
from pathlib import Path

import polars as pl

from telechargement._telechargement import download

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"

# URL stable data.gouv (suit la dernière actualisation quotidienne).
URL_RNIC = "https://www.data.gouv.fr/fr/datasets/r/3ea8e2c3-0038-464a-b17e-cd5c91f65ce2"

COLONNES = [
    "numero_immatriculation", "nom_usage_copropriete", "type_syndic", "mandat_en_cours",
    "residence_service", "periode_construction",
    "nombre_total_lots", "nombre_lots_habitation", "nombre_lots_stationnement",
    "nom_qp_2024",
    "reference_cadastrale_1", "reference_cadastrale_2", "reference_cadastrale_3",
]


def preparer_copro(dept: str, *, force: bool = False) -> Path:
    dest = INTERIM / f"copro_{dept}.parquet"
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"✓ {dest.name} (existe déjà — --force pour régénérer)")
        return dest

    brut = download(URL_RNIC, RAW / "rnic_national.csv", force=force)

    # Le national fait ~430 Mo : lecture paresseuse, projection immédiate, filtre département
    # sur le préfixe des références cadastrales (l'insee est les 5 premiers caractères).
    lf = (
        pl.scan_csv(brut, infer_schema=False)
        .select(COLONNES)
        .unpivot(
            index=[c for c in COLONNES if not c.startswith("reference_cadastrale")],
            on=["reference_cadastrale_1", "reference_cadastrale_2", "reference_cadastrale_3"],
            value_name="id_parcelle",
        )
        .drop("variable")
        .filter(pl.col("id_parcelle").str.starts_with(dept) & (pl.col("id_parcelle").str.len_chars() == 14))
        .with_columns(
            pl.col("nombre_total_lots").cast(pl.Int32, strict=False),
            pl.col("nombre_lots_habitation").cast(pl.Int32, strict=False),
            pl.col("nombre_lots_stationnement").cast(pl.Int32, strict=False),
        )
        .unique(subset=["id_parcelle", "numero_immatriculation"])
    )
    frame = lf.collect()

    INTERIM.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".parquet.tmp")
    # Trié par parcelle : jointures et lookups serveur prunables par row-group.
    frame.sort("id_parcelle").write_parquet(tmp, compression="zstd")
    tmp.rename(dest)
    print(f"  → {dest.name} : {frame.height:,} liens (parcelle, copro), "
          f"{frame['numero_immatriculation'].n_unique():,} copropriétés ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def main(dept: str) -> None:
    preparer_copro(dept, force="--force" in sys.argv)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0] if args else "33")
