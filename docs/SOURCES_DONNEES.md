# Sources de données — Socle immobilier cartographique

Suivi d'exploration des sources publiques candidates au **socle immobilier cartographique** (cf. [CONTEXT.md](../CONTEXT.md)). Objectif : savoir précisément, pour chaque source, **où sont les données, ce qu'on récupère, ce qui est superflu/doublon, et par quelles clés elle se joint aux autres** — avant de décider ce qui est réalisable.

- **Date de cadrage** : 2026-06-09
- **Méthode** : exploration via le MCP `datagouv` (catalogue data.gouv.fr) + lecture des documentations fournies avec les fichiers. Le champ **Définition** de chaque source est construit à partir de ces docs.
- **Cadre métier** : voir le langage du domaine dans [CONTEXT.md](../CONTEXT.md). On distingue les **Sources socle** (attendues dans toute estimation : BAN, DVF, Cadastre) des **Enrichissements optionnels** (DPE, RNB/BDNB, copropriétés, risques, urbanisme).

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

**Champs clés retenus** _(à confirmer sur échantillon)_ : `id` / `cle_interop` (clé d'interopérabilité BAN), `numero`, `rep`, `nom_voie`, `code_postal`, `code_insee`, `nom_commune`, `lon`, `lat`, `x`, `y`, `type_position`, `source`, et le champ de **lien cadastral** (`cad_parcelles`, liste de parcelles) — à vérifier.

**Superflu / doublon** : alias et libellés AFNOR/acheminement multiples (`nom_afnor`, `libelle_acheminement`…) redondants pour nos besoins ; coordonnées projetées `x`/`y` (Lambert) doublon de `lon`/`lat` si on travaille en WGS84.

**Clés de jointure** : `cle_interop` ↔ RNB (`addresses[].cle_interop`) et ↔ DPE (`Identifiant__BAN`) · `cad_parcelles` ↔ Cadastre/DVF (`id_parcelle`) _(à confirmer)_ · `code_insee` ↔ communes.

## 1.3 Cadastre (Etalab)

- **ID data.gouv** : `59b0020ec751df07d5f13bcf` · Organisation : data.gouv.fr (Etalab) · Licence : `fr-lo` · Fréquence : **trimestrielle** · MàJ catalogue : 2026-05-07
- **Statut** : 🔎 À échantillonner (noms d'attributs exacts à confirmer)
- **Définition** : découpage parcellaire du territoire au format géo simplifié (vs PCI Vecteur EDIGÉO brut). Fournit les **géométries de parcelles et sections** et la clé de rattachement `id_parcelle`.

**Fichiers / accès** : hébergés sur `cadastre.data.gouv.fr` (pas de ressource tabulaire data.gouv directe). Formats : **GeoJSON, Shapefile, GeoParquet, MBTiles**. 8 couches : `parcelles`, `subdivisions_fiscales`, `lieux_dits`, `feuilles`, `sections`, `prefixes_sections`, `communes`, `batiments`.

**Champs clés retenus** :
- Couche **parcelles** _(à confirmer)_ : `id` (= code dépt + commune + préfixe + section + numéro), `commune`, `prefixe`, `section`, `numero`, `contenance` (surface), géométrie.
- Couche **sections** : `code`, `commune`, géométrie — pertinent comme **emprise d'analyse intermédiaire** (cf. CONTEXT « Section cadastrale »).

**Superflu / à différer** : couches `subdivisions_fiscales`, `lieux_dits`, `prefixes_sections`, `feuilles` — peu utiles à l'estimation au départ. Couche `batiments` cadastrale : redondante avec RNB/BDNB pour la maille bâtiment → préférer RNB.

**Clés de jointure** : `parcelles.id` ↔ DVF (`id_parcelle`) ↔ RNB (`plots[].id`). Format **GeoParquet** = idéal pour DuckDB spatial.

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

**Clés de jointure** : c'est le **hub** — `addresses.cle_interop` ↔ BAN, `plots.id` ↔ Cadastre/DVF, `ext_ids` ↔ BDNB. À relier à DPE via `rnb_id`.

## 2.2 BDNB — Base de Données Nationale des Bâtiments

- **ID data.gouv** : `61dc7157488f8cdb4283e3c3` · Organisation : CSTB · Licence : `lov2` · Fréquence : **semestrielle** · MàJ catalogue : 2026-05-22
- **Statut** : ⏳ À approfondir (enrichissement lourd, optionnel)
- **Définition** : carte d'identité agrégée des **~32 M de bâtiments** (croisement d'une vingtaine de bases publiques), à la maille bâtiment : âge, typologie, énergie/DPE, rénovation.

**Fichiers / accès** : exports France **très volumineux** — CSV 36,7 Go, GPKG 47,5 Go, pgdump 37,7 Go ; **API** (portail BDNB) ; **dictionnaire de données** xlsx (`documentation.xlsx`, v0.7.11). Pas d'export départemental sur data.gouv (dispo sur bdnb.io).

**Position dans le socle** : redondant en partie avec RNB (maille bâtiment) + DPE (énergie). **À ne pas ingérer en masse au départ** — n'apporter que des champs ciblés (année de construction, type, copropriété) si le besoin se confirme, via API ou extraction. Pivot bâtiment = RNB, pas BDNB.

---

# 3. Enrichissements optionnels

## 3.1 DPE Logements existants (depuis juillet 2021)  ⭐ jointure clé

- **ID data.gouv** : `67f7e557cb268460ce66c8d4` · Organisation : ADEME · Licence : `lov2` · Fréquence : **hebdomadaire** · MàJ catalogue : 2026-06-08
- **Statut** : 🔎 À échantillonner · **~14,9 M enregistrements**
- **Définition** : ensemble des **diagnostics de performance énergétique** réalisés sur les logements existants depuis juillet 2021 (classe énergie/GES, consommation, caractéristiques du logement). Source du **signal énergétique** (cf. CONTEXT) destiné à remplacer l'ajustement DPE manuel.

**Fichiers / accès** : données hébergées par l'**ADEME** (`data.ademe.fr/datasets/dpe03existant`) — consultation, **description des champs** et **API** documentées là-bas (pas de fichier tabulaire data.gouv direct).

**Champs clés retenus** :
- Identification / jointure : `N°DPE`, `Identifiant__BAN`, adresse brute + adresse BAN, `Code INSEE (BAN)`, `Code postal (BAN)`, `geopoint`/`latitude`/`longitude`, **identifiant parcelle cadastrale**, **identifiant RNB**.
- Métier : `Etiquette_DPE`, `Etiquette_GES`, `Surface_habitable_logement`, `Type_bâtiment`, `année de construction`, `date d'établissement du DPE`.

**Superflu pour le départ** : la masse des champs techniques de calcul réglementaire (parois, ponts thermiques, systèmes…) — on ne retient que classe, GES, surface, type, dates, ids.

**Clés de jointure** : `Identifiant__BAN` ↔ BAN ; **`identifiant RNB` ↔ RNB** ; `parcelle` ↔ Cadastre/DVF. ⇒ contrairement au notebook (jointure adresse approximative), la jointure par **ID** est possible → revoir la « jointure DPE imparfaite » à la hausse, à quantifier sur échantillon (taux de remplissage réel des ids BAN/RNB).

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
        │ id_parcelle              │ ext_ids               │ parcelle
        │                          ▼                       │
┌───────────────┐           ┌─────────────┐                │
│      DVF      │           │    BDNB     │                │
│  (mutations)  │           │ (lourd, opt)│                │
│  id_parcelle  │───────────┴─────────────┴────────────────┘
└───────────────┘   (DVF↔DPE : pas d'id commun → via parcelle ou adresse)
```

**Chaînes de jointure exploitables**
1. **Adresse → bien** : BAN (`cle_interop`) → RNB (`addresses`) → `plots` → Cadastre (`id_parcelle`) → DVF.
2. **DVF → bâtiment/DPE** : DVF (`id_parcelle`) → Cadastre / RNB (`plots`) → `rnb_id` → DPE (`rnb_id`). Attention : 1 parcelle peut porter N bâtiments → jointure parcelle imparfaite pour cibler le bon logement.
3. **DPE → tout** : DPE porte directement `Identifiant__BAN`, `rnb_id` et `parcelle` → jointure par ID (à quantifier : taux de remplissage réel).

**Points durs à valider sur échantillon (dépt 33)**
- Taux de remplissage de `Identifiant__BAN` et `rnb_id` dans le DPE existant.
- Présence/fiabilité du lien cadastral dans la BAN (`cad_parcelles`).
- Couverture des `plots` RNB (ratio de recouvrement) sur parcelles DVF.
- Cardinalité parcelle ↔ bâtiment (combien de logements/bâtiments par parcelle) pour mesurer l'ambiguïté DVF→DPE.

---

# 6. Statut global & prochaines étapes

| Source | Rôle | Statut |
| --- | --- | --- |
| DVF géolocalisé | Socle — comparables | ✅ |
| BAN | Socle — adresse/géocodage | 🔎 |
| Cadastre | Socle — parcelle/section | 🔎 |
| RNB | Pivot bâtiment | ✅ |
| DPE existants | Enrichissement — signal énergétique | 🔎 |
| DPE neufs | Enrichissement | ⏳ |
| BDNB | Enrichissement lourd | ⏳ |
| Adresses cadastre | Appoint jointure | ⏳ |
| Copropriétés | Enrichissement facteur appart. | ⏳ |
| GASPAR | Contexte risques | ⏳ |
| APIs (BAN, Cadastre, GPU) | Géocodage / géométrie / urbanisme | ⏳ |

**Prochaines étapes**
1. Échantillonner le dépt 33 (DVF déjà en main + RNB_33 + DPE 33) et **mesurer les taux de match** des chaînes ci-dessus.
2. Confirmer les noms de colonnes marqués _(à confirmer)_ sur extraits réels (BAN, Cadastre parcelles, DPE).
3. Approfondir les dataservices (specs OpenAPI) pour le géocodage et la géométrie parcellaire.
4. Décider du périmètre d'ingestion (national direct vs progressif) **après** mesure de joignabilité.
