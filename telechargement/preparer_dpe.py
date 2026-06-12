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

# Schéma cible commun : signal/ajustement énergétique + rattachement + caractérisation fine.
# Les champs « riches » post-2021 (étage, conso/GES chiffrées, validité, adresse BAN affichable)
# sont null en pré-2021 mais précieux côté appli : on les garde au lieu de les projeter à la poubelle.
COMMON = [
    "numero_dpe", "source_dpe", "date_etablissement", "date_fin_validite",
    "type_batiment", "surface_habitable", "etage",
    "annee_construction", "periode_construction",
    "etiquette_energie", "etiquette_ges", "dpe_vierge",
    "conso_ep_m2", "emission_ges_m2",
    "type_energie_principale",
    "id_rnb", "identifiant_ban", "adresse_ban", "score_ban",
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
        pl.lit(None, dtype=pl.Date).alias("date_fin_validite"),
        pl.when(tb == "MAISON INDIVIDUELLE").then(pl.lit("maison"))
          .when(tb == "LOGEMENT").then(pl.lit("appartement"))
          .when(tb.str.starts_with("BATIMENT COLLECTIF")).then(pl.lit("immeuble"))
          .otherwise(None).alias("type_batiment"),
        surface.alias("surface_habitable"),
        pl.lit(None, dtype=pl.Int32).alias("etage"),
        annee.alias("annee_construction"),
        _periode(annee).alias("periode_construction"),
        pl.when(vierge).then(None).otherwise(_classe("classe_consommation_energie")).alias("etiquette_energie"),
        pl.when(vierge).then(None).otherwise(_classe("classe_estimation_ges")).alias("etiquette_ges"),
        vierge.alias("dpe_vierge"),
        pl.lit(None, dtype=pl.Float64).alias("conso_ep_m2"),
        pl.lit(None, dtype=pl.Float64).alias("emission_ges_m2"),
        pl.lit(None, dtype=pl.Utf8).alias("type_energie_principale"),
        pl.lit(None, dtype=pl.Utf8).alias("id_rnb"),
        pl.lit(None, dtype=pl.Utf8).alias("identifiant_ban"),
        pl.lit(None, dtype=pl.Utf8).alias("adresse_ban"),
        pl.lit(None, dtype=pl.Float64).alias("score_ban"),
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
        pl.col("date_fin_validite_dpe").str.slice(0, 10)
          .str.to_date("%Y-%m-%d", strict=False).alias("date_fin_validite"),
        pl.col("type_batiment").str.to_lowercase().str.strip_chars().alias("type_batiment"),
        _surface_clip(pl.col("surface_habitable_logement").cast(pl.Float64, strict=False)).alias("surface_habitable"),
        pl.col("numero_etage_appartement").cast(pl.Float64, strict=False)
          .cast(pl.Int32, strict=False).alias("etage"),
        annee.alias("annee_construction"),
        pl.coalesce(pl.col("periode_construction").cast(pl.Utf8), _periode(annee)).alias("periode_construction"),
        _classe("etiquette_dpe").alias("etiquette_energie"),
        _classe("etiquette_ges").alias("etiquette_ges"),
        pl.lit(False).alias("dpe_vierge"),
        pl.col("conso_5_usages_par_m2_ep").cast(pl.Float64, strict=False).alias("conso_ep_m2"),
        pl.col("emission_ges_5_usages_par_m2").cast(pl.Float64, strict=False).alias("emission_ges_m2"),
        _energie("type_energie_principale_chauffage").alias("type_energie_principale"),
        pl.col("id_rnb").cast(pl.Utf8).alias("id_rnb"),
        pl.col("identifiant_ban").cast(pl.Utf8).alias("identifiant_ban"),
        pl.col("adresse_ban").cast(pl.Utf8).alias("adresse_ban"),
        pl.col("score_ban").cast(pl.Float64, strict=False).alias("score_ban"),
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


def _resoudre_rnb(frame: pl.DataFrame, dept: str) -> pl.DataFrame:
    """Complète `id_rnb` pour les DPE non rattachés par l'ADEME + qualifie le lien (`rnb_lien`).

    L'ADEME ne fournit un id_rnb que sur ~47 % des DPE post-2021, et jamais en pré-2021 —
    or TOUTE la chaîne aval (comparables, /api/dpe) joint sur id_rnb : un DPE sans id_rnb
    est invisible. Trois niveaux de rattachement, du plus sûr au plus interprété
    (mesuré dept 33, cf. docs/SOURCES_DONNEES.md §11) :

      ademe    id_rnb fourni par l'ADEME                                   (post-2021)
      cle_ban  identifiant_ban == RNB.cle_interop_ban, clé MONO-bâtiment   (+117 k candidats,
               70,9 % des clés RNB sont mono-bâtiment → lien sans ambiguïté)
      spatial  plus proche bâtiment RNB ≤ 15 m, géocodage 'precise'        (+104 k pré-2021,
               distance médiane 12,1 m ; seuil serré pour éviter le bâtiment voisin)

    `rnb_lien` (ademe | cle_ban | spatial | null) et `rnb_dist_m` (spatial) sont exposés
    jusqu'à l'appli pour accompagner chaque DPE d'un avertissement de fiabilité honnête.
    """
    adr_path = INTERIM / f"rnb_adr_{dept}.parquet"
    pts_path = INTERIM / f"rnb_points_{dept}.parquet"
    if not adr_path.exists() or not pts_path.exists():
        print(f"  ⚠ rnb_adr/rnb_points absents pour {dept} : id_rnb ADEME seul (pas de récupération)")
        return frame.with_columns(
            pl.when(pl.col("id_rnb").is_not_null()).then(pl.lit("ademe")).otherwise(None).alias("rnb_lien"),
            pl.lit(None, dtype=pl.Float64).alias("rnb_dist_m"),
        )

    import time

    import duckdb

    t0 = time.monotonic()
    con = duckdb.connect()
    con.register("dpe", frame)
    print("  rattachement RNB : clés BAN mono-bâtiment…", flush=True)
    con.execute(f"""
        CREATE TEMP TABLE cle_mono AS
        SELECT cle_interop_ban AS cle, any_value(rnb_id) AS rnb_id
        FROM read_parquet('{adr_path}')
        GROUP BY 1 HAVING count(DISTINCT rnb_id) = 1
    """)
    print(f"  rattachement RNB : spatial ≤ 15 m (grille équi-jointe)… [{time.monotonic() - t0:.0f}s]", flush=True)
    # Spatial : uniquement les DPE encore orphelins, géocodés à l'adresse (grille ~111 m puis
    # haversine). ⚠ La fenêtre 3×3 est faite en ÉQUI-jointure : chaque DPE est dupliqué sur ses
    # 9 cellules voisines puis joint par hachage sur (gx, gy). Un `BETWEEN gx-1 AND gx+1` en
    # condition de jointure dégénère en range-join quasi cartésien sur 200 k × 1,1 M points
    # (mesuré : >30 min CPU à fond) ; l'équi-jointure fait le même travail en quelques secondes.
    con.execute(f"""
        CREATE TEMP TABLE spatial AS
        WITH q AS (
            SELECT d.numero_dpe, d.longitude AS lon, d.latitude AS lat,
                   CAST(floor(d.longitude * 1000) AS INT) gx, CAST(floor(d.latitude * 1000) AS INT) gy
            FROM dpe d
            LEFT JOIN cle_mono c ON d.identifiant_ban = c.cle
            WHERE d.id_rnb IS NULL AND c.rnb_id IS NULL
              AND d.geo_precision = 'precise' AND d.longitude IS NOT NULL
        ),
        q9 AS (
            SELECT q.*, q.gx + dx.v AS jx, q.gy + dy.v AS jy
            FROM q
            CROSS JOIN (VALUES (-1), (0), (1)) dx(v)
            CROSS JOIN (VALUES (-1), (0), (1)) dy(v)
        ),
        p AS (
            SELECT rnb_id, lon, lat,
                   CAST(floor(lon * 1000) AS INT) gx, CAST(floor(lat * 1000) AS INT) gy
            FROM read_parquet('{pts_path}')
        ),
        cand AS (
            SELECT q9.numero_dpe, p.rnb_id,
                   2 * 6371000 * asin(sqrt(power(sin(radians(p.lat - q9.lat) / 2), 2)
                       + cos(radians(q9.lat)) * cos(radians(p.lat))
                         * power(sin(radians(p.lon - q9.lon) / 2), 2))) AS d
            FROM q9 JOIN p ON p.gx = q9.jx AND p.gy = q9.jy
        )
        SELECT numero_dpe, arg_min(rnb_id, d) AS rnb_id, round(min(d), 1) AS dist_m
        FROM cand GROUP BY 1 HAVING min(d) <= 15
    """)
    resolu = con.sql("""
        SELECT d.* EXCLUDE (id_rnb),
               COALESCE(d.id_rnb, c.rnb_id, s.rnb_id) AS id_rnb,
               CASE WHEN d.id_rnb IS NOT NULL THEN 'ademe'
                    WHEN c.rnb_id IS NOT NULL THEN 'cle_ban'
                    WHEN s.rnb_id IS NOT NULL THEN 'spatial'
               END AS rnb_lien,
               s.dist_m AS rnb_dist_m
        FROM dpe d
        LEFT JOIN cle_mono c ON d.id_rnb IS NULL AND d.identifiant_ban = c.cle
        LEFT JOIN spatial s ON d.numero_dpe = s.numero_dpe
    """).pl()
    con.close()

    stats = resolu.group_by("rnb_lien").len().sort("rnb_lien")
    detail = " · ".join(f"{r['rnb_lien'] or 'non_rattache'} {r['len']:,}" for r in stats.iter_rows(named=True))
    print(f"  rattachement RNB : {detail}  [{time.monotonic() - t0:.0f}s]", flush=True)
    return resolu


def preparer_dpe(dept: str, *, force: bool = False, refetch: bool = False) -> Path:
    """`force` régénère le MIX local (projection, dédup, résolution id_rnb) depuis les
    sources déjà téléchargées ; `refetch` re-télécharge aussi les sources (API ADEME =
    des heures). Les deux sont découplés pour qu'un changement de logique locale ne
    déclenche jamais un re-fetch complet par accident."""
    dest = INTERIM / f"dpe_{dept}.parquet"
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"✓ {dest.name} (existe déjà — --force pour régénérer)")
        return dest

    print(f"\n── DPE final — dept {dept} ──")
    post_path = recuperer_post(dept, force=refetch)        # API (résumable)
    post = _project_post(pl.read_parquet(post_path), dept)
    pre = _project_pre(_fetch_pre2021(dept), dept)         # S3 (pansement)
    print(f"  pré-2021 : {pre.height:,}  ·  post-2021 : {post.height:,}")

    frame, retires = _mix_dedup(pre, post)
    print(f"  doublons inter-millésime (maisons) retirés : {retires:,}  →  final {frame.height:,} DPE")

    frame = _resoudre_rnb(frame, dept)

    INTERIM.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".parquet.tmp")
    # Trié par id_rnb : le serveur requête `WHERE id_rnb = ?` → les statistiques de
    # row-groups parquet éliminent l'essentiel du fichier sans le lire.
    frame.sort("id_rnb", nulls_last=True).write_parquet(tmp, compression="zstd")
    tmp.rename(dest)
    print(f"  → {dest.name} ({frame.height:,} DPE, {len(frame.columns)} colonnes, {dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def main(dept: str) -> None:
    preparer_dpe(dept, force="--force" in sys.argv, refetch="--refetch" in sys.argv)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0] if args else "33")
