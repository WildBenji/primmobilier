# Changelog

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
