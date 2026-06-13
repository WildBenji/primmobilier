# Plan d'attaque — Site Primmobilier « 2028 »

> Transformer le POC cartographique en site web complet : comptes utilisateurs
> (gratuit aujourd'hui, payant demain), estimation/exploration, métriques &
> graphiques, export, et un design « 2028 » — aérien, slick, scandinave,
> dutch-efficient — qui serve aussi bien les pros que les particuliers.
>
> Document de pilotage. Le journal des actions est dans
> [JOURNAL_SITE_2028.md](JOURNAL_SITE_2028.md). Les décisions de fond sont
> actées au fil du grill (`/grill-with-docs`) : termes dans
> [../CONTEXT.md](../CONTEXT.md), choix structurants en ADR
> ([adr/](adr/)).

## 1. État des lieux (ce sur quoi on bâtit)

- **Données** : socle Parquet/DuckDB local par département (33 complet, 17/24/47
  partiels), pipeline reproductible (`lancer_pipeline.py`). Cf. ADR 0002 et 0005.
- **Serveur** : `web_poc/server.py` — `http.server` stdlib, un handler par
  route API, AUCUNE notion d'utilisateur, de session ni d'état. Servi en local.
- **Client** : `web_poc/static/` — une seule page (index.html + app.js ~2 700
  lignes, vanilla ES modules, MapLibre, zéro build). Double thème déjà en place
  (theme.js), timeline, tri, détail comparable, DPE (WIP couverture).
- **Design actuel** : déjà une direction « 2028 » amorcée (v1.7.0) : sombre par
  défaut, teal/accents néon, Inter + Space Grotesk, panneaux flottants.
- **Docs** : CONTEXT.md (glossaire du socle), 6 ADRs, docs/ (sources, pipeline).

## 2. Cible (le produit fini)

| Page | Contenu | Statut |
|---|---|---|
| Accueil public | Promesse, démo, « Essayer sans compte », futurs tarifs (D14) | À créer |
| Atlas du marché | La page actuelle (estimation + exploration), refondue dans le shell + bouton Exporter (D21) | Existe (POC) |
| Observatoire | Prix, évolution de la médiane, corrélation taux d'emprunt, synthèse LLM + bouton Exporter (D6, D10, D12) | À créer |
| Export | CSV/XLSX/GeoJSON sur la sélection + rapport PDF multi-templates ; sections pré-cochées (D8, D9, D11) | À créer |
| Compte | Profil, formule, compteurs de quota, Analyses sauvegardées (vues paramétriques, D20) | À créer |
| Login / Inscription | Email + mot de passe (D4) ; quotas par formule dès le jour 1 (D1) | À créer |

Transversal : navigation commune, design system unifié, backend avec
authentification et sécurité dignes d'un produit payant.

## 3. Chantiers

### A. Recherche & système de design « 2028 »
Direction visuelle (à partir de l'existant), design tokens (couleurs, typo,
espacements, rayons, ombres, thèmes clair/sombre), composants réutilisables
(panneaux, boutons, champs, menus, badges, cartes, graphiques), layout shell
(navigation entre pages), accessibilité. Mots d'ordre : aérien, slick,
future-proof, scandinave, dutch-efficient, pro ET grand public.

### B. Backend produit & comptes
Choix du framework serveur (l'actuel stdlib ne porte ni sessions ni middleware),
base utilisateurs, inscription/login/logout, sessions, hachage mots de passe,
CSRF/rate-limiting/headers de sécurité, modèle d'« entitlements » (droits par
plan : gratuit / payant futur) posé dès le départ, RGPD (données perso minimales,
suppression de compte).

### C. Shell multi-pages & refonte estimation/exploration
Navigation commune (header/nav), routage des pages, intégration de la page
actuelle dans le shell sans régression fonctionnelle.

### D. Observatoire (page métriques & graphiques) — nommé (D6)
Indicateurs calculés sur l'Analyse courante : prix et dispersion, évolution de
la médiane, **corrélation avec les taux d'emprunt** (Webstat, D10), extensible
(volumes, DPE quand la couverture sera là). **Rapport rédigé par LLM** sur le
bien/la zone (D12 — modèle, coût et quota à cadrer). Lib de graphiques
compatible zéro-build (ADR 0008). Bouton Exporter. Ambition : page vitrine du
produit.

### E. Export
Moteur d'export : périmètre = l'Analyse courante. CSV / XLSX / GeoJSON bâtis
sur la sélection de l'utilisateur + **rapport PDF multi-templates** (D8, D11)
embarquant les sections de l'Observatoire et la synthèse LLM. Choix du contenu
par préréglages + cases par groupe, pré-cochées (D9). Page dédiée + boutons
Exporter sur les 2 pages. Décompte d'unités d'export par formule (D1-D2).

### F. Infra & mise en ligne
Hébergement, HTTPS, domaines, sauvegarde de la base utilisateurs, logs &
observabilité, stratégie de déploiement des parquets (volumineux).

## 4. Ordre d'attaque

Chaque phase se termine par une vérification explicite (méthode du projet :
valider par la donnée / le test, cf. ADR 0001).

| Phase | Contenu | Vérifié quand |
|---|---|---|
| 0. Cadrage (en cours) | Grill des décisions structurantes, termes au CONTEXT.md, ADRs | Toutes les « décisions ouvertes » (§5) sont actées au journal |
| 1. Recherche design | Explorations visuelles sur la page actuelle (variantes), tokens, maquette du shell + des 4 pages | Direction validée par l'utilisateur sur maquettes comparées |
| 2. Socle technique | Framework backend choisi et posé, base users, auth complète, shell multi-pages servi | Tests : inscription→login→session→logout→suppression ; pages naviguent |
| 3. Refonte estimation/exploration | Page actuelle migrée dans le shell + design system | Parité fonctionnelle (scénarios Playwright existants rejoués) |
| 4. Métriques & graphiques | Page nommée, indicateurs, graphiques sur la sélection | Indicateurs justes vs requêtes DuckDB de contrôle |
| 5. Export | Moteur + page + boutons contextuels | Exports ouverts dans Excel/QGIS ; contenu = sélection exacte |
| 6. Compte & entitlements | Page compte, plans, quotas branchés | Un compte « gratuit » voit ses limites appliquées |
| 7. Durcissement | Sécurité (audit headers/CSRF/rate-limit), perfs, RGPD | Checklist sécurité passée ; scan basique sans finding critique |
| 8. Mise en ligne | Infra, HTTPS, monitoring | Site accessible publiquement, sauvegardes testées |

Le chantier DPE en cours (HAND-OFF.md racine) reste indépendant et prioritaire
à reprendre séparément — il n'est pas absorbé par ce plan.

## 5. Décisions — état

**Phase 0 terminée le 2026-06-12.** Les 22 décisions structurantes (D1-D22)
sont actées et détaillées dans [JOURNAL_SITE_2028.md](JOURNAL_SITE_2028.md) ;
les termes sont au [CONTEXT.md](../CONTEXT.md) (Formule, Unité d'analyse,
Unité d'export, Quota, Analyse, Observatoire, Atlas du marché, Analyse
sauvegardée) ; les choix d'architecture en ADR
([0007](adr/0007-fastapi-sqlite-pour-le-backend-produit.md) FastAPI+SQLite,
[0008](adr/0008-front-vanilla-multi-pages-zero-build.md) front vanilla
zéro-build).

En une ligne chacune : quotas 4 paliers paramétrables (D1) comptés par adresse
distincte (D2) ; FastAPI+SQLite (D3) ; email+mdp (D4) ; front vanilla
multi-pages (D5) ; pages = Accueil, Atlas du marché, Observatoire, Export,
Compte (D6, D14, D21) ; objet central = Analyse (D7) ; export 4 formats par
sections pré-cochées (D8-D9) ; Observatoire = prix/évolution/corrélation taux
+ synthèse LLM, PDF multi-templates (D10-D12) ; thème clair par défaut, teal
deux tons, Inter+Space Grotesk, net+verre sur carte, divulgation progressive
(D13, D15-D18) ; VPS européen (D19) ; analyses sauvegardées = vues
paramétriques (D20) ; un seul CONTEXT.md (D22).

**Reste ouvert** (à trancher dans les phases, non bloquant) : lib de
graphiques zéro-build (ph. 4) ; provider email (ph. 2) ; modèle et coût LLM
(ph. 4-5) ; politique anonyme exacte — 0 export à confirmer (ph. 6) ; noms
des paliers payants (ph. 6) ; OVH vs Hetzner (ph. 8).

## 6. Risques identifiés

- `app.js` monolithique (~2 700 l.) : la refonte doit éviter la réécriture
  big-bang → migration par modules (timeline.js et theme.js montrent la voie).
- DuckDB + parquets locaux en multi-utilisateurs concurrent : à mesurer tôt
  (phase 2) sous charge.
- Volumétrie des parquets (plusieurs Go) au déploiement.
- Auth maison = surface d'attaque ; ne rien improviser en crypto/sessions.
- Le « payant plus tard » mal anticipé = refonte douloureuse des quotas.
