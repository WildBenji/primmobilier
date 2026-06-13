# HAND-OFF

> 2026-06-12 · deux chantiers en parallèle, indépendants :
> 1. **Site 2028** — cadrage (phase 0) terminé, prochaine étape = recherche design (phase 1). **C'est le travail actif.**
> 2. **DPE** — gros œuvre terminé et commité (v1.7.0), reste de la généralisation et des finitions.

---

## ▶ Start here — Site 2028, Phase 1 : recherche design

**Phase 0 (cadrage) terminée** : 22 décisions actées
([docs/JOURNAL_SITE_2028.md](docs/JOURNAL_SITE_2028.md)), plan
([docs/PLAN_SITE_2028.md](docs/PLAN_SITE_2028.md)), termes produit au
[CONTEXT.md](CONTEXT.md), choix d'archi en ADR
[0007](docs/adr/0007-fastapi-sqlite-pour-le-backend-produit.md) (FastAPI+SQLite)
et [0008](docs/adr/0008-front-vanilla-multi-pages-zero-build.md) (front vanilla
zéro-build).

**Prochaine étape = produire des explorations visuelles comparées** : des
**maquettes HTML statiques**, sur les tokens déjà actés, pour donner à voir et
trancher sur pièces. Pages à maquetter :
- **Accueil** (page publique : promesse, démo, « Essayer sans compte », tarifs — D14)
- **Atlas du marché** refondu (la page carte actuelle dans le shell commun — D21)
- **Observatoire** (métriques & graphiques : prix, évolution médiane, corrélation
  taux d'emprunt, synthèse LLM — D6, D10, D12)

**Tokens à respecter dans les maquettes** (déjà tranchés au journal) : thème
**clair par défaut** (sombre néon en signature au toggle — D13) · couleur
**teal deux tons** (#0d9488 sur clair, #2dd4bf néon sur sombre — D16) · typo
**Inter + Space Grotesk** (D17) · surfaces **nettes + verre uniquement sur la
carte** (D18) · **une seule interface, divulgation progressive** (D15). Point de
départ visuel : l'existant `web_poc/static/` (déjà une direction 2028 amorcée).

**Méthode** : explorer plusieurs variantes par page, les comparer côte à côte,
**trancher sur pièces** avec l'utilisateur. C'est du concret à regarder, pas du
code de prod — on valide la direction avant de l'industrialiser (phase 2 :
socle technique).

**En attente côté utilisateur** : feu vert pour lancer les premières variantes,
ou ajustement d'une décision du journal avant de commencer. Décisions encore
ouvertes (non bloquantes, tranchées en cours de route) listées en fin de
[JOURNAL_SITE_2028.md](docs/JOURNAL_SITE_2028.md) : lib de graphiques, provider
email, modèle/coût LLM, politique anonyme exacte, noms des paliers payants,
OVH vs Hetzner.

---

## ▶ Chantier DPE — reste à faire (indépendant)

> Gros œuvre TERMINÉ et commité : chaîne DPE complète sur le 33 (v1.6.0) puis
> couverture maximisée par cascade `ademe`/`cle_ban`/`spatial` dans
> `preparer_dpe._resoudre_rnb` — DPE joignables 26 % → 61 %, couverture
> comparables 34,7 % → 42,3 % (commit `045c5bc`, v1.7.0). Doctrine :
> [docs/EXPLORATION_DPE.md](docs/EXPLORATION_DPE.md) ; chiffres :
> [docs/SOURCES_DONNEES.md](docs/SOURCES_DONNEES.md) §3.1.

### 1. Généraliser aux autres départements
`uv run python -m telechargement.preparer_dpe 24|17|47` (~12 min/dept,
mono-connexion — le fetch API ADEME est cappé serveur, NE PAS paralléliser,
mesuré ×0,3) puis `uv run python -m pipeline.construire_comparables <dept>`.
Seul le 33 a aujourd'hui `etiquette_dpe` dans son `comparables_{dept}.parquet`.

### 2. Identification du bâtiment (affine le message une fois matché)
Remplacer le disclaimer générique « ne désigne pas le lot exact » par une
confiance graduée via le cadastre (`cadastre_batiments.type` : `01`=dur/logement,
`02`=léger/abri, jamais un logement) :
- **Maison + 1 bâti dur** → **certain** (le DPE est celui de la maison) ; retirer le disclaimer.
- **Maison + N durs** → **probable = le plus grand bâti dur** (un DPE existant signale déjà un logement).
- Légers (`02`) ignorés ; **appartement** reste ambigu (match-surface + disclaimer).
- **Où** : `/api/dpe` (`dpe_rows`, server.py) reçoit déjà `dept`+`rnb_id`+`surface` ;
  lui passer `parcelle`+`type`, compter les durs via `_parcelle_footprints()`
  (server.py), renvoyer `confiance`. Client : `renderDpePanel` adapte le message ;
  `loadComparableDpe` passe `row.id_parcelle`+`row.type_local`.

### 3. Angle de couverture complémentaire (optionnel, non mesuré)
Jointure par **adresse normalisée** : `comparables.adresse_dvf` ↔ DPE
(`numero_rue`+`nom_rue`+`code_insee` côté pré-2021 S3 ; `adresse_ban` côté post)
via la normalisation `_norm()` de
[telechargement/preparer_adresses_parcelle.py](telechargement/preparer_adresses_parcelle.py).
Rattrape les DPE sans coordonnées — à mesurer avant d'intégrer (méthode ADR 0001).

## Landmark
- Le pré-2021 (S3) servira au-delà du DPE : l'historique DVF < 2021 est prévu
  (DataGouv ne fournit que 5 ans).
