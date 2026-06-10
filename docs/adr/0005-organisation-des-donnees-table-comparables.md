---
status: accepted
date: 2026-06-10
superseded-by: 0006 §4-6
---

# Organisation des données : table comparables centrée DVF, pont parcelle→bâtiment

Après mesure de la joignabilité ([ADR 0003](0003-rnb-pivot-batiment.md)) et de la récupération
des non-matchs ([ADR 0004](0004-recuperation-non-matchs-dvf-rnb.md)), il faut figer **comment
les données sont stockées pour le service** (comparables immobiliers).

## Décisions

1. **DVF est la base. On filtre au logement.** `type_local ∈ {Maison, Appartement}`. Seules
   **32% des lignes DVF** sont du logement (41% terrain non bâti, 24% dépendances, 3% locaux) —
   le reste est hors périmètre.

2. **Grain = le bien logement vendu, pas la ligne DVF brute.** DVF éclate chaque mutation en
   N lignes (lots × parcelles × natures de culture, valeur répétée) ; on **dédoublonne** ces
   répétitions mais on **garde les biens distincts** (2 appartements vendus = 2 lignes).

3. **`valeur_fonciere` = total de la mutation, jamais sommée entre lignes.** Deux drapeaux au
   niveau mutation : `flag_multi_bien` (la vente couvre >1 bien → prix non décomposable) et
   `flag_multi_adresse` (la vente couvre >1 parcelle).

4. **Pont `(id_mutation, id_parcelle) → rnb_id` (nullable) + `confiance`.** Le bâtiment exact
   n'est désigné que quand c'est sûr :
   - parcelle **mono-bâtiment** → `rnb_id`, `confiance=haute`
   - parcelle multi-bâtiments mais **adresse DVF ↔ adresse d'un seul bâtiment** → `haute`
   - **récupéré** (parcelle absente du RNB, cf. ADR 0004) → `moyenne`/`basse`
   - parcelle multi-bâtiments **non tranchée** → `rnb_id = NULL`, `confiance=parcelle` (lien parcelle conservé)
   - non rattachable → exclu (cf. `pertes`)

5. **Pas de désambiguïsation par surface au sol ni BDNB.** Mesuré sur la Gironde : la surface
   (empreinte `shape` vs `surface_reelle_bati`) ne tranche que **33%** des cas multi-bâtiments,
   l'adresse **46%** ; le plafond de résolution bâtiment est **~60%**. Au-delà = sur-ingénierie
   pour un gain marginal. **Le bâtiment est un bonus quand il est certain ; la parcelle + les
   coordonnées sont le socle de localisation** (suffisant pour des comparables ; le DPE se
   joindra par clé d'adresse, sans pré-choix de bâtiment).

   > Supersédé pour la BDNB par l'[ADR 0006](0006-bdnb-parcelle-pour-resolution-batiment.md) :
   > la route officielle `batiment_groupe_complet_parcelle` est désormais utilisée pour enrichir
   > la parcelle et résoudre un `batiment_groupe_id` quand la parcelle ne porte qu'un groupe BDNB.

6. **Référentiel d'adresses élagué.** `adresses_ref` ne garde que les `rnb_id` réellement
   référencés par le pont (≈ ceux touchés par DVF), pas les ~1,17 M adresses du RNB → fichiers
   et requêtes allégés.

## Artefacts (par département)

| Fichier | Grain | Rôle |
| --- | --- | --- |
| `comparables_{dept}.parquet` | 1 bien logement vendu | table de service (prix, surface, type, parcelle, `rnb_id`, `confiance`, flags) |
| `pont_batiment_{dept}.parquet` | `(id_mutation, id_parcelle)` | résolution bâtiment + confiance (autorité du rattachement) |
| `adresses_ref_{dept}.parquet` | `(rnb_id, cle_interop_ban)` | adresse normalisée + coords, élagué aux bâtiments référencés |
| `pertes_{dept}.parquet` | mutation | ventes non rattachables + raison (cf. ADR 0004) |

## Conséquences

- DVF brut reste la source canonique ; ces fichiers sont **dérivés et reconstructibles**
  ([ADR 0002](0002-parquet-duckdb-comme-moteur-de-service.md)).
- La précision bâtiment est **partielle et tracée** par `confiance` ; un consommateur qui exige
  le bâtiment certain filtre `confiance IN (haute)`, les autres travaillent à la parcelle.
- La désambiguïsation fine (logement dans un immeuble, propriétés divisées) reste une itération
  ultérieure, via DPE/surface ou BDNB, si un usage la justifie.
