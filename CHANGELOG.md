# Changelog

## v0.9.0 - 2026-06-10

- **Résolution bâtiment par BDNB** ([ADR 0006](docs/adr/0006-bdnb-parcelle-pour-resolution-batiment.md)) : extraction BDNB Open départementale dans `preparer_donnees.py`, et `construire_comparables.py` résout `batiment_groupe_id` + attributs (usage, logements, hauteur, niveaux, emprise, année…) quand une parcelle porte un groupe BDNB unique, sans relation RNB↔BDNB inventée. Nouvelle étape `pipeline/reduire_referentiels.py` qui réduit RNB/BAN/BDNB/Cadastre au graphe DVF, câblée dans `lancer_pipeline.py`.
- **Emprises réelles « code postal » et « commune »** : nouveau référentiel national des contours codes postaux (`telechargement/preparer_codes_postaux.py`, GeoJSON → GeoParquet) servi par l'endpoint `/api/codepostal` — les grandes villes sont découpées par CP, plus de tracé débordant sur la commune entière. La commune utilise les contours administratifs (geo.api.gouv.fr). Garde anti-réponse-périmée par jeton de séquence.
- **Bâti cadastral dans le détail** : acquisition de la couche bâtiments du cadastre (`preparer_cadastre.py`), endpoint `/api/batiments` qui rattache les empreintes à la parcelle par intersection spatiale (préfiltre bbox **élargi d'une marge** pour ne pas rater un bâtiment qui déborde la parcelle, puis `ST_Intersects`) et renvoie type (en dur / léger) + surface au sol. La fiche détail dessine la parcelle et ses bâtiments distinctement (maison / annexes / garage) et les liste ; survoler une box illumine l'empreinte correspondante sur la carte. La date cadastrale (relevé) n'est plus affichée comme une année de construction — elle passe en infobulle.
- **Définitions au survol** : un « ? » à côté de chaque label de la fiche détail explique la donnée (surface habitable DVF vs emprise au sol cadastre vs emprise BDNB, année de construction vs relevé cadastral, etc.).
- **Focus parcelle à la sélection** : sélectionner un comparable affiche automatiquement la grille cadastre de sa parcelle seule et masque les autres ; fermer le détail rétablit l'overlay du menu « Grille cadastre » (renommé depuis « Cadastre »).
- **Panneaux modernisés** : ouverture des panneaux détail / vue rue en glissé + fondu, blocs repliables animés (`grid-template-rows`), finition « verre » (flou d'arrière-plan, coins arrondis, ombres douces), le tout respectant `prefers-reduced-motion`.
- **Tri des comparables** : option « Similarité » ajoutée et tri par similarité décroissante par défaut.
- **Carte** : double-clic sur un comparable = zoom rapproché + ouverture du détail (le double-clic ailleurs garde le recentrage + géocodage inverse). Au zoom rapproché, les points/halo s'effacent (le point devient un anneau) pour ne plus masquer le bâtiment et le cadastre.
- **UI carte** : menus « Fond de carte » et « Grille cadastre » au survol (groupés par fournisseur, accessibles au clavier via `:focus-within`) en remplacement des `<select>` ; case « Afficher la zone » pour masquer/afficher l'emprise ; type Appartement/Maison pris en compte immédiatement.
- **Libellés d'emprise** : le message de fin et la fourchette observée reflètent l'emprise choisie (rayon, code postal, `Commune (code INSEE)`, section) au lieu du seul département.
- Hygiène : en-tête `Cache-Control: no-store` (limité au service local), endpoints servis par les référentiels `*_service` quand ils existent.

## v0.8.0 - 2026-06-10

- Optimisation des endpoints Estimation et Exploration : les emprises (rayon, code postal, commune, section cadastrale) sont poussées dans DuckDB avant matérialisation Python, avec préfiltre bbox puis distance exacte pour les rayons.
- Exploration marché accélérée : filtres catégorie/bornes €/m² appliqués en SQL, DVF scoped une seule fois, et mutations DVF mono-ligne matérialisées en parquet temporaire réutilisable par département.
- Robustesse API/UI : validation stricte du département pour `/api/parcelles`, erreurs serveur JSON au lieu de connexions coupées, gestion frontend des erreurs réseau/serveur et garde contre les réponses obsolètes.
- Hygiène du POC web : connexions DuckDB fermées explicitement, chargement spatial mutualisé, dérivation département centralisée, chaînes serveur échappées dans les rendus HTML, et détails Exploration sans champs Similarité/Confiance absents.
- Documentation des conventions de service web : les futures fonctions interactives doivent filtrer tôt côté DuckDB et matérialiser les scans coûteux réutilisables.

## v0.7.0 - 2026-06-10

- Acquisition cadastre (Etalab) pour les départements 33 et 47 : nouveau module `telechargement/preparer_cadastre.py` qui télécharge parcelles + sections (GeoJSON.gz) et les convertit en **GeoParquet** (géométrie WKB, centroïde `clon`/`clat` précalculé) via DuckDB spatial. GeoParquet non publié par Etalab → conversion maison.
- Mesures de croisement cadastre × DVF/RNB consignées dans `docs/SOURCES_DONNEES.md` (§1.3 passe à « catalogué & mesuré », nouveau §10) : parcelle 97,89%, section 99,84%, point∈parcelle 97,12%, recovery spatiale renumérotation 98,67%, contenance dispo 99,97%.
- Emprise **Section** activée dans le POC (le mode « Cadastre » était un TODO désactivé) : `resolve_section()` résout par point-dans-polygone la section contenant l'adresse, filtre les comparables/biens sur `substr(id_parcelle, 1, 10)` et renvoie le polygone affiché sur la carte. Vaut pour Estimation et Exploration.
- **Overlay cadastre** : nouvel endpoint `/api/parcelles` (par `ids` des biens listés, ou par `bbox` de la vue via le centroïde) et dropdown « Cadastre » (Masqué / Biens affichés / Tout au zoom ≥ 14). Lignes vectorielles indépendantes du fond de carte.

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
