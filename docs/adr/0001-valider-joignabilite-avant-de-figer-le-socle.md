---
status: accepted
date: 2026-06-09
---

# Valider la joignabilité sur un département témoin avant de figer le socle

Les jointures entre sources publiques (DVF, BAN, Cadastre, DPE, RNB) sont le risque
principal du projet et leur qualité réelle est inconnue. Nous décidons donc de **mesurer
les taux de match sur un département témoin (33, Gironde — données DVF déjà en main)
avant de figer deux décisions structurantes** : le **pivot de rattachement**
(parcelle `id_parcelle` vs bâtiment `rnb_id`) et le **périmètre d'ingestion**
(national direct vs progressif).

Concrètement : on instrumente avant de bâtir. La phase 1 produit des scripts
d'ingestion/nettoyage et une mesure de joignabilité (taux de remplissage de `rnb_id`
et `Identifiant__BAN` dans le DPE, couverture des `plots` RNB sur les parcelles DVF,
cardinalité parcelle ↔ bâtiment), pas un schéma de socle définitif.

## Pourquoi

- **Difficile à revenir dessus** : le pivot choisi oriente tout le modèle DuckDB/Parquet et les pipelines.
- **Surprenant sans contexte** : le dépôt contient du cadrage (CONTEXT.md, SOURCES_DONNEES.md) mais volontairement ni schéma ni pipeline figés — ce report est délibéré.
- **Vrai arbitrage** : contre l'option « adopter RNB tout de suite » et contre « partir en ingestion nationale directe ».

## Conséquences

- Décisions reportées et tracées comme ambiguïtés ouvertes dans [CONTEXT.md](../../CONTEXT.md).
- État d'avancement des sources et points durs à mesurer suivis dans [docs/SOURCES_DONNEES.md](../SOURCES_DONNEES.md).
