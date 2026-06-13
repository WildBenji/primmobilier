# Socle Immobilier Cartographique

Ce contexte decrit le socle national de donnees immobilieres cartographiques destine a explorer, croiser et preparer les donnees publiques avant de construire des moteurs metier comme l'estimation par comparables.

## Language

**Socle immobilier cartographique**:
Ensemble national de donnees immobilieres publiques, geolocalisees ou rattachables a un lieu, preparees pour l'analyse cartographique et les usages metier.
_Avoid_: moteur d'estimation, prototype Bordeaux, pipeline Gironde

**Tranche geographique**:
Sous-ensemble territorial du socle national utilise pour explorer, verifier ou limiter une analyse sans changer le modele de donnees.
_Avoid_: perimetre produit, pipeline local, MVP Gironde

**Moteur d'estimation par comparables**:
Usage metier qui estime un bien a partir de ventes comparables issues du socle immobilier cartographique.
_Avoid_: socle de donnees, plateforme data

**Pipeline de preparation local**:
Chaine executee hors serveur qui telecharge les donnees open data, les harmonise et produit les fichiers Parquet prets a deployer.
_Avoid_: pipeline serveur, ingestion en production

**Cycle de preparation batch**:
Execution periodique locale qui regenere les artefacts deployables a partir des dernieres publications open data.
_Avoid_: ingestion temps reel, synchronisation continue

**Instantane source**:
Inventaire des fichiers publics utilises pour un cycle de preparation, avec leurs dates, URLs et empreintes quand disponibles.
_Avoid_: version applicative, date de deploy

**Version de build donnees**:
Identifiant de generation locale des artefacts produits par un cycle de preparation batch.
_Avoid_: version source, version code

**Artefact deploye**:
Fichier prepare localement et copie sur le serveur pour etre requete par l'application.
_Avoid_: donnee brute, fichier source

**Parquet departemental**:
Fichier Parquet prepare localement et partitionne par departement pour representer une tranche physique du socle national.
_Avoid_: export temporaire, cache local

**Base de service DuckDB**:
Moteur DuckDB embarque dans le serveur, reconstructible a tout moment depuis les Parquets departementaux canoniques (cf. ADR 0002) — pas un fichier base deploye ni une source de verite.
_Avoid_: source canonique, stockage brut, base a sauvegarder

**Table large orientee requete**:
Table denormalisee construite pour eviter des jointures repetitives lors des requetes serveur frequentes. Realisee : `comparables_{dept}` au grain bien logement (cf. ADR 0005).
_Avoid_: modele source, verite metier unique

**Requete analytique immobiliere**:
Question dynamique qui combine localisation, periode, caracteristiques de bien et sources publiques pour calculer un indicateur immobilier.
_Avoid_: tuile cartographique, couche de fond

**Emprise d'analyse**:
Zone choisie explicitement par l'utilisateur pour selectionner les comparables autour du bien cible.
_Avoid_: elargissement automatique, zone implicite

**Section cadastrale**:
Division cadastrale utilisee comme emprise d'analyse intermediaire entre la parcelle individuelle et la commune.
_Avoid_: parcelle cadastrale, parcelle du bien

**Estimation locale**:
Estimation du bien cible fondee sur une emprise proche comme un rayon, une section cadastrale ou un code postal.
_Avoid_: comparaison nationale, contexte de marche

**Contexte de marche**:
Lecture comparative sur une emprise large comme un departement, une region ou le pays pour situer les ordres de grandeur.
_Avoid_: estimation locale, prix du bien cible

**Historique DVF disponible**:
Fenetre temporelle exploitable des mutations DVF presentes dans le socle, typiquement limitee aux cinq dernieres annees publiees.
_Avoid_: historique illimite, archive longue

**Marche recent**:
Sous-ensemble des comparables sur les douze derniers mois disponibles, utilise pour situer l'estimation par rapport aux conditions recentes.
_Avoid_: tendance longue, historique complet

**Tendance temporelle**:
Indicateur secondaire d'evolution du prix au metre carre calcule sur les comparables retenus au fil du temps.
_Avoid_: prix principal, projection certaine

**Contexte de taux**:
Information sur les taux d'emprunt immobilier accompagnant l'estimation pour expliquer les conditions de financement et leur lien avec le marche.
_Avoid_: comparable immobilier, ajustement automatique, prevision de taux

**Source Banque de France Webstat**:
Source publique institutionnelle utilisee pour alimenter le contexte de taux.
_Avoid_: source de prix immobilier, prevision de taux

**Recherche d'adresse BAN**:
Autocompletion d'adresse utilisant la Base Adresse Nationale pour proposer des adresses pendant la saisie utilisateur.
_Avoid_: saisie libre non geocodee, recherche cadastrale directe

**API BAN directe**:
Usage en ligne de l'API Base Adresse Nationale pour rechercher et resoudre une adresse au moment de la saisie utilisateur.
_Avoid_: ingestion BAN nationale, geocodage batch

**Adresse resolue**:
Adresse selectionnee par l'utilisateur apres recherche BAN, avec coordonnees, code postal, commune et identifiants utiles aux jointures.
_Avoid_: texte d'adresse brut, adresse non geocodee

**Rattachement cadastral BAN**:
Identifiant cadastral fourni avec une adresse resolue BAN, utilise pour rejoindre directement le Cadastre quand il est disponible.
_Avoid_: jointure spatiale obligatoire, recherche cadastrale separee

**Adresse parcellaire**:
Adresse rattachee a une parcelle par lien cadastral direct (codesParcelles du cadastre fusionnes aux cad_parcelles de la BAN), affichee dans le detail comme proxy de l'adresse du proprietaire. Independante du pivot batiment RNB : couvre aussi les parcelles sans batiment adresse. Ce n'est ni l'identite du proprietaire (Fichiers Fonciers/MAJIC, hors open data) ni une supposition de proximite spatiale.
_Avoid_: identite du proprietaire, proprietaire de la parcelle, adresse du bien cible, plus proche adresse

**Emprise par distance**:
Emprise d'analyse definie par un rayon autour des coordonnees de l'adresse resolue.
_Avoid_: code postal, commune, section cadastrale

**Emprise administrative**:
Emprise d'analyse definie par un code ou territoire comme section cadastrale, code postal, arrondissement, commune, departement, region ou pays.
_Avoid_: rayon spatial, distance autour du point, ville

**Arrondissement**:
Emprise administrative infra-communale utilisee quand elle est disponible dans les grandes communes concernees.
_Avoid_: commune entiere par defaut, quartier informel

**Comparaison multi-emprises**:
Tableau qui compare le bien cible et son estimation aux prix observes sur des emprises plus larges que l'emprise d'analyse active.
_Avoid_: comparatif plus fin, second calcul principal

**Vue temporelle de comparaison**:
Onglet de comparaison multi-emprises limite soit a l'historique complet disponible, soit aux douze derniers mois.
_Avoid_: colonne surchargee, periode implicite

**Indicateur comparatif minimal**:
Mesure affichee dans la comparaison multi-emprises en premiere version, limitee au nombre de comparables et au prix au metre carre median.
_Avoid_: tableau definitif, indicateurs exhaustifs

**Cohorte nationale comparable**:
Ensemble des biens similaires au bien cible a l'echelle nationale, filtre avant agregation par emprises.
_Avoid_: tout le marche national, echantillon local uniquement

**Prix median estime**:
Prix central affiche en premier pour le bien cible, calcule a partir des comparables retenus et des ajustements applicables.
_Avoid_: prix certain, prix exact

**Prix soumis**:
Prix demande, prix d'achat ou prix envisage saisi par l'utilisateur pour etre compare a l'estimation.
_Avoid_: entree de calcul, prix estime

**Positionnement du prix soumis**:
Lecture du prix soumis par rapport aux comparables retenus, en prix total et en prix au metre carre.
_Avoid_: estimation, ajustement du prix

**Fourchette d'estimation**:
Intervalle de prix autour du prix median estime qui represente l'incertitude issue des comparables et ajustements.
_Avoid_: marge commerciale, erreur de calcul

**Confiance d'estimation**:
Niveau qualitatif indiquant la robustesse de l'estimation selon volume, dispersion, proximite et qualite des donnees.
_Avoid_: garantie de prix, probabilite de vente

**Dispersion des comparables**:
Ecart des prix au metre carre des comparables retenus autour de leur mediane.
_Avoid_: nombre de comparables, tendance de marche

**Source socle**:
Source publique attendue dans toute estimation, comme BAN, DVF ou Cadastre.
_Avoid_: enrichissement optionnel

**Enrichissement optionnel**:
Source ajoutee au socle pour ameliorer le contexte ou l'ajustement, mais dont l'absence ne bloque pas l'estimation.
_Avoid_: source socle, prerequis

**Contexte de proximite**:
Information descriptive sur les equipements, services ou nuisances proches du bien cible, affichee sans ajustement automatique du prix.
_Avoid_: ajustement de prix, score de valeur

**Alerte d'echantillon faible**:
Message indiquant que le nombre de comparables trouves dans l'emprise d'analyse est trop faible pour produire une estimation robuste.
_Avoid_: erreur bloquante, elargissement automatique

**Absence d'estimation fiable**:
Etat affiche quand les comparables restent insuffisants dans l'emprise d'analyse et la tolerance de surface autorisee, sans produire de prix median estime.
_Avoid_: estimation forcee, chiffre par defaut

**Estimation bloquee**:
Etat affiche quand une donnee indispensable au calcul manque, notamment la surface cible.
_Avoid_: estimation degradee, valeur par defaut

**Couche de fond cartographique**:
Fond de carte externe affiche dans le navigateur pour situer les donnees immobilieres.
_Avoid_: donnee immobiliere, artefact deploye

**Adresse cible**:
Adresse saisie par l'utilisateur pour representer le bien a estimer ou le bien a analyser.
_Avoid_: mutation centrale, parcelle centrale, point arbitraire

**Bien cible**:
Bien decrit par l'utilisateur a partir d'une adresse cible et de caracteristiques comme type, surface, pieces ou equipements.
_Avoid_: adresse seule, mutation DVF, bien public observe

**Surface cible**:
Surface du bien cible fournie par l'utilisateur ou retrouvee dans les donnees publiques avant estimation.
_Avoid_: surface optionnelle, surface deduite silencieusement

**Type cible**:
Type du bien cible, maison ou appartement, fourni par l'utilisateur ou retrouve dans les donnees publiques avant estimation.
_Avoid_: type optionnel, melange maison appartement

**Pieces cible**:
Nombre de pieces principales du bien cible fourni par l'utilisateur, retrouve dans les donnees publiques ou infere explicitement a partir de la surface.
_Avoid_: pieces silencieuses, prerequis bloquant

**Terrain cible**:
Surface de terrain associee a une maison cible, fournie par l'utilisateur ou retrouvee dans les donnees publiques.
_Avoid_: prerequis appartement, contexte seulement

**Facteur d'appartement**:
Caracteristique qualitative importante d'un appartement, comme etage, orientation, stationnement, exterieur, vue ou taille de copropriete.
_Avoid_: filtre DVF natif, attribut toujours observable

**Comparable immobilier**:
Vente observee d'un bien similaire a l'adresse cible, retenue selon des criteres de distance, periode et caracteristiques du bien.
_Avoid_: toute mutation DVF, point de carte

**Comparable retenu**:
Comparable immobilier effectivement utilise dans le calcul et affiche a l'utilisateur avec ses attributs de selection.
_Avoid_: comparable potentiel, statistique agregee seule, lookalike

**Tolerance de comparabilite**:
Ecart maximal accepte entre le bien cible et une vente observee pour qu'elle puisse devenir un comparable retenu.
_Avoid_: explication a posteriori, ajustement libre

**Tolerance de surface**:
Tolerance de comparabilite appliquee a la surface du bien cible, initialement fixee a dix pour cent et bornee a vingt pour cent.
_Avoid_: changement d'emprise, comparaison hors taille

**Prix au metre carre median**:
Mediane des prix au metre carre des comparables retenus, utilisee comme base de calcul du prix median estime.
_Avoid_: moyenne simple, prix total median

**Ecretage des extremes**:
Exclusion prudente des valeurs extremes de prix au metre carre avant calcul de la mediane.
_Avoid_: suppression manuelle, correction qualitative

**Appariement DPE**:
Rattachement probabiliste entre un bien, une adresse ou une vente et un diagnostic de performance energetique issu des donnees DPE.
_Avoid_: jointure certaine, attribut DVF natif

**DPE officiel du bien**:
Diagnostic de performance energetique rattache au bien cible avec une correspondance suffisamment directe pour etre presente comme observe.
_Avoid_: DPE estime, DPE invente, moyenne d'adresse

**Profil DPE d'adresse**:
Synthese des diagnostics de performance energetique connus a une adresse, utilisee comme contexte lorsque le DPE officiel du bien n'est pas identifiable.
_Avoid_: DPE officiel du bien, DPE certain

**Avertissement de fiabilite**:
Message qui signale a l'utilisateur qu'une donnee enrichie est contextuelle ou incertaine et ne doit pas etre lue comme une observation certaine du bien cible.
_Avoid_: erreur technique, disclaimer generique

**Signal energetique**:
Information issue d'un DPE officiel ou d'un profil DPE d'adresse qui influence l'estimation car elle indique une performance energetique et des travaux energetiques probables.
_Avoid_: etat general certain, diagnostic travaux complet

**Ajustement energetique**:
Correction de prix issue du signal energetique, calculee de preference par comparaison locale puis par bareme de repli si les comparables enrichis sont insuffisants.
_Avoid_: ajustement manuel DPE, verite nationale unique

**Ajustement declaratif**:
Correction appliquee a l'estimation a partir d'une caracteristique declaree par l'utilisateur mais non observee avec certitude dans les sources publiques.
_Avoid_: comparable filtre, donnee observee

**Coefficient d'ajustement editable**:
Valeur d'ajustement proposee par defaut pour une caracteristique qualitative, que l'utilisateur peut modifier avant calcul.
_Avoid_: coefficient cache, slider sans valeur proposee

**Ajustement en pourcentage**:
Ajustement exprime en proportion du prix au metre carre median, sans montant fixe.
_Avoid_: ajustement forfaitaire, montant fixe

**Activation des ajustements**:
Controle global permettant d'appliquer ou de neutraliser les ajustements qualitatifs declaratifs.
_Avoid_: ajustement obligatoire, reglage par facteur uniquement

**Formule**:
Niveau de droits d'un visiteur ou d'un compte (anonyme, gratuite, deux paliers payants) qui definit ses quotas d'unites d'analyse et d'export. Les seuils sont parametrables en configuration, jamais en dur dans le code.
_Avoid_: role, groupe, abonnement (la formule existe avant tout paiement)

**Unite d'analyse**:
Une adresse resolue distincte consultee en estimation ou en exploration, decomptee une fois par periode de quota quel que soit le nombre de reglages, de modes ou d'emprises appliques dessus. Re-estimer ou re-filtrer la meme adresse ne consomme rien.
_Avoid_: requete API, appel serveur, session, clic Estimer

**Unite d'export**:
Un fichier d'export genere (donnees ou graphiques), decompte du quota d'exports de la formule au moment de la generation.
_Avoid_: telechargement de page, capture d'ecran, export de tuiles

**Quota**:
Nombre d'unites d'analyse et d'unites d'export accorde par une formule sur sa periode de decompte (mois calendaire pour les comptes ; allocation unique avant inscription pour les anonymes).
_Avoid_: rate limit technique, plafond API

**Analyse**:
L'objet de travail courant du site : une adresse resolue, son mode (estimation ou exploration), son emprise d'analyse, ses filtres et sa fenetre temporelle, avec les comparables qui en resultent. C'est ce que l'Observatoire visualise et ce que l'export serialise.
_Avoid_: selection courante, recherche, requete, dossier

**Observatoire**:
Page du site presentant les metriques et graphiques calcules sur l'Analyse courante (prix, volumes, evolutions, distributions). Porte un bouton Exporter, comme la page d'estimation/exploration.
_Avoid_: page metriques, dashboard, tableau de bord, page marche

**Atlas du marche**:
Page carte du site reunissant les modes estimation et exploration sur l'Analyse courante. Nom complet en titre, abrege en « Atlas » dans la navigation.
_Avoid_: la carte, page principale, atlas (sans complement, trop large)

**Analyse sauvegardee**:
Vue parametrique d'une Analyse enregistree au compte : uniquement les parametres (adresse, mode, emprise, filtres, fenetre temporelle), regeneree a la volee a l'ouverture. Les fichiers produits (PDF, CSV, GeoJSON) ne sont jamais conserves.
_Avoid_: rapport archive, fichier sauvegarde, cache de resultats

## Relationships

- Un **Socle immobilier cartographique** contient une ou plusieurs **Tranches geographiques**
- Un **Moteur d'estimation par comparables** consomme le **Socle immobilier cartographique**
- Une **Tranche geographique** peut servir a tester le **Moteur d'estimation par comparables** sans definir le perimetre du socle
- Un **Pipeline de preparation local** produit un ou plusieurs **Artefacts deployes**
- Un **Cycle de preparation batch** execute le **Pipeline de preparation local**
- Un **Cycle de preparation batch** reference un **Instantane source** et produit une **Version de build donnees**
- Un **Artefact deploye** represente une version prete a servir du **Socle immobilier cartographique**
- Un **Parquet departemental** est un **Artefact deploye** canonique
- Une **Base de service DuckDB** peut etre reconstruite a partir des **Parquets departementaux**
- Une **Table large orientee requete** peut etre ajoutee a la **Base de service DuckDB** si les jointures repetitives deviennent le cout dominant
- BAN, DVF et Cadastre sont des **Sources socle**
- La premiere version utilise l'**API BAN directe** pour la recherche d'adresse
- Les sources socle sont deja geolocalisees (DVF, DPE, RNB, Cadastre) ; seule l'**Adresse cible** saisie est geocodee, sans ingestion BAN locale en premiere version
- La **Recherche d'adresse BAN** produit une **Adresse resolue**
- DPE et les donnees de proximite sont des **Enrichissements optionnels**
- Les donnees de proximite alimentent le **Contexte de proximite**
- Le **Contexte de proximite** n'ajuste pas automatiquement le prix
- Une **Requete analytique immobiliere** est executee sur les **Artefacts deployes**
- Une **Couche de fond cartographique** est consommee par le navigateur et n'est pas stockee sur le serveur applicatif
- Une **Adresse resolue** devient l'**Adresse cible** qui localise un **Bien cible**
- Une **Adresse resolue** permet les jointures avec DVF et Cadastre ou les requetes spatiales autour de ses coordonnees
- Un **Rattachement cadastral BAN** permet une jointure Cadastre directe avant de recourir a une jointure spatiale
- Un **Bien cible** declenche une **Requete analytique immobiliere**
- Un **Type cible** est obligatoire pour calculer un **Prix median estime**
- Une **Surface cible** est obligatoire pour calculer un **Prix median estime**
- Une **Estimation bloquee** remplace l'estimation si aucun **Type cible** ou aucune **Surface cible** n'est disponible
- Les **Pieces cible** ameliorent la selection des comparables mais ne bloquent pas l'estimation si elles sont inferees explicitement
- Une **Confiance d'estimation** baisse quand les **Pieces cible** sont inferees
- Le **Terrain cible** est un critere de comparabilite fortement recommande pour les maisons
- Les **Facteurs d'appartement** influencent l'estimation quand ils sont declares ou enrichis de facon fiable, mais ne filtrent pas strictement les comparables par defaut
- Une **Requete analytique immobiliere** utilise une **Emprise d'analyse** choisie par l'utilisateur
- Une **Emprise par distance** utilise les coordonnees de l'**Adresse resolue** et une requete spatiale
- Une **Emprise administrative** utilise les codes territoriaux disponibles sans requete spatiale
- Un **Arrondissement** peut etre utilise comme **Emprise administrative** plus fine que la commune
- Une **Section cadastrale** peut servir d'**Emprise d'analyse**
- Les trois modes d'emprise principaux sont rayon, section cadastrale, puis arrondissement ou code postal
- Une **Comparaison multi-emprises** contient uniquement des emprises plus larges que l'**Emprise d'analyse** active
- Une **Comparaison multi-emprises** reutilise les memes filtres de comparabilite que l'estimation principale
- Une **Comparaison multi-emprises** est presentee en deux **Vues temporelles de comparaison** : historique complet et douze derniers mois
- Une **Comparaison multi-emprises** affiche au minimum les **Indicateurs comparatifs minimaux**
- Une **Cohorte nationale comparable** peut servir de base a la **Comparaison multi-emprises** si les performances DuckDB/Parquet le permettent
- Une **Estimation locale** utilise une emprise proche du **Bien cible**
- Un **Contexte de marche** utilise une emprise large pour questionner les ordres de grandeur
- Une **Estimation locale** s'appuie sur l'**Historique DVF disponible**
- Le **Marche recent** complete l'**Historique DVF disponible** avec une lecture sur douze mois
- Une **Cohorte nationale comparable** est construite sur l'**Historique DVF disponible**
- Une **Cohorte nationale comparable** produit des agregats separes pour l'historique complet et le **Marche recent**
- La **Tendance temporelle** accompagne l'estimation comme indicateur secondaire
- Le **Contexte de taux** accompagne toujours l'estimation avec le taux actuel et l'historique recent, sans prevision
- Le **Contexte de taux** est alimente par la **Source Banque de France Webstat**
- Une **Requete analytique immobiliere** selectionne plusieurs **Comparables immobiliers**
- Une **Tolerance de comparabilite** limite la selection des **Comparables immobiliers**
- La **Tolerance de surface** limite la comparaison des biens et ne change jamais l'**Emprise d'analyse**
- Une **Estimation locale** utilise et affiche des **Comparables retenus**
- Une **Estimation locale** exige au moins cinq **Comparables retenus** pour afficher un prix
- L'**Ecretage des extremes** intervient apres la selection des comparables et avant le calcul du **Prix au metre carre median**
- Une **Estimation locale** calcule un **Prix au metre carre median** puis le multiplie par la surface du **Bien cible**
- Une **Estimation locale** affiche un **Prix median estime**, une **Fourchette d'estimation** et une **Confiance d'estimation**
- Un **Prix soumis** peut etre compare au **Prix median estime** sans influencer l'estimation
- Le **Positionnement du prix soumis** compare le **Prix soumis** aux **Comparables retenus** en prix total et en prix au metre carre
- La **Confiance d'estimation** depend notamment du nombre de **Comparables retenus**
- La **Confiance d'estimation** baisse quand la **Dispersion des comparables** est forte
- Une **Alerte d'echantillon faible** peut accompagner une **Requete analytique immobiliere** sans modifier son **Emprise d'analyse**
- Une **Absence d'estimation fiable** remplace le prix si l'echantillon reste insuffisant dans les bornes de comparabilite autorisees
- Un **Comparable immobilier** provient d'une vente observee dans le **Socle immobilier cartographique** et ressemble au **Bien cible**
- Un **Appariement DPE** peut produire un **DPE officiel du bien** ou un **Profil DPE d'adresse**
- Un **DPE officiel du bien** peut enrichir directement un **Bien cible**
- Un **Profil DPE d'adresse** renseigne le contexte energetique d'une **Adresse cible**
- Pour une maison, un DPE a la meme adresse peut devenir un **DPE officiel du bien** si type, surface et adresse concordent
- Pour un appartement, plusieurs DPE a la meme adresse produisent par defaut un **Profil DPE d'adresse**, sauf correspondance directe
- Un **Profil DPE d'adresse** doit etre accompagne d'un **Avertissement de fiabilite**
- Un **DPE officiel du bien** ou un **Profil DPE d'adresse** produit un **Signal energetique**
- Un **Signal energetique** peut influencer l'estimation chiffree
- Un **Signal energetique** produit un **Ajustement energetique** quand l'information est exploitable
- Un **Ajustement declaratif** intervient apres la selection des **Comparables immobiliers**
- Un **Ajustement declaratif** utilise un **Coefficient d'ajustement editable**
- Un **Ajustement declaratif** est un **Ajustement en pourcentage**
- Un **Ajustement declaratif** s'applique au **Prix au metre carre median** avant calcul du prix total
- L'**Activation des ajustements** peut neutraliser l'ensemble des **Ajustements declaratifs**

## Example dialogue

Les echanges ci-dessous illustrent les distinctions les MOINS intuitives du modele —
le reste decoule des Relationships.

> **Dev:** "On commence par Bordeaux pour simplifier le pipeline ?"
> **Domain expert:** "Non, Bordeaux est seulement une tranche du socle national ; le pipeline doit rester national dans son principe."

> **Dev:** "Le serveur telecharge et transforme les donnees publiques ?"
> **Domain expert:** "Non, la preparation lourde se fait en local ; le serveur recoit seulement les artefacts prepares."

> **Dev:** "La base DuckDB est-elle la source de verite ?"
> **Domain expert:** "Non, les Parquets departementaux sont canoniques ; DuckDB est une base de service reconstructible."

> **Dev:** "Si le rayon choisi donne peu de comparables, on elargit automatiquement ?"
> **Domain expert:** "Non, l'emprise d'analyse est choisie par l'utilisateur ; on l'avertit si l'echantillon est faible."

> **Dev:** "Le mode cadastral utilise la parcelle du bien ?"
> **Domain expert:** "Non, il utilise la section cadastrale ; la parcelle individuelle est trop fine pour l'estimation."

> **Dev:** "Deux maisons de meme surface batie sont-elles comparables quel que soit leur terrain ?"
> **Domain expert:** "Non, la surface de terrain doit etre utilisee comme critere fortement recommande quand elle est disponible."

> **Dev:** "Le prix demande par l'utilisateur influence-t-il l'estimation ?"
> **Domain expert:** "Non, il sert seulement a positionner l'offre par rapport a l'estimation."

> **Dev:** "Peut-on afficher un prix avec trois ventes similaires ?"
> **Domain expert:** "Non, il faut au moins cinq comparables retenus ; en dessous on affiche une absence d'estimation fiable."

> **Dev:** "Calcule-t-on la mediane des prix totaux des comparables ?"
> **Domain expert:** "Non, on calcule la mediane du prix au metre carre, puis on la multiplie par la surface du bien cible."

> **Dev:** "Si on trouve plusieurs DPE a l'adresse d'un appartement, on choisit le plus proche comme DPE du bien ?"
> **Domain expert:** "Non, on presente un profil DPE d'adresse ; seul un rattachement direct devient le DPE officiel du bien."

> **Dev:** "Doit-on prevoir les taux futurs ?"
> **Domain expert:** "Non, on affiche le taux actuel et l'historique recent sans faire de prevision."

## Flagged ambiguities

- "Bordeaux/Gironde" a ete utilise comme possible perimetre initial, mais la resolution est que c'est une **Tranche geographique**, pas le perimetre produit.
- "Parcelle cadastrale" a ete utilise pour parler d'emprise, mais la resolution est **Section cadastrale** pour l'estimation.
- "Ville" est un libelle utilisateur possible, mais le terme canonique du modele est **commune**.
- "Lookalike" est compris comme **Comparable retenu** dans le langage du produit.
- "DPE du bien" et "moyenne des DPE a l'adresse" ne sont pas equivalentes : le premier est un **DPE officiel du bien**, la seconde est un **Profil DPE d'adresse**.
- "DPE" ne doit pas etre confondu avec un diagnostic complet de l'etat du bati : il est utilise comme **Signal energetique**, pas comme preuve certaine de tous les travaux a prevoir.
- Le **pivot de rattachement** entre sources est **tranche** (mesure dept 33) : le `rnb_id` du RNB est le pivot batiment, la parcelle (`id_parcelle`) est un lien secondaire fiable mais ambigu a l'unite (38% de parcelles mono-batiment). Voir [docs/adr/0003-rnb-pivot-batiment.md](docs/adr/0003-rnb-pivot-batiment.md) et [docs/SOURCES_DONNEES.md](docs/SOURCES_DONNEES.md).
- L'**Appariement DPE** est resolu et mesure (dept 33) : cascade `id_rnb` natif → cle BAN mono-batiment → spatial ≤ 15 m, soit 61 % de DPE joignables et 87 % de match par cle, chaque lien qualifie par `rnb_lien`. Voir [docs/SOURCES_DONNEES.md](docs/SOURCES_DONNEES.md) §3.1 et [docs/EXPLORATION_DPE.md](docs/EXPLORATION_DPE.md) §8.1.
