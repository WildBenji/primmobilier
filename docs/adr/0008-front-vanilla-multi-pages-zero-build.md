---
status: accepted
date: 2026-06-12
---

# Front vanilla multi-pages, zéro build — pas de framework SPA

Le site complet (estimation/exploration, métriques, export, compte) reste en
**JavaScript vanilla à modules ES, sans chaîne de build** : une page HTML par
écran, un **shell commun** (navigation, thème, session) en module partagé, et
la poursuite de l'extraction d'`app.js` en modules (comme `timeline.js` et
`theme.js`). Les **frameworks SPA (React/Svelte/Vue) sont écartés**, de même
que l'hybride « nouvelles pages en framework, carte en vanilla ».

## Pourquoi

- **La page carte est le cœur du produit et fonctionne** : un framework SPA
  imposerait de réécrire ~2 700 lignes éprouvées (MapLibre, timeline, tri,
  détail) — le risque n°1 identifié au plan (PLAN_SITE_2028 §6).
- **Zéro build = zéro ops front** : éditer un fichier suffit (le serveur local
  sert déjà sans cache). Cohérent avec la philosophie zéro-ops du projet
  (ADR 0002, 0007).
- **L'hybride écarté** : deux mondes front = deux façons de faire un bouton,
  deux gestions du thème, double maintenance du design system.
- **Déviation assumée du chemin attendu** : en 2026 le réflexe est un
  framework. Ce *non* est délibéré ; le design system vit dans les CSS custom
  properties (déjà en place pour le double thème) et des composants HTML/CSS
  documentés, pas dans une bibliothèque de composants JS.

## Conséquences

- Le shell commun (header/nav/thème/session) est un contrat : toute nouvelle
  page l'importe, rien ne se duplique.
- La refonte de la page carte est une **migration par modules, pas une
  réécriture** ; chaque extraction doit garder la parité fonctionnelle
  (scénarios Playwright rejoués).
- Les bibliothèques tierces restent compatibles no-build (ESM/CDN, comme
  MapLibre aujourd'hui) — contrainte à vérifier avant d'adopter une lib de
  graphiques.
- À revisiter si l'équipe grossit ou si l'interactivité des nouvelles pages
  explose ; le découpage en modules garderait alors la migration ciblée.
