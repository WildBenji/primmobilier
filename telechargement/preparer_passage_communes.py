"""Table de passage des codes communes périmés vers le code COG courant.

DVF conserve le `code_commune` au moment de la vente. Après une fusion (commune nouvelle,
fusion-association) ou un changement de code (transfert de chef-lieu / de département), cet
ancien code **disparaît** des référentiels courants (geo.api, BAN) : ni contour, ni adresse
ne lui correspondent plus. Exemple Charente-Maritime : `17334` Saint-Georges-de-Longuepierre
→ commune nouvelle `17268` Rives-de-Boutonne (COG, effet 2025-01-01).

Ce module construit, depuis le **Code Officiel Géographique (COG) de l'INSEE**, une table
nationale `code_perime → code_actuel` permettant de **normaliser** ces codes côté pipeline,
de sorte que filtres par attribut, contours et géocodage restent alignés.

Sources (data.gouv `58c984b088ee386cdb1261f3`, INSEE) :
  - `v_commune_{millésime}.csv`     : communes courantes (autorité « actuel »).
  - `v_mvt_commune_{millésime}.csv` : historique des mouvements (`COM_AV` -> `COM_AP`).

Produit (national, idempotent) :
  - data/interim/passage_communes.parquet  : `code_perime`, `code_actuel`, `nom_actuel`
    (remap des codes périmés vers la commune courante).
  - data/interim/communes_actuelles.parquet : `insee`, `nom_cog`
    (nom COG courant par code — autorité de nommage : corrige aussi les codes *survivants*
    dont la commune a changé de nom, p.ex. `17268` Nuaillé-sur-Boutonne -> Rives-de-Boutonne).
  - data/interim/communes_modif.parquet : `code`, `date_effet`
    (date du dernier mouvement COG touchant un code — pour tracer la modification au détail).

Usage : uv run python -m telechargement.preparer_passage_communes
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

import duckdb
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
COG_MILLESIME = "2026"
COG_BASE = "https://www.insee.fr/fr/statistiques/fichier/8740222"
COMMUNE_URL = f"{COG_BASE}/v_commune_{COG_MILLESIME}.csv"
MVT_URL = f"{COG_BASE}/v_mvt_commune_{COG_MILLESIME}.csv"


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"✓ déjà là : {dest.name}")
        return dest
    print(f"⤓ {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"  → {dest.name} ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def _resolve(code: str, edges: dict[str, str], current: dict[str, str]) -> str | None:
    """Suit la chaîne de fusions `code -> ...` jusqu'à une commune courante (ou None)."""
    cur = code
    seen: set[str] = set()
    while cur not in current and cur in edges and cur not in seen:
        seen.add(cur)
        cur = edges[cur]
    return cur if cur in current else None


def preparer_passage_communes() -> None:
    dest = INTERIM / "passage_communes.parquet"
    noms_dest = INTERIM / "communes_actuelles.parquet"
    modif_dest = INTERIM / "communes_modif.parquet"
    if dest.exists() and noms_dest.exists() and modif_dest.exists():
        print(f"✓ {dest.name}, {noms_dest.name}, {modif_dest.name}")
        return
    INTERIM.mkdir(parents=True, exist_ok=True)
    commune_csv = _download(COMMUNE_URL, RAW / f"v_commune_{COG_MILLESIME}.csv")
    mvt_csv = _download(MVT_URL, RAW / f"v_mvt_commune_{COG_MILLESIME}.csv")

    con = duckdb.connect()
    # Communes courantes : code -> libellé (autorité « actuel »).
    current = {
        code: nom
        for code, nom in con.execute(
            "SELECT COM, LIBELLE FROM read_csv_auto(?, all_varchar = true) WHERE TYPECOM = 'COM'",
            [str(commune_csv)],
        ).fetchall()
    }
    # Arêtes « ancien code -> code absorbant » : un code commune qui en devient un autre
    # (commune nouvelle, fusion-association, transfert de chef-lieu / de département). On
    # ignore les changements de nom (COM_AV = COM_AP) et les lignes vers COMD/COMA/ARM.
    # Ordre chronologique + premier gagne : la 1re transition d'un code le rend périmé.
    edges: dict[str, str] = {}
    for av, ap in con.execute(
        """
        SELECT COM_AV, COM_AP
        FROM read_csv_auto(?, all_varchar = true)
        WHERE TYPECOM_AV = 'COM' AND TYPECOM_AP = 'COM' AND COM_AV <> COM_AP
        ORDER BY DATE_EFF
        """,
        [str(mvt_csv)],
    ).fetchall():
        edges.setdefault(av, ap)
    # Date du dernier mouvement COG touchant un code (comme COM_AV ou COM_AP) : sert à
    # dater la modification de commune au détail d'une vente. Gardé large ; l'usage est
    # filtré côté pipeline aux lignes dont l'identité a réellement changé.
    modif = con.execute(
        """
        SELECT code, max(DATE_EFF) AS date_effet FROM (
            SELECT COM_AV AS code, DATE_EFF FROM read_csv_auto(?, all_varchar = true) WHERE TYPECOM_AV = 'COM'
            UNION ALL
            SELECT COM_AP AS code, DATE_EFF FROM read_csv_auto(?, all_varchar = true) WHERE TYPECOM_AP = 'COM'
        )
        GROUP BY code
        """,
        [str(mvt_csv), str(mvt_csv)],
    ).fetchall()
    con.close()

    passage = []
    for code in edges:
        if code in current:
            continue
        actuel = _resolve(code, edges, current)
        if actuel and actuel != code:
            passage.append((code, actuel, current[actuel]))

    pl.DataFrame(
        passage, schema=["code_perime", "code_actuel", "nom_actuel"], orient="row"
    ).write_parquet(dest)
    pl.DataFrame(
        list(current.items()), schema=["insee", "nom_cog"], orient="row"
    ).write_parquet(noms_dest)
    pl.DataFrame(
        modif, schema=["code", "date_effet"], orient="row"
    ).write_parquet(modif_dest)
    print(
        f"\n✓ {dest.name} — {len(passage)} codes communes périmés mappés vers le COG {COG_MILLESIME}"
        f"\n✓ {noms_dest.name} — {len(current)} noms de communes courants (autorité de nommage)"
        f"\n✓ {modif_dest.name} — {len(modif)} dates de mouvements de communes"
    )


if __name__ == "__main__":
    preparer_passage_communes()
