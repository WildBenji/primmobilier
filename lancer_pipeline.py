"""Lance le pipeline complet pour un département : acquisition -> table comparables.

Enchaîne, dans l'ordre, les étapes documentées dans docs/PIPELINE.md :
  1. telechargement.preparer_donnees   -> data brutes + interim (DVF, RNB, BAN)
  2. pipeline.recuperation_non_match    -> recup_liens (cascade A/B/C)
  3. pipeline.geocodage_residuel        -> recup_liens_final + pertes (BAN >= seuil)
  4. pipeline.construire_comparables    -> comparables + pont_batiment + adresses_ref

La mesure de joignabilité (pipeline.qualite_jointure) est un diagnostic optionnel,
hors du chemin de production ; on la lance avec --mesure.

Usage : uv run python lancer_pipeline.py DEPT [--mesure]
        uv run python lancer_pipeline.py 47
"""
from __future__ import annotations

import sys
import time

from pipeline.construire_comparables import main as construire
from pipeline.geocodage_residuel import SEUIL_SCORE
from pipeline.geocodage_residuel import main as geocoder
from pipeline.qualite_jointure import main as mesurer
from pipeline.recuperation_non_match import main as recuperer
from telechargement.preparer_donnees import main as telecharger


def _etape(n: int, titre: str) -> None:
    print(f"\n{'=' * 70}\n[{n}/4] {titre}\n{'=' * 70}")


def main(dept: str, mesure: bool = False) -> None:
    t0 = time.time()
    print(f"### Pipeline comparables — département {dept} ###")

    _etape(1, "Acquisition des données (DVF / RNB / BAN)")
    telecharger(dept)
    if mesure:
        print("\n--- Diagnostic : qualité de jointure ---")
        mesurer(dept)

    _etape(2, "Récupération des non-matchs (cascade adresse / parcelle-BAN / spatial)")
    recuperer(dept)

    _etape(3, f"Géocodage BAN des résiduels (seuil score {SEUIL_SCORE})")
    geocoder(dept, SEUIL_SCORE)

    _etape(4, "Construction de la table comparables + pont + adresses_ref")
    construire(dept)

    print(f"\n### Terminé en {time.time() - t0:.0f}s "
          f"-> data/interim/comparables_{dept}.parquet ###")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dept = args[0] if args else "33"
    main(dept, mesure="--mesure" in sys.argv)
