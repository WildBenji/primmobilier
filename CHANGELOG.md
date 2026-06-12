# Changelog

## v1.8.0 - 2026-06-12

- **Frise temporelle déplaçable** : une fois la période sélectionnée, on attrape la fenêtre entre les deux poignées et on la translate d'un bloc à largeur constante (glisser sur le canvas, bornes respectées). Curseur `grab`/`grabbing`, support tactile.
- **Couleur de zone réglable** : un petit curseur-palette à côté du toggle « Afficher la zone » change la teinte du cercle/de l'emprise sur la carte (dégradé arc-en-ciel dans la piste, pouce à la couleur choisie).
- **Correctif — persistance de la couleur de zone** : la zone était peinte selon le thème UI, donc invisible (teal pâle) sur un fond clair sous thème sombre. Les couleurs de zone suivent désormais le **fond de carte affiché** (`BASE_TONE`), pas le thème — la zone reste lisible sur tous les fonds.
- **Tri des résultats par DPE** : nouveau critère « DPE » dans le menu de tri (étiquettes A→G, biens sans étiquette en fin de liste). _(Données présentes uniquement sur le 33 pour l'instant.)_
- **Bâti cadastral — filtre de recouvrement** : une empreinte n'est listée que si ≥ 10 % de sa surface tombe dans la parcelle (`BATIMENT_MIN_OVERLAP`), au lieu d'un simple `ST_Intersects` qui captait en entier les bâtiments voisins se touchant en limite. Élimine les faux positifs (mesuré : 58 → 32 bâtiments sur 40 parcelles).
- **Documentation — grand nettoyage** : suppression de `NOTEBOOK_ESTIMATION_DONNEES.md` (absorbé/périmé), HAND-OFF DPE réduit au reste-à-faire, CHANGELOG/CONTEXT/EXPLORATION_DPE condensés (narrations d'exploration abandonnées ou absorbées retirées), SOURCES_DONNEES et PIPELINE recalés sur l'état réel du code (statuts, étape 5 enrichissements), micro-corrections ADR 0003/0004/0005. ~75 Ko de doc retirés/réécrits sans perte d'information unique.
- **Cadrage Site 2028** : plan d'attaque et journal de décisions pour transformer le POC en site complet (comptes, quotas, Observatoire, export, design 2028) — `docs/PLAN_SITE_2028.md`, `docs/JOURNAL_SITE_2028.md`, ADR 0007 (FastAPI + SQLite) et 0008 (front vanilla zéro-build), termes produit au CONTEXT.md.

## v1.7.0 - 2026-06-12

- **Refonte visuelle du POC web** : design à tokens en **double thème** persisté (sombre « aerial » / clair nordique), fond de carte suivant le thème sans écraser un choix manuel.
- **Frise temporelle du marché** : histogramme des ventes par mois, sélection libre **[début, fin]** à deux poignées, lecture animée, filtrage carte instantané sans re-requête.
- **Couche données — récupération maximisée** (mesuré dept 33) : DPE joignables **26 % → 61 %** (cascade `rnb_lien`), clé d'adresse bis/ter, copropriétés RNIC, carte des loyers + rendement brut, perf jointures spatiales (équi-jointure 9 cellules). Détails : [docs/SOURCES_DONNEES.md](docs/SOURCES_DONNEES.md) §3.1/§3.4/§3.5.
- **Exploration multi-types** : sélection multiple des catégories, synchronisée dans les deux sens avec les lignes de stats du bas.

## v1.6.0 - 2026-06-12

- **DPE (performance énergétique) — chaîne complète.** Nouveau fichier socle `dpe_{dept}.parquet` (pré-2021 S3 + post-2021 API ADEME, fetch résumable, nettoyage harmonisé), jointure sur les comparables via `id_rnb`, badge A-G sur les cartes et panneau « DPE (énergie) » dans la fiche (`/api/dpe`). Étape ajoutée à `lancer_pipeline`. Doctrine, acquisition et règles de nettoyage : [docs/EXPLORATION_DPE.md](docs/EXPLORATION_DPE.md). _(La couverture du match, 28 % ici, est résolue en v1.7.0 : 61 %.)_
- **Survol bâti cadastral bidirectionnel** : survoler une empreinte de bâtiment sur la carte illumine la box correspondante du détail (et inversement, comme avant) ; ouvre automatiquement le panneau « Bâti cadastral » s'il est replié.

## v1.5.0 - 2026-06-12

- **Adresse parcellaire** : nouveau lien **direct** parcelle↔adresse (adresses extraites du cadastre `codesParcelles` + BAN `cad_parcelles`, fusionnées et harmonisées à la source pour dédupliquer les doublons inter-sources). Affiché au clic d'un comparable comme **proxy de l'adresse propriétaire** (jamais son identité), avec l'adresse officielle BAN privilégiée et un « ? » qui en explique l'intérêt face à l'adresse de vente DVF. Couvre aussi les parcelles sans bâtiment RNB adressé (94,6 % des parcelles DVF sur le 33, mesuré par un spike de joignabilité).
- **Résultats à défilement infini** : le panneau de droite remplit automatiquement l'écran puis charge davantage de comparables au défilement, au lieu d'un champ « Max » qui pouvait figer l'application en demandant des milliers de cartes d'un coup. Le tri reste calculé sur **toute** la cohorte, pas seulement les résultats affichés.
- **Bâti cadastral — repli copropriété** : quand la parcelle de la vente est une **parcelle de référence** de copropriété / division en volumes (elle porte le lot et l'adresse mais aucune empreinte bâtie), la fiche affiche désormais le **bâtiment réel porté par la parcelle voisine**, identifié via le RNB en confiance haute, avec un « i » qui explique pourquoi. Messages d'indisponibilité du cadastre clarifiés (erreur technique transitoire vs parcelle absente du plan cadastral) ; le message « terrain nu / jardin » trompeur est corrigé.

## v1.4.0 - 2026-06-11

- **Exploration plus complète** : le type de bien passe sur un menu cohérent avec « Fond de carte », avec bornes naturelles par emprise pour le prix, la surface et les pièces. Les pièces sont désactivées pour les catégories où elles n'ont pas de sens.
- **Résultats cohérents à grande échelle** : le tri est appliqué côté serveur sur toute la cohorte avant limitation d'affichage; vider `Max` prend désormais le total disponible, avec un plafond applicatif aligné sur le plafond de sécurité des points.
- **Panneaux plus propres** : le panneau droit disparaît entièrement quand il est replié, les contrôles MapLibre passent derrière le panneau gauche, et la sélection d'un comparable est promue temporairement en haut avec une animation plus fluide.
- **Cadastre Dordogne reconstruit** : les données locales du département 24 ont été reconstruites avec les couches cadastre Etalab, rétablissant la résolution parcellaire à Sarlat-la-Canéda.
- **Panoramax retiré** : suppression des appels, panneaux et rendus de vue rue pour réduire le bruit visuel et simplifier l'application.

## v1.3.0 - 2026-06-11

- **Future map shell** : UI réorganisée autour de deux docks stables — panneau gauche (recherche/estimation) et dock droit (résultats) — tous deux escamotables. La carte reste le canvas principal en arrière-plan.
- **Détail inline** : le détail d'un comparable se déplie directement dans sa carte dans la liste (plus de colonne latérale). Tick « ✓ consulté » sur les fiches déjà vues.
- **Contrôles de carte intégrés** : sélecteurs de fond de carte et grille cadastre déplacés dans le panneau gauche (plus de `position: fixed` en bas à droite).
- **Synchronisation carte ↔ liste** : le survol d'un point sur la carte illumine le résultat correspondant dans la liste et y scroll automatiquement.
- **Chip ventes interactif** : le compteur de ventes devient un bouton qui déplie/replie les statistiques (accoléon avec le détail d'emprise).
- **Mobile adapté** : docks empilés en haut/bas avec onglets de dépliage, grille détail en une seule colonne.

## v1.2.0 - 2026-06-11

- **Acquisition départementale complète** : `preparer_donnees.py` devient le point d'entrée unique pour DVF, RNB, BDNB, BAN, contours communes, COG et cadastre Etalab (sections, parcelles, bâtiments, lieux-dits), avec vérification finale bloquante des artefacts attendus avant construction.
- **Téléchargements robustes et partagés** : nouveau helper `telechargement/_telechargement.py` avec écriture atomique et retry exponentiel, utilisé par les modules d'acquisition communes, cadastre et passage communes.
- **Contours codes postaux complets** : agrégation finale par `codePostal` via union géométrique, pour éviter les contours partiels quand un code postal traverse plusieurs départements traités.
- **Détails cartographiques enrichis** : endpoint `/api/lieudit` et affichage du lieu-dit cadastral dans la fiche d'une vente ; les détails d'emprise commune/code postal se comportent en accordéon et replient temporairement les stats pour réduire la surcharge visuelle.
- **Documentation pipeline/source** : mise à jour du flux d'acquisition, des artefacts garantis, des lieux-dits cadastraux et du piège des codes postaux trans-départementaux.

## v1.1.0 - 2026-06-11

- **Emprises géographiques sur contours IGN locaux** : contours communes figés et contours codes postaux hybrides, filtrage **géométrique côté serveur** (`ST_Within`) — stats, compteur et carte alignés sur l'emprise réellement tracée, plus de dépendance runtime à geo.api. Mécanique : [docs/SOURCES_DONNEES.md](docs/SOURCES_DONNEES.md) §1.4-§1.5.
- **Normalisation COG des communes** : remappage des codes communes périmés (fusions, communes nouvelles) vers la commune courante, tracé au détail d'une vente. Détails et chiffres de vérification : [docs/SOURCES_DONNEES.md](docs/SOURCES_DONNEES.md) §1.5.
- **Finitions UI** : fermeture des menus « Fond de carte » / « Grille cadastre » après sélection (plus besoin de cliquer sur la carte), loupe légère au survol d'un résultat avec illumination du point correspondant sur la carte, panneau détail en finition « verre », emprise cliquable (chip + détails).
- Hygiène : `.gitignore` couvre les fichiers macOS ; pipeline de téléchargement et pipeline de transformation documentées comme couches indépendantes.

## v1.0.0 - 2026-06-10

- **Exploration filtrable par prix réel** : le slider de prix à deux poignées s'aligne sur les min/max DVF réels du cohort courant (emprise, rayon/zone, types et historique), sans borne artificielle `0 → 1 M€+`; les bornes sont calculées avant filtre prix afin que la plage affichée reste celle du marché observé.
- **Historique en plage temporelle** : remplacement du slider historique simple par un double slider `0 – 5 ans`; Estimation et Exploration acceptent désormais `history_min_years` / `history_max_years` et filtrent les ventes par fenêtre d'âge réelle.
- **Ergonomie Exploration** : le filtre prix remonte sous l'historique, au-dessus du choix d'emprise; les filtres prix se réinitialisent quand l'adresse, l'emprise, le rayon, les types ou l'historique changent pour éviter de réutiliser une ancienne plage sur une nouvelle zone.
- **Finition UI** : correction de l'alignement visuel des doubles sliders afin que les poignées atteignent les extrémités de piste attendues.

## v0.9.0 - 2026-06-10

- **Résolution bâtiment par BDNB** ([ADR 0006](docs/adr/0006-bdnb-parcelle-pour-resolution-batiment.md)) : extraction BDNB Open départementale dans `preparer_donnees.py`, et `construire_comparables.py` résout `batiment_groupe_id` + attributs (usage, logements, hauteur, niveaux, emprise, année…) quand une parcelle porte un groupe BDNB unique, sans relation RNB↔BDNB inventée. Nouvelle étape `pipeline/reduire_referentiels.py` qui réduit RNB/BAN/BDNB/Cadastre au graphe DVF, câblée dans `lancer_pipeline.py`.
- **Emprises réelles « code postal » et « commune »** : nouveau référentiel national des contours codes postaux (`telechargement/preparer_codes_postaux.py`, GeoJSON → GeoParquet) servi par l'endpoint `/api/codepostal` — les grandes villes sont découpées par CP, plus de tracé débordant sur la commune entière. La commune utilise les contours administratifs (geo.api.gouv.fr). Garde anti-réponse-périmée par jeton de séquence.
- **Bâti cadastral dans le détail** : acquisition de la couche bâtiments du cadastre (`preparer_cadastre.py`), endpoint `/api/batiments` qui rattache les empreintes à la parcelle par intersection spatiale (préfiltre bbox **élargi d'une marge** pour ne pas rater un bâtiment qui déborde la parcelle, puis `ST_Intersects`) et renvoie type (en dur / léger) + surface au sol. La fiche détail dessine la parcelle et ses bâtiments distinctement (maison / annexes / garage) et les liste ; survoler une box illumine l'empreinte correspondante sur la carte. La date cadastrale (relevé) n'est plus affichée comme une année de construction — elle passe en infobulle.
- **Fiche détail enrichie** : focus parcelle à la sélection (grille cadastre de la parcelle seule), définitions au survol (« ? ») sur chaque donnée, panneaux et blocs repliables modernisés.
- **Tri des comparables** : option « Similarité » ajoutée et tri par similarité décroissante par défaut.
- **UI carte** : menus « Fond de carte » / « Grille cadastre » au survol, case « Afficher la zone », double-clic comparable = zoom + détail, libellés reflétant l'emprise choisie.
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

- Mode **Exploration** (panorama de marché) en plus de l'Estimation : endpoint `/api/market` affichant le prix de **tous les biens** d'une emprise, médiane €/m² et prix médian par type, switch de mode segmenté et chips de filtre.
- Qualité des prix par construction : logement depuis la table `comparables` propre ; terrain/dépendance/local depuis les **mutations DVF mono-ligne** uniquement, étiquetés « indicatif » (doctrine : `docs/SOURCES_DONNEES.md` §9).
- **Sélecteur de fonds de carte** (6 couches, dont Stadia sans clé en local uniquement — `docs/SOURCES_DONNEES.md` §8).
- Découplage carte/liste pour la performance : la carte reçoit tous les points en payload allégé, la liste DOM est plafonnée, les statistiques restent sur la cohorte complète.

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
