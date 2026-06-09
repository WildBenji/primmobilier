---
status: accepted
date: 2026-06-09
---

# RNB (`rnb_id`) comme pivot bâtiment, la parcelle comme lien secondaire

Le spike de joignabilité sur la Gironde (cf. [SOURCES_DONNEES.md §6](../SOURCES_DONNEES.md), notebook `spike_jointures_33.ipynb`)
a mesuré les taux de match réels et lève la décision reportée par l'[ADR 0001](0001-valider-joignabilite-avant-de-figer-le-socle.md).

**Décision : le `rnb_id` du Référentiel National des Bâtiments est le pivot d'intégration du socle.**
La parcelle cadastrale (`id_parcelle`) reste un **lien secondaire** entre DVF et le bâtiment, pas le pivot.

## Pourquoi (chiffres dept 33)

- **DVF → RNB par parcelle : 95% des ventes de logement** (96-97% Maison/Appartement). Le RNB est atteignable depuis quasiment toutes les ventes qui nous intéressent.
- **DPE → RNB par clé d'adresse (`identifiant_ban` ↔ `cle_interop_ban`) : 87%.** La jointure énergétique par clé est viable sans re-géocodage (la crainte d'un keyspace FANTOIR incompatible était infondée — les deux clés sont dans le namespace BAN cle_interop courant).
- **La parcelle est ambiguë à l'unité** : 2,26 bâtiments par parcelle en moyenne, max 769, seulement 38% de parcelles mono-bâtiment. Elle ne suffit donc pas à désigner *le* bâtiment vendu → mauvais candidat comme pivot, bon candidat comme arête de jointure.
- **BAN écartée comme crosswalk** : `cad_parcelles` ne couvre que 16% des parcelles DVF (vs 52% pour RNB) et n'ajoute que +2,3 pts → l'[ADR 0002 / décision API-only BAN] tient.

## Conséquences

- Le modèle de données s'organise autour du **bâtiment RNB** ; DVF s'y rattache via parcelle, DPE via clé d'adresse.
- **Point dur restant** (hors scope de cet ADR) : sur une parcelle multi-bâtiments, départager quel bâtiment/logement correspond à une vente DVF ou à un DPE (surface, adresse normalisée, `bdg_cover_ratio`). À traiter dans une itération dédiée.
- ~13% des DPE et ~1/3 des ventes logement restent sans rattachement DPE direct → l'enrichissement énergétique sera partiel et devra être signalé comme tel (cf. « Avertissement de fiabilité » dans CONTEXT.md).
