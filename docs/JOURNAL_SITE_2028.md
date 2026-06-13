# Journal — Site Primmobilier « 2028 »

> Log chronologique de ce qui a été fait sur le chantier site complet.
> Le plan vivant est dans [PLAN_SITE_2028.md](PLAN_SITE_2028.md).

## 2026-06-12

- Lancement du chantier. Lecture de l'existant : CONTEXT.md (glossaire socle),
  ADRs 0001-0006, web_poc (server.py stdlib, app.js vanilla ~2 700 l., double
  thème v1.7.0), HAND-OFF DPE en cours (chantier séparé, non absorbé).
- Création du plan d'attaque ([PLAN_SITE_2028.md](PLAN_SITE_2028.md)) :
  6 chantiers (design system, backend/comptes, shell multi-pages, métriques,
  export, infra), 9 phases ordonnées, 12 décisions ouvertes.
- Phase 0 (cadrage) démarrée : grill des décisions structurantes une par une
  (/grill-with-docs). Décisions actées ci-dessous au fil de l'eau.

### Décisions actées

- **D1 — Modèle payant = quotas d'usage, 4 paliers** : anonyme (5 unités avant
  inscription), gratuit (10), payant palier 1 (~50), payant palier 2 (~200) —
  sur les estimations/explorations ET les exports. Chiffres = brouillon →
  **les seuils doivent être paramétrables facilement** (pas de constantes en
  dur dispersées). Conséquences : compteurs d'usage par compte dès la phase 2,
  suivi anonyme (cookie) pour le palier non connecté, table/fichier de
  configuration des plans.
- **D2 — Unité de quota = adresse distincte** (définition déléguée par
  l'utilisateur, conçue et actée comme décision de travail) : 1 **unité
  d'analyse** = une adresse résolue distincte consultée en estimation OU
  exploration ; tous les réglages (curseurs, modes, emprises, re-visites) sur
  la même adresse sont gratuits. Décompte par **mois calendaire** pour les
  comptes, **pas de limite journalière** (l'utilisateur peut tout consommer en
  un jour). 1 **unité d'export** = un fichier généré. Clé d'identité d'une
  adresse = identifiant BAN (insensible à la graphie). Propositions à valider
  au fil de l'eau : anonymes = 5 unités d'analyse uniques (à vie, cookie) et
  **0 export** (l'export demande un compte — levier d'inscription) ; reset
  mensuel calendaire plutôt que glissant. Termes ajoutés au CONTEXT.md :
  Formule, Unité d'analyse, Unité d'export, Quota.
- **D3 — Backend = FastAPI + SQLite** : migration route par route depuis le
  serveur stdlib ; SQLite porte l'état produit (comptes, sessions, compteurs,
  config des formules), DuckDB/Parquet restent le moteur data (ADR 0002).
  → **ADR 0007** créé (FastAPI + SQLite pour le backend produit).
- **D4 — Auth = email + mot de passe** : sessions cookie httponly, hachage
  argon2, reset par email (⇒ provider d'envoi d'emails à choisir en phase 2) ;
  OAuth ajoutable plus tard, pas de 2FA au lancement.
- **D5 — Front = vanilla multi-pages, zéro build** : une page HTML par écran,
  shell commun (nav/thème/session), app.js poursuivi en extraction de modules ;
  frameworks SPA et hybride écartés. → **ADR 0008** créé.
- **D6 — La page métriques s'appelle « Observatoire »** (« Marché » écarté :
  collision avec « Contexte de marché »/« Marché récent » du glossaire et la
  marque « Atlas du marché »).
- **D7 — L'objet central s'appelle « Analyse »** : adresse + mode + emprise +
  filtres + fenêtre temporelle + comparables résultants. L'Observatoire
  visualise l'Analyse courante, l'export la sérialise. Cohérent avec « unité
  d'analyse » (D2). Termes ajoutés au CONTEXT.md.
- **D8 — Export : les 4 formats dès la v1** : CSV / XLSX / GeoJSON construits
  sur ce que l'utilisateur a choisi dans son Analyse, + rapport PDF mis en
  page reprenant les sections de l'Observatoire. Contenu choisi **par
  sections, checkboxes pré-cochées** (défauts sensés).
- **D9 — Granularité export = préréglages + cases par groupe** (Essentiel /
  Complet / Données brutes ; groupes de colonnes et graphiques).
- **D10 — Observatoire v1** : prix, évolution de la médiane, **corrélation
  avec les taux d'emprunt** (source Banque de France Webstat déjà au
  glossaire — à implémenter), extensible (« d'autres choses encore ») ;
  ambition : « une page magnifique ».
- **D11 — Le rapport PDF aura plusieurs templates** de mise en page au choix.
- **D12 — Rapport rédigé par LLM** : appel API à un LLM pour rédiger une
  synthèse du bien estimé ou de la zone explorée, intégrée à l'Observatoire et
  au PDF. À cadrer en phase 4-5 : modèle, coût par appel (à couvrir par les
  quotas/formules), gestion de la clé API côté serveur.
- **D13 — Thème clair par défaut** (scandinave assumé) ; le sombre néon actuel
  devient le thème signature au toggle. Inverse le défaut actuel de theme.js.
- **D14 — Une page d'accueil publique dédiée** entre au périmètre (absente de
  la liste initiale) : promesse, démo, « Essayer sans compte », futurs tarifs.
  Vitrine du design + atterrissage SEO.
- **D15 — Une seule interface, divulgation progressive** : l'essentiel par
  défaut, la profondeur (filtres fins, cadastre, SIG) à la demande. Pas de
  « mode pro » commutable, pas de double parcours.
- **D16 — Couleur de marque = teal deux tons** : teal profond (famille
  #0d9488) sur fonds clairs, version néon (#2dd4bf) réservée au thème sombre
  et aux accents data.
- **D17 — Typographie conservée** : Inter (UI) + Space Grotesk (titres,
  grands chiffres).
- **D18 — Surfaces : net + verre sur carte** : aplats nets, hairlines, ombres
  douces partout ; translucidité + flou discret réservés aux panneaux
  flottants au-dessus de la carte. Micro-animations sobres.
- **D19 — Hébergement = VPS européen unique** (OVH/Hetzner, disque local pour
  SQLite + parquets, HTTPS Caddy/nginx, sauvegardes fichier). Choix du
  fournisseur en phase 8.
- **D20 — Analyses sauvegardées = vues paramétriques** : le compte stocke les
  PARAMÈTRES d'une Analyse (adresse, mode, emprise, filtres, fenêtre) et la
  régénère à la volée à l'ouverture. Aucun fichier produit (PDF/CSV) n'est
  conservé. Edge à régler en phase 6 : rouvrir une analyse sur un nouveau mois
  re-décompte-t-elle une unité ? (proposition : oui, c'est une consultation.)
- **D21 — La page carte s'appelle « Atlas du marché »** (« Atlas » en nav
  compacte) — garde la marque, « du marché » borne l'ambition.
- **D22 — Un seul CONTEXT.md pour l'instant** (décision documentaire prise en
  autonomie) : les termes produit tiennent dans le glossaire existant ; on ne
  crée pas de CONTEXT-MAP tant que le vocabulaire produit ne déborde pas.

### Reste ouvert (à trancher dans les phases, pas bloquant)

- Lib de graphiques compatible zéro-build (phase 4) ; provider d'emails
  (phase 2) ; modèle LLM + coût/quota de la synthèse (phase 4-5) ; politique
  anonyme exacte (0 export à confirmer, phase 6) ; noms des deux paliers
  payants (phase 6) ; OVH vs Hetzner (phase 8).
- **Phase 0 (cadrage) : terminée.** Prochaine étape = phase 1, recherche
  design : explorations visuelles comparées (maquettes HTML statiques sur les
  tokens actés D13/D16-D18) pour l'Accueil, l'Atlas refondu et l'Observatoire.

## 2026-06-13

Phase 1 (recherche design) lancée. Accueil exploré en maquettes HTML statiques
jetables, direction tranchée sur pièces après itérations. Maquettes de travail
élaguées : une seule conservée,
[../web_poc/maquettes/accueil.html](../web_poc/maquettes/accueil.html), avec
`base.css` (tokens) et `neon.css` (couche signature sombre).

### Accueil : direction retenue (verrouillée)

- Hero centré sous « lampadaire » : trois faisceaux (un central plus deux
  partant des coins hauts, effet scène) qui s'intensifient quand la souris
  approche de la barre de recherche. En sombre ils s'allument en néon ; en clair
  ils assombrissent pour créer du relief. Intensité pilotée par `opacity` dans
  les deux thèmes (repaint fiable). La lumière diffuse au centre.
- Thème clair par défaut confirmé (D13), sans persistance : clair à chaque
  ouverture, sombre = signature au toggle.
- Démo-first : grande barre d'adresse en vedette, puis deux actions à poids égal
  Estimer / Explorer (pas de focus sur l'estimation, c'est aussi un outil
  d'exploration).
- Carte en bandeau large et bas, juste sous le hero (plus au même niveau que le
  texte). Verre réservé à la carte (D18).
- À décliner ensuite sur l'Atlas refondu et l'Observatoire (même signature).

### Règles de copie (transverses, actées)

- Vouvoiement de rigueur partout.
- Vendre au-delà de l'estimation : estimer, étudier le marché, générer des
  rapports.
- Pas de tirets longs ni de gras dans la copie produit.

### Modèle de crédits (raffine D2, à reporter au CONTEXT.md)

- 1 crédit = un point d'analyse : une adresse, une zone (double-clic sur la
  carte), ou une ville / code postal.
- Une fois le point choisi, tous les réglages fins (rayon, type de bien, nombre
  de pièces, historique comparatif…) restent illimités tant qu'on ne change pas
  de point. Un export par adresse.
- Anonyme : 5 crédits, 1 export offert, sans historique (pas de compte). Ferme
  la proposition « anonyme = 0 export » de D2 (désormais 1 export offert en
  anonyme). Termes « crédit » et « point d'analyse » à ajouter au CONTEXT.md.
