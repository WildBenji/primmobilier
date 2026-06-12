# Exploration DPE — Fusion pré et post juillet 2021

> **Objectif** : comprendre les 2 jeux de données DPE (avant et après la réforme du 1er juillet 2021), leurs schémas, leurs différences, et définir une stratégie de fusion en une table unique exploitable pour le socle immobilier cartographique.

- **Date d'exploration** : 2026-06-11
- **Sources** : ADEME (data.ademe.fr), data.gouv.fr, API Data-Fair
- **Contexte métier** : le DPE est un **enrichissement optionnel** qui alimente le **signal énergétique** et l'**ajustement énergétique** (cf. [CONTEXT.md](../CONTEXT.md)). La table fusionnée servira à l'appariement DPE → bien cible et à l'enrichissement des comparables.

> ### ⚠️ Passe de vérification — 2026-06-12 (via MCP data.gouv + API ADEME data-fair en direct)
> Le corps de ce document (exploration du 2026-06-11) est **conservé tel quel**, y compris ses parties erronées : en cas de doute sur le terrain, on préfère relire la source brute que de l'avoir effacée. Les corrections vérifiées sont ajoutées à côté, marquées **« ✅ vérifié »**, et **font foi** là où elles contredisent le corps.
>
> **Confirmé exact** : IDs des jeux (existants `67f7e557cb268460ce66c8d4`, neufs `67f7e5758ffc5d79ab9e8c27`), ADEME / licence `lov2` / MàJ **hebdomadaire**, volumétrie post-2021 = **14 968 624** lignes, schéma (tous les champs cités existent, dont `id_rnb`), data.gouv = simples pointeurs vers `data.ademe.fr/datasets/dpe03existant`, pas de jeu data.gouv pour le pré-2021.
>
> **Corrigé** (détails en **§6.4**) : (1) le filtre `?code_departement_ban=33` du §6.1 est **silencieusement ignoré** par data-fair (testé : renvoie d'autres départements) → utiliser `?qs=code_departement_ban:33` ; (2) la **pagination par curseur** (`next`/`after`) est obligatoire et manquait — le dept 33 seul a **378 013** DPE post-2021. **Amélioration de fond** (détails en **§8.1**) : pour primmobilier, prioriser **`id_rnb`** (jointure RNB directe) avant `identifiant_ban`.
>
> **Périmètre du chantier (clarifié 2026-06-12)** : le **pré-2021 est déjà résolu** — l'intégralité est sur notre **S3 d'enrichissement**, rien à acquérir (§6.2). **Le seul vrai chantier d'acquisition est le post-2021** (§6.5). Le POC `preparer_dpe.py`/`nettoyer_dpe.py` a été **audité** : son acquisition (CSV locaux d'avril 2024) est une impasse prod et son fichier de sortie n'est **pas exploitable** (`id_rnb` 0 %, `numero_dpe` post garbage, dates absentes) ; mais l'API §6.4 récupère tout (id_rnb 52 %, ban 99,9 %, en ~3 min/dept) et le nettoyage est à conserver. Détail en **§6.5**.

---

## 1. Inventaire des jeux de données

| Propriété | DPE avant juillet 2021 | DPE après juillet 2021 |
|---|---|---|
| **ID data.gouv** | *(pas de dataset data.gouv.fr, seulement ADEME)* | `67f7e557cb268460ce66c8d4` |
| **Nom ADEME** | `dpe-france` (logements) + `dpe-tertiaire` | `dpe03existant` (logements existants) + `67f7e5758ffc5d79ab9e8c27` (neufs) |
| **Volumétrie** | ~10,7 M enregistrements (logements) | ~14,9 M enregistrements (existants) |
| **Période** | 2013 → 30 juin 2021 | 1er juillet 2021 → aujourd'hui |
| **Méthode** | Multiple : 3CL, factures, conventionnelle… | **Unifiée** : 3CL 2021 uniquement |
| **Usages mesurés** | 3 (chauffage, ECS, refroidissement) | 5 (+ éclairage, auxiliaires) |
| **Seuil GES** | Oui, mais séparé | **Double-seuil** intégré dans l'étiquette DPE |
| **Nb champs (API)** | ~20 (vue tabulaire simplifiée) | **230** (détaillés, 18 groupes) |
| **Dump SQL brut** | `dpe_logement_202103.sql` (~1,6 Go) | `dump_dpev2_prod_fdld.sql.gz` (PostgreSQL) |
| **Géocodage** | `latitude`/`longitude` + `geo_score` | **BAN** : `identifiant_ban`, `coordonnee_cartographique_x/y_ban`, `score_ban`, `statut_geocodage` |
| **Clé adresse pivot** | `geo_adresse` (texte libre) | **`identifiant_ban`** (namespace BAN, jointure RNB) |
| **Fréquence MàJ** | Figé (dernière MàJ 14 déc 2022) | **Hebdomadaire** |
| **Contrôles cohérence** | Aucun (données brutes) | **Oui** (rejet si bloquant) |
| **Licence** | Licence Ouverte v2 | Licence Ouverte v2 |

### 1.1 DPE tertiaire (avant 2021)

Jeu séparé `dpe-tertiaire` : ~515 k enregistrements, bâtiments tertiaires uniquement. **Hors périmètre** pour le socle logement. À n'intégrer que si le besoin tertiaire émerge.

### 1.2 DPE neufs (après 2021)

Jeu `67f7e5758ffc5d79ab9e8c27` : même structure que `dpe03existant`, pour les logements **neufs**. Recoupe les ventes VEFA de DVF. **À fusionner avec les existants** dans la table unifiée (un champ `origine_dpe` = `existant` / `neuf`).

---

## 2. Schéma détaillé — DPE après juillet 2021 (`dpe03existant`)

230 champs répartis en 18 groupes. La source est le dictionnaire de données ADEME (joint au dataset) et le schéma exposé par l'API Data-Fair.

### 2.1 Groupe « Administratif » (16 champs)

| Champ | Type | Description | Cardinalité |
|---|---|---|---|
| `numero_dpe` | string | Identifiant unique du DPE | 14,9 M |
| `date_etablissement_dpe` | date | Date d'établissement | 1 804 valeurs |
| `date_visite_diagnostiqueur` | date | Date de visite | 1 835 |
| `date_reception_dpe` | date | Date de réception par l'ADEME | 1 802 |
| `date_fin_validite_dpe` | date | Date de fin de validité (10 ans) | 1 802 |
| `date_derniere_modification_dpe` | date | **Date de dernière modification** — à utiliser pour l'alimentation incrémentale | 162 |
| `numero_dpe_remplace` | string | Numéro du DPE remplacé par celui-ci | 1,36 M |
| `numero_dpe_immeuble_associe` | string | DPE immeuble associé (appartements) | 166 k |
| `id_rnb` | string | Identifiant RNB du bâtiment | 2,7 M |
| `provenance_id_rnb` | string | Origine du `id_rnb` : `Reprise RNB` ou `Logiciel` | 2 |
| `numero_rpls_logement` | string | Identifiant RPLS (logement social) | 35 k |
| `numero_immatriculation_copropriete` | string | Immatriculation copropriété | 79 k |
| `modele_dpe` | string | Modèle : `DPE 3CL 2021 methode logement` (valeur unique) | 1 |
| `version_dpe` | number | Version du moteur de calcul : 1, 1.1, 2, 2.1 à 2.6 | 9 |
| `methode_application_dpe` | string | 6 méthodes : `dpe maison individuelle`, `dpe appartement individuel`, `dpe appartement genere a partir des donnees DPE immeuble`, `dpe immeuble collectif`, `dpe issu d'une etude thermique reglementaire RT2012 batiment : appartement`, `dpe issu d'une etude thermique reglementaire RT2012 batiment : immeuble` | 6 |

### 2.2 Groupe « Bilan DPE » (2 champs) — ⭐ essentiels

| Champ | Type | Description | Valeurs |
|---|---|---|---|
| `etiquette_dpe` | string | Classe énergétique (A à G) — prend en compte le **double-seuil** énergie + GES | A, B, C, D, E, F, G |
| `etiquette_ges` | string | Classe GES seule (A à G) | A, B, C, D, E, F, G |

> **Attention** : depuis 2021, l'étiquette DPE intègre à la fois la consommation d'énergie primaire ET les émissions de GES. Le seuil le plus défavorable des deux détermine la classe. Ce n'était pas le cas avant 2021 où les deux étiquettes étaient indépendantes.

### 2.3 Groupe « Caractéristiques bâtiment » (15 champs) — ⭐ essentiels

| Champ | Type | Description | Valeurs / Notes |
|---|---|---|---|
| `type_batiment` | string | Type de bâtiment | `appartement`, `maison`, `immeuble` |
| `annee_construction` | integer | Année de construction | 588 valeurs distinctes |
| `periode_construction` | string | Période de construction (10 périodes) | `avant 1948`, `1948-1974`, `1975-1977`, `1978-1982`, `1983-1988`, `1989-2000`, `2001-2005`, `2006-2012`, `2013-2021`, `apres 2021` |
| `type_installation_chauffage` | string | Individuel / collectif | `individuel`, `collectif`, `mixte (collectif-individuel)` |
| `type_installation_ecs` | string | Individuel / collectif | `individuel`, `collectif`, `mixte (collectif-individuel)` |
| `hauteur_sous_plafond` | number | Hauteur sous plafond (m) | 610 valeurs |
| `nombre_appartement` | integer | Nombre d'appartements dans l'immeuble | 963 valeurs |
| `nombre_niveau_immeuble` | integer | Nombre de niveaux de l'immeuble | 79 valeurs |
| `nombre_niveau_logement` | integer | Nombre de niveaux du logement (maison) | 205 valeurs |
| `typologie_logement` | string | Typologie (ex. T2, T3…) | 7 valeurs |
| `appartement_non_visite` | integer | Appartement non visité (0/1) | 0, 1 |
| `surface_habitable_logement` | number | **Surface habitable du logement (m²)** — ⭐ clé pour l'estimation | 7 962 valeurs |
| `surface_habitable_immeuble` | number | Surface habitable de l'immeuble | 85 k valeurs |
| `surface_tertiaire_immeuble` | number | Surface tertiaire de l'immeuble | 1 933 valeurs |
| `classe_inertie_batiment` | string | Inertie thermique | `Légère`, `Moyenne`, `Lourde`, `Très lourde` |

### 2.4 Groupe « Localisation » (22 champs) — ⭐ clés de jointure

| Champ | Type | Description | Notes |
|---|---|---|---|
| `identifiant_ban` | string | **Clé BAN** (cle_interop) — ⭐ jointure directe avec RNB | 4,96 M remplis |
| `adresse_ban` | string | Adresse complète BAN | 4,8 M |
| `numero_voie_ban` | string | Numéro de voie | 14,9 k distincts |
| `nom_rue_ban` | string | Nom de rue | 711 k distincts |
| `nom_commune_ban` | string | Nom commune | 37 k distincts |
| `code_postal_ban` | string | Code postal | 6 171 distincts |
| `code_insee_ban` | string | Code INSEE commune | 35 k distincts |
| `code_departement_ban` | string | Code département | 104 distincts |
| `code_region_ban` | string | Code région | 19 valeurs |
| `coordonnee_cartographique_x_ban` | number | Coordonnée X (Lambert 93 probable) | 4,9 M |
| `coordonnee_cartographique_y_ban` | number | Coordonnée Y (Lambert 93 probable) | 4,9 M |
| `score_ban` | number | Score de qualité du géocodage BAN (0-1) | 97 valeurs |
| `statut_geocodage` | string | `adresse geocodee ban a l'adresse` ou `adresse non geocodee ban car aucune correspondance trouvee` | 2 valeurs |
| `adresse_brut` | string | Adresse brute saisie par le diagnostiqueur | 6,6 M |
| `adresse_complete_brut` | string | Adresse complète brute | 7,1 M |
| `nom_commune_brut` | string | Commune brute | 331 k |
| `code_postal_brut` | integer | Code postal brut | 9 491 distincts |
| `numero_etage_appartement` | integer | Étage | 106 valeurs |
| `position_logement_dans_immeuble` | string | Position (ex. étage) | 3 valeurs |
| `nom_residence` | string | Nom de résidence | 278 k distincts |
| `complement_adresse_batiment` | string | Complément adresse bâtiment | 5,3 M |
| `complement_adresse_logement` | string | Complément adresse logement | 3,6 M |
| `classe_altitude` | string | Classe d'altitude | `inferieur a 400m`, `400-800m`, `superieur a 800m`, `Non affecte` |
| `zone_climatique` | string | Zone climatique réglementaire | H1a, H1b, H1c, H2a, H2b, H2c, H2d, H3 |

### 2.5 Groupes consommation, GES, coûts

**Consommation énergie primaire** (kWhEP) : `conso_5_usages_ep`, `conso_5_usages_par_m2_ep`, `conso_chauffage_ep`, `conso_ecs_ep`, `conso_refroidissement_ep`, `conso_eclairage_ep`, `conso_auxiliaires_ep`

**Consommation énergie finale** (kWhEF) : mêmes 7 champs suffixés `_ef`

**Émissions GES** (kgCO2eq) : `emission_ges_5_usages`, `emission_ges_5_usages_par_m2`, + 5 usages

**Coûts** (€) : `cout_total_5_usages`, `cout_chauffage`, `cout_ecs`, `cout_refroidissement`, `cout_eclairage`, `cout_auxiliaires`

**Bilan par énergie** (n1=principale, n2=secondaire, n3=tertiaire) : pour chaque niveau n, 10 champs : `type_energie_n*`, `conso_5_usages_ef_energie_n*`, `conso_chauffage_ef_energie_n*`, `conso_ecs_ef_energie_n*`, `cout_total_5_usages_energie_n*`, `cout_chauffage_energie_n*`, `cout_ecs_energie_n*`, `emission_ges_5_usages_energie_n*`, `emission_ges_chauffage_energie_n*`, `emission_ges_ecs_energie_n*`.

Types d'énergie (14 valeurs) : `Gaz naturel`, `Electricité`, `Réseau de Chauffage urbain`, `Fioul domestique`, `Bois – Bûches`, `Bois – Granulés (pellets) ou briquettes`, `GPL`, `Propane`, `Bois – Plaquettes forestières`, `Charbon`, `Bois – Plaquettes d'industrie`, `Électricité d'origine renouvelable utilisée dans le bâtiment`, `Butane`, `Réseau de Froid Urbain`

### 2.6 Groupes techniques (chauffage, ECS, ventilation, climatisation, ENR, isolation)

Structures arborescentes détaillées avec jusqu'à 2 installations, 2 générateurs par installation. Voir la section 8 pour les champs effectivement retenus pour le socle.

**Champs booléens (0/1)** : `appartement_non_visite`, `protection_solaire_exterieure`, `logement_traversant`, `presence_brasseur_air`, `inertie_lourde`, `isolation_toiture`, `ventilation_posterieure_2012`

### 2.7 Champs système Data-Fair

`_geopoint` (lat,lon), `_id`, `_i` (ligne d'origine), `_rand` (tri aléatoire).

---

## 3. Schéma détaillé — DPE avant juillet 2021 (`dpe-france`)

La vue tabulaire Data-Fair pour les logements expose ~20 champs agrégés (les données complètes sont dans le dump SQL `dpe_logement_202103.sql` avec des dizaines de tables).

### 3.1 Champs de la vue tabulaire

| Champ | Type | Description | Valeurs / Notes |
|---|---|---|---|
| `numero_dpe` | string | Identifiant unique du DPE | 10,7 M distincts |
| `nom_methode_dpe` | string | Méthode utilisée (3CL, factures…) | 491 valeurs distinctes ⚠️ |
| `version_methode_dpe` | string | Version de la méthode | 91 valeurs distinctes |
| `date_etablissement_dpe` | date | Date d'établissement | 3 701 valeurs |
| `consommation_energie` | number | **Consommation énergie primaire** (kWhEP/m².an) — 3 usages | 82 613 valeurs |
| `classe_consommation_energie` | string | **Classe énergétique** (A-G, mais + valeurs parasites) | 19 valeurs ⚠️ |
| `estimation_ges` | number | **Estimation GES** (kgCO2eq/m².an) — 3 usages | 19 770 valeurs |
| `classe_estimation_ges` | string | **Classe GES** (A-G, + valeurs parasites) | 16 valeurs ⚠️ |
| `annee_construction` | integer | Année de construction | 873 valeurs |
| `surface_thermique_lot` | number | **Surface thermique du lot** (m²) — équivalent `surface_habitable_logement` | 69 031 valeurs |
| `tr001_modele_dpe_type_libelle` | string | Type de DPE | `Vente`, `Location`, `Neuf`, `Copropriété`, `Bâtiment public`, `Centre commercial` |
| `tr002_type_batiment_description` | string | Type de bâtiment | `Logement`, `Maison Individuelle`, `Bâtiment collectif à usage principal d'habitation` |
| `code_insee_commune_actualise` | string | Code INSEE commune | 47 011 distincts |
| `tv016_departement_code` | string | Code département | 96 distincts |
| `latitude` | number | Latitude | 2,5 M remplis |
| `longitude` | number | Longitude | 2,7 M remplis |
| `geo_adresse` | string | Adresse géocodée (texte) | 3,3 M remplis |
| `geo_score` | number | Score géocodage | 71 valeurs |
| `_geopoint` | string | Centroïde "lat,lon" | Calculé |

### 3.2 Problèmes de qualité — classes énergétiques pré-2021

Les valeurs réelles de `classe_consommation_energie` (pré-2021) **ne sont pas limitées à A-G** :

```
D, E, N, C, B, A, F, G, S, I, 5, 6, -, 4, 7, 8, H, 0, 3
```

**Causes** :
- `N`, `S`, `I`, `H`, `0`, `-` = valeurs non standard saisies par les diagnostiqueurs
- `5`, `6`, `7`, `8`, `3`, `4` = probablement des conversions erronées (échelle numérique ?)
- **Aucun contrôle de cohérence** avant 2021 → données brutes non filtrées

Même problème sur `classe_estimation_ges` : `C, N, B, D, E, A, F, G, S, I, 1, -, 2, 0, 7, H`

### 3.3 Types de bâtiment pré-2021

`tr002_type_batiment_description` a seulement 3 valeurs **mais** inclut `Bâtiment collectif à usage principal d'habitation` qui recouvre à la fois les appartements individuels ET l'immeuble entier — pas de distinction nette maison/appartement comme post-2021.

---

## 4. Différences structurelles majeures entre les deux versions

| Aspect | Pré-2021 | Post-2021 | Impact fusion |
|---|---|---|---|
| **Méthode de calcul** | Multiple (3CL v1, factures, conventionnelle…) — `nom_methode_dpe` a 491 valeurs | **Unifiée 3CL 2021** (valeur unique) | Impossibilité de comparer directement les consommations |
| **Nombre d'usages** | 3 (chauffage, ECS, refroidissement) | **5** (+ éclairage, auxiliaires) | Les kWh/m² pré et post 2021 ne sont pas comparables |
| **Seuil GES** | Indépendant (étiquette GES séparée) | **Intégré** dans l'étiquette DPE (double-seuil) | Une étiquette C pré-2021 ≠ une étiquette C post-2021 |
| **Géocodage** | `latitude`/`longitude` + `geo_adresse` texte | BAN : `identifiant_ban`, coordonnées cartographiques, `score_ban` | Pas de jointure directe par clé pour le pré-2021 |
| **Clé adresse** | `geo_adresse` (texte libre, 3,3 M remplis) | `identifiant_ban` (clé structurée, 4,9 M) | Jointure RNB impossible pour le pré-2021 sans géocodage additionnel |
| **Surface** | `surface_thermique_lot` | `surface_habitable_logement` | Même concept, nom différent |
| **Type bâtiment** | `Logement`, `Maison Individuelle`, `Bâtiment collectif` | `appartement`, `maison`, `immeuble` | Mapping nécessaire |
| **Contrôles qualité** | **Aucun** → valeurs parasites dans les classes | **Contrôles bloquants** → données filtrées | Le pré-2021 nécessite un nettoyage lourd |
| **Nb champs** | ~20 (vue tabulaire) | 230 | La fusion est une **union des champs communs uniquement** |
| **Énergies** | Pas de détail par vecteur | 3 niveaux (n1/n2/n3) avec 14 types | Information riche uniquement post-2021 |
| **Installations** | Pas de détail | Chauffage (2 installations × 2 générateurs), ECS, ventilation, clim détaillés | Uniquement post-2021 |

---

## 5. Stratégie de fusion (historique — schéma v0, supplanté par §6.6)

Le schéma cible détaillé esquissé ici (« dpe_unifie », ~30 champs) a été remplacé par
le **schéma final du builder** : §6.6 et la constante `COMMON` de
[`telechargement/preparer_dpe.py`](../telechargement/preparer_dpe.py). Les mappings
(type_batiment, classes A-G, géocodage pré-2021) y sont implémentés. Reste valable :

**Doctrine de non-comparabilité des consommations** — les kWh/m² pré et post 2021 ne
sont **pas comparables** (3 usages méthode variable vs 5 usages 3CL 2021 unifiée).
Conséquence implémentée : les valeurs chiffrées pré-2021 ne sont **pas conservées**
(`conso_ep_m2`/`emission_ges_m2` null en pré, cf. `_project_pre`) ; seules les
**étiquettes A-G** sont l'information cross-source.

---

## 6. Accès aux données

### 6.1 DPE post-2021 (recommandé)

- **API Data-Fair** : `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines`
  — syntaxe de filtrage et pagination par curseur : **voir §6.4 (méthode vérifiée, qui fait foi)**.
- **Dump SQL complet** : `https://opendata.ademe.fr/dump_dpev2_prod_fdld.sql.gz` (PostgreSQL, **~70 Go**)
  - Contient les 230 champs + tables de référence
  - Dictionnaire technique : joint au dataset (fichier XLSX `DPE_dictionnaire_de_donnees_DUMP.xlsx`)
  - Tables énumérateurs : `DPE_enum_tables.xlsx`
- **Fréquence** : hebdomadaire — utiliser `date_derniere_modification_dpe` pour l'incrémental

### 6.2 DPE pré-2021

> ### ✅ Acquisition pré-2021 : source résolue (2026-06-12, vérifié sur S3)
> **L'intégralité des DPE pré-2021 est disponible sur notre S3 d'enrichissement**, en **Parquet typé partitionné par département** (table Athena). ⚠️ **Pansement temporaire, pas un accès de production** : ce S3 ne sera pas accessible au runtime. Il sert uniquement de **source de fetch maintenant**, le temps de construire le fichier final local — c'est ce **fichier final local** qui sert l'appli (cf. « Architecture cible » en §6.5).
>
> - **Chemin** : `s3://prod-klarsen-enrichissement/athena_tables/diagnostic-performance-energie/dpe-pre-2021/departement={dd}/` (un `.parquet` par dept).
> - **Inspecté (dept 33, 2026-06-12)** : **303 154 lignes**, 53 colonnes typées. `numero_dpe` **100 % / 303 154 uniques** (vraie clé). `date_etablissement_dpe` typé `Date` 100 % (⚠ plancher sentinelle `1899-12-30` à filtrer). `classe_consommation_energie`/`ges` 100 %, valeurs **A-G + `N`** → déjà quasi propres (le zoo de parasites du §3.2 a disparu, seul `N`→null à nettoyer). `surface_habitable` 100 %. Géocodage lat/lon **82 %** (`geo_type` : housenumber 57 %, street 23 %, null 18 %). Flag **`dpe_vierge`** présent (12,8 % vierges → exclure du signal). Adresse **décomposée** (numero_rue/type_voie/nom_rue/batiment/escalier/etage/porte/lot). **Pas de `identifiant_ban`/`id_rnb`** (normal pré-2021) → jointure par **coordonnées** (housenumber fiable) ou `code_insee`+adresse.
> - **CRS** : coords déjà **WGS84** (géocodage BAN) → l'étape CRS de `nettoyer_dpe` (`lat>100`=Lambert) ne s'y déclenche pas, elles restent intactes.
> - La donnée pré-2021 est **figée depuis déc. 2022** → ce S3 ne se périme pas. Les voies API/dump ci-dessous ne sont gardées que comme **référence de provenance**.
>
> → **Le seul vrai chantier d'acquisition DPE est le post-2021** (cf. §6.5).

- **API Data-Fair** : `https://koumoul.com/data-fair/api/v1/datasets/dpe-france/lines`
  - Vue tabulaire simplifiée (~20 champs)
  - Filtrage par département : `?tv016_departement_code=33&size=10000`
- **Dump SQL complet** : `https://object.files.data.gouv.fr/data-pipeline-open/ademe/dpe_logement_202103.sql`
  - Export MySQL/PostgreSQL, ~1,6 Go
  - Contient des dizaines de tables normalisées
  - Dictionnaire de données : PDF joint `ADEME - DPE - Dictionnaire de données - 2020-06-08.pdf`
- **Statut** : figé, plus mis à jour depuis décembre 2022

### 6.3 Stratégie d'ingestion recommandée

1. **Post-2021** : ingestion incrémentale hebdomadaire via l'API Data-Fair, filtrée par département
2. **Pré-2021** : ~~ingestion unique via le dump SQL ou l'API~~ → **déjà sur S3, rien à ingérer** (cf. §6.2)
3. **DPE neufs** : même pipeline que post-2021 existants, champ `origine = 'neuf'`
4. **Stockage** : Parquet départemental partitionné par `code_departement` et `source_dpe` (pre_2021 / post_2021)

### 6.4 ✅ Récupération vérifiée (2026-06-12) — corrige et complète §6.1

> Vérifié en direct sur l'API data-fair. **Fait foi** sur la mécanique de récupération là où elle contredit §6.1 (gardé comme historique). Calqué sur les `preparer_*` du socle (scoped département, idempotent) → `preparer_dpe.py` → `data/interim/dpe_{dept}.parquet`.

**Endpoint** : `GET https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines`

| Param | Valeur correcte | Pourquoi |
|---|---|---|
| **Filtre dept** | `qs=code_departement_ban:33` (query Lucene) | `?code_departement_ban=33` est **ignoré** (testé : renvoie d'autres dépts). `qs` testé : 100 % dept 33. |
| **Pagination** | suivre le champ **`next`** de la réponse (curseur `&after=…`) jusqu'à son absence | `page`/`size` est plafonné ; le curseur ne l'est pas. Le dept 33 = **378 013** lignes → ~38 pages. ⚠️ `next` référence l'**id interne** du dataset (`meg-…`) : le suivre **tel quel**. |
| **Colonnes** | `select=numero_dpe,id_rnb,identifiant_ban,etiquette_dpe,etiquette_ges,surface_habitable_logement,type_batiment,date_etablissement_dpe,date_derniere_modification_dpe,numero_dpe_remplace,code_insee_ban,code_postal_ban,…` | Réduit **230 → ~25** champs : payload divisé d'autant. |
| **Taille page** | `size=10000` (max) | — |
| **Incrémental hebdo** | ajouter au `qs` : ` AND date_derniere_modification_dpe:[2026-06-01 TO *]` | Ne re-télécharge que le modifié depuis le dernier run. |

**Squelette d'URL** :
```
…/lines?qs=code_departement_ban:33&select=numero_dpe,id_rnb,identifiant_ban,etiquette_dpe,surface_habitable_logement,type_batiment,date_etablissement_dpe&size=10000
→ lire response.next, refetch, répéter tant que `next` existe
```

**À vérifier (optim)** : `&format=csv` peut streamer tout le dept en une requête (sinon le curseur reste la voie fiable). Rate-limit anonyme probable sur gros volumes → réutiliser [`telechargement/_telechargement.py`](../telechargement/_telechargement.py) (retry + backoff exponentiel, écriture atomique).

**Bulk SQL** (`dump_dpev2_prod_fdld.sql.gz`, plusieurs Go PostgreSQL) : complet mais **non scoped, non incrémental, restauration PG lourde** → réservé à un one-shot national, à éviter pour le pattern dept-scoped du socle.

### 6.5 ✅ Le seul chantier d'acquisition DPE : le post-2021 (audit 2026-06-12)

Le **pré-2021 est résolu** (déjà sur S3, §6.2). **Tout l'effort porte sur le post-2021.** Un POC existe déjà ([`telechargement/preparer_dpe.py`](../telechargement/preparer_dpe.py) + [`nettoyer_dpe.py`](../telechargement/nettoyer_dpe.py)) — audité, voici l'état :

- **Acquisition POC = impasse prod.** Il lit des **CSV locaux exportés à la main** depuis un notebook (avril 2024, ~9 dépts cherry-pickés, vue tabulaire). Marqué `⚠ TEMPORAIRE — NE PAS DÉPLOYER`. Sa justification (« API trop lente, ~2 pages/min ») est **fausse** : mesuré le 2026-06-12 avec la méthode §6.4 (qs + curseur + select) = **2 075 lignes/s → dept 33 en ~3 min**. La lenteur venait de la mauvaise pagination (`page` au lieu de curseur) et de l'absence de `select`.
- **Conséquence : le fichier `dpe_{dept}.parquet` produit n'est PAS exploitable** pour la stratégie validée. Le CSV source ne contient ni `numero_dpe`, ni `id_rnb`, ni dates → dans le parquet : **`id_rnb` à 0 %** (clé de jointure n°1, §8.1), `numero_dpe` post **synthétique/garbage** (`./`, `/`, `0000000000`), **dates post à 0 %** (pas d'incrémental/validité), données **figées avril 2024**. Seuls `etiquette` (92 %) et `surface` (99,5 %) sont bons ; le rattachement au bien est cassé.
- **La voie API récupère tout ça** : mesuré, l'API livre **`id_rnb` à 52 %** (mieux que les 18 % du dictionnaire — backfill RNB en cours) et **`identifiant_ban` à 99,9 %**, plus le vrai `numero_dpe` et les dates. → Refonder `preparer_dpe.py` sur §6.4 débloque la jointure RNB directe.
- ~~Le nettoyage `nettoyer_dpe.py` est à garder~~ — **finalement supprimé** : ses corrections (CRS, étage, escalier) visaient l'ancien CSV ; le nettoyage vit dans les projections de `preparer_dpe.py` (cf. §6.6).

**Plan post-2021 (réalisé, cf. §6.6)** : `preparer_dpe.py` (API §6.4, nettoyage intégré aux projections) → `dpe_{dept}.parquet`. Lecture CSV locale abandonnée (fallback offline : §12).

#### Débit serveur ADEME — plancher incompressible (testé 2026-06-12)

Le serveur ADEME est le **goulot, côté client il est imbattable** (confirmé multi-machines/multi-lieux par l'équipe). Mesures :
- **Run réel dept 33** : 378 013 DPE en **12 min 13 s**, débit plat **516 l/s** (mono-connexion, curseur, `select` 31 champs).
- **Throttle temporel** : une connexion fait ~**1 658 l/s** les 2 premières minutes puis s'effondre (d'où la moyenne 516).
- **Parallélisation testée et écartée** : 4 curseurs disjoints en parallèle = **452 l/s agrégé** (×0,3 vs séquentiel), chacun étranglé à 65-209 l/s. **Cap global serveur** : les connexions se partagent un budget et créent de la contention. Inutile, voire contre-productif.

→ **Plancher : ~12 min/dept, ~8 h national, mono-connexion résumable.** On ne cherche pas à accélérer le serveur : on **récupère au fur et à mesure** (dept par dept, en arrière-plan, résumable) et on consolide tout dans **le fichier final local** `dpe_{dept}.parquet`. C'est lui, et lui seul, qui sert l'appli — jamais le serveur ADEME ni aucune source distante au runtime.

#### Architecture cible (alignée sur le reste du socle)

Le DPE suit **le même modèle que DVF/cadastre/RNB/parcelle_adresse** : **fetch → mix → nettoie → projette (champs utiles à l'appli uniquement) → écrit un fichier final LOCAL**, et c'est ce fichier local qui alimente l'appli. S3 et l'API ne sont que des **sources de récupération**, jamais lues au runtime.

```
   ┌─ pré-2021 : fetch S3 (parquet/dept, §6.2)
   │                                              ┐
   ├─ post-2021 : fetch API data-fair (§6.4)      ├─ MIX (schéma cible commun §5.2,
   │                                              │        + source_dpe pre/post)
   └─ neufs : même API, origine_dpe=neuf          ┘        │
                                                           ▼
                                            NETTOIE (nettoyer_dpe : CRS / étage / escalier,
                                                     classes A-G, dpe_vierge, sentinelles dates)
                                                           │
                                                           ▼
                              PROJETTE → champs §8 utiles à l'appli SEULEMENT
                                                           │
                                                           ▼
                              data/interim/dpe_{dept}.parquet   ← alimente l'appli
```

- **Récupération « au fur et à mesure »** : on construit le fichier final dept par dept, à la demande, comme les autres `preparer_*` (idempotent, écriture atomique tmp+rename, `--force`).
- **Projection stricte** : on ne stocke QUE ce qui sert au **signal/ajustement énergétique** et au **rattachement au bien** (clés `id_rnb`/`identifiant_ban`/coords, `etiquette_*`, `surface_habitable`, `type_batiment`, dates de validité). Le reste des 230 champs reste à la source.

### 6.6 ✅ Builder final implémenté + nettoyage (2026-06-12)

[`telechargement/preparer_dpe.py`](../telechargement/preparer_dpe.py) : `fetch post (API résumable) + fetch pré (S3) → projection/nettoyage → résolution RNB → mix + dédup → data/interim/dpe_{dept}.parquet`. Mesuré sur le 33 : **653 450 DPE** (289 k pré + 364 k post), signal énergie exploitable 93,5 %, et après la cascade de résolution RNB (`ademe` → `cle_ban` → `spatial`, cf. [SOURCES_DONNEES.md §3.1](SOURCES_DONNEES.md)) **61 % de DPE joignables** (contre 26 % avec le seul id_rnb natif).

> ⚠️ [`telechargement/nettoyer_dpe.py`](../telechargement/nettoyer_dpe.py) est **supprimé/obsolète** : sa conversion CRS Lambert→WGS84 est inutile (on lit `_geopoint`/coords déjà WGS84), et sa décomposition étage/escalier visait l'ancien CSV. Le nettoyage vit désormais dans les projections de `preparer_dpe.py`.

**Schéma final** : les **26 colonnes** de `COMMON` (`numero_dpe, source_dpe, date_etablissement, date_fin_validite` · `type_batiment, surface_habitable, etage, annee_construction, periode_construction` · `etiquette_energie, etiquette_ges, dpe_vierge, conso_ep_m2, emission_ges_m2, type_energie_principale` · `id_rnb, identifiant_ban, adresse_ban, score_ban` · `code_insee, code_postal, code_departement, nom_commune` · `latitude, longitude, geo_precision`) + **`rnb_lien`/`rnb_dist_m`** issus de la résolution RNB (qualification de fiabilité exposée jusqu'à l'appli).

> **Niveau bâtiment** : le rattachement se fait au bâtiment (`id_rnb`) — en collectif, l'étiquette **ne désigne pas le lot exact** ; l'appli choisit le DPE le plus proche en surface et l'assume comme best-guess (caveat affiché, cf. `dpe_rows` dans `web_poc/server.py`).

**Règles de nettoyage (mêmes pour les deux sources, mesurées sur le 33)** :

| Champ | Règle | Pourquoi |
|---|---|---|
| `surface_habitable` | base habitable (pré : fallback `surface_thermique_lot`), clip **[8, 1000] m²** sinon null | le pré montait à 69 052 m², avait des ≤0 |
| `annee_construction` | clamp **[1700, année courante]** sinon null | pré : 0 et 32767 (overflow) ; post : 1300/2099 |
| `periode_construction` | **unifiée** : post natif, pré dérivé de l'année nettoyée (mêmes 10 tranches) → **98,3 %** | post a 46 % d'`annee` nulle mais sa `periode` est remplie |
| `etiquette_energie/ges` | A-G strict (le `N` pré → null) | parasites pré-2021 |
| `dpe_vierge` | flag conservé **+ étiquette annulée si vierge** | 3 787 vierges « classés A » sur le 33 = faux excellents qui pollueraient le signal |
| `type_energie_principale` | 14 libellés ADEME → tokens (`electricite`, `gaz_naturel`, `reseau_chaleur`, `bois`, `fioul`, `gpl`, `charbon`…) | robuste accents/tirets |
| `latitude/longitude` | WGS84 ; hors France métro → null | 31 post + 1 pré hors bornes |
| `geo_precision` | `precise` (housenumber/adresse) / `coarse` (rue, interpolation) / `none` | fiabilité du rattachement spatial (précis 81 % sur le 33) |
| **dédup pré↔post** | coords (~11 m) + surface, garde le plus récent, **MAISONS uniquement** | en collectif la géo ne distingue pas les logements empilés (257 k apparts distincts fusionnés à tort sinon) |

---

## 7. Pièges et précautions

### 7.1 Qualité des données

| Piège | Détail | Mitigation |
|---|---|---|
| **Saisie manuelle** | Les données sont saisies par des centaines d'entreprises de diagnostic, sans reprise par l'ADEME | Contrôles de cohérence post-2021 uniquement. Pré-2021 = données brutes non filtrées |
| **Classes énergétiques parasites** | Pré-2021 : valeurs non standard (N, S, I, chiffres…) dans 19 valeurs distinctes | Nettoyage §5.4 |
| **Adresses inexactes** | Saisie libre par le diagnostiqueur → `adresse_brut` souvent incomplète ou erronée | Utiliser `adresse_ban` (post-2021) ou regéocoder |
| **Doublons** | Un même logement peut avoir plusieurs DPE (vente, location, DPE remplacé) | `numero_dpe_remplace` permet de tracer les remplacements. Pour l'appariement, prendre le plus récent |
| **Non-représentativité** | Les DPE ne couvrent que les biens vendus/loués/construits → pas représentatif du parc entier | L'ADEME le signale explicitement. Pour l'estimation, on utilise le DPE comme signal, pas comme statistique parc |
| **DPE immeuble vs logement** | Post-2021 distingue `appartement` et `immeuble`. Un DPE immeuble porte sur l'immeuble entier, pas sur un logement | Filtrer sur `type_batiment != 'immeuble'` pour l'appariement logement |
| **Coordonnées Lambert vs WGS84** | `coordonnee_cartographique_x/y_ban` sont probablement en Lambert 93 | Convertir en WGS84 pour compatibilité avec le reste du socle. Le champ `_geopoint` est déjà en WGS84 |

### 7.2 Jointures

| Clé | Pré-2021 | Post-2021 | Fiabilité |
|---|---|---|---|
| `identifiant_ban` → RNB | ❌ Absent | ✅ Présent (4,9 M / 14,9 M) | Jointure directe viable (87% mesuré sur 33) |
| Coordonnées → RNB spatial | ✅ Partiel (2,5 M) | ✅ Via `_geopoint` | Fallback si `identifiant_ban` absent |
| Adresse → API BAN | ✅ `geo_adresse` (3,3 M) | Via `adresse_ban` | Regéocodage possible mais coûteux |
| `id_rnb` natif | ❌ | ✅ 2,7 M remplis | Jointure directe la plus fiable (post-2021) |
| Code commune → DVF | ✅ `code_insee_commune_actualise` | ✅ `code_insee_ban` | Jointure administrative |

### 7.3 DPE tertiaire pré-2021

Le dataset `dpe-tertiaire` (515 k) n'a **pas** d'équivalent post-2021 (le tertiaire est inclus dans d'autres jeux). Hors périmètre logement.

---

## 8. Champs à retenir pour le socle immobilier

Pour le **signal énergétique** et l'**ajustement énergétique**, les champs suivants sont suffisants :

### 8.1 Champs prioritaires (toujours présents)

> ### ✅ Amélioration vérifiée (2026-06-12) — clé de jointure pour primmobilier
> Le socle a pour **pivot le RNB** (`rnb_id`, cf. [ADR 0003](adr/0003-rnb-pivot-batiment.md)). Or le DPE post-2021 **porte nativement `id_rnb`** (confirmé au schéma data-fair, ~2,7 M / 14,9 M remplis). → **Prioriser `id_rnb` comme clé n°1** : jointure **directe `rnb_id` ↔ `id_rnb`**, sans détour par BAN. `identifiant_ban` devient le **fallback**, et reste la clé du **profil DPE d'adresse**. À rattacher au vocabulaire déjà figé ([CONTEXT.md](../CONTEXT.md)) : **DPE officiel du bien** (clé niveau-numéro unique) vs **profil DPE d'adresse** (niveau-voie ou multiple). Cascade d'appariement recommandée : `id_rnb` (gold) → `identifiant_ban` niveau-numéro unique (officiel) → `identifiant_ban` niveau-voie/multiple (profil, avec avertissement de fiabilité).
>
> **Priorité pré-2021 revue** : les comparables = ventes DVF **2021-2025**, qui recoupent le **post-2021** (clés présentes). Le pré-2021 (gelé, sans `identifiant_ban`/`id_rnb`, nettoyage lourd) a une **valeur marginale faible** pour primmobilier → phase 2 optionnelle, pas à parité avec le post-2021.

| Champ unifié | Usage |
|---|---|
| `id_rnb` | ⭐ **Clé de jointure n°1 pour primmobilier** : `rnb_id` ↔ `id_rnb` direct (post-2021, ~2,7 M). Voir l'encart ci-dessus. |
| `numero_dpe` | Identifiant unique |
| `source_dpe` | `pre_2021` / `post_2021` |
| `date_etablissement` | Âge du DPE, validité |
| `type_batiment` | Filtre maison/appartement |
| `surface_habitable` | Croisement avec surface cible |
| `annee_construction` | Ancienneté du bien |
| `etiquette_energie` | Signal énergétique principal |
| `etiquette_ges` | Signal GES |
| `code_insee` | Jointure administrative |
| `code_postal` | Jointure administrative |
| `identifiant_ban` | Jointure RNB (post-2021) |
| `latitude` / `longitude` | Jointure spatiale |
| `type_energie_principale` | Type d'énergie de chauffage |

### 8.2 Champs secondaires (post-2021 uniquement)

| Champ | Usage potentiel |
|---|---|
| `classe_inertie_batiment` | Confort, qualité construction |
| `type_installation_chauffage` | Individuel vs collectif |
| `type_ventilation` | Qualité installation |
| `periode_construction` | Regroupement périodes |
| `qualite_isolation_enveloppe` | Qualité isolation |
| `conso_5_usages_par_m2_ep` | Consommation normalisée |
| `score_ban` | Fiabilité géocodage |
| `version_dpe` | Version moteur calcul |

### 8.3 Champs à exclure

- Détails techniques des installations (230 champs trop fins pour l'estimation)
- Déperditions par paroi
- Bilans par énergie n2/n3
- Coûts (modélisés, non réels)
- Confort d'été
- ENR détaillé
- Champs calculés Data-Fair (`_id`, `_i`, `_rand`)
- `adresse_brut` (donnée saisie non normalisée)
- `complement_adresse_*` (texte libre)

---

## 9. (supprimé)

Esquisse de pipeline d'ingestion v0, supplantée par le builder réel (§6.5-§6.6) ;
ses règles (dédup par numero_dpe seul, exclusion des immeubles) contredisaient le code.

---

## 10. Questions ouvertes

**Résolues** : remplissage `identifiant_ban` → mesuré (87 % de match RNB sur le 33, cf. §8.1) ·
coordonnées → WGS84 confirmé (`_geopoint`, cf. §6.2/§7.1) · géocodage rétroactif pré-2021 →
remplacé par la cascade spatiale (§6.6, SOURCES_DONNEES.md §3.1) · DPE remplacés → dédup
garde le plus récent (builder §6.6).

**Encore ouvertes** :

| Question | Bloquant ? | Piste |
|---|---|---|
| Faut-il intégrer les DPE neufs dans la même table ? | Non | Oui, avec `origine_dpe = 'neuf'`. Recoupe les VEFA |
| Le pré-2021 expose-t-il `nb_pieces`/`typologie_logement` ? | Non | Explorer le **parquet S3 53 colonnes** (§6.2) — la vue tabulaire ne l'expose pas |

---

## 11. Références

- **ADEME — Portail open data DPE** : https://data.ademe.fr/datasets/dpe03existant
- **ADEME — Ancien portail DPE** : https://data.ademe.fr/datasets/dpe-france
- **data.gouv.fr — DPE existants** : https://www.data.gouv.fr/fr/datasets/67f7e557cb268460ce66c8d4/
- **Observatoire DPE-Audit** : https://observatoire-dpe-audit.ademe.fr/accueil
- **Dictionnaire de données DUMP (post-2021)** : joint au dataset (XLSX)
- **Dictionnaire de données pré-2021** : PDF `ADEME - DPE - Dictionnaire de données - 2020-06-08.pdf`
- **Décret n°2011-807** (collecte DPE) : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000024317077/
- **Arrêté du 31 mars 2021** (réforme DPE) : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000043353381/

---

## 12. Provenance & fallbacks d'acquisition

Ce qui reste vrai et utile de l'évaluation pré-percée (le reste — estimations de débit
API pessimistes, états des lieux 2024 — est périmé : la méthode qui fait foi est §6.4/§6.5,
~12 min/dept mesuré, mono-connexion car cap serveur global) :

- **Aucune option bulk par département pour le post-2021** : pas d'équivalent des
  `dep_XX.csv.gz` pré-2021. L'API résumable §6.4 est le plancher.
- **Dump SQL national** : `opendata.ademe.fr/dump_dpev2_prod_fdld.sql.gz`, PostgreSQL
  **~70 Go**, servi par la même infra ADEME/Koumoul que l'API — débit testé 2026-06-12
  ~800 Ko/s-2 Mo/s soit **10-24 h** de téléchargement, puis restauration + filtrage.
  À ne considérer que pour une ingestion nationale en une passe.
- **CSV legacy du notebook** `~/Code/klarsen/notebooks/DiagnosticPerformanceEnergetique/dpe.ipynb` :
  split manuel du CSV national (7,7 M lignes) d'avril 2024 — post-2021 : 9 depts
  (17, 33, 67, 75, 91, 92, 93, 94, 95), pré-2021 : 5 depts. Gelés, 38 colonnes. Historique.
- **S3 d'enrichissement** (pansement, pas un accès prod — cf. §6.2) : pré-2021
  `dpe-pre-2021/` 95 depts (53 colonnes, source de fetch actuelle) ; post-2021
  `enrichment-databases/dpe/` 95 depts (38 colonnes, fév 2025) en secours si l'API ADEME
  devenait indisponible.
