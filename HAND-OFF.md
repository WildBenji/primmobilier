# HAND-OFF

> 2026-06-13 23:03 · branch `develop` @ `45ae99d` · tree: 13 chemins non commités (8 modifiés, 5 nouveaux dont `web_poc/maquettes/atlas/`)

## ▶ Start here — next action
La migration Atlas est **terminée et vérifiée navigateur** ; tout le travail est **non commité** sur `develop`.
1. Lancer le backend : `uv run uvicorn web_poc.app:app --port 8000` (il sert la page + /api/*).
2. Revue visuelle finale : http://localhost:8000/maquettes/atlas.html (recharge forcée `⌘⇧R`).
3. **Commiter le WIP en groupes logiques** (rien n'est commité) : (a) backend `web_poc/app.py` + deps `pyproject.toml`/`uv.lock` ; (b) front modulaire `web_poc/maquettes/atlas/` + `atlas.js` + `atlas.html` ; (c) shell commun `shell.js`/`shell.css`/`tokens.css` (+ pages `accueil`/`observatoire`/`export`) ; (d) `lancer_pipeline.py` (découplage DPE, à part). Puis éventuellement `/release`.

Si tu CONTINUES la migration au lieu de commiter : seules les **autres pages** maquette (`observatoire.html`, `accueil.html`, `export.html`) restent des placeholders — **Atlas seul était dans le périmètre**.

## Goal
Porter L'INTÉGRALITÉ du POC monolithique (`web_poc/static/app.js`, ~2700 lignes) sur la maquette en **modules ES natifs** (`web_poc/maquettes/atlas/`, zéro build — ADR 0008), au niveau de parité du POC.
**Done when :** chaque interaction du POC est présente ET **vérifiée en pilotant un vrai navigateur**. → **ATTEINT** pour la page Atlas.

## Status — where we stopped
**Migration Atlas complète et vérifiée.** Panneau gauche, liste comparables (virtualisée) et détail d'un bien sont au niveau du POC. Dernier lot bouclé : pastille « ventes » rendue non interactive (`disabled`, plus de caret trompeur) + messages d'erreur détail alignés (vouvoiement). Zéro exception JS sur tous les flux pilotés.

## What's been done (and why)
- Backend FastAPI `web_poc/app.py` réutilisant les service-functions du POC `web_poc/server.py` _(sert /api/* + statiques ; ADR 0007)_.
- Découpage modulaire `atlas/` : `state.js` (singleton `S` + créneaux fonctions), `format/api/map/address/estimate/explore/comparables/detail/controls/scope/timeline.js`, entrée `atlas.js`.
- ~40 bugs/gaps trouvés par audits multi-agents (workflows) puis **corrigés par lots, chacun vérifié au navigateur (CDP)** : flux estimation/exploration, filtres marché (types + curseurs prix/surface/pièces), tri (DPE directionnel, départage, flèche), survol synchronisé liste↔carte, **puce d'emprise interactive** (commune↔CP, `syncAddressLabel`), **frise temporelle réelle** (remplace une fausse frise D3 codée en dur), recadrage carte (`fitPending` + garde anti-stale), **Reset complet** (`resetAll`), **virtualisation** liste (12 000 biens → ~30 cartes DOM, IntersectionObserver), champs détail (Copropriété RNIC, DPE étage/validité/distribution, BDNB hauteur/emprise/résolution, commune modifiée), **infobulles** FIELD_HINTS + tooltip flottant, **survol bâti↔carte** (source `parcelleDetail` + feature-state), thème (fond + frise suivent la bascule).

## Dead ends — do not retry
- **Affirmer « ça marche » sur `node --check` + boot console + curl** : a échoué plusieurs fois, l'utilisateur retrouvait des bugs. → TOUJOURS piloter un vrai navigateur (CDP) avant de conclure. Mémoire [[verify-ui-real-browser]].
- **Playwright** : écarté par l'utilisateur → pilotage via **Chrome DevTools Protocol** brut (recette ci-dessous).
- **Tuer un job long en cours** (ex. `lancer_pipeline.py`) : interdit par l'utilisateur — les modifs de code sont « pour après ».
- MapLibre `setData()` veut une Feature/FeatureCollection, pas une géométrie nue (`section.geojson` = MultiPolygon nu → l'envelopper).
- `--remote-allow-origins=*` doit être **quoté** en zsh (`'*'`) sinon glob.

## Tree state
- Branche `develop` @ `45ae99d`, **tout en WIP non commité**. Aucun commit cette session.
- Nouveaux : `web_poc/app.py`, `web_poc/maquettes/atlas.js`, `web_poc/maquettes/atlas/` (12 modules), `shell.js`, `shell.css`, `tokens.css`.
- Modifiés : `web_poc/maquettes/atlas.html` (DOM recâblé de bout en bout), `base.css`, `observatoire/accueil/export.html` (shell commun), `lancer_pipeline.py` (DPE découplé), `pyproject.toml`/`uv.lock` (fastapi/uvicorn).
- Code mort inerte laissé en place : script D3 inline d'`atlas.html` (~l.360-410, ids `#mapFx`/`#tl`) cible des éléments inexistants → no-op. À nettoyer un jour, pas urgent.

## How to verify
1. Serveur : `uv run uvicorn web_poc.app:app --port 8000` (démarré SANS `--reload` → un changement **Python** exige un redémarrage manuel ; un changement **front statique** = simple reload navigateur).
2. Boucle de feedback navigateur réel (mémoire [[verify-ui-real-browser]]) :
   ```
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
     --remote-debugging-port=9222 '--remote-allow-origins=*' --user-data-dir=/tmp/cdp-profile \
     --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
     "http://localhost:8000/maquettes/atlas.html" &
   uv run --with websocket-client python <script>   # Runtime.evaluate pour cliquer/lire le DOM, capturer Runtime.exceptionThrown
   ```
   Exemples de scripts laissés dans `/tmp/cdp_*.py`. La BAN (api-adresse.data.gouv.fr) est joignable pour saisir une adresse réelle.
3. Données : départements 17, 24, 33, 47, 85. Ex. Bordeaux (citycode 33063, CP 33000) ; La Roche-sur-Yon (85191).
4. Syntaxe d'un module : `node --check --input-type=module < web_poc/maquettes/atlas/<mod>.js`.

## Open questions & blockers
- Aucun blocant ; la page Atlas est complète.
- Côté produit : porter les autres pages (`observatoire`, `accueil`, `export`) encore statiques ? Hors périmètre initial.
- Compteur de cohorte = `summary.count` ; divergence rare si la cohorte dépasse `POINTS_HARD_CAP=20000` (non bloquant).

## Landmarks & context
- **Architecture anti-cycle** : `state.js` exporte `S` (données + créneaux). `atlas.js` remplit `S.run` / `S.configureScopeChip` / `S.resetMarketFilters` / `S.selectComparable` ; estimate/explore/scope appellent via `S.*` au lieu d'importer en cercle.
- **Bascule de fond** : toggle de `visibility` des couches `base-*` (jamais `setStyle`, qui effacerait zone/cadastre/comparables/parcelleDetail).
- **feature-state bâti** : source `parcelleDetail` avec `promoteId:"idx"` car `/api/batiments` ne pose pas d'`id` top-level (seulement `properties.idx`).
- Contrats backend, data layer, ADRs : `web_poc/server.py`, `docs/`, `CLAUDE.md` — **ne pas re-documenter ici**.
- Copie (mémoire [[copy-vouvoiement-positionnement]]) : vouvoiement, pas de longs tirets ni de gras.
