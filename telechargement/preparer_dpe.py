"""Construit le fichier DPE FINAL d'un département : mix pré-2021 + post-2021 → dpe_{dept}.parquet.

C'est LE fichier qui sert l'appli (signal/ajustement énergétique + rattachement au bien), au même
titre que dvf_/cadastre_/rnb_. On récupère au fur et à mesure, on mixe selon nos besoins, on écrit
en local — et c'est ce fichier local, lui seul, que l'appli consomme.

Sources de récupération (jamais lues au runtime — uniquement pour BÂTIR ce fichier) :
  • post-2021 : API ADEME data-fair via `recuperer_dpe_post2021` (serveur lent → fetch résumable) ;
  • pré-2021  : parquet S3 d'enrichissement (PANSEMENT TEMPORAIRE, pas un accès prod ; figé déc. 2022).

Nettoyage / harmonisation (mesuré sur le 33, cf. docs/EXPLORATION_DPE.md) — les deux sources sont
projetées sur un schéma cible commun resserré, avec les MÊMES règles :
  • surface_habitable : base habitable (pré : fallback `surface_thermique_lot`) clippée [8, 1000] m²
    sinon null (le pré montait à 69 052 m², avait des ≤0) ;
  • annee_construction : clampée [1700, année courante] sinon null (le pré avait 0 et 32767/overflow,
    le post 1300/2099) ;
  • periode_construction : signal d'âge unifié — post = tranche native ; pré = dérivée de l'année
    nettoyée ; mêmes 10 tranches (le post a 46 % d'`annee` nulle mais sa `periode` est remplie) ;
  • etiquette_energie/ges : A-G uniquement (le pré traîne un `N` = DPE vierge → null) ;
  • dpe_vierge : flag conservé (pré ~13 % vierges, sans donnée énergie → l'appli les exclut du signal) ;
  • type_energie_principale : 14 libellés ADEME normalisés en tokens (electricite, gaz_naturel, …) ;
  • coords WGS84 (post via `_geopoint`, pré natif) ; hors France métropolitaine → null ;
  • geo_precision : precise (housenumber/adresse) / coarse (rue, interpolation) / none (sans coords) ;
  • DÉDUP inter-millésime : un logement diagnostiqué avant ET après 2021 n'a pas d'identifiant commun
    (le pré n'a ni `numero_dpe` partagé, ni `identifiant_ban`/`id_rnb`). Restreinte aux MAISONS
    (coords ~11 m + surface = un logement unique) ; en collectif la géo ne distingue pas les logements
    empilés (mesuré : 257 k appartements distincts fusionnés à tort) → jamais fusionnés. Garde le
    DPE le plus récent.

Usage : uv run python -m telechargement.preparer_dpe [DEPT] [--force]
"""
from __future__ import annotations

import subprocess
import sys
from datetime import date
from pathlib import Path

import polars as pl

from telechargement.recuperer_dpe_post2021 import recuperer as recuperer_post

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"

S3_PRE = ("s3://prod-klarsen-enrichissement/athena_tables/"
          "diagnostic-performance-energie/dpe-pre-2021")

ANNEE_MAX = date.today().year
_CLASSES = ["A", "B", "C", "D", "E", "F", "G"]

# Schéma cible commun : uniquement ce qui sert au signal/ajustement énergétique + rattachement.
COMMON = [
    "numero_dpe", "source_dpe", "date_etablissement",
    "type_batiment", "surface_habitable",
    "annee_construction", "periode_construction",
    "etiquette_energie", "etiquette_ges", "dpe_vierge",
    "type_energie_principale",
    "id_rnb", "identifiant_ban",
    "code_insee", "code_postal", "code_departement", "nom_commune",
    "latitude", "longitude", "geo_precision",
]


# ── helpers de nettoyage (mêmes règles pour les deux sources) ──

def _classe(col: str) -> pl.Expr:
    """Étiquette → A-G validée, sinon null (élimine le `N` vierge et les parasites pré-2021)."""
    c = pl.col(col).cast(pl.Utf8).str.to_uppercase().str.strip_chars()
    return pl.when(c.is_in(_CLASSES)).then(c).otherwise(None)


def _surface_clip(expr: pl.Expr) -> pl.Expr:
    """Surface d'un logement réaliste : hors [8, 1000] m² → null."""
    return pl.when((expr >= 8) & (expr <= 1000)).then(expr).otherwise(None)


def _annee_clip(expr: pl.Expr) -> pl.Expr:
    """Année de construction plausible : hors [1700, année courante] → null."""
    return pl.when((expr >= 1700) & (expr <= ANNEE_MAX)).then(expr).otherwise(None)


def _periode(annee: pl.Expr) -> pl.Expr:
    """Année nettoyée → 1 des 10 tranches ADEME (mêmes libellés que `periode_construction` post)."""
    return (
        pl.when(annee.is_null()).then(None)
        .when(annee < 1948).then(pl.lit("avant 1948"))
        .when(annee <= 1974).then(pl.lit("1948-1974"))
        .when(annee <= 1977).then(pl.lit("1975-1977"))
        .when(annee <= 1982).then(pl.lit("1978-1982"))
        .when(annee <= 1988).then(pl.lit("1983-1988"))
        .when(annee <= 2000).then(pl.lit("1989-2000"))
        .when(annee <= 2005).then(pl.lit("2001-2005"))
        .when(annee <= 2012).then(pl.lit("2006-2012"))
        .when(annee <= 2021).then(pl.lit("2013-2021"))
        .otherwise(pl.lit("après 2021"))
    )


def _energie(col: str) -> pl.Expr:
    """14 libellés ADEME → tokens (robuste aux accents/tirets via mots-clés en minuscule)."""
    e = pl.col(col).cast(pl.Utf8).str.to_lowercase()
    return (
        pl.when(e.is_null()).then(None)
        .when(e.str.contains("bois")).then(pl.lit("bois"))
        .when(e.str.contains("lectric")).then(pl.lit("electricite"))
        .when(e.str.contains("gaz naturel")).then(pl.lit("gaz_naturel"))
        .when(e.str.contains("chauffage urbain") | e.str.contains("seau de chaleur")).then(pl.lit("reseau_chaleur"))
        .when(e.str.contains("froid urbain")).then(pl.lit("reseau_froid"))
        .when(e.str.contains("fioul")).then(pl.lit("fioul"))
        .when(e.str.contains("gpl") | e.str.contains("propane") | e.str.contains("butane")).then(pl.lit("gpl"))
        .when(e.str.contains("charbon")).then(pl.lit("charbon"))
        .otherwise(e)
    )


def _en_france(lat: pl.Expr, lon: pl.Expr) -> pl.Expr:
    """Coords dans la France métropolitaine (+ Corse). Hors bornes → considérées invalides
    (les 4 dépts du socle sont métropolitains ; un DOM serait à élargir ici)."""
    return (lat >= 41) & (lat <= 52) & (lon >= -5.5) & (lon <= 10)


def _fetch_pre2021(dept: str) -> pl.DataFrame:
    """Récupère le parquet pré-2021 du dept depuis S3 (pansement temporaire) → DataFrame brut."""
    dest = RAW / f"dpe_pre2021_{dept}"
    if not list(dest.glob("*.parquet")):
        dest.mkdir(parents=True, exist_ok=True)
        print(f"  pré-2021 : fetch S3 dept {dept}…", flush=True)
        subprocess.run(["aws", "s3", "cp", f"{S3_PRE}/departement={dept}/",
                        str(dest), "--recursive", "--quiet"], check=True)
    files = sorted(dest.glob("*.parquet"))
    if not files:
        raise RuntimeError(f"aucun parquet pré-2021 S3 pour le dept {dept} ({S3_PRE}/departement={dept}/)")
    return pl.concat([pl.read_parquet(f) for f in files], how="diagonal_relaxed")


def _project_pre(df: pl.DataFrame, dept: str) -> pl.DataFrame:
    annee = _annee_clip(pl.col("annee_construction").cast(pl.Int32, strict=False))
    surface = _surface_clip(pl.coalesce(pl.col("surface_habitable"),
                                        pl.col("surface_thermique_lot")).cast(pl.Float64, strict=False))
    lat, lon = pl.col("latitude").cast(pl.Float64, strict=False), pl.col("longitude").cast(pl.Float64, strict=False)
    france = _en_france(lat, lon)
    tb = pl.col("tr002_type_batiment_description")
    d = pl.col("date_etablissement_dpe")
    # DPE vierge = aucune évaluation énergétique fiable. Quand le flag est posé, la classe source
    # est un artefact (93 % de faux « A » mesurés sur le 33) → on annule l'étiquette pour ne pas
    # polluer le signal. Le flag reste, le bien reste (adresse/surface utiles).
    vierge = pl.col("dpe_vierge").cast(pl.Boolean, strict=False)
    return df.select(
        pl.col("numero_dpe").cast(pl.Utf8),
        pl.lit("pre_2021").alias("source_dpe"),
        pl.when(d == pl.date(1899, 12, 30)).then(None).otherwise(d).alias("date_etablissement"),
        pl.when(tb == "MAISON INDIVIDUELLE").then(pl.lit("maison"))
          .when(tb == "LOGEMENT").then(pl.lit("appartement"))
          .when(tb.str.starts_with("BATIMENT COLLECTIF")).then(pl.lit("immeuble"))
          .otherwise(None).alias("type_batiment"),
        surface.alias("surface_habitable"),
        annee.alias("annee_construction"),
        _periode(annee).alias("periode_construction"),
        pl.when(vierge).then(None).otherwise(_classe("classe_consommation_energie")).alias("etiquette_energie"),
        pl.when(vierge).then(None).otherwise(_classe("classe_estimation_ges")).alias("etiquette_ges"),
        vierge.alias("dpe_vierge"),
        pl.lit(None, dtype=pl.Utf8).alias("type_energie_principale"),
        pl.lit(None, dtype=pl.Utf8).alias("id_rnb"),
        pl.lit(None, dtype=pl.Utf8).alias("identifiant_ban"),
        pl.col("code_insee_commune_actualise").cast(pl.Utf8).alias("code_insee"),
        pl.col("code_postal").cast(pl.Utf8).alias("code_postal"),
        pl.lit(dept).alias("code_departement"),
        pl.col("commune").cast(pl.Utf8).alias("nom_commune"),
        pl.when(france).then(lat).otherwise(None).alias("latitude"),
        pl.when(france).then(lon).otherwise(None).alias("longitude"),
        pl.when(~france | lat.is_null()).then(pl.lit("none"))
          .when(pl.col("geo_type") == "housenumber").then(pl.lit("precise"))
          .otherwise(pl.lit("coarse")).alias("geo_precision"),
    )


def _project_post(df: pl.DataFrame, dept: str) -> pl.DataFrame:
    geo = pl.col("_geopoint").str.split(",")  # "lat,lon" (WGS84)
    lat, lon = geo.list.first().cast(pl.Float64, strict=False), geo.list.last().cast(pl.Float64, strict=False)
    france = _en_france(lat, lon)
    annee = _annee_clip(pl.col("annee_construction").cast(pl.Int32, strict=False))
    statut = pl.col("statut_geocodage").cast(pl.Utf8).str.to_lowercase()
    return df.select(
        pl.col("numero_dpe").cast(pl.Utf8),
        pl.lit("post_2021").alias("source_dpe"),
        pl.col("date_etablissement_dpe").str.slice(0, 10)
          .str.to_date("%Y-%m-%d", strict=False).alias("date_etablissement"),
        pl.col("type_batiment").str.to_lowercase().str.strip_chars().alias("type_batiment"),
        _surface_clip(pl.col("surface_habitable_logement").cast(pl.Float64, strict=False)).alias("surface_habitable"),
        annee.alias("annee_construction"),
        pl.coalesce(pl.col("periode_construction").cast(pl.Utf8), _periode(annee)).alias("periode_construction"),
        _classe("etiquette_dpe").alias("etiquette_energie"),
        _classe("etiquette_ges").alias("etiquette_ges"),
        pl.lit(False).alias("dpe_vierge"),
        _energie("type_energie_principale_chauffage").alias("type_energie_principale"),
        pl.col("id_rnb").cast(pl.Utf8).alias("id_rnb"),
        pl.col("identifiant_ban").cast(pl.Utf8).alias("identifiant_ban"),
        pl.col("code_insee_ban").cast(pl.Utf8).alias("code_insee"),
        pl.col("code_postal_ban").cast(pl.Utf8).alias("code_postal"),
        pl.lit(dept).alias("code_departement"),
        pl.col("nom_commune_ban").cast(pl.Utf8).alias("nom_commune"),
        pl.when(france).then(lat).otherwise(None).alias("latitude"),
        pl.when(france).then(lon).otherwise(None).alias("longitude"),
        pl.when(~france | lat.is_null()).then(pl.lit("none"))
          .when(statut.str.contains("adresse")).then(pl.lit("precise"))
          .otherwise(pl.lit("coarse")).alias("geo_precision"),
    )


def _mix_dedup(pre: pl.DataFrame, post: pl.DataFrame) -> tuple[pl.DataFrame, int]:
    """Union pré+post, puis dédup par coords (~11 m) + surface arrondie, en gardant le plus récent.

    ⚠ Restreint aux MAISONS : une maison = un logement unique à ces coords, donc une collision
    coords+surface y désigne le même bien re-diagnostiqué. En collectif c'est FAUX — tous les
    appartements d'un immeuble partagent le point géocodé du bâtiment et beaucoup ont une surface
    voisine (mesuré sur le 33 : la clé géo+surface fusionnait 257 k appartements DISTINCTS). On ne
    fusionne donc jamais `appartement`/`immeuble` ; on les garde tous (l'appli préférera le plus
    récent à l'affichage). Pareil pour les lignes sans coords/surface."""
    tous = pl.concat([pre.select(COMMON), post.select(COMMON)], how="vertical")
    est_maison = (pl.col("type_batiment") == "maison") & pl.col("latitude").is_not_null() \
        & pl.col("longitude").is_not_null() & pl.col("surface_habitable").is_not_null()
    maisons = tous.filter(est_maison)
    autres = tous.filter(~est_maison)
    dedup = (
        maisons.with_columns(_lat=pl.col("latitude").round(4), _lon=pl.col("longitude").round(4),
                             _surf=pl.col("surface_habitable").round(0))
        .sort("date_etablissement", descending=True, nulls_last=True)
        .unique(subset=["_lat", "_lon", "_surf"], keep="first")
        .drop("_lat", "_lon", "_surf")
    )
    retires = maisons.height - dedup.height
    return pl.concat([dedup, autres], how="vertical"), retires


def preparer_dpe(dept: str, *, force: bool = False) -> Path:
    dest = INTERIM / f"dpe_{dept}.parquet"
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"✓ {dest.name} (existe déjà — --force pour régénérer)")
        return dest

    print(f"\n── DPE final — dept {dept} ──")
    post_path = recuperer_post(dept, force=force)          # API (résumable)
    post = _project_post(pl.read_parquet(post_path), dept)
    pre = _project_pre(_fetch_pre2021(dept), dept)         # S3 (pansement)
    print(f"  pré-2021 : {pre.height:,}  ·  post-2021 : {post.height:,}")

    frame, retires = _mix_dedup(pre, post)
    print(f"  doublons inter-millésime (maisons) retirés : {retires:,}  →  final {frame.height:,} DPE")

    INTERIM.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".parquet.tmp")
    frame.write_parquet(tmp, compression="zstd")
    tmp.rename(dest)
    print(f"  → {dest.name} ({frame.height:,} DPE, {len(frame.columns)} colonnes, {dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def main(dept: str) -> None:
    preparer_dpe(dept, force="--force" in sys.argv)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0] if args else "33")
