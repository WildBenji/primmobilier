# Sources de données — Socle immobilier cartographique

Suivi d'exploration des sources publiques candidates au **socle immobilier cartographique** (cf. [CONTEXT.md](../CONTEXT.md)). Objectif : savoir précisément, pour chaque source, **où sont les données, ce qu'on récupère, ce qui est superflu/doublon, et par quelles clés elle se joint aux autres** — avant de décider ce qui est réalisable.

> **Le pipeline qui exploite ces sources est décrit dans [PIPELINE.md](PIPELINE.md)** (étapes, schéma mermaid, choix, limites).

- **Date de cadrage** : 2026-06-09
- **Méthode** : exploration via le MCP `datagouv` (catalogue data.gouv.fr) + lecture des documentations fournies avec les fichiers. Le champ **Définition** de chaque source est construit à partir de ces docs.
- **Cadre métier** : voir le langage du domaine dans [CONTEXT.md](../CONTEXT.md). On distingue les **Sources socle** (attendues dans toute estimation : BAN, DVF, Cadastre) des **Enrichissements optionnels** (DPE, RNB/BDNB, copropriétés, risques, urbanisme).
- **Principe de volumétrie** : l'application chiffre depuis DVF. Les fichiers bruts peuvent être
  complets pour audit/reconstruction, mais les artefacts opérationnels sont réduits aux parcelles,
  adresses et bâtiments reliés à une vente DVF.

## Légende statut d'exploration

| Statut | Sens |
| --- | --- |
| ✅ Catalogué | Métadonnées + ressources + définition + clés de jointure identifiées |
| 🔎 À échantillonner | Champs exacts à confirmer sur un extrait réel (dépt 33) |
| ⏳ À approfondir | Exploration partielle, reste des points ouverts |

> ⚠️ Les noms de colonnes marqués _(à confirmer)_ proviennent de la doc/connaissance générale et doivent être validés sur un échantillon réel lors de la phase de validation des jointures.

---

# 1. Sources socle

## 1.1 DVF géolocalisé — Demandes de valeurs foncières géolocalisées

- **ID data.gouv** : `5cc1b94a634f4165e96436c1` · Organisation : data.gouv.fr (dérivé DGFiP/Etalab) · Licence : `lov2` · Fréquence : **semestrielle** · MàJ catalogue : 2026-06-09
- **Statut** : ✅ Catalogué (schéma déjà validé localement, 509 325 lignes Gironde)
- **Définition** : version **normalisée et enrichie** des Demandes de Valeurs Foncières de la DGFiP, géolocalisée, qui recense les mutations immobilières (ventes) avec prix, caractéristiques du bien et rattachement parcellaire. C'est le **cœur du moteur de comparables**.

**Fichiers / accès**
| Ressource | Format | Taille | Usage |
| --- | --- | --- | --- |
| Fichier unique 2021-2025 (`dvf.csv.gz`) | csv.gz | 499 Mo | Reprise complète |
| Arborescence par année/département (`geo-dvf/latest/csv/`) | csv | — | **Préféré** : reprises partielles, cache, incrémental |

**Champs clés retenus** (estimation + jointures) : `id_mutation`, `date_mutation`, `nature_mutation` (filtrer `Vente`, `VEFA`), `valeur_fonciere`, `code_postal`, `code_commune`, `nom_commune`, `code_departement`, `id_parcelle`, `type_local` (Maison/Appartement), `surface_reelle_bati`, `nombre_pieces_principales`, `surface_terrain`, `longitude`, `latitude`. Dérivés calculés : `prix_m2`, `annee`, `section` (extraite de `id_parcelle`), flags qualité `qc_*`.

**Superflu / doublon / à écarter pour notre objectif** :
- `lot1_numero`..`lot5_numero`, `lot1_surface_carrez`..`lot5_surface_carrez`, `nombre_lots`, `numero_volume` : utiles seulement pour les ventes multi-lots, que le calcul `prix_m2` évite volontairement → garder au niveau source brut, exclure de la table de comparables.
- `code_nature_culture`, `nature_culture`, `code_nature_culture_speciale`, `nature_culture_speciale` : pertinents pour le foncier non bâti, hors périmètre logement.
- `adresse_code_voie`, `adresse_suffixe`, `numero_disposition` : faible valeur pour l'estimation.
- `code_type_local` : doublon de `type_local`.

**Clés de jointure** : `id_parcelle` → Cadastre parcelles → RNB (`plots`). Pas d'identifiant BAN ni RNB natif → le rattachement bâtiment/adresse passe par la parcelle ou par géocodage des coordonnées.

## 1.2 BAN — Base Adresse Nationale

- **ID data.gouv** : `5530fbacc751df5ff937dddb` · Organisation : BAN · Licence : `lov2` · Fréquence : **quotidienne** · MàJ catalogue : 2026-06-09
- **Statut** : ✅ Décidé — **API seule en v1, pas d'ingestion locale** (cf. ci-dessous). Les colonnes du CSV ne sont à échantillonner que si l'ingestion devient nécessaire.
- **Définition** : référentiel d'adresses **officiel** de l'État (donnée de référence du Service Public de la Donnée). Sert au géocodage, à l'autocomplétion, à la normalisation d'adresse et au rattachement adresse → coordonnées → parcelle.
- **Décision (v1)** : usage via **API BAN uniquement** pour géocoder l'**adresse cible** saisie. Pas d'ingestion BAN nationale : les sources socle (DVF, DPE, RNB, Cadastre) sont déjà géolocalisées, donc aucun géocodage de masse n'est requis. Endpoint recommandé : tester l'API Géoplateforme (`data.geopf.fr/geocodage/`) et conserver `api-adresse.data.gouv.fr` en repli.

**Fichiers / accès**
| Ressource | Format | Usage |
| --- | --- | --- |
| BAN CSV (national/départemental) | csv | Ingestion locale |
| BAN CSV **avec identifiants** | csv | Variante avec colonnes d'identification BAN |
| Format Addok | addok | Moteur de géocodage Addok auto-hébergé |
| WFS/WMS/MVT | tuiles | Cartographie (hors socle serveur) |

**Champs clés retenus** (CSV départemental, séparateur `;`, vérifié sur dept 48) : **`id`** (cle_interop, 100% rempli, ex. `48002_0021_00301`), **`id_fantoir`** (~44% rempli, ex. `48002_0021`), `numero`, `rep`, `nom_voie`, `code_postal`, `code_insee`, `nom_commune`, `lon`, `lat`, `type_position`, **`cad_parcelles`** (parcelle(s) cadastrale(s), ex. `48002000ZL0057`, multi possible `|`-séparé).

**Superflu / doublon** : `x`/`y` (Lambert) doublon de `lon`/`lat` ; `nom_afnor`, `libelle_acheminement`, `alias`, `nom_ld` redondants ; `id_fantoir` = legacy, utile seulement comme pont vers d'anciennes clés.

**Clés de jointure (BAN = crosswalk déterministe)** : `id` ↔ RNB (`addresses[].cle_interop_ban`) et ↔ DPE (`identifiant_ban`) — **même namespace, confirmé** · `cad_parcelles` ↔ Cadastre/DVF (`id_parcelle`) — **confirmé** · `code_insee` ↔ communes. ⇒ BAN relie à elle seule les 3 keyspaces (adresse / parcelle), mais reste un **secours** : RNB porte déjà `addresses` (cle_interop) ET `plots` (parcelle) → on mesurera si RNB seul suffit avant d'ingérer la BAN (cf. décision API-only).

## 1.3 Cadastre (Etalab)

- **ID data.gouv** : `59b0020ec751df07d5f13bcf` · Organisation : data.gouv.fr (Etalab) · Licence : `fr-lo` · Fréquence : **trimestrielle** · MàJ catalogue : 2026-05-07
- **Statut** : ✅ **Catalogué & mesuré (33 + 47)** — parcelles + sections ingérées en GeoParquet, schéma et clés confirmés (cf. mesures §10).
- **Définition** : découpage parcellaire du territoire au format géo simplifié (vs PCI Vecteur EDIGÉO brut). Fournit les **géométries de parcelles et sections** et la clé de rattachement `id_parcelle`.

**Fichiers / accès** : hébergés sur `cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements/{dept}/` (pas de ressource tabulaire data.gouv directe ; GeoParquet **non publié** → on convertit le GeoJSON nous-mêmes). Acquisition : [`telechargement/preparer_cadastre.py`](../telechargement/preparer_cadastre.py) (idempotent, GeoJSON.gz → GeoParquet WKB via DuckDB spatial, couches `sections` + `parcelles` + `batiments`). Tailles 33 : parcelles 235 Mo gz / sections 9,6 Mo gz / bâtiments 82 Mo gz (→ `cadastre_batiments_33.parquet` 177 Mo, 1,43 M empreintes).

**Champs réels confirmés (DuckDB spatial sur 33/47)** :
- Couche **parcelles** : `id` (= commune + préfixe + section + numéro, ex. `33063000KE0083`), `commune`, `prefixe`, `section`, `numero`, `contenance` (surface terrain m², dispo à **99,97%**), `arpente`, `created`, `updated`, géométrie. Ajout calculé à l'ingestion : `clon`/`clat` (centroïde, pour filtre bbox rapide).
- Couche **sections** : `id` (commune + préfixe + section, ex. `33063000KE`), `commune`, `code`, géométrie — **emprise d'analyse** (cf. CONTEXT « Section cadastrale »).
- Couche **bâtiments** : empreintes au sol (MultiPolygon), `type` (`01` bâti en dur / `02` bâti léger : garage, abri…), `nom` (souvent nul), `commune`, `created`/`updated`, `clon`/`clat`. **Pas d'id parcelle** → rattachement par intersection spatiale (empreinte ∩ parcelle). Sert à dessiner le détail intérieur d'une parcelle (maison + annexes) là où RNB n'expose qu'un point et BDNB que des attributs.

**Superflu / à différer** : couches `subdivisions_fiscales`, `lieux_dits`, `prefixes_sections`, `feuilles` — peu utiles à l'estimation.

**Clés de jointure (confirmées)** : `parcelles.id` ↔ DVF (`id_parcelle`) [**97,89%** des parcelles DVF logement présentes] ↔ RNB (`plots[].id`) · `sections.id` ↔ `substr(id_parcelle, 1, 10)` [**99,84%**]. Format GeoParquet (WKB) = idéal pour DuckDB spatial (`ST_GeomFromWKB`, `ST_Contains`).

**Artefact service** : `cadastre_parcelles_service_{dept}.parquet` ne garde que les parcelles
présentes dans DVF. Les sections et bâtiments restent complets : les bâtiments sont interrogés
à la demande par parcelle (endpoint `/api/batiments`, préfiltre bbox `clon`/`clat` puis
`ST_Intersects`), pas réduits au graphe DVF.

## 1.4 Contours communes (geo.api.gouv.fr) + contours codes postaux dérivés

- **Source communes** : [geo.api.gouv.fr](https://geo.api.gouv.fr) (`/communes?codeDepartement={dept}&geometry=contour`), limites administratives **IGN Admin Express**. Licence ouverte.
- **Statut** : ✅ **Intégré** — figé en local, plus de dépendance runtime à geo.api ; les contours code postal en sont **construits**.
- **Pourquoi pas un jeu « contours codes postaux » tout fait** : le seul référentiel national (« contours **calculés** des zones codes postaux », adresse.data.gouv.fr, millésime **2021**) est constitué d'enveloppes par adresse qui **débordent et se chevauchent largement** (ex. le 33000 englobant toute l'agglo bordelaise) → **abandonné**. Il n'existe par ailleurs aucun découpage officiel pour un code postal **intra-communal** (une commune à plusieurs CP).

**Méthode** (cf. [`telechargement/preparer_communes.py`](../telechargement/preparer_communes.py) puis [`telechargement/preparer_codes_postaux.py`](../telechargement/preparer_codes_postaux.py)) :
1. **Communes** : un appel geo.api par département → `contours_communes_{dept}.parquet` (`insee, nom, geom_wkb`). Détail IGN qui **suit les axes réels** (routes, rues).
2. **Codes postaux** (hybride, à partir des communes locales + BAN) :
   - CP couvrant des **communes entières** → **union** des polygones communaux (exact, sans chevauchement) ;
   - **commune découpée** en plusieurs CP (grandes villes) → **partition adaptative par plus proche adresse BAN**, fusionnée par CP et **découpée à la commune**. Astuce : une coordonnée → un seul CP (le plus fréquent) pour éviter les chevauchements.
   - Le flag **`is_split`** marque les CP issus de cette partition intra-communale (vs union de communes).

**Champs** : `contours_communes_{dept}` = `insee` (↔ DVF `code_commune` / citycode BAN), `nom`, géométrie WKB. `contours_codes_postaux` = `codePostal` (↔ DVF `code_postal`), `nb_points`, `is_split`, géométrie WKB.

**Clé de service** : lecture DuckDB `ST_GeomFromWKB` filtrée sur `insee` / `codePostal` (endpoint `/api/codepostal`), cohérente avec la résolution des sections cadastrales. Communes et CP partageant la **même géométrie geo.api**, le service peut filtrer les biens débordants (géocodage hors limite administrative) sur le polygone exact.

**Artefacts** : `data/interim/contours_communes_{dept}.parquet` (~2-3 Mo/dept) + `data/interim/contours_codes_postaux.parquet` (~2 Mo, départements présents). Qualité mesurée : ≥ 99,9 % des biens d'un CP tombent dans son contour.

## 1.5 Mailles géographiques : définitions et cardinalités

Référence pour les **emprises de comparaison** du POC (rayon, section, code postal, commune) et
pour toute requête filtrant par zone. Sources : **Code Officiel Géographique (COG)** de l'INSEE
(`v_commune_{millésime}.csv`, data.gouv `58c984b088ee386cdb1261f3`) et **Base officielle des
codes postaux** de La Poste (data.gouv `545b55e1c751df52de9b6045`).

| Objet | Définition | Cardinalité | Preuve |
| --- | --- | --- | --- |
| **Commune** ↔ **code INSEE** (`code_commune`, citycode) | maille administrative de base ; le code INSEE (`COM`, 5 caractères) l'identifie | **1:1** (bijection, à millésime donné) | COG : un seul `COM` par commune. **Conséquence : « emprise commune » = « emprise code INSEE »**, même zone, même filtre |
| **Code postal** ↔ **commune** | objet de **distribution postale** (La Poste), pas une maille administrative | **N:M** | CP `01300` → 24 communes ; Toulouse (`31555`) → 6 CP (`31000…31500`) |
| **« Ville »** | **notion non officielle** ; en pratique = commune. Absente du COG | — | sous la commune : lieux-dits (`Ligne_5` La Poste) **sans code INSEE**, donc non filtrables à une maille propre |
| **Arrondissement municipal** (Paris/Lyon/Marseille) | subdivision de commune | code INSEE **propre** (`TYPECOM=ARM`), parent via `COMPARENT` | Paris commune `75056` ; arrond. `75101`–`75120`. Marseille `13055` → `13201`–`13216` ; Lyon `69123` → `69381`–`69389` |
| **Commune déléguée / associée** | ancienne commune fusionnée dans une commune nouvelle | code INSEE **propre** (`TYPECOM=COMD`/`COMA`), parent via `COMPARENT` | Béon `01039` (délégué) → parent `01138` |

**Application dans le code** (toutes les requêtes respectent ces cardinalités) :
- Emprise **commune** : filtre par code INSEE — attribut DVF `code_commune` (`add_scope_filter`)
  **et** géométrie `ST_Within` sur `contours_communes.insee` (1:1, cf. §1.4). Pas d'emprise
  « code INSEE » séparée : elle désignerait la **même** zone (la barre de recherche permet déjà
  de saisir nom de commune, code postal ou adresse).
- Emprise **code postal** : N:M assumé — `scope_communes_rows` liste **toutes** les communes
  d'un CP et **tous** les CP d'une commune ; le contour CP est hybride (union de communes +
  partition intra-communale, cf. §1.4). Ne jamais supposer « 1 CP = 1 commune ».
- `dept_from_citycode` dérive le département du code INSEE (`97x` → 3 car. DOM ; Corse `2A/2B`
  → 2 car.).
- **Normalisation des codes périmés (millésime COG)** : le code INSEE n'est unique qu'à
  millésime fixé — une fusion (commune nouvelle, fusion-association) fait **disparaître** un code
  des référentiels courants (geo.api, BAN). DVF conservant le code au moment de la vente, ces
  ventes seraient orphelines (ni contour ni adresse). [`telechargement/preparer_passage_communes.py`](../telechargement/preparer_passage_communes.py)
  télécharge le **COG INSEE** (`v_commune` + `v_mvt_commune`, data.gouv `58c984b088ee386cdb1261f3`)
  et produit deux tables nationales : `passage_communes` (`code_perime → code_actuel`, fermeture
  transitive des fusions) et `communes_actuelles` (`insee → nom_cog`, autorité de nommage).
  `preparer_donnees._normaliser_communes` les applique au DVF : **(1)** remap des codes périmés
  vers la commune actuelle, **(2)** nom COG autoritaire par code — ce qui corrige aussi les codes
  *survivants renommés* (commune nouvelle reprenant le code d'une fondatrice, p.ex. `17268`
  Nuaillé-sur-Boutonne → Rives-de-Boutonne). Résultat vérifié sur 17/33/47 : **0 code commune
  orphelin, 0 nom divergent du contour geo.api**. La normalisation **conserve l'origine** :
  `comparables.commune_modif_origine` (`Nom (CODE)`) + `commune_modif_date` (table
  `communes_modif`, dates `v_mvt_commune`) tracent la fusion/renommage au **détail d'une vente**
  (ex. vendue sous *Saint-Georges-de-Longuepierre (17334)*, rattachée à *Rives-de-Boutonne*,
  modifiée le 2025-01-01).

> **Limite connue** : pour Paris/Lyon/Marseille, DVF porte le code d'**arrondissement** (`751xx`…)
> tandis que `contours_communes` (geo.api `/communes`) ne fournit que la commune-mère. Le filtre
> par **attribut** reste exact (par arrondissement) ; seul le **tracé** du contour peut manquer.
> Sans incidence sur la Gironde (dept de référence), à traiter via l'endpoint geo.api
> `/communes/{code}/arrondissements-municipaux` si ces métropoles sont intégrées.

---

# 2. Pivot bâtiment

## 2.1 RNB — Référentiel National des Bâtiments  ⭐ pivot recommandé

- **ID data.gouv** : `65a5568dfc88169d0a5416ca` · Organisation : RNB (beta.gouv) · Licence : `lov2` · Fréquence : **hebdomadaire** · MàJ catalogue : 2026-06-08
- **Statut** : ✅ Catalogué
- **Définition** : référentiel **national de référence du bâtiment** attribuant un identifiant stable (`rnb_id`) à chaque bâtiment, conçu pour relier entre elles les bases adresse / parcelle / DPE / énergie. **Candidat naturel comme pivot de jointure du socle.**

**Fichiers / accès**
| Ressource | Format | Taille |
| --- | --- | --- |
| Export national `RNB_nat.csv.zip` | zip(csv) | 10,8 Go |
| Export départemental `RNB_{dept}.csv.zip` (ex. `RNB_33` = Gironde) | zip(csv) | 277 Mo (33) |

**Champs (export CSV, 7 colonnes)** :
| Colonne | Contenu | Rôle jointure |
| --- | --- | --- |
| `rnb_id` | Identifiant RNB du bâtiment | **Pivot** |
| `point` | Point WGS84 (EWKT) | Requête spatiale |
| `shape` | Enveloppe bâtiment WGS84 (EWKT) | Requête spatiale/polygone |
| `status` | Statut physique du bâtiment | Filtre |
| `ext_ids` | JSON — ids BD TOPO et **BDNB** | → BDNB / BD TOPO |
| `addresses` | JSON — liste d'adresses, ≥ **clé d'interop BAN** | → BAN |
| `plots` | JSON — **parcelles cadastrales** + ratio de recouvrement | → Cadastre / DVF |

**Superflu / doublon** : `shape` peut être omis si seul `point` suffit (allège fortement). `status` filtrable en amont.

**Clés de jointure** : c'est le **hub** — `addresses.cle_interop` ↔ BAN, `plots.id` ↔ Cadastre/DVF. `ext_ids` peut contenir des identifiants externes, dont BDNB construction, mais **ne doit pas être utilisé comme conversion implicite vers `batiment_groupe_id` BDNB** sans table officielle. À relier à DPE via `rnb_id`.

**Artefacts service** : après récupération des non-matchs, `rnb_plots_service_{dept}`,
`rnb_adr_service_{dept}` et `rnb_points_service_{dept}` ne gardent que les parcelles DVF et les
`rnb_id` récupérés. Les exports RNB complets restent nécessaires en amont pour retrouver les
parcelles renumérotées et les rattachements par adresse/spatial.

## 2.2 BDNB — Base de Données Nationale des Bâtiments

- **ID data.gouv** : `61dc7157488f8cdb4283e3c3` · Organisation : CSTB · Licence : `lov2` · Fréquence : **semestrielle** · MàJ catalogue : 2026-05-22
- **Statut** : ✅ Ciblé pour les fiches détail et la résolution groupe bâtiment par parcelle
- **Définition** : carte d'identité agrégée des **~32 M de bâtiments** (croisement d'une vingtaine de bases publiques), à la maille bâtiment : âge, typologie, énergie/DPE, rénovation.

**Fichiers / accès** : exports France **très volumineux** — CSV 36,7 Go, GPKG 47,5 Go, pgdump 37,7 Go ; exports **départementaux** sur `bdnb.io/download` / S3 `open-data.s3.fr-par.scw.cloud` ; **API BDNB Open** `69427c378a39a6a5051349e7`, base `https://api.bdnb.io/v1/bdnb` ; **dictionnaire de données** xlsx (`documentation.xlsx`, v0.7.11).

**Route / tables officielles retenues** : la spec API expose `/donnees/batiment_groupe_complet_parcelle`, décrite comme une jointure `batiment_groupe` avec les tables métier faisant le lien avec les parcelles. En production locale, on reconstruit cette vue depuis les ZIP départementaux avec `rel_batiment_groupe_parcelle`, `batiment_groupe`, `batiment_groupe_synthese_propriete_usage`, `batiment_groupe_ffo_bat`, `batiment_groupe_rnc`, `batiment_groupe_geospx` et `batiment_groupe_bdtopo_bat`.

**Position dans le socle** : BDNB enrichit les fiches détail et peut résoudre un `batiment_groupe_id` quand une parcelle n'a qu'un groupe BDNB. Le pivot bâtiment reste RNB quand un `rnb_id` est résolu ; on ne remplace pas RNB par BDNB via inférence.

**Champs ciblés retenus** : `batiment_groupe_id`, `parcelle_id`, `code_departement_insee`, `code_commune_insee`, `usage_principal_bdnb_open`, `usage_niveau_1_txt`, `nb_log`, `nb_log_rnc`, `nb_lot_garpark_rnc`, `nb_lot_tertiaire_rnc`, `surface_emprise_sol`, `hauteur_mean`, `nb_niveau`, `annee_construction`, `mat_mur_txt`, `mat_toit_txt`, `type_batiment_dpe`, `fiabilite_emprise_sol`, `fiabilite_hauteur`, `fiabilite_cr_adr_niv_1`, `fiabilite_cr_adr_niv_2`, `s_geom_groupe`.

**Règle de précision** : si la route renvoie plusieurs `batiment_groupe_id` pour une parcelle, la fiche reste au niveau parcelle enrichie. Aucun choix par "plus grande emprise", distance ou surface n'est appliqué sans source officielle.

**Artefact service** : `bdnb_batiments_service_{dept}.parquet` est filtré sur les `parcelle_id`
présents dans DVF. L'ingestion départementale filtre également les tables BDNB dès que possible
sur ces parcelles puis sur les `batiment_groupe_id` restants.

---

# 3. Enrichissements optionnels

## 3.1 DPE Logements existants (depuis juillet 2021)  ⭐ jointure clé

- **ID data.gouv** : `67f7e557cb268460ce66c8d4` · Organisation : ADEME · Licence : `lov2` · Fréquence : **hebdomadaire** · MàJ catalogue : 2026-06-08
- **Statut** : 🔎 À échantillonner · **~14,9 M enregistrements**
- **Définition** : ensemble des **diagnostics de performance énergétique** réalisés sur les logements existants depuis juillet 2021 (classe énergie/GES, consommation, caractéristiques du logement). Source du **signal énergétique** (cf. CONTEXT) destiné à remplacer l'ajustement DPE manuel.

**Fichiers / accès** : données hébergées par l'**ADEME** (`data.ademe.fr/datasets/dpe03existant`) — consultation, **description des champs** et **API** documentées là-bas (pas de fichier tabulaire data.gouv direct).

**Champs clés retenus** (noms réels de l'API ADEME, vérifiés — 145 champs au total) :
- Identification / jointure : `numero_dpe`, **`identifiant_ban`** (clé BAN cle_interop, ex. `48027_z3ta9n_00091`), `code_departement_ban`, `code_insee_ban`, `code_postal_ban`, `nom_commune_ban`, `nom_rue_ban`, `numero_voie_ban`, `adresse_ban`, `_geopoint` (lat,lon), `score_ban` + `statut_geocodage` (qualité géocodage).
- Métier : `etiquette_dpe`, `etiquette_ges`, `type_batiment` (maison/appartement/immeuble), `date_reception_dpe`, `version_dpe`.

> **Correction** : contrairement à une lecture optimiste de la doc ADEME, le DPE existant en open data **ne porte NI `rnb_id` NI identifiant parcelle**. Le seul lien sortant est `identifiant_ban`.

**Superflu pour le départ** : la masse des champs techniques de calcul réglementaire (parois, ponts thermiques, systèmes, consos…) — on ne retient que clé BAN, classe, GES, type, géopoint, qualité géocodage, dates.

**Clés de jointure** : `identifiant_ban` ↔ **même namespace que `BAN.id` et `RNB.cle_interop_ban`** → jointure directe par clé viable (vérifié : formats compatibles). ⚠️ Caveat à mesurer : une partie des `identifiant_ban` est **au niveau voie sans numéro** (ex. `48002_koo2vl`) → ne matche pas une adresse à la maison ; + qualité variable (`score_ban`). Pas de lien parcelle direct → passer par BAN (`cad_parcelles`) ou RNB (`plots`).

## 3.2 DPE Logements neufs (depuis juillet 2021)

- **ID data.gouv** : `67f7e5758ffc5d79ab9e8c27` · Organisation : ADEME · Licence : `lov2` · Fréquence : **hebdomadaire**
- **Statut** : ⏳ À approfondir
- **Définition** : équivalent du DPE existants pour les **logements neufs**. Même structure de champs ; à combiner avec le DPE existant selon ancien/neuf (recoupe les ventes VEFA de DVF).

## 3.3 Adresses extraites du cadastre

- **ID data.gouv** : `5bd837f2634f41112d338d46` · Organisation : data.gouv.fr (Etalab) · Licence : `lov2` · Fréquence : **annuelle** · MàJ catalogue : 2026-06-06
- **Statut** : ⏳ À approfondir
- **Définition** : adresses extraites du plan + fichier des parcelles bâties de la DGFiP, **source primaire de la BAN**, rattachant adresse ↔ parcelle. Formats : CSV / GeoJSON / NDJSON départementaux.
- **Position** : utile comme **renfort de la jointure adresse↔parcelle** quand BAN ne porte pas le lien cadastral. Doublon partiel de BAN → à n'utiliser qu'en appoint.

## 3.4 Registre national d'immatriculation des copropriétés

- **ID data.gouv** : `62da71c068871f4c54258c7c` · Organisation : ANAH · Licence : `lov2` · Fréquence : **quotidienne** · MàJ catalogue : 2026-06-09 · 18 ressources
- **Statut** : ⏳ À approfondir
- **Définition** : recensement des copropriétés à usage d'habitation (taille, période, situation administrative, adresse de référence).
- **Position** : enrichissement « facteur d'appartement » (taille de copropriété) ; jointure par adresse/commune. Hors socle initial.

## 3.5 GASPAR — risques

- **ID data.gouv** : `536995eea3a729239d20486b` · Organisation : Min. Transition écologique · Licence : `fr-lo` · Fréquence : **quotidienne** · MàJ catalogue : 2025-12-16
- **Statut** : ⏳ À approfondir
- **Définition** : procédures administratives liées aux risques (PPR naturels/technologiques/miniers, catastrophes naturelles, DICRIM) — **grain commune/zone**.
- **Position** : contexte de proximité / décote potentielle ; jointure par `code_commune`. Hors socle initial.

---

# 4. APIs (dataservices) — à approfondir

| API | ID dataservice | Usage | Statut |
| --- | --- | --- | --- |
| API Adresse (BAN / Géoplateforme) | `672cf67802ef6b1be63b8975` | Géocodage et autocomplétion à la saisie (`/search`, `/reverse`, `/search/csv`) | ⏳ |
| API Cadastre data.gouv (bundler Etalab) | `6661eadade5469423f58a6b4` | Exports parcelle/commune/EPCI | ⏳ |
| API Carto Cadastre (IGN) | `672cf6658e2b8878bf0a5e6c` | Géométrie/centroïde de parcelle, divisions cadastrales | ⏳ |
| API Carto GPU (urbanisme, IGN) | `672cf67520c9ae9747b4015c` | Zonage, servitudes, prescriptions intersectant un point/parcelle | ⏳ |
| API BDNB Open | `69427c378a39a6a5051349e7` | Bâtiments groupes par parcelle et attributs métier | ✅ |

> Note notebook : l'API actuelle (`api-adresse.data.gouv.fr`) doit être testée vs l'API Géoplateforme (`data.geopf.fr/geocodage/`).

---

# 5. Synthèse — graphe de jointure

Le **RNB (`rnb_id`) est le pivot bâtiment** qui relie les sources entre elles :

```
                         ┌─────────────┐
            cle_interop   │     BAN     │  code_insee
        ┌────────────────▶│  (adresse)  │
        │                 └─────────────┘
        │                        ▲ Identifiant__BAN
        │                        │
┌───────────────┐  plots.id ┌─────────────┐  rnb_id  ┌─────────────┐
│   CADASTRE    │◀──────────│     RNB     │─────────▶│     DPE     │
│  (parcelles)  │           │  (pivot     │          │ (existant/  │
│   id_parcelle │           │   bâtiment) │          │   neuf)     │
└───────────────┘           │  ext_ids    │          └─────────────┘
        ▲                   └─────────────┘                ▲
        │ id_parcelle              │ parcelle_id           │ parcelle
        │                          ▼                       │
┌───────────────┐           ┌─────────────┐                │
│      DVF      │           │    BDNB     │                │
│  (mutations)  │           │ (lourd, opt)│                │
│  id_parcelle  │───────────┴─────────────┴────────────────┘
└───────────────┘   (DVF↔DPE : pas d'id commun → via parcelle ou adresse)
```

> **Correction du modèle** (vérifié via le catalogue) : le DPE ne porte **que** `identifiant_ban` (pas de `rnb_id` ni parcelle). Le lien bâtiment passe par la **clé BAN cle_interop** (DPE ↔ RNB.addresses) ou par les coordonnées. BAN porte en plus `cad_parcelles` → crosswalk adresse↔parcelle.

**Chaînes de jointure exploitables**
1. **Adresse → bien** : adresse cible → API BAN → `id` (cle_interop) → RNB (`addresses.cle_interop_ban`) → `plots` → Cadastre (`id_parcelle`) → DVF.
2. **DVF → bâtiment/groupe** : DVF (`id_parcelle`) → RNB (`plots`) → `rnb_id` quand la parcelle ou l'adresse tranche ; DVF (`id_parcelle`) → BDNB (`parcelle_id`) → `batiment_groupe_id` quand la parcelle BDNB n'a qu'un groupe. Si plusieurs groupes restent possibles, on conserve le niveau parcelle.
3. **DPE → bâtiment** : DPE (`identifiant_ban`) → RNB (`addresses.cle_interop_ban`) → `rnb_id`. Fallback : spatial (DPE `_geopoint` ↔ RNB `point`) ou BAN crosswalk.

**Points durs à valider sur échantillon (dépt 33)**
- Taux de match direct `DPE.identifiant_ban` ↔ `RNB.cle_interop_ban` (+ part des clés DPE au niveau voie sans numéro, et qualité `score_ban`).
- Couverture des `plots` RNB sur les parcelles DVF (`id_parcelle`).
- Cardinalité parcelle ↔ bâtiment (combien de bâtiments par parcelle) → ambiguïté DVF→bâtiment→DPE.
- Apport réel de la BAN (`cad_parcelles`) en plus de RNB : nécessaire ou redondant ?
- Taux de couverture du fallback spatial (distance DPE↔RNB) quand la clé échoue.

---

# 6. Résultats de mesure — spike dept 33 (exécuté 2026-06-09)

Notebook : [notebooks/spike_jointures_33.ipynb](../notebooks/spike_jointures_33.ipynb). Volumes : 525 352 lignes DVF, 1 134 596 bâtiments RNB, 376 409 DPE.

| Mesure | Résultat | Conclusion |
| --- | --- | --- |
| Qualité clé DPE | `identifiant_ban` 100% rempli, **93,1% avec numéro**, score_ban 0,66 | clé adresse propre |
| **DPE ↔ RNB** (clé `cle_interop_ban`) | **87,0%** des clés DPE matchent | jointure énergétique par clé **viable** (pas de re-géocodage ; la crainte FANTOIR était infondée) |
| **DVF logement → RNB** (parcelle) | **95,0% des ventes** (Maison 96,8% / Appart 96,3%) | couverture parcelle excellente sur le bâti (le 52% global est plombé par les terrains/`(vide)` à 27%) |
| Cardinalité parcelle ↔ bâtiment | 2,26 moy, **max 769**, 38,1% mono-bâti | parcelle **ambiguë pour cibler 1 bâtiment** |
| DVF logement → DPE via RNB | **62,3%** | ~2/3 des ventes enrichissables DPE |
| Apport BAN vs RNB | BAN 16,2% / RNB 52,2% / union 54,5% (**+2,3 pts**) | BAN inutile comme crosswalk parcelle |

**Décisions éclairées** (cf. [ADR 0003](adr/0003-rnb-pivot-batiment.md)) : RNB `rnb_id` = **pivot bâtiment** ; parcelle = lien secondaire (fiable mais ambigu à l'unité) ; **BAN reste API-only** (validé par les chiffres) ; enrichissement DPE par clé d'adresse retenu. Restent à creuser : départage bâtiment/logement sur parcelles multi-bâtiments, et les ~13% de DPE non matchés (clés voie-seule, millésime BAN).

## 6.1 Récupération des 4,96% non-matchs DVF → RNB

Les 6 274 ventes de logement (4,96%) non rattachées par la parcelle ont *toutes* une parcelle valide en DVF **absente de `RNB.plots`** ; ~100% des bâtiments existent dans le RNB sur une **autre parcelle** → **renumérotation cadastrale**, pas un trou de couverture. Une cascade de récupération (cf. [ADR 0004](adr/0004-recuperation-non-matchs-dvf-rnb.md)) les rattache par fiabilité décroissante :

| Étape | Mécanisme | Récupérés (cumul) |
| --- | --- | --- |
| A — clé adresse | `insee_codevoie_numero` reconstruite → `RNB.adresses` | 4 811 |
| B — pont parcelle BAN | parcelle → `BAN.cad_parcelles` → clé → RNB | 4 903 |
| C — plus proche bâtiment | coords DVF → bâtiment RNB ≤ 50 m | 5 667 |
| D — géocodage BAN | api-adresse, **score ≥ 0,95** + type précis + bâtiment ≤ 50 m | **5 733** |

**Entonnoir : 120 119 match direct + 5 733 récupérées = 99,57% exploitable, 541 perdues (0,43%)**, ces dernières dominées par adresses lieu-dit / numéros fictifs absentes de toute référence. Artefacts : `data/interim/recup_liens_final_{dept}.parquet` (autorité, avec `methode`/`confiance`) + `pertes_{dept}.parquet` (raison de perte).

---

# 7. Statut global & prochaines étapes

| Source | Rôle | Statut |
| --- | --- | --- |
| DVF géolocalisé | Socle — comparables | ✅ mesuré (33) |
| BAN | Socle — adresse/géocodage | ✅ API-only (validé) |
| Cadastre | Socle — parcelle/section | 🔎 |
| RNB | Pivot bâtiment | ✅ mesuré (33) |
| DPE existants | Enrichissement — signal énergétique | ✅ mesuré (33) |
| DPE neufs | Enrichissement | ⏳ |
| BDNB | Enrichissement lourd | ⏳ |
| Adresses cadastre | Appoint jointure | ⏳ |
| Copropriétés | Enrichissement facteur appart. | ⏳ |
| GASPAR | Contexte risques | ⏳ |
| APIs (BAN, Cadastre, GPU) | Géocodage / géométrie / urbanisme | ⏳ |

**Prochaines étapes**
1. ~~Échantillonner le dépt 33 et mesurer les taux de match~~ → **fait** (cf. §6).
1bis. ~~Récupérer les ~5% de non-matchs DVF→RNB~~ → **fait** : 99,57% exploitable sur 33 (cf. §6.1, [ADR 0004](adr/0004-recuperation-non-matchs-dvf-rnb.md)).
1ter. ~~Figer l'organisation des données (table comparables)~~ → **fait** : grain bien logement + pont parcelle→bâtiment + ref adresses élagué ([ADR 0005](adr/0005-organisation-des-donnees-table-comparables.md)). Sur 33 : 138 804 biens, **57% rattachés au bâtiment sûr**, 39% à la parcelle. Artefacts : `comparables_{dept}`, `pont_batiment_{dept}`, `adresses_ref_{dept}`.
2. Départager bâtiment/logement sur parcelle multi-bâtiments : **plafond mesuré ~60%** (adresse 46%, surface 33% — cf. ADR 0005) → escalade DPE/BDNB seulement si un usage l'exige. Comprendre les ~13% de DPE non matchés.
3. Confirmer les colonnes _(à confirmer)_ du Cadastre (parcelles/sections) sur extrait réel.
4. Décider du périmètre d'ingestion (national direct vs progressif) — désormais possible sur la base des taux mesurés.

---

# 8. Fonds de carte (rendu web POC)

Fonds raster utilisés par le sélecteur « Fond de carte » du POC web ([web_poc/static/app.js](../web_poc/static/app.js)). Ce sont des **tuiles d'affichage**, pas des données du socle — aucune jointure, seulement le rendu.

**Galerie de référence pour choisir/comparer des fonds** : <https://leaflet-extras.github.io/leaflet-providers/preview/> — aperçu live de ~40 fournisseurs avec le template d'URL `{z}/{x}/{y}` copiable. ⚠️ Beaucoup de fournisseurs listés exigent désormais une **clé API** (Thunderforest, MapTiler, Stadia/Stamen) — vérifier au cas par cas avant d'intégrer.

| Fond (valeur sélecteur) | Fournisseur | URL | Clé / inscription | Attribution |
| --- | --- | --- | --- | --- |
| `ignplan` *(défaut)* | IGN Géoplateforme | WMTS `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` | Non | © IGN / cartes.gouv.fr |
| `carto` | CARTO Positron (`light_all`) | `basemaps.cartocdn.com/light_all/...` | Non | © OSM contributors © CARTO |
| `voyager` | CARTO Voyager | `basemaps.cartocdn.com/rastertiles/voyager/...` | Non | © OSM contributors © CARTO |
| `osm` | OpenStreetMap standard | `tile.openstreetmap.org/...` | Non | © OSM contributors |
| `ign` | IGN Géoplateforme | WMTS `ORTHOIMAGERY.ORTHOPHOTOS` (satellite) | Non | © IGN / cartes.gouv.fr |
| `stadiasat` | Stadia AlidadeSatellite | `tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg` | **Localhost seulement** (voir ⚠️) | © Stadia Maps © OpenMapTiles © OSM contributors |

> ⚠️ **Stadia.AlidadeSatellite — auth par domaine.** Vérifié 2026-06-10 : sans clé, une requête serveur→serveur renvoie **401**, mais avec un `Origin`/`Referer` en `localhost`/`127.0.0.1` elle renvoie **200**. Donc **utilisable sans clé ni inscription tant que le POC tourne en local**. Pour un déploiement sur un vrai domaine, il faut un compte Stadia (gratuit) pour enregistrer le domaine ou obtenir une clé API, sinon les tuiles renverront 401. C'est la seule entrée du sélecteur soumise à cette condition.

---

# 9. Mode Exploration (panorama de marché) — usage des données DVF

Le POC web a deux modes : **Estimation** (comparables d'un bien cible, via `comparables_{dept}`) et **Exploration** (`/api/market`), qui affiche le **prix de tous les biens dans une emprise**, indépendamment d'un bien cible. Deux qualités de prix selon la source, par construction :

| Catégorie | Source | €/m² | Qualité |
| --- | --- | --- | --- |
| Maison, Appartement | `comparables_{dept}` (mono-bien, propre) | `valeur_fonciere / surface_reelle_bati` | **logement** (fiable) |
| Terrain | DVF brut, **mutations mono-ligne** | `valeur_fonciere / surface_terrain` | indicatif |
| Dépendance, Local | DVF brut, **mutations mono-ligne** | `valeur_fonciere / surface_reelle_bati` | indicatif |

**Pourquoi mono-ligne** : dans DVF brut, `valeur_fonciere` est au grain **mutation** (dupliquée sur chaque ligne bâti + terrain d'une même vente). Calculer un €/m² par ligne sur les ventes multi-lignes fausserait le prix. On ne retient donc, pour terrain/dépendance/local, que les **mutations à une seule ligne** (≈ 68 k sur le 33) où `valeur_fonciere` = prix d'un bien unique sans ambiguïté. **Limite assumée** : les terrains/dépendances vendus dans des mutations multi-lignes sont écartés → panorama indicatif, non exhaustif.

**Découplage carte / liste** (perf) : `/api/market` et `/api/estimate` renvoient deux tableaux — `points` (tous les biens de l'emprise, payload allégé : coords + type + prix, plafond de sécurité 20 000) pour la carte WebGL, et `comparables`/`biens` (liste détaillée plafonnée par le paramètre `max_comparables`, défaut 200) pour le tableau DOM. Les statistiques (médiane €/m²) sont calculées sur la **cohorte complète**, pas sur l'échantillon affiché.

---

# 10. Cadastre — mesures de croisement et intégration POC (33)

Spike exécuté 2026-06-10 (DuckDB spatial sur `cadastre_parcelles_33` ≈ 1,99 M parcelles, `cadastre_sections_33` = 6 987 sections).

| Croisement | Mesure (33) | Conclusion |
| --- | --- | --- |
| DVF logement `id_parcelle` ∈ cadastre | **97,89%** | Jointure parcelle fiable ; 2,11% manquants = renumérotation (cf. ADR 0004) |
| DVF → section (`substr(id,1,10)`) ∈ cadastre | **99,84%** · 4 145 sections ≥5 ventes (76%) · 30,8 ventes/section | **Emprise Section pleinement exploitable** |
| Point DVF ∈ parcelle déclarée | **97,12%** | Cohérence coords ↔ parcelle validée |
| Recovery spatiale renumérotation (avec coords) | **98,67%** | Assignation parcelle par point-dans-polygone, robuste à l'`id` — complète la cascade RNB d'ADR 0004 |
| `contenance` (surface parcelle) | **99,97%** dispo · 98 600 maisons enrichies · terrain médian 776 m² | **Feature prédictive** « surface terrain » pour la maison |

**Caveat** : la recovery spatiale ne couvre que les parcelles renumérotées **disposant de coordonnées DVF** ; le reste passe par la cascade adresse RNB (ADR 0004). Le cadastre est un **complément/validateur**, pas un remplaçant du pivot RNB.

**Intégration POC web (v0.6.x)** :
- **Emprise « Section »** : `resolve_section()` résout la section contenant l'adresse (point-dans-polygone), filtre les comparables/biens sur `substr(id_parcelle,1,10)` et renvoie le polygone pour l'affichage.
- **Overlay cadastre** (`/api/parcelles`) : lignes de parcelles, soit par `ids` (parcelles des biens listés), soit par `bbox` (vue courante, filtre sur centroïde `clon`/`clat` précalculé, plafonné). Indépendant du fond de carte.

**Pistes ouvertes (cf. HAND-OFF)** : exposer **tous les bâtiments d'une parcelle** (maison + dépendances : garage, abri, jardin) via RNB `plots`/`shape`, et enrichir le **détail du comparable** (contenance, section, nb de bâtiments sur la parcelle, etc.).
