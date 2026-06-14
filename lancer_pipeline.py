"""Lance le pipeline complet pour un département : acquisition -> table comparables.

⚠ Le DPE est DÉCOUPLÉ de ce pipeline : sa préparation est fragile (fetch ADEME lent et
instable, reprenable) et ne doit pas vivre dans le chemin critique. On le prépare EN
AMONT :  uv run python -m telechargement.preparer_dpe DEPT
Au démarrage, le pipeline vérifie seulement que data/interim/dpe_{dept}.parquet existe ;
s'il manque, il prévient clairement et demande s'il faut continuer sans (les comparables
sont alors construits sans enrichissement DPE). --sans-dpe pour forcer sans question.

Enchaîne, dans l'ordre, les étapes documentées dans docs/PIPELINE.md :
  1. telechargement.preparer_donnees   -> acquisition COMPLÈTE + interim (DVF normalisé COG, RNB, BDNB, BAN, contours communes, cadastre) ; vérifie la complétude (arrêt net si un artefact manque)
     + telechargement.preparer_codes_postaux -> contours codes postaux hybrides (union communes + Voronoï)
  2. pipeline.recuperation_non_match    -> recup_liens (cascade A/B/C)
  3. pipeline.geocodage_residuel        -> recup_liens_final + pertes (BAN >= seuil)
  4. pipeline.reduire_referentiels      -> artefacts service réduits au graphe DVF
  5. telechargement.preparer_copro      -> copropriétés RNIC par parcelle
     + telechargement.preparer_loyers   -> indicateurs de loyers par commune (national)
     (DPE : préparé en amont, hors pipeline — cf. avertissement en tête)
  6. pipeline.construire_comparables    -> comparables + pont_batiment + adresses_ref

La mesure de joignabilité (pipeline.qualite_jointure) est un diagnostic optionnel,
hors du chemin de production ; on la lance avec --mesure.

Usage : uv run python lancer_pipeline.py DEPT [--mesure] [--sans-dpe]
        uv run python lancer_pipeline.py 47
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from pipeline.construire_comparables import main as construire
from pipeline.geocodage_residuel import SEUIL_SCORE
from pipeline.geocodage_residuel import main as geocoder
from pipeline.qualite_jointure import main as mesurer
from pipeline.recuperation_non_match import main as recuperer
from pipeline.reduire_referentiels import main as reduire
from telechargement.preparer_codes_postaux import main as telecharger_codes_postaux
from telechargement.preparer_copro import preparer_copro as construire_copro
from telechargement.preparer_donnees import main as telecharger
from telechargement.preparer_loyers import preparer_loyers as construire_loyers

ROOT = Path(__file__).resolve().parent


def _etape(n: int, total: int, titre: str) -> None:
    print(f"\n{'=' * 70}\n[{n}/{total}] {titre}\n{'=' * 70}")


def _verifier_dpe(dept: str) -> bool:
    """Le DPE est préparé EN AMONT (hors pipeline, car fragile). On vérifie seulement
    sa présence. Renvoie True si on peut continuer. Absent : prévient clairement et
    demande confirmation (--sans-dpe pour forcer sans question)."""
    dpe = ROOT / "data" / "interim" / f"dpe_{dept}.parquet"
    if dpe.exists() and dpe.stat().st_size > 0:
        return True
    print(f"\n{'⚠ ' * 23}\n"
          f"DPE ABSENT pour le département {dept} : {dpe} introuvable.\n"
          f"La préparation DPE est découplée du pipeline (fetch ADEME lent et fragile).\n"
          f"Préparez-le d'abord :  uv run python -m telechargement.preparer_dpe {dept}\n"
          f"Sinon, les comparables seront construits SANS enrichissement DPE.\n"
          f"{'⚠ ' * 23}")
    if "--sans-dpe" in sys.argv:
        print("→ --sans-dpe : on continue sans DPE.")
        return True
    try:
        reponse = input("Continuer SANS DPE ? [o/N] ").strip().lower()
    except EOFError:
        reponse = ""  # non-interactif : on n'enchaîne jamais sans DPE par accident
    if reponse in ("o", "oui", "y", "yes"):
        return True
    print("Abandon : préparez le DPE puis relancez (ou --sans-dpe pour forcer).")
    return False


def main(dept: str, mesure: bool = False) -> None:
    t0 = time.time()
    print(f"### Pipeline comparables — département {dept} ###")

    # DPE découplé : préparé en amont (cf. docstring). On vérifie seulement sa présence ;
    # absent, on prévient clairement et on demande s'il faut continuer sans.
    if not _verifier_dpe(dept):
        return

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

    _etape(5, total, "Enrichissements — copropriétés RNIC, loyers communes (DPE préparé en amont)")
    construire_copro(dept)
    construire_loyers()

    _etape(6, total, "Construction de la table comparables + pont + adresses_ref")
    construire(dept)

    print(f"\n### Terminé en {time.time() - t0:.0f}s "
          f"-> data/interim/comparables_{dept}.parquet ###")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dept = args[0] if args else "33"
    main(dept, mesure="--mesure" in sys.argv)
