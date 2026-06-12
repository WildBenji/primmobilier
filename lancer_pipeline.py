"""Lance le pipeline complet pour un département : acquisition -> table comparables.

Enchaîne, dans l'ordre, les étapes documentées dans docs/PIPELINE.md :
  1. telechargement.preparer_donnees   -> acquisition COMPLÈTE + interim (DVF normalisé COG, RNB, BDNB, BAN, contours communes, cadastre) ; vérifie la complétude (arrêt net si un artefact manque)
     + telechargement.preparer_codes_postaux -> contours codes postaux hybrides (union communes + Voronoï)
  2. pipeline.recuperation_non_match    -> recup_liens (cascade A/B/C)
  3. pipeline.geocodage_residuel        -> recup_liens_final + pertes (BAN >= seuil)
  4. pipeline.reduire_referentiels      -> artefacts service réduits au graphe DVF
  5. pipeline.construire_comparables    -> comparables + pont_batiment + adresses_ref

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
from pipeline.reduire_referentiels import main as reduire
from telechargement.preparer_codes_postaux import main as telecharger_codes_postaux
from telechargement.preparer_dpe import preparer_dpe as construire_dpe
from telechargement.preparer_donnees import main as telecharger


def _etape(n: int, total: int, titre: str) -> None:
    print(f"\n{'=' * 70}\n[{n}/{total}] {titre}\n{'=' * 70}")


def main(dept: str, mesure: bool = False) -> None:
    t0 = time.time()
    print(f"### Pipeline comparables — département {dept} ###")

    total = 6

    _etape(1, total, "Acquisition des données (DVF / RNB / BDNB / BAN)")
    telecharger(dept)
    # Contours codes postaux hybrides : construits depuis les contours communes (geo.api,
    # figés par preparer_donnees ci-dessus) + les adresses DVF. Couvre tous les depts présents.
    telecharger_codes_postaux()
    if mesure:
        print("\n--- Diagnostic : qualité de jointure ---")
        mesurer(dept)

    _etape(2, total, "Récupération des non-matchs (cascade adresse / parcelle-BAN / spatial)")
    recuperer(dept)

    _etape(3, total, f"Géocodage BAN des résiduels (seuil score {SEUIL_SCORE})")
    geocoder(dept, SEUIL_SCORE)

    _etape(4, total, "Réduction des référentiels au graphe DVF")
    reduire(dept)

    _etape(5, total, "DPE — récupération (pré S3 + post API résumable) + mix nettoyé")
    construire_dpe(dept)

    _etape(6, total, "Construction de la table comparables + pont + adresses_ref")
    construire(dept)

    print(f"\n### Terminé en {time.time() - t0:.0f}s "
          f"-> data/interim/comparables_{dept}.parquet ###")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dept = args[0] if args else "33"
    main(dept, mesure="--mesure" in sys.argv)
