---
status: accepted
date: 2026-06-10
---

# Récupération des ventes DVF non rattachées au RNB : cascade + seuil de perte

L'[ADR 0003](0003-rnb-pivot-batiment.md) relie DVF au bâtiment RNB **via la parcelle**.
Sur la Gironde, **95,0%** des ventes de logement atteignent le RNB ainsi ; **4,96%
(6 274 mutations)** non. La décomposition montre que ces non-matchs ont *tous* une
parcelle valide en DVF mais **absente de `RNB.plots`**, et que ~100% des bâtiments
correspondants existent bel et bien dans le RNB (avec des `plots`) sur une **parcelle
différente** → il s'agit de **décalages de renumérotation cadastrale**, pas de trous de
couverture. (Pipeline : `pipeline/{qualite_jointure,recuperation_non_match,geocodage_residuel}.py` — cf. [PIPELINE.md](../PIPELINE.md).)

## Décision

On récupère ces non-matchs par une **cascade de stratégies ordonnée par fiabilité**,
chaque lien portant une **`methode` + `confiance`**, et on applique une **politique de
perte stricte** : ce qui n'est pas rattachable de façon défendable est **marqué perdu /
inexploitable** plutôt que faussement rattaché.

| Ordre | `methode` | Mécanisme | `confiance` |
| --- | --- | --- | --- |
| A | `adresse` | clé BAN reconstruite `insee_codevoie_numero` (codevoie en minuscules) → `RNB.adresses` | `haute` si bâtiment ≤ 25 m, sinon `moyenne` |
| B | `parcelle_ban` | parcelle DVF → `BAN.cad_parcelles` → clé → `RNB.adresses` | `moyenne` |
| C | `spatial` | coords DVF → plus proche bâtiment RNB (haversine) | `moyenne` ≤ 25 m, `basse` 25–50 m |
| D | `ban_geocode` | géocodage texte BAN (api-adresse) → plus proche bâtiment RNB | `moyenne` ≤ 25 m, `basse` 25–50 m |

**Garde-fous de l'étape D (géocodage)** — un résultat n'est retenu que si :
`result_score >= 0.95` (**seuil paramétrable**, 2ᵉ argument CLI) **ET** `result_type ∈ {housenumber, street}`
**ET** un bâtiment RNB existe à **≤ 50 m** des coords renvoyées. En dessous du seuil de
score, **l'adresse est jetée** : un faux rattachement coûte plus cher qu'une perte assumée.

## Pourquoi (chiffres dept 33)

Sur les 6 274 non-matchs :

| Étape | Récupérés | Cumul |
| --- | --- | --- |
| A — clé adresse | 4 811 | 4 811 |
| B — pont parcelle BAN | +92 | 4 903 |
| C — plus proche bâtiment (≤ 50 m) | +764 | 5 667 |
| D — géocodage BAN (score ≥ 0,95) | +66 | **5 733** |
| **Perdu / inexploitable** | | **541** |

**Entonnoir final (126 393 ventes de logement) : 120 119 match direct + 5 733 récupérées
= 99,57% exploitable, 541 perdues (0,43%).** Répartition des liens par confiance :
`haute` 843, `moyenne` 4 690, `basse` 200.

Pertes par raison : `score_insuffisant` 364, `aucun_resultat_ban` 138,
`geocodage_imprecis` 37, `aucun_batiment_proche` 2 — dominées par des adresses
lieu-dit / numéros fictifs (`9001…`) absentes de toute référence (≠ problème de format).

## Conséquences

- **Artefacts** (par département) : `recup_liens_final_{dept}.parquet`
  (`id_mutation, rnb_id, methode, confiance, dist_m`) fait **autorité** pour le
  rattachement bâtiment ; `pertes_{dept}.parquet` trace les ventes inexploitables + raison.
- Une **dépendance API** (api-adresse.data.gouv.fr) entre dans le pipeline pour l'étape D
  seulement (résiduel) ; à mettre en cache à l'échelle nationale.
- La **`confiance`** doit être propagée jusqu'au service : un lien `basse` (spatial 25–50 m
  ou géocodage limite) est un candidat, pas une certitude — cohérent avec le point dur
  multi-bâtiments de l'[ADR 0003](0003-rnb-pivot-batiment.md).
- Le **seuil 0,95** est volontairement conservateur ; le baisser augmente le rappel mais
  réintroduit du faux rattachement (à 0,6, 209 récupérés mais qualité hétérogène). À
  réévaluer si le rappel prime sur la précision pour un usage donné.
