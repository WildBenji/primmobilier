---
status: accepted
date: 2026-06-12
---

# FastAPI + SQLite pour le backend produit (comptes, quotas, sécurité)

Le passage du POC au site complet (comptes utilisateurs, formules et quotas,
export, futur paiement) se fait sur **FastAPI**, avec **SQLite comme base
produit** (comptes, sessions, compteurs d'usage, configuration des formules).
Le serveur stdlib `http.server` actuel est remplacé ; **Django est écarté**,
ainsi que toute auth maison sur stdlib. Les données immobilières restent sur
Parquet + DuckDB (ADR [0002](0002-parquet-duckdb-comme-moteur-de-service.md)) —
SQLite ne porte QUE l'état produit.

## Pourquoi

- **Continuité Python** : même langage que le pipeline et les handlers actuels ;
  les fonctions de service (`*_rows(params) → dict`) se portent quasi
  mécaniquement en routes FastAPI.
- **Sécurité non improvisée** : sessions, middleware, CSRF, rate-limiting et
  hachage de mots de passe via un écosystème mûr — le risque « auth maison »
  est explicitement identifié au plan (PLAN_SITE_2028 §6).
- **SQLite suffit et suit la philosophie zéro-ops du projet** : un seul
  serveur, volumétrie comptes/quotas minuscule, sauvegarde = un fichier.
  Même esprit que l'ADR 0002 (pas de système de plus avant le besoin prouvé).
- **Django écarté en connaissance de cause** : son admin (édition des seuils)
  et son auth intégrée étaient l'argument d'en face ; le coût (ORM/templates
  imposés, migration des routes moins directe, lourdeur pour une API + front
  statique) l'emporte. La paramétrisation des quotas sera une table SQLite +
  un écran d'admin minimal à nous.

## Conséquences

- `web_poc/server.py` migre route par route vers une app FastAPI ; le front
  statique est servi par la même app au départ.
- La base SQLite est **canonique pour l'état produit** (contrairement à la
  base DuckDB, dérivée et jetable) → sauvegardes obligatoires dès la mise en
  ligne.
- À revisiter si multi-serveurs ou forte concurrence d'écriture : SQLite →
  Postgres (le schéma et les requêtes resteront standards pour rendre la
  migration mécanique).
