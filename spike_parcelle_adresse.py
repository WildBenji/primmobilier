"""SPIKE JETABLE — mesure de joignabilité parcelle↔adresse (doctrine ADR 0001).

Question : avant de câbler le crosswalk `codesParcelles` + BAN `cad_parcelles` dans la
chaîne (pour l'afficher au clic parcelle), quelle est la COUVERTURE réelle — combien de
parcelles ont ≥1 adresse rattachée par lien DIRECT (sans pivot RNB) ?

L'ADR 0003 a écarté `cad_parcelles` à 16% des parcelles DVF — mais (a) pour un AUTRE usage
(crosswalk DVF→RNB), et (b) BAN seul. Le pattern piscines prend le NDJSON cadastre
(`codesParcelles`, source DGFiP primaire) comme source, BAN n'étant qu'un supplément. On
re-mesure donc : cadastre seul, BAN seul, et la FUSION — sur tout le cadastre ET sur le
sous-ensemble DVF (comparable au 16% de l'ADR 0003).

Usage : uv run python spike_parcelle_adresse.py 33
"""
from __future__ import annotations

import gzip
import json
import sys
import urllib.request
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
NDJSON_URL = ("https://adresse.data.gouv.fr/data/adresses-cadastre/latest/"
              "ndjson-full/adresses-cadastre-{dept}.ndjson.gz")


def _pct(n: int, d: int) -> str:
    return f"{n:>10,} / {d:>10,}  ({100*n/d:5.1f}%)" if d else f"{n:,} / 0"


def main(dept: str) -> None:
    # 1. Dénominateurs : toutes les parcelles du dept + sous-ensemble DVF (maison/appart).
    parcelles = set(
        pl.read_parquet(INTERIM / f"cadastre_parcelles_{dept}.parquet", columns=["id"])
        .get_column("id").to_list())
    dvf_parcelles = set(
        pl.read_parquet(INTERIM / f"dvf_{dept}.parquet", columns=["id_parcelle", "type_local"])
        .filter(pl.col("type_local").is_in(["Maison", "Appartement"]))
        .get_column("id_parcelle").drop_nulls().to_list())
    print(f"Parcelles cadastre : {len(parcelles):,}  ·  parcelles DVF (maison/appart) : {len(dvf_parcelles):,}\n")

    # 2. Cadastre NDJSON `codesParcelles` (source primaire DGFiP) — télécharge si absent.
    nd = RAW / f"adresses-cadastre-{dept}.ndjson.gz"
    if not nd.exists():
        print(f"Téléchargement {nd.name}…")
        urllib.request.urlretrieve(NDJSON_URL.format(dept=dept), nd)
        print(f"  → {nd.stat().st_size/1e6:.1f} MB")
    cad_by_parcelle: dict[str, int] = {}
    n_addr_cad = 0
    with gzip.open(nd, "rt") as f:
        for line in f:
            r = json.loads(line)
            codes = r.get("codesParcelles") or []
            if codes:
                n_addr_cad += 1
            for p in codes:
                cad_by_parcelle[p] = cad_by_parcelle.get(p, 0) + 1
    cad_set = set(cad_by_parcelle)

    # 3. BAN `cad_parcelles` (supplément) — lien cadastral natif, pipe-séparé.
    ban = pl.read_csv(RAW / f"ban_{dept}.csv.gz", separator=";", infer_schema_length=0,
                      columns=["cad_parcelles"]).get_column("cad_parcelles")
    ban_by_parcelle: dict[str, int] = {}
    for v in ban.drop_nulls().to_list():
        for p in v.split("|"):
            if p:
                ban_by_parcelle[p] = ban_by_parcelle.get(p, 0) + 1
    ban_set = set(ban_by_parcelle)
    fusion = cad_set | ban_set

    # 4. Couverture — sur tout le cadastre ET sur le sous-ensemble DVF.
    def covered(src: set[str], denom: set[str]) -> int:
        return len(src & denom)

    print("── Couverture sur TOUTES les parcelles cadastre " + "─" * 24)
    print(f"  cadastre codesParcelles : {_pct(covered(cad_set, parcelles), len(parcelles))}")
    print(f"  BAN cad_parcelles       : {_pct(covered(ban_set, parcelles), len(parcelles))}")
    print(f"  FUSION (union)          : {_pct(covered(fusion, parcelles), len(parcelles))}")

    print("\n── Couverture sur les parcelles DVF (comparable ADR 0003 = 16%) " + "─" * 8)
    print(f"  cadastre codesParcelles : {_pct(covered(cad_set, dvf_parcelles), len(dvf_parcelles))}")
    print(f"  BAN cad_parcelles       : {_pct(covered(ban_set, dvf_parcelles), len(dvf_parcelles))}")
    print(f"  FUSION (union)          : {_pct(covered(fusion, dvf_parcelles), len(dvf_parcelles))}")

    # 5. Apport marginal BAN au-dessus du cadastre + multiplicité.
    ban_only = (ban_set - cad_set) & parcelles
    print(f"\n  Apport marginal BAN (parcelles couvertes par BAN mais PAS cadastre) : {len(ban_only):,}")
    multi_cad = sum(1 for c in cad_by_parcelle.values() if c > 1)
    print(f"  Parcelles cadastre avec >1 adresse (ambiguïté logement) : {multi_cad:,} / {len(cad_set):,}")
    print(f"  Adresses cadastre rattachées à ≥1 parcelle : {n_addr_cad:,}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
