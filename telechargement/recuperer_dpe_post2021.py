"""Récupère les DPE post-2021 d'un département via l'API ADEME data-fair → parquet local.

Le serveur ADEME est lent et instable sur de gros volumes : un département peut demander
beaucoup de pages, et la connexion peut tomber / être throttlée en cours de route. Ce script
est donc conçu pour la ROBUSTESSE, pas la vitesse brute :

  • RÉSUMABLE — le curseur `next` est checkpointé sur disque (`_state.json`) après CHAQUE page,
    et chaque page est écrite immédiatement en part parquet. Si le run s'interrompt (réseau,
    throttling, machine éteinte, Ctrl-C), on le relance et il reprend EXACTEMENT où il en était.
    Un run de plusieurs heures — voire jours — survit à n'importe quelle coupure.
  • DÉBIT — `select` réduit les 230 champs aux ~30 utiles à l'appli : c'est le principal levier
    de vitesse (payload divisé d'autant). Pagination par CURSEUR `next` (jamais `page`, plafonné
    et lent). Le `select` est intersecté avec le schéma réel → pas de 400 si un champ disparaît.
  • RÉSILIENCE — retry + backoff exponentiel sur timeout / 5xx / 429.

Méthode vérifiée le 2026-06-12 (cf. docs/EXPLORATION_DPE.md §6.4) :
  - filtre Lucene `qs=code_departement_ban:{dd}` (le param brut `code_departement_ban=` est IGNORÉ
    par data-fair et renvoie d'autres départements) ;
  - le `next` pointe vers l'id interne du dataset (`meg-…`) : on le suit tel quel.

Produit (idempotent) :
  data/raw/dpe_post2021_{dept}.parts/   parts parquet + _state.json (reprise) — supprimé en fin
  data/interim/dpe_post2021_{dept}.parquet   1 ligne/DPE, champs en chaîne (le cast/nettoyage et
                                             le MIX avec le pré-2021 S3 sont des étapes aval).

Usage : uv run python -m telechargement.recuperer_dpe_post2021 [DEPT] [--force]
"""
from __future__ import annotations

import json
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"

BASE = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant"
PAGE = 10000  # taille de page max acceptée par data-fair

# Champs souhaités : clés de jointure/dédup + signal/ajustement énergétique + désambiguïsation
# appartement (cf. EXPLORATION_DPE §8 / §8.1). Intersecté avec le schéma réel au démarrage : un
# champ absent est simplement ignoré (avec avertissement), jamais une cause d'échec.
CHAMPS_SOUHAITES = [
    # — identité & dédup —
    "numero_dpe", "numero_dpe_remplace",
    "date_etablissement_dpe", "date_fin_validite_dpe", "date_derniere_modification_dpe",
    # — clés de jointure au bien —
    "id_rnb", "identifiant_ban",
    "code_insee_ban", "code_postal_ban", "code_departement_ban", "nom_commune_ban",
    "adresse_ban", "_geopoint", "score_ban", "statut_geocodage",
    # — signal / ajustement énergétique —
    "etiquette_dpe", "etiquette_ges",
    "conso_5_usages_par_m2_ep", "emission_ges_5_usages_par_m2",
    "type_energie_principale_chauffage",
    # — caractéristiques du bien —
    "type_batiment", "surface_habitable_logement",
    "annee_construction", "periode_construction",
    "classe_inertie_batiment", "type_installation_chauffage", "type_ventilation",
    # — désambiguïsation appartement —
    "typologie_logement", "numero_etage_appartement",
    "complement_adresse_logement", "numero_immatriculation_copropriete",
]


def _get(url: str, attempts: int = 6) -> dict:
    """GET JSON avec retry + backoff exponentiel. Les 4xx (hors 429) sont définitives → on lève ;
    timeouts / 5xx / 429 (throttling) sont transitoires → on réessaie en doublant l'attente."""
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url, headers={"Accept": "application/json", "User-Agent": "primmobilier-dpe/1.0"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise  # 400/404… : inutile de réessayer, c'est la requête qui est mauvaise
            wait = min(120, 2 ** i)
            print(f"    ⚠ HTTP {e.code} → retry dans {wait}s ({i + 1}/{attempts})", flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as e:
            wait = min(120, 2 ** i)
            print(f"    ⚠ {type(e).__name__} → retry dans {wait}s ({i + 1}/{attempts})", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"échec après {attempts} tentatives : {url}")


def _schema_select(dept: str) -> list[str]:
    """Intersecte CHAMPS_SOUHAITES avec le schéma réel du dataset (robustesse au drift)."""
    keys = {f["key"] for f in _get(f"{BASE}/schema")}
    select = [c for c in CHAMPS_SOUHAITES if c in keys]
    manquants = [c for c in CHAMPS_SOUHAITES if c not in keys]
    if manquants:
        print(f"  ⚠ champs absents du schéma (ignorés) : {', '.join(manquants)}")
    return select


def _premiere_url(dept: str, select: list[str]) -> str:
    params = {"qs": f"code_departement_ban:{dept}", "select": ",".join(select), "size": PAGE}
    return f"{BASE}/lines?{urlencode(params)}"


def _ecrire_part(results: list[dict], select: list[str], path: Path) -> None:
    """Écrit une page en parquet, tout en chaîne (Utf8) : data-fair omet les champs nuls et
    renvoie des types hétérogènes d'une page à l'autre — un schéma Utf8 uniforme garantit un
    `concat` trivial. Le cast (dates, numériques) est une étape de nettoyage AVAL, pas ici."""
    rows = [{c: (None if (v := row.get(c)) is None else str(v)) for c in select} for row in results]
    pl.DataFrame(rows, schema={c: pl.Utf8 for c in select}).write_parquet(path)


def _fmt(s: float) -> str:
    if s < 60:
        return f"{s:.0f}s"
    if s < 3600:
        return f"{s // 60:.0f}m{s % 60:.0f}s"
    return f"{s // 3600:.0f}h{(s % 3600) // 60:.0f}m"


def recuperer(dept: str, *, force: bool = False) -> Path:
    dest = INTERIM / f"dpe_post2021_{dept}.parquet"
    if dest.exists() and dest.stat().st_size > 0 and not force:
        print(f"✓ {dest.name} (existe déjà — --force pour régénérer)")
        return dest

    parts = RAW / f"dpe_post2021_{dept}.parts"
    state_file = parts / "_state.json"
    if force:
        shutil.rmtree(parts, ignore_errors=True)
    parts.mkdir(parents=True, exist_ok=True)

    # Reprise : on relit le checkpoint si présent, sinon on démarre une nouvelle session.
    if state_file.exists():
        state = json.loads(state_file.read_text())
        select, url, page, rows, total = (state["select"], state["next"],
                                          state["page"], state["rows"], state["total"])
        print(f"↻ reprise dept {dept} : page {page}, {rows:,}/{total:,} déjà récupérés")
    else:
        select = _schema_select(dept)
        url = _premiere_url(dept, select)
        page, rows, total = 0, 0, None
        print(f"  dept {dept} : {len(select)} champs sélectionnés")

    t0 = time.monotonic()
    while url:
        data = _get(url)
        results = data.get("results", [])
        if total is None:
            total = data.get("total", 0)
            print(f"  total à récupérer : {total:,} DPE (~{-(-total // PAGE)} pages)")
        if not results:
            break
        _ecrire_part(results, select, parts / f"part_{page:05d}.parquet")
        rows += len(results)
        page += 1
        url = data.get("next")
        # Checkpoint atomique APRÈS écriture de la part → la reprise ne redemande jamais une page
        # déjà sur disque, et ne saute jamais une page non écrite.
        tmp = state_file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps({"select": select, "next": url, "page": page,
                                   "rows": rows, "total": total}))
        tmp.rename(state_file)
        dt = time.monotonic() - t0
        rate = rows / dt if dt else 0
        eta = (total - rows) / rate if rate and total else 0
        print(f"\r  page {page} · {rows:,}/{total:,} ({100 * rows / total:4.1f}%) · "
              f"{rate:,.0f} l/s · ETA {_fmt(eta)}    ", end="", flush=True)
    print()

    # Consolidation : toutes les parts ont le même schéma Utf8 → concat trivial.
    part_files = sorted(parts.glob("part_*.parquet"))
    if not part_files:
        raise RuntimeError(f"aucune page récupérée pour le dept {dept} — vérifier le filtre/API.")
    frame = pl.concat([pl.read_parquet(p) for p in part_files], how="vertical")

    INTERIM.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".parquet.tmp")
    frame.write_parquet(tmp, compression="zstd")
    tmp.rename(dest)
    shutil.rmtree(parts, ignore_errors=True)  # checkpoint + parts inutiles une fois consolidé

    print(f"\n  → {dest.name} : {frame.height:,} DPE post-2021 "
          f"({dest.stat().st_size / 1e6:.1f} Mo) en {_fmt(time.monotonic() - t0)}")
    return dest


def main(dept: str) -> None:
    recuperer(dept, force="--force" in sys.argv)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0] if args else "33")
