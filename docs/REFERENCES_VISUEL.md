# Références visuelles & data-viz — référence absolue

> **Statut : canonique.** Ce document est LA référence pour tout le travail
> graphique et visuel du Site 2028 (Accueil, Atlas, Observatoire, exports). Tout
> nouveau graphe ou écran s'y conforme. Si un choix visuel n'est pas couvert ici,
> on l'ajoute ici avant de l'implémenter ailleurs.

## 0. Principes

- **Bibliothèque de graphiques : [D3.js](https://d3js.org/)** (zéro-build via CDN,
  conforme à l'ADR 0008). Choisie pour le rendu sur-mesure, aérien et durable
  (D3 est le socle de la data-viz primée et le restera). Les libs « presse-bouton »
  (ECharts, Highcharts…) sont écartées pour le rendu produit car trop « look de lib ».
- **Tokens** : thème **clair par défaut** (D13), **teal deux tons** #0d9488 / #2dd4bf (D16),
  **Inter + Space Grotesk** (D17), surfaces nettes, **glow/bloom réservé au thème sombre**,
  chiffres en monospace. Voir `web_poc/maquettes/base.css`.
- **Mots d'ordre** : aérien, futuriste, sur-mesure, lisible, ancré dans la donnée réelle
  (on ne montre que ce qu'on peut calculer depuis nos sources : DVF, cadastre, DPE, BAN, RNB,
  RNIC, loyers/Webstat). Aucun indicateur inventé.

## 1. La référence absolue : Nadieh Bremer

[Nadieh Bremer](https://www.visualcinnamon.com/) (Visual Cinnamon) est la référence
mondiale du D3 esthétique. Sa série **« SVGs beyond mere shapes »** documente
exactement les techniques qu'on utilise.

- Site : <https://www.visualcinnamon.com/> · Archive complète : <https://www.visualcinnamon.com/blog/archive/>
- Projet « Data Sketches » (avec Shirley Wu), galerie de référence : <https://www.datasketch.es/>
- GitHub : <https://github.com/nbremer>
- Bac à sable Observable (gradients + filtres) : <https://observablehq.com/@nbremer/svg-gradient-filter-playground-hexagons>

### Série « SVGs beyond mere shapes »
- Article d'introduction (index de la série) : <https://www.visualcinnamon.com/2016/04/svg-beyond-mere-shapes/>
- **Glow / bloom** : <https://www.visualcinnamon.com/2016/06/glow-filter-d3-visualization/>
- **Gooey / métaballs** : <https://www.visualcinnamon.com/2016/06/fun-data-visualizations-svg-gooey-effect/> · variante transition : <https://www.visualcinnamon.com/2015/05/gooey-effect/>
- **Dégradés basés sur la donnée** : <https://www.visualcinnamon.com/2016/05/data-based-svg-gradient-d3/>
- **Dégradé animé (imiter un flux)** : <https://www.visualcinnamon.com/2016/05/animate-gradient-imitate-flow-d3/>
- **Color blending** : <https://www.visualcinnamon.com/2016/05/beautiful-color-blending-svg-d3/>
- **Légende de couleur en dégradé** : <https://www.visualcinnamon.com/2016/05/smooth-color-legend-d3-svg-gradient/>

## 2. Catalogue de techniques (recettes + liens)

### 2.1 Glow / bloom (sombre uniquement)
Filtre SVG : `feGaussianBlur stdDeviation≈3.5` → `feMerge`(blur + SourceGraphic).
S'applique aux **paths, cercles, rects** (pas aux `<line>`). Appliqué à la médiane,
aux lignes de comparaison, aux points.
- Recette : <https://www.visualcinnamon.com/2016/06/glow-filter-d3-visualization/>

### 2.2 Dégradé le long du tracé
`linearGradient` en `gradientUnits="userSpaceOnUse"` étiré sur la largeur du graphe,
stops teal → cyan, appliqué en `stroke`. La ligne change de couleur le long de x.
- Méthode « gradient along stroke » (Bostock) : <https://observablehq.com/@d3/gradient-encoding>
- Booster D3 avec des dégradés SVG (Creative Bloq) : <https://www.creativebloq.com/how-to/boost-d3js-charts-with-svg-gradients>
- Ligne à dégradé (D3 Graph Gallery) : <https://d3-graph-gallery.com/graph/line_color_gradient_svg.html>

### 2.3 Dégradé basé sur la donnée
Position des stops calculée depuis les valeurs (ex. couleur par seuil DPE, opacité
par densité). Plus de sens et plus beau qu'un dégradé décoratif.
- <https://www.visualcinnamon.com/2016/05/data-based-svg-gradient-d3/>

### 2.4 Dégradé animé (flux / shimmer)
SMIL : `linearGradient` avec `spreadMethod="reflect"` ; on anime `x1` (0%→100%) et
`x2` (100%→200%) sur la même durée (distance 100% constante) → une lumière qui
circule le long du tracé. Palette symétrique pour une boucle invisible.
- <https://www.visualcinnamon.com/2016/05/animate-gradient-imitate-flow-d3/>

### 2.5 Gooey / métaballs
Filtre appliqué à un `<g>` de cercles : `feGaussianBlur stdDeviation=10` →
`feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"`. Les points
proches fusionnent en blobs organiques. Idéal pour un beeswarm « liquide ».
- <https://www.visualcinnamon.com/2016/06/fun-data-visualizations-svg-gooey-effect/>

### 2.6 Textures organiques : feTurbulence + feDisplacementMap
Bruit de Perlin (`feTurbulence`) utilisé tel quel (grain) ou pour déformer
(`feDisplacementMap`) une aire/un fond : profondeur organique impossible en CSS seul.
À doser très subtil (aérien, pas « glitch »).
- feTurbulence (Codrops) : <https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/>
- feDisplacementMap (MDN) : <https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap>
- feTurbulence (MDN) : <https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence>
- Textures organiques (dev.to) : <https://dev.to/hexshift/creating-organic-textures-with-svg-filter-distortions-1moj>

### 2.7 Animation & transitions
Easings D3 (`easeCubicOut`, `easeBackOut`, `easeElastic`), tracé qui se dessine
(`stroke-dashoffset`), apparition en cascade, pulse SMIL.
- Animer des line charts (D3 Graph Gallery) : <https://d3-graph-gallery.com/interactivity.html>
- Galerie D3 officielle : <https://observablehq.com/@d3/gallery>

## 3. Types de graphes marquants (au-delà des barres/lignes)

- **Beeswarm** (chaque observation = un point, force-layout) : <https://d3-graph-gallery.com/violin.html> · React Graph Gallery : <https://www.react-graph-gallery.com/beeswarm>
- **Violin / ridgeline** (distributions) : <https://www.react-graph-gallery.com/ridgeline> · <https://www.react-graph-gallery.com/violin-plot>
- « Beyond Bar and Box Plots » : <https://z3tt.github.io/beyond-bar-and-box-plots/>

## 4. Inspiration & concours (à parcourir régulièrement)

- **Information is Beautiful Awards** : <https://www.informationisbeautifulawards.com/> · Showcase : <https://www.informationisbeautifulawards.com/showcase>
- **Data Visualization Society — IIB** : <https://www.datavisualizationsociety.org/iib-awards>
- **Awwwards — data-viz** : <https://www.awwwards.com/websites/data-visualization/>
- **Webby — Best Data Visualization** : <https://winners.webbyawards.com/winners/websites-and-mobile-sites/features-design/best-data-visualization>
- **The Pudding** (essais visuels) : <https://pudding.cool/>
- **FlowingData** : <https://flowingdata.com/>
- **Observable** (carnets D3) : <https://observablehq.com/>
- Refs studios SaaS pour l'UI/dashboard (densité, profondeur, mouvement) : Linear, Vercel, Stripe, Ramp.

## 5. Application à Primmobilier (état au 2026-06-13)

Maquette : `web_poc/maquettes/observatoire.html` (D3 pur).
- **Médiane €/m²** : aire dégradée + ruban P25–P75 + ligne (dégradé le long du tracé + bloom) + volume + crosshair + point « maintenant » pulsé.
- **Comparer des marchés** : multi-lignes lumineuses, focus/estompe au survol, légende, « + Zone ».
- **Ventes individuelles (beeswarm)** : un point par vente, **couleur = DPE** (échelle A–G officielle), bloom en sombre.
- **Prix vs taux** : double axe, aire + ligne dégradé/bloom, taux en pointillés.

**Effets actifs (validés)** : dégradé animé en flux sur la médiane (§2.4) ; gooey/métaballs
sur le beeswarm avec un **toggle** d'activation (§2.5) ; grain feTurbulence subtil sur les aires
en thème sombre (§2.6) ; bloom en couches (§2.1).

## 6. Décision

La bibliothèque **D3.js** est figée comme socle des graphiques produit (résout la
décision ouverte « lib de graphiques » du [JOURNAL_SITE_2028.md](JOURNAL_SITE_2028.md)).
ECharts a servi de jalon puis a été retiré.
