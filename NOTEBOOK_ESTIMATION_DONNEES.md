# Estimation interactive DVF: comprehension et socle donnees

Date de cadrage: 2026-06-09.

## Objectif

Ce document explique ce que fait le notebook `estimation_interactive.ipynb`, quelles donnees il utilise aujourd'hui, et comment preparer un socle de donnees publiques pour un futur site web cartographique plus riche.

Le point cle: le notebook actuel est un prototype local d'estimation par comparables DVF. Le futur site devra transformer ce prototype en moteur spatial rapide, alimente par des donnees nationales ou departementales, requetable avec DuckDB/Parquet et expose sur une carte interactive.

## Ce que fait le notebook

Le notebook construit un tableau de bord Jupyter pour estimer un bien immobilier a partir de ventes comparables issues de DVF.

Flux fonctionnel:

1. Il charge `data/processed/dvf_valide.parquet`.
2. Il garde uniquement les mutations geolocalisees avec `longitude`, `latitude` et `prix_m2`.
3. Il derive une `section` cadastrale depuis `id_parcelle` avec `str.slice(8, 2)`.
4. Il prepare:
   - la liste des codes postaux presents dans DVF;
   - un centroide median par code postal;
   - la derniere date de vente connue, utilisee comme ancre pour le marche recent.
5. L'utilisateur saisit une adresse, un code postal, une rue optionnelle, le type de bien, la surface, le nombre de pieces, un rayon, un prix demande optionnel et des ajustements qualitatifs.
6. L'adresse est geocodee via la Base Adresse Nationale.
7. Les comparables DVF sont filtres par:
   - meme code postal;
   - meme `type_local`: `Appartement` ou `Maison`;
   - surface entre +/- 15%;
   - meme nombre de pieces.
8. Le notebook choisit automatiquement le premier niveau geographique avec au moins 5 comparables:
   - rayon geographique reel autour du point, calcule en Haversine;
   - meme rue;
   - meme section cadastrale;
   - code postal entier.
9. Si aucun niveau n'a assez de donnees, il elargit la surface a +/- 30% sur le code postal.
10. Il retire les 1% extremes de `prix_m2`, sauf si ce filtrage laisse moins de 3 comparables.
11. Il calcule:
   - mediane du prix au m2;
   - ecart-type du prix au m2;
   - prix brut de reference;
   - prix ajuste;
   - mediane recente sur les 12 derniers mois disponibles;
   - tendance annuelle via regression lineaire sur les medianes mensuelles;
   - position du prix demande dans la distribution des comparables.
12. Il affiche:
   - une carte Plotly Mapbox/OpenStreetMap des comparables;
   - un point pour le bien estime;
   - un cercle de recherche;
   - histogrammes prix au m2 et prix total;
   - courbe de tendance;
   - tableau des 25 comparables les plus proches ou les plus recents.

## Donnees locales actuellement utilisees

Le notebook ne requete pas directement DVF en ligne. Il s'appuie sur un parquet deja produit par les notebooks amont.

Fichier:

`data/processed/dvf_valide.parquet`

Schema observe localement:

| Colonne | Type |
| --- | --- |
| `id_mutation` | String |
| `date_mutation` | Date |
| `numero_disposition` | Int64 |
| `nature_mutation` | String |
| `valeur_fonciere` | Float64 |
| `adresse_numero` | Int64 |
| `adresse_suffixe` | String |
| `adresse_nom_voie` | String |
| `adresse_code_voie` | String |
| `code_postal` | String |
| `code_commune` | String |
| `nom_commune` | String |
| `code_departement` | String |
| `id_parcelle` | String |
| `numero_volume` | Int64 |
| `lot1_numero` a `lot5_numero` | String ou Int64 selon colonne |
| `lot1_surface_carrez` a `lot5_surface_carrez` | Float64 |
| `nombre_lots` | Int64 |
| `code_type_local` | String |
| `type_local` | String |
| `surface_reelle_bati` | Int64 |
| `nombre_pieces_principales` | Int64 |
| `code_nature_culture` | String |
| `nature_culture` | String |
| `code_nature_culture_speciale` | String |
| `nature_culture_speciale` | String |
| `surface_terrain` | Int64 |
| `longitude` | Float64 |
| `latitude` | Float64 |
| `annee` | Int32 |
| `prix_m2` | Float64 |
| `qc_prix_manquant` | Boolean |
| `qc_surface_implausible` | Boolean |
| `qc_pieces_implausible` | Boolean |
| `qc_prix_m2_hors_bornes` | Boolean |
| `qc_prix_m2_extreme` | Boolean |
| `qc_anomalie` | Boolean |

Volume local observe: 509 325 lignes validees.

## Pipeline local actuel

`01_telechargement.ipynb`:

- telecharge les fichiers `geo-dvf/latest/csv/{year}/departements/{dept}.csv.gz`;
- perimetre actuel: `DEPTS = ["33"]`, `YEARS = range(2021, 2026)`;
- stocke les CSV gzip dans `data/raw/`;
- telecharge aussi un CSV Banque de France Webstat MIR, utilise par d'autres notebooks.

`02_nettoyage.ipynb`:

- lit tous les fichiers `data/raw/dvf_*_*.csv.gz`;
- force les codes administratifs en texte pour conserver les zeros significatifs;
- parse `date_mutation`;
- retire les colonnes entierement vides;
- calcule `prix_m2` uniquement pour les ventes mono-bien de logements:
  - `type_local` dans `Maison`, `Appartement`;
  - `nature_mutation` dans `Vente`, `Vente en l'etat futur d'achevement`;
  - une seule ligne logement par `id_mutation`;
  - surface et valeur fonciere positives.
- ajoute des flags qualite:
  - prix manquant;
  - surface logement implausible;
  - nombre de pieces implausible;
  - prix au m2 hors bornes metier;
  - prix au m2 statistiquement extreme.
- ecrit:
  - `data/processed/dvf_clean.parquet`;
  - `data/processed/dvf_valide.parquet`, sans les anomalies dures.

## Limites du notebook actuel

- Perimetre local limite a la Gironde dans le pipeline observe.
- Granularite geographique encore simple: rayon, rue, section cadastrale, code postal.
- Pas de jointure DPE reelle: le DPE est un ajustement manuel.
- Pas d'information fiable sur etage, exposition, etat, parking, terrasse, jardin ou ascenseur dans DVF.
- Pas de correction automatique par annee de construction, copropriete, qualite energetique, risque, bruit, urbanisme ou tension locative.
- Pas de gestion avancee des mutations multi-lots: le calcul `prix_m2` actuel evite volontairement les ventes complexes.
- La section cadastrale est derivee de l'identifiant parcelle mais n'est pas jointe a une geometrie cadastrale.
- Le geocodage se fait en ligne au moment de l'usage; pour un site web, il faudra aussi une base d'adresses ingeree localement.

## Donnees publiques prioritaires

### 1. Base Adresse Nationale

Usage futur:

- geocodage d'adresse;
- autocompletion;
- normalisation des adresses;
- rattachement adresse -> coordonnees -> parcelle/batiment;
- ingestion massive pour eviter de dependre uniquement d'un appel API en direct.

Jeu de donnees data.gouv:

- Nom: Base Adresse Nationale
- ID: `5530fbacc751df5ff937dddb`
- URL: https://www.data.gouv.fr/datasets/base-adresse-nationale/
- Organisation: Base Adresse Nationale
- Licence: `lov2`
- Frequence: quotidienne
- Derniere mise a jour catalogue observee: 2026-06-09

Ressources utiles:

- CSV national ou departemental: https://adresse.data.gouv.fr/data/ban/adresses/latest/csv
- Format Addok: https://adresse.data.gouv.fr/data/ban/adresses/latest/addok
- Format BAL: https://adresse.data.gouv.fr/data/ban/adresses/latest/csv-bal
- Documentation: https://adresse.data.gouv.fr/donnees-nationales

API utile:

- Nom: API Adresse, Base Adresse Nationale
- ID data.gouv: `672cf67802ef6b1be63b8975`
- Base API URL: https://data.geopf.fr/geocodage/
- OpenAPI: https://data.geopf.fr/geocodage/openapi.yaml
- Endpoints utiles: `GET /search`, `GET /reverse`, `POST /search/csv`, `POST /reverse/csv`.

Note: le notebook utilise actuellement `https://api-adresse.data.gouv.fr/search/`. Pour un nouveau projet, documenter et tester la compatibilite avec l'API Geoplateforme actuelle.

### 2. Demandes de valeurs foncieres geolocalisees

Usage futur:

- coeur du moteur de comparables;
- calcul de prix au m2;
- tendances temporelles;
- distribution par quartier/rayon/type/surface/pieces;
- carte des transactions.

Jeu de donnees data.gouv:

- Nom: Demandes de valeurs foncieres geolocalisees
- ID: `5cc1b94a634f4165e96436c1`
- URL: https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/
- Organisation: data.gouv.fr
- Licence: `lov2`
- Frequence: semestrielle
- Derniere mise a jour catalogue observee: 2026-06-09

Ressources utiles:

- Fichier unique janvier 2021 - decembre 2025: https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres-geolocalisees/20260424-090024/dvf.csv.gz
- Arborescence CSV pour fichiers individuels: https://files.data.gouv.fr/geo-dvf/latest/csv/

Preference pour le futur projet:

- utiliser les fichiers individuels par annee/departement pour faciliter les reprises partielles, le cache, et les imports incrementaux;
- convertir en Parquet partitionne par `annee`, `code_departement`, puis eventuellement `code_commune`;
- conserver aussi un niveau mutation et un niveau local/bien, car une mutation peut contenir plusieurs lignes.

### 3. Cadastre

Usage futur:

- geometries de parcelles;
- sections cadastrales reelles;
- jointure `id_parcelle` DVF -> parcelle;
- requetes spatiales point/rayon/polygone;
- contexte foncier: surface parcelle, batiments, proximite, voisinage.

Jeu de donnees data.gouv:

- Nom: Cadastre
- ID: `59b0020ec751df07d5f13bcf`
- URL: https://www.data.gouv.fr/datasets/cadastre/
- Organisation: data.gouv.fr
- Licence: `fr-lo`
- Frequence: trimestrielle
- Derniere mise a jour catalogue observee: 2026-05-07

Ressources:

- Documentation: https://cadastre.data.gouv.fr/datasets/cadastre-etalab
- Telechargement: https://cadastre.data.gouv.fr/datasets/cadastre-etalab/

APIs:

- API Cadastre data.gouv
  - ID: `6661eadade5469423f58a6b4`
  - Base API URL: https://cadastre.data.gouv.fr/bundler/cadastre-etalab/
  - OpenAPI: https://raw.githubusercontent.com/datagouv/cadastre-bundler-api/master/definition.yml
  - Endpoints utiles: exports par departement, commune, EPCI; formats et layers Cadastre Etalab.
- API Carto module Cadastre IGN
  - ID: `672cf6658e2b8878bf0a5e6c`
  - Base API URL: https://apicarto.ign.fr/api/cadastre
  - OpenAPI: https://apicarto.ign.fr/api/doc/cadastre.yml
  - Usage: geometrie/centroide de parcelle, divisions cadastrales, infos par commune.

### 4. DPE logements existants

Usage futur:

- remplacer l'ajustement manuel DPE par une donnee observee;
- calculer la distribution DPE locale;
- valoriser ou penaliser les biens selon classe energie/GES;
- relier DPE a l'adresse, au batiment, a la periode de construction, a la surface.

Jeu de donnees data.gouv:

- Nom: DPE Logements existants depuis juillet 2021
- ID: `67f7e557cb268460ce66c8d4`
- URL: https://www.data.gouv.fr/datasets/dpe-logements-existants-depuis-juillet-2021/
- Organisation: ADEME
- Licence: `lov2`
- Frequence: hebdomadaire
- Derniere mise a jour catalogue observee: 2026-06-08

Ressources:

- Donnees et consultation: https://data.ademe.fr/datasets/dpe03existant
- Documentation des champs: https://data.ademe.fr/datasets/dpe03existant
- Documentation API: https://data.ademe.fr/datasets/dpe03existant/api-doc

Jeu complementaire:

- DPE Logements neufs depuis juillet 2021
- ID: `67f7e5758ffc5d79ab9e8c27`

Point d'attention: la jointure DPE -> DVF ne sera pas parfaite. Il faudra combiner adresse normalisee, code commune, coordonnees, surface, type de logement, date et eventuellement identifiant batiment RNB/BDNB.

## Donnees publiques complementaires utiles

### Referentiel National des Batiments

- Nom: Referentiel National des Batiments
- ID: `65a5568dfc88169d0a5416ca`
- URL: https://www.data.gouv.fr/datasets/referentiel-national-des-batiments/
- Organisation: Referentiel National des Batiments
- Licence: `lov2`
- Frequence: hebdomadaire
- Derniere mise a jour catalogue observee: 2026-06-08

Usage: rattacher adresse, parcelle, batiment, DPE et DVF a un identifiant batiment stable.

### Base de donnees nationale des batiments

- Nom: Base de donnees nationale des batiments
- ID: `61dc7157488f8cdb4283e3c3`
- URL: https://www.data.gouv.fr/datasets/base-de-donnees-nationale-des-batiments/
- Organisation: CSTB
- Licence: `lov2`
- Frequence: semestrielle
- Derniere mise a jour catalogue observee: 2026-05-22

Usage: enrichissement batimentaire et energetique, age du bati, typologie, renovation, croisements DPE.

### Adresses extraites du cadastre

- Nom: Adresses extraites du cadastre
- ID: `5bd837f2634f41112d338d46`
- URL: https://www.data.gouv.fr/datasets/adresses-extraites-du-cadastre/
- Organisation: data.gouv.fr
- Licence: `lov2`
- Frequence: annuelle
- Derniere mise a jour catalogue observee: 2026-06-06

Ressources:

- CSV departementaux: https://adresse.data.gouv.fr/data/adresses-cadastre/latest/csv/
- GeoJSON departementaux: https://adresse.data.gouv.fr/data/adresses-cadastre/latest/geojson/
- NDJSON brut: https://adresse.data.gouv.fr/data/adresses-cadastre/latest/ndjson-full/

Usage: source primaire utile pour rattacher adresses et parcelles.

### Registre national des coproprietes

- Nom: Registre national d'Immatriculation des Coproprietes
- ID: `62da71c068871f4c54258c7c`
- URL: https://www.data.gouv.fr/datasets/registre-national-dimmatriculation-des-coproprietes/
- Organisation: ANAH
- Licence: `lov2`
- Frequence: quotidienne
- Derniere mise a jour catalogue observee: 2026-06-09

Usage: immeubles collectifs, taille de copropriete, periode, situation administrative, indicateurs agregeables par zone.

### Encadrement des loyers Bordeaux

Sources trouvees:

- Encadrement des loyers de Bordeaux 2023: https://www.data.gouv.fr/datasets/encadrement-des-loyers-de-bordeaux-2023
- Secteurs geographiques: https://www.data.gouv.fr/datasets/encadrement-des-loyers-sur-bordeaux-secteurs-geographiques

Usage: estimation locative, simulation rendement, comparaison achat/location.

### Risques

Source trouvee:

- GASPAR, base nationale de gestion des procedures administratives relatives aux risques
- ID: `536995eea3a729239d20486b`
- URL: https://www.data.gouv.fr/datasets/base-nationale-de-gestion-assistee-des-procedures-administratives-relatives-aux-risques-gaspar

Usage: risques naturels/technologiques par commune ou zone, information de contexte et decote potentielle.

### Urbanisme

API utile:

- API Carto module Geoportail de l'Urbanisme
- ID: `672cf67520c9ae9747b4015c`
- Base API URL: https://apicarto.ign.fr/api/gpu
- OpenAPI: https://apicarto.ign.fr/api/doc/gpu.yml

Usage: zonage, servitudes, prescriptions, contraintes d'urbanisme intersectant une parcelle ou un point.

## Proposition de modele DuckDB / Parquet

Ne pas partir sur une seule giga-table des le depart. Une giga-table serait simple a requeter mais fragile:

- duplication enorme des geometries et attributs;
- jointures DPE/adresse/parcelle imparfaites;
- cout de regeneration eleve;
- risque de melanger des niveaux differents: mutation, local, parcelle, batiment, adresse.

Approche recommandee:

1. Tables source normalisees en Parquet partitionne.
2. Vues DuckDB materialisees ou tables derivees pour les requetes frequentes.
3. Une table denormalisee `comparables_search` optimisee pour la carte et l'estimation.

Tables source:

| Table | Grain | Role |
| --- | --- | --- |
| `dvf_mutations` | `id_mutation` | date, nature, valeur globale, commune |
| `dvf_locaux` | ligne DVF / local | type, surface, pieces, lots, prix_m2 calcule |
| `dvf_parcelles` | mutation x parcelle | lien `id_mutation`, `id_parcelle`, terrain/culture |
| `ban_adresses` | adresse BAN | libelle, numero, voie, commune, code postal, lon/lat |
| `cadastre_parcelles` | parcelle | `id_parcelle`, commune, section, contenance, geometrie |
| `cadastre_batiments` | batiment cadastral | geometrie batiment, parcelles associees |
| `rnb_batiments` | batiment RNB | identifiant batiment, geometrie/point, liens adresse/parcelle |
| `dpe_logements` | diagnostic | classe DPE/GES, surface, adresse, date, conso, emissions |
| `coproprietes` | copropriete | infos immeuble/copro, adresse, commune |
| `loyers_zones` | zone reglementaire | zone geographique, plafonds, typologie |
| `risques` | commune/zone | PPR, risques naturels/technologiques |
| `urbanisme_zones` | zonage/prescription | geometries GPU et regles |

Table derivee principale:

`comparables_search`

Grain: vente comparable exploitable pour estimation.

Colonnes minimales:

- `id_mutation`
- `date_mutation`
- `annee`
- `mois`
- `code_departement`
- `code_commune`
- `nom_commune`
- `code_postal`
- `adresse_nom_voie`
- `adresse_numero`
- `id_parcelle`
- `section`
- `type_local`
- `surface_reelle_bati`
- `nombre_pieces_principales`
- `valeur_fonciere`
- `prix_m2`
- `longitude`
- `latitude`
- `geom_point`
- `surface_terrain`
- `nombre_lots`
- `is_vefa`
- `is_mono_bien`
- `quality_flags`
- enrichissements optionnels:
  - `classe_dpe_probable`
  - `classe_ges_probable`
  - `rnb_id`
  - `annee_construction`
  - `copro_id`
  - `zone_loyer`
  - `risque_score`
  - `urbanisme_zone`

Indexation/requetes:

- DuckDB + extension spatial pour requetes point/rayon/polygone.
- Parquet partitionne par `code_departement` puis `annee`.
- Colonnes de clustering utiles: `code_commune`, `code_postal`, `type_local`, `surface_reelle_bati`, `nombre_pieces_principales`.
- Pour le web, prevoir des tuiles ou agregats:
  - mediane prix/m2 par carreau H3 ou geohash;
  - volumes par mois;
  - distributions par commune/quartier;
  - bbox rapide pour la carte.

## Algorithme cible pour reproduire puis depasser le notebook

Base compatible notebook:

1. Geocoder l'adresse ou choisir un point sur la carte.
2. Recuperer code postal, commune, parcelle et eventuellement batiment.
3. Filtrer les comparables:
   - rayon spatial;
   - type de bien;
   - surface comparable;
   - nombre de pieces;
   - periode temporelle configurable;
   - exclusion des ventes complexes ou flags qualite.
4. Si volume insuffisant, degrade automatiquement:
   - rayon plus large;
   - rue;
   - carreau H3/quartier;
   - section cadastrale;
   - commune/code postal.
5. Calculer mediane, quantiles, tendance, marche recent, percentile prix demande.
6. Afficher carte, distribution, historique et tableau.

Ameliorations possibles:

- rayon et periode configurables;
- filtre neuf/ancien, VEFA, maison/appartement;
- pondération par distance, recence, surface et similarite;
- ajustements DPE observes plutot que manuels;
- comparaison par parcelle/batiment/quartier;
- scoring de confiance selon volume et dispersion;
- estimation locative avec encadrement des loyers;
- indicateurs copropriete;
- alertes risques/urbanisme;
- exports des comparables retenus.

## Decisions a prendre pour le futur projet

1. Perimetre initial: Bordeaux/Gironde pour MVP ou ingestion nationale directe.
2. Mode d'ingestion: fichiers departementaux preferes pour DVF/BAN/Cadastre, puis national si besoin.
3. Jointure DPE: adresse normalisee seule, RNB/BDNB, ou pipeline hybride.
4. Niveau spatial de pre-agregation: H3, geohash, carreaux INSEE, IRIS ou quartiers maison.
5. Forme de stockage:
   - Parquet partitionne + DuckDB pour analyse et backend leger;
   - PostGIS si besoin d'API spatiale multi-utilisateurs plus robuste;
   - PMTiles/vector tiles pour affichage cartographique rapide.

## Priorite d'implementation donnees

1. Reproduire le parquet DVF actuel en pipeline scriptable, partitionne, departemental.
2. Ajouter BAN ingeree localement + API geocodage en appoint.
3. Ajouter Cadastre parcelles pour geometries et jointure `id_parcelle`.
4. Ajouter DPE existants et tester les strategies de jointure.
5. Construire `comparables_search`.
6. Ajouter RNB/BDNB pour stabiliser adresse/parcelle/batiment/DPE.
7. Ajouter loyers, coproprietes, risques et urbanisme selon les options produit.

