"""Crosswalk DIRECT parcelle↔adresse d'un département → GeoParquet.

Lien cadastral natif DGFiP, **sans pivot RNB** : une parcelle (même un jardin ou un terrain
sans bâtiment référencé) reçoit l'adresse qui y est enregistrée. Comble le trou du pivot RNB
(qui n'adresse une parcelle que si elle porte un bâtiment RNB lui-même adressé).

Deux sources fusionnées (spike de joignabilité 33 : 94,6 % des parcelles DVF par le cadastre,
+64 k parcelles par l'apport BAN — cf. docs/SOURCES_DONNEES) :
  - **cadastre** « Adresses extraites du cadastre » NDJSON-full, champ `codesParcelles`
    (source primaire, porte `destinationPrincipale`) ;
  - **BAN** colonne `cad_parcelles` (supplément : adresses que le cadastre n'extrait pas — lien
    cadastral natif, pas une supposition x/y ; code postal natif, sans destination).

Source unique du lien direct ; consommé par le POC (endpoint /api/parcelle-adresses). On ne
résout QUE le lien direct (palier « parcelle » du pattern piscines) : pas d'inférence
géométrique adjacent/proximité. En immeuble une parcelle peut porter >1 adresse : on les garde
toutes (on ne prétend pas désigner un lot précis).

Produit (idempotent) :
  data/raw/      adresses-cadastre-{dept}.ndjson.gz
  data/interim/  parcelle_adresse_{dept}.parquet
                 (id_parcelle, numero, voie, code_postal, ville, code_insee, lon, lat,
                  destination, source) — une ligne par (parcelle, adresse).

Usage : uv run python -m telechargement.preparer_adresses_parcelle [DEPT]   (défaut 33)
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import polars as pl

from telechargement._telechargement import download

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
NDJSON_URL = ("https://adresse.data.gouv.fr/data/adresses-cadastre/latest/"
              "ndjson-full/adresses-cadastre-{dept}.ndjson.gz")

SCHEMA = ["id_parcelle", "numero", "voie", "code_postal", "ville",
          "code_insee", "lon", "lat", "destination", "source"]


def _commune_lookup(ban_src: Path) -> dict[str, tuple[str, str]]:
    """code_insee → (code_postal, nom_commune) le plus fréquent. Le NDJSON cadastre ne porte
    QUE l'INSEE : on résout le code postal d'affichage via BAN, au niveau commune (suffisant
    pour l'affichage ; un code postal voie-niveau serait plus précis mais inutilement lourd)."""
    df = (pl.read_csv(ban_src, separator=";", infer_schema_length=0,
                      columns=["code_insee", "code_postal", "nom_commune"])
          .drop_nulls("code_insee"))
    top = (df.group_by(["code_insee", "code_postal", "nom_commune"]).agg(pl.len().alias("n"))
             .sort("n", descending=True)
             .group_by("code_insee").agg(pl.first("code_postal"), pl.first("nom_commune")))
    return {r["code_insee"]: (r["code_postal"] or "", r["nom_commune"] or "")
            for r in top.iter_rows(named=True)}


def _norm(col: str) -> pl.Expr:
    """Forme canonique pour COMPARAISON uniquement (jamais affichée) : lettres accentuées →
    non accentuées, minuscule, tout caractère non alphanumérique → espace, **runs d'espaces
    réduits à un seul** (le `+`), bords élagués (`strip_chars`). « Impasse de Péchauriol Est »
    et « Impasse de Péchauriol-est » → `impasse de pechauriol est` → la même adresse vue par
    cadastre et BAN ne compte qu'une fois ; les séparations de mots restent lisibles."""
    return (pl.col(col).fill_null("").str.normalize("NFKD").str.replace_all(r"\p{M}", "")
            .str.to_lowercase().str.replace_all(r"[^a-z0-9]+", " ").str.strip_chars())


def _harmoniser(df: pl.DataFrame) -> pl.DataFrame:
    """Déduplique à la SOURCE les adresses cadastre/BAN qui désignent la même adresse sur une
    parcelle (clé canonique numéro+voie+commune). Pour l'AFFICHAGE on garde le libellé **officiel
    de la BAN** quand il existe (BAN d'abord), tout en préservant la `destination` issue du
    cadastre. La forme normalisée ne sert qu'à la clé : elle n'est jamais conservée ni affichée.
    Une parcelle garde toutes ses adresses RÉELLEMENT distinctes ; seuls les doublons tombent."""
    return (
        df.with_columns(
            _cle=pl.concat_str([_norm("numero"), _norm("voie"),
                                pl.col("code_insee").fill_null("")], separator="|"))
        .sort(pl.col("source") != "ban")  # BAN (False) trié avant cadastre → libellés BAN priment
        .group_by("id_parcelle", "_cle", maintain_order=True)
        .agg(
            pl.col("numero").first(), pl.col("voie").first(),
            pl.col("code_postal").first(), pl.col("ville").first(),
            pl.col("code_insee").first(), pl.col("lon").first(), pl.col("lat").first(),
            pl.col("destination").drop_nulls().first(),  # destination = attribut cadastre, préservé
            pl.col("source").first(),  # provenance du libellé affiché (ban si dispo, sinon cadastre)
        )
        .drop("_cle")
        .select(SCHEMA)
    )


def _from_cadastre(nd: Path, communes: dict[str, tuple[str, str]]) -> pl.DataFrame:
    rows = []
    with gzip.open(nd, "rt") as f:
        for line in f:
            r = json.loads(line)
            codes = r.get("codesParcelles") or []
            if not codes:
                continue
            pos = r.get("meilleurePosition") or (r["positions"][0] if r.get("positions") else None)
            if not pos:
                continue
            lon, lat = pos["geometry"]["coordinates"]
            insee = r.get("codeCommune") or ""
            cp, ville = communes.get(insee, ("", ""))
            numero = f"{(r.get('numero') or '').strip()}{(r.get('repetition') or '').strip()}".strip()
            base = {"numero": numero, "voie": (r.get("nomVoie") or "").strip(),
                    "code_postal": cp, "ville": ville, "code_insee": insee,
                    "lon": float(lon), "lat": float(lat),
                    "destination": r.get("destinationPrincipale"), "source": "cadastre"}
            for p in codes:
                rows.append({"id_parcelle": p, **base})
    return pl.DataFrame(rows, schema={c: (pl.Float64 if c in ("lon", "lat") else pl.Utf8)
                                      for c in SCHEMA}) if rows else pl.DataFrame(schema=SCHEMA)


def _from_ban(ban_src: Path) -> pl.DataFrame:
    return (
        pl.read_csv(ban_src, separator=";", infer_schema_length=0,
                    columns=["cad_parcelles", "numero", "rep", "nom_voie",
                             "code_postal", "code_insee", "nom_commune", "lon", "lat"])
        .filter(pl.col("cad_parcelles").is_not_null() & (pl.col("cad_parcelles") != ""))
        .with_columns(pl.col("cad_parcelles").str.split("|"))
        .explode("cad_parcelles")
        .filter(pl.col("cad_parcelles") != "")
        .select(
            pl.col("cad_parcelles").alias("id_parcelle"),
            pl.concat_str([pl.col("numero").fill_null(""), pl.col("rep").fill_null("")])
              .str.strip_chars().alias("numero"),
            pl.col("nom_voie").fill_null("").alias("voie"),
            pl.col("code_postal").fill_null("").alias("code_postal"),
            pl.col("nom_commune").fill_null("").alias("ville"),
            pl.col("code_insee").fill_null("").alias("code_insee"),
            pl.col("lon").cast(pl.Float64, strict=False),
            pl.col("lat").cast(pl.Float64, strict=False),
            pl.lit(None, dtype=pl.Utf8).alias("destination"),
            pl.lit("ban").alias("source"),
        )
        .drop_nulls(["lon", "lat"])
    )


def _nonvide(path: Path) -> bool:
    """Le parquet existe ET porte ≥1 ligne (un run interrompu peut laisser un fichier
    vide/tronqué de taille >0 que `_verifier` ne détecterait pas — on le rebâtit alors)."""
    try:
        return pl.scan_parquet(path).select(pl.len()).collect().item() > 0
    except Exception:
        return False


def main(dept: str) -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    dest = INTERIM / f"parcelle_adresse_{dept}.parquet"
    if dest.exists() and _nonvide(dest):
        print(f"✓ {dest.name}")
        return
    dest.unlink(missing_ok=True)  # cache vide/corrompu : on repart de zéro plutôt que de le servir

    ban_src = RAW / f"ban_{dept}.csv.gz"
    if not ban_src.exists():
        raise FileNotFoundError(
            f"BAN absente pour le dept {dept} ({ban_src}) — prérequis du crosswalk "
            f"parcelle↔adresse. Lancer telechargement.preparer_donnees d'abord.")
    try:
        nd = download(NDJSON_URL.format(dept=dept), RAW / f"adresses-cadastre-{dept}.ndjson.gz")
    except Exception as e:  # 404 dept inexistant, réseau, gzip corrompu… : on échoue net et clair.
        raise RuntimeError(
            f"Adresses-cadastre du dept {dept} indisponibles "
            f"({NDJSON_URL.format(dept=dept)}) : {type(e).__name__}: {e}. "
            f"Crosswalk parcelle↔adresse NON construit pour ce département.") from e

    communes = _commune_lookup(ban_src)
    cad = _from_cadastre(nd, communes)
    ban = _from_ban(ban_src)
    # Refus explicite d'un crosswalk partiel : chaque source DOIT contribuer (toute la France a
    # des codesParcelles cadastre ET des cad_parcelles BAN). 0 ligne ⇒ fichier corrompu / format
    # changé ⇒ on échoue plutôt que de produire un parquet trompeur servi tel quel par l'app.
    if cad.is_empty():
        raise RuntimeError(
            f"0 lien parcelle↔adresse extrait du NDJSON cadastre du dept {dept} ({nd}) — "
            f"fichier corrompu ou format changé. Refus de produire un crosswalk partiel.")
    if ban.is_empty():
        raise RuntimeError(
            f"0 lien `cad_parcelles` dans la BAN du dept {dept} ({ban_src}) — source incomplète. "
            f"Refus de produire un crosswalk partiel.")
    brut = pl.concat([cad, ban], how="vertical")
    df = _harmoniser(brut)

    tmp = dest.with_suffix(".parquet.tmp")
    tmp.unlink(missing_ok=True)
    df.write_parquet(tmp)
    tmp.rename(dest)  # atomique : jamais de parquet partiel pris pour complet à la reprise

    n_cad = int((df["source"] == "cadastre").sum())
    print(f"  → {dest.name} : {df.height:,} liens "
          f"({df['id_parcelle'].n_unique():,} parcelles ; cadastre {n_cad:,} + BAN {df.height - n_cad:,}"
          f" ; {brut.height - df.height:,} doublons inter-sources retirés)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "33")
