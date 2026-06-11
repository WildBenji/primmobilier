---
status: accepted
date: 2026-06-10
supersedes: 0005 §5
---

# BDNB par parcelle pour enrichir et résoudre les bâtiments

## Contexte

L'ADR 0005 assumait de ne pas utiliser la BDNB pour départager les parcelles multi-bâtiments.
Cette position était acceptable pour une table de comparables minimale, mais insuffisante pour
les fiches détail et la lecture cartographique : afficher `confiance=parcelle` et
`source=multi_ambigu` n'est pas une information métier utile.

Après vérification via le MCP data.gouv et le portail BDNB, la route officielle BDNB Open
pertinente est `/donnees/batiment_groupe_complet_parcelle`. Elle relie explicitement un
`batiment_groupe_id` à un `parcelle_id` et expose les attributs métier du groupe de bâtiments.
Pour le pipeline local, on reconstruit cette vue depuis les ZIP CSV départementaux officiels
du millésime `2026-02-a`, plutôt que de paginer l'API.

## Décisions

1. **La BDNB est intégrée par la clé officielle `parcelle_id`.** On ne déduit aucune relation
   `RNB.ext_ids` -> `batiment_groupe_id` tant qu'une route ou table officielle ne la documente
   pas. Les `ext_ids` RNB peuvent contenir des ids BDNB construction, mais ils ne sont pas le
   même namespace que les ids BDNB groupe.

2. **L'ingestion de production utilise les ZIP départementaux BDNB.** Les fichiers
   `open_data_millesime_2026-02-a_dep{dept}_csv.zip` sont téléchargés depuis le S3 officiel BDNB,
   puis réduits immédiatement aux tables et colonnes utiles.

3. **La BDNB de service est filtrée sur DVF.** Les tables opérationnelles ne conservent que les
   `parcelle_id` présents dans DVF. L'application ne vise pas l'exploration exhaustive du parc
   bâti hors ventes.

4. **Le RNB reste le pivot bâtiment quand il est résolu.** La BDNB ajoute un
   `batiment_groupe_id` et des attributs métier ; elle ne remplace pas un `rnb_id` absent par
   inférence.

5. **Une parcelle BDNB à groupe unique peut résoudre un groupe de bâtiments.** Si
   `/batiment_groupe_complet_parcelle` ne renvoie qu'un `batiment_groupe_id` distinct pour la
   parcelle, le pont marque `resolution_statut=bdnb_groupe_resolu`.

6. **Une parcelle à plusieurs groupes reste un contexte parcellaire.** Aucun bâtiment n'est
   choisi par surface, distance ou "plus gros bâtiment" sans source officielle. Le statut interne
   devient `parcelle_seule`, pas "ambigu" dans les surfaces utilisateur.

7. **L'interface ne montre pas les champs techniques `confiance` et `source`.** Ces champs
   restent internes pour l'audit du pipeline. Les fiches détail affichent les identifiants et les
   attributs sourcés : parcelle, `rnb_id`, `batiment_groupe_id`, usage BDNB, logements, niveaux,
   hauteur, millésime/construction quand disponibles.

## Colonnes BDNB retenues

L'ingestion départementale `bdnb_batiments_{dept}.parquet` conserve uniquement les colonnes
utiles au rattachement et aux fiches détail :

`batiment_groupe_id`, `parcelle_id`, `code_departement_insee`, `code_commune_insee`,
`usage_principal_bdnb_open`, `usage_niveau_1_txt`, `nb_log`, `nb_log_rnc`,
`nb_lot_garpark_rnc`, `nb_lot_tertiaire_rnc`, `surface_emprise_sol`, `hauteur_mean`,
`nb_niveau`, `annee_construction`, `mat_mur_txt`, `mat_toit_txt`, `type_batiment_dpe`,
`fiabilite_emprise_sol`, `fiabilite_hauteur`, `fiabilite_cr_adr_niv_1`,
`fiabilite_cr_adr_niv_2`, `s_geom_groupe`.

## Conséquences

- Les anciens libellés `multi_ambigu` ne sont plus une catégorie métier exposée.
- La précision augmente sans heuristique : chaque résolution est rattachée à une clé officielle.
- Les cas non résolus restent visibles comme parcelles enrichies, mais ne prétendent pas désigner
  un bâtiment unique.
