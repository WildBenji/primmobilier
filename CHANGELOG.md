# Changelog

## v0.6.0 - 2026-06-10

- Mode **Exploration** (panorama de marché) dans le POC web, en plus de l'Estimation : nouvel endpoint `/api/market` affichant le prix de **tous les biens** d'une emprise (maison, appartement, terrain, dépendance, local), indépendamment d'un bien cible — seules comptent la localisation (adresse, code postal ou commune) et l'emprise. Médiane €/m² et prix médian par type.
- Qualité des prix par construction (cf. `docs/SOURCES_DONNEES.md` §9) : logement (Maison/Appartement) depuis la table `comparables` propre ; terrain/dépendance/local depuis les **mutations DVF mono-ligne** uniquement (évite le `valeur_fonciere` dupliqué des ventes multi-lignes), étiquetés « indicatif ».
- Bascule de mode via un **switch segmenté** Estimation/Exploration ; en Exploration, **chips** de filtre par type de bien ; les champs propres à chaque mode (caractéristiques du bien d'un côté, filtres de l'autre) sont masqués dans l'autre mode.
- **Sélecteur de fonds de carte** (6 couches) : IGN Plan (défaut), CARTO Positron, CARTO Voyager, OpenStreetMap, IGN Satellite, Stadia Satellite. Stadia utilisable sans clé en local uniquement (auth par domaine) — documenté dans `docs/SOURCES_DONNEES.md` §8.
- **Panneaux déplaçables** (estimation, fond de carte, comparables, vue rue) par leur en-tête, en état ouvert comme replié ; double-clic sur l'en-tête pour remettre à la position d'origine.
- Bouton **Reset** qui remet l'interface à l'état initial (carte, points, estimation, comparables, formulaire).
- Nombre de comparables affichés **paramétrable** (défaut 200, validé par Entrée, plafonné automatiquement au nombre réellement disponible) et compteur `affichés/total`.
- Découplage carte/liste pour la performance : la carte reçoit **tous les points** de l'emprise en payload allégé (coords + type + prix), la liste DOM reste plafonnée ; les statistiques restent calculées sur la cohorte complète.
- Correctif d'affichage : les sections masquées par l'attribut `hidden` (`.grid`, `.result`) étaient neutralisées par `display: grid` — les blocs spécifiques à un mode persistaient à tort en changeant de mode.

## v0.5.0 - 2026-06-10

- Ajout d'un POC web local `web_poc/` pour tester l'usage final de l'estimation par comparables : serveur HTTP local, API d'estimation DuckDB, carte MapLibre, recherche d'adresse BAN et couche IGN optionnelle.
- Interface d'analyse des comparables : panneau d'estimation rétractable, panneau comparables rétractable, détail cliquable, heatmap/points proportionnés à la similarité, marqueur distinct pour l'adresse cible.
- Emprises de comparaison : rayon logarithmique de 100 m à 20 km, code postal, commune, et mode cadastre laissé en TODO tant que les géométries ne sont pas disponibles.
- Ajout du choix d'historique des ventes de 12 mois à 5 ans, appliqué côté serveur avec une date de référence stable.
- Interaction carte : double-clic avec géocodage inverse BAN pour sélectionner l'adresse la plus proche et lancer l'estimation, et touche Entrée pour relancer le calcul depuis le panneau.
- Intégration Panoramax provisoire : recherche de vue rue proche pour l'adresse cible et les comparables, avec garde-fou contre les réponses asynchrones périmées.
- Corrections du POC : suppression du plafonnement SQL qui tronquait les scopes code postal/commune, absence d'emprises approximatives fausses, et message d'erreur quand moins de 5 comparables sont disponibles.

## v0.4.0 - 2026-06-10

- Récupération des non-matchs DVF→RNB (ADR 0004) : cascade clé d'adresse / pont parcelle-BAN / plus proche bâtiment, puis géocodage BAN des résiduels (seuil de score paramétrable à 0,95, sous lequel la ligne est marquée perdue). 99,57% des ventes de logement exploitables sur le 33, 99,84% sur le 47.
- Organisation des données (ADR 0005) : table `comparables` au grain du bien logement, `pont_batiment` `(id_mutation, id_parcelle) → rnb_id` nullable + `confiance` (mono-bâti/adresse = haute, récupéré = moyenne/basse, multi ambigu = parcelle), `adresses_ref` BAN/RNB élagué aux bâtiments référencés. ~60% des biens rattachés au bâtiment, ~39% à la parcelle.
- Désambiguïsation bâtiment sur parcelle multi-bâtiments mesurée puis écartée : plafond ~60% (adresse 46%, surface au sol 33%), pas de recours à la BDNB — choix documenté.
- Pipeline réutilisable et industrialisé : `telechargement/` (acquisition DVF/RNB/BAN par département), `pipeline/` (étapes + module `commun`), lanceur `lancer_pipeline.py`, validé sur deux départements (33 urbain, 47 rural).
- Documentation `docs/PIPELINE.md` : flux et cascade de confiance en mermaid, étapes, modèle de données, choix structurants et limites assumées.

## v0.3.0 - 2026-06-09

- Environnement de traitement : Polars + DuckDB + pyarrow (et JupyterLab/ipykernel en dev) via uv ; `data/` et checkpoints notebooks ignorés.
- Spike de joignabilité sur le département 33 (`notebooks/spike_jointures_33.ipynb`) : ingestion DVF/RNB/DPE/BAN en Polars, mesures de taux de match en DuckDB.
- Résultats mesurés (cf. `docs/SOURCES_DONNEES.md` §6) : DPE↔RNB par clé d'adresse 87%, DVF logement→RNB 95%, parcelle ambiguë (38% mono-bâtiment), apport BAN marginal.
- ADR 0003 : RNB (`rnb_id`) retenu comme pivot bâtiment, la parcelle comme lien secondaire ; décision BAN API-only confirmée par les chiffres.
- Corrections du modèle de jointure : le DPE open data ne porte que `identifiant_ban` (ni rnb_id ni parcelle) ; BAN confirmée comme crosswalk (`id` + `cad_parcelles`).

## v0.2.0 - 2026-06-09

- Ajout de `docs/SOURCES_DONNEES.md` : catalogue d'exploration des sources opendata (DVF, BAN, Cadastre, RNB, BDNB, DPE, copropriétés, GASPAR, APIs) avec définitions, champs retenus/superflus, clés de jointure et graphe de jointure (RNB comme pivot bâtiment).
- Ajout des ADR de socle : `0001` (valider la joignabilité sur un département témoin avant de figer pivot et périmètre) et `0002` (Parquet + DuckDB spatial comme moteur de service, PostGIS écarté).
- Raffinements du modèle dans `CONTEXT.md` : géocodage via API BAN seule (sources déjà géolocalisées), et consignation des ambiguïtés ouvertes (pivot de rattachement, appariement DPE par identifiant).

## v0.1.0 - 2026-06-09

- Initial project scaffold for the primmobilier data and estimation work.
- Documented the national real-estate cartographic data foundation and estimation domain language.
- Added notes describing the existing DVF estimation notebook, data sources, and target data architecture.
