---
status: accepted
date: 2026-06-09
---

# Parquet + DuckDB (spatial) comme moteur de service, pas PostGIS

La couche de service (requêtes d'estimation : sélection de comparables par rayon/emprise,
filtres surface/type/pièces, agrégats multi-emprises) s'appuie sur des **fichiers Parquet
partitionnés comme source canonique** et **DuckDB avec l'extension `spatial` comme moteur
de requête embarqué**, lisant le Parquet directement. **PostGIS est écarté** pour l'instant.

## Pourquoi

- **Workload read-mostly** : les artefacts sont régénérés par cycle de préparation batch, pas écrits en continu — la concurrence d'écriture et le multi-utilisateurs robuste de PostGIS ne sont pas requis au départ.
- **Reproductibilité / zéro ops** : DuckDB est embarqué, sans serveur de base à maintenir ; le service se reconstruit à partir des Parquet (cf. CONTEXT « Base de service DuckDB » reconstructible).
- **Déviation du chemin attendu** : pour une appli web cartographique, le réflexe serait PostGIS. Ce *non* est délibéré et doit éviter qu'on « rajoute PostGIS » par défaut.

## Conséquences

- Les **Parquets départementaux** restent canoniques ; la **Base de service DuckDB** est un dérivé jetable/reconstructible.
- À revisiter si un besoin réel apparaît : forte concurrence, écritures temps réel, ou API spatiale multi-utilisateurs à fort trafic → PostGIS (ou hybride) serait alors reconsidéré.
- Cohérent avec l'ADR [0001](0001-valider-joignabilite-avant-de-figer-le-socle.md) : on ne multiplie pas les systèmes avant d'avoir prouvé le besoin.
