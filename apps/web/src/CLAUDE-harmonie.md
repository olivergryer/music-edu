# Module Harmonie — CLAUDE-harmonie.md

Chiffrage et analyse fonctionnelle. **Noyau algorithmique pur** (fonctions testées en TDD) +
**une activité élève** : la détection d'erreur, route `/harmonie`.

Le module croise **deux modélisations décorrélées**, et c'est ce croisement qui est diagnostique :

- le **cercle des tierces** (`geometrie.ts`) encode la proximité **acoustique** ;
- la **matrice de transition** (`matrice.ts`) encode la syntaxe **enseignée**.

IV→V est à distance angulaire maximale (3) et à fréquence syntaxique maximale (.45). Ne jamais
dériver l'une de ces tables de l'autre.

## Architecture

Tout sous `src/modules/harmonie/`. Imports relatifs **avec extension `.ts`** et marqueur `type` sur
les imports de types — requis par `node --test`, qui efface les types sans les résoudre.

| Fichier | Rôle |
|---|---|
| `types.ts` | `Mode` `Degre` `Renversement` `Qualite` `Fonction` `Accord` `Progression` `VecteurErreur` `Diagnostic` `Perturbation` `Disposition` `ReponseBasse`. `qualite(mode, degre)` **dérivée, jamais stockée**. `creerAccord`/`accordId`/`assertAccord`. |
| `geometrie.ts` | `ORDRE_TIERCES = [1,3,5,7,2,4,6]`, `distanceAngulaire(Signee)`, tables 7×7 `notesCommunes` par mode, `ARCS` T/D/S, `fonctions`/`estPivot`/`franchitArc`, **`estCouture`** (VII–II), `estFonctionSansSonorite`. |
| `metrique.ts` | `vecteurErreur` (4 canaux) · `diagnostiquer` · `indiceDeDeduction` · `evaluerBasse` (niveau 1). |
| `niveaux.ts` | `NIVEAUX` 0→8 (`regime`/`tache`/`vocabulaire`/`renversements`/`septiemeSur`/`longueur`/`finales`/`gabarits`), `perturbationsAutorisees`, `assertNiveauGenerable`. |
| `matrice.ts` | `MATRICE_MAJEUR`/`MATRICE_MINEUR` (poids bruts), normalisation par ligne, `probabilite`, `ligneRestreinte`. |
| `gabarits.ts` | `parseGabarit("I-IV-V7-I")` ⇄ `formatGabarit`. Chiffrage : `6` `64` `7` `65` `43` `2`. |
| `contraintes.ts` | Les 5 contraintes dures, en un seul endroit. `violations` · `respecteContraintes` · `substitutionValide`. |
| `generateur.ts` | `genererProgression(mode, niveau, longueur, seed)` — **déterministe par seed**, 3 régimes, rejet borné. `longueursDisponibles`. |
| `perturbation.ts` | `perturber` · `perturbationsPossibles(prog, index, niveau)` · `difficulte`. Choix du substitut **déterministe**, premier candidat valide. |
| `dispositions.ts` | `TABLE_DISPOSITIONS` · `disposition` · `realiserProgression`/`hauteursReelles` (MIDI) · `plageTransposition` · `TESSITURES`. |
| `rng.ts` | `mulberry32` + `weightedPick` — copie de `modules/notes/rng.ts`, modules indépendants. |
| `harmonieRef.ts` | **Tests uniquement.** Construction indépendante des accords, pour ne pas vérifier une table contre elle-même. |
| `chiffrage.ts` | Notation **française académique**. `chiffrageDe` (étages) · `chiffrer` (plat) · `romainChiffre` — casse et « ° » DÉRIVÉS de `qualite(mode, degre)`. |
| `chiffrageObsolete.ts` | **Non branché.** L'ancienne notation anglo-saxonne, gardée pour pouvoir y revenir. |
| `ChiffrageEmpile.tsx` | Rendu empilé des étages (6 sur 4, 7 sur +). |
| `detection.ts` | Activité de détection, **pur** : `construireSession`, rampe de difficulté, `scorerSession`, `encoderDrapeaux`/`decoderDrapeaux`. |
| `glyphe.ts` | Glyphe de correction A/B, **pur** : `geometrieGlyphe`, `lireDrapeaux`, `angleCercleDeg`/`pointCercle`. |
| `audio.ts` | Chemin audio unique du module (soundfont GM). Hors de la règle « fonctions pures » : Web Audio. |
| `Glyphes.tsx` | Les deux rendus SVG : `CercleTierces`, `EcartEmpilement`, `GlypheColonne`, `LegendeColonne`. |
| `DetectionPage.tsx` · `BancPage.tsx` | Les deux écrans. `BancPage` est `IS_DEV` seulement. |

## Banc d'écoute — `/harmonie/banc`

Route **`IS_DEV` uniquement**, aucun lien depuis le Hub, aucune XP, aucun Firestore. Sert à trancher
à l'oreille ce qui ne se tranche pas sur le papier. Ne fait que **lire** le noyau.

- Réglages : mode · niveau 0-7 · longueur (bornée par `longueursDisponibles`, pas par `spec.longueur`) ·
  graine · tonique · transposition (bornée par `plageTransposition`) · tempo · timbre (piano / cordes).
- Progression tirée : chiffrage, position métrique, hauteurs MIDI réalisées, suivi de l'accord en cours.
- **A/B des perturbations** : pour l'accord choisi, chaque type praticable avec sa `difficulte`, et
  original ↔ perturbé. C'est le cœur du banc.
- Ligne de matrice en lecture seule, renormalisée sur le vocabulaire du niveau.

**Réglage des poids : édition de fichier + HMR**, jamais par l'UI — pour ne pas polluer l'API du
noyau d'un paramètre de matrice optionnel.

⚠ **Politique d'autoplay** : `soundfont-player` ne résout jamais sa promesse si l'`AudioContext` a été
créé hors geste utilisateur. Le contexte est donc créé paresseusement et le préchargement attend le
premier clic (« un clic active le son »). Ne pas remettre de préchargement au montage.

## Trois régimes de génération (annexe §1)

| Régime | Niveaux | Principe |
|---|---|---|
| `atome` | 0-1 | Contexte tonal + objet isolé. Début libre. |
| `gabarit` | 2-5 | Formules à emplacements variables. **Aucune matrice.** |
| `matrice` | 6-8 | Génération libre pondérée. Début imposé sur I. |

La matrice n'est requise qu'à partir du niveau 6. Le **niveau 8** (degrés secondaires) est déclaré
mais `genererProgression` lève.

## Contraintes dures — `contraintes.ts`

1. Début sur I aux régimes écrits ; finale dans `NIVEAUX[n].finales` (`[]` = libre).
2. **Aucun accord diminué à l'état fondamental.** Lecture de « VII et II° » : en majeur cela ne vise
   que le VII (le II y est mineur, et le gabarit `I-VI-II-V` du niveau 3 l'emploie au fondamental).
3. 6/4 cadentiel seulement (avant V, temps fort) **jusqu'au niveau 6 inclus** ; libre au niveau 7.
4. Jamais trois répétitions consécutives du même degré.
5. Septième seulement sur les degrés de `septiemeSur` (vide en dessous du niveau 5).

**Le piège du moteur de perturbation** : un substitut qui violerait l'une de ces contraintes serait
détectable *par grammaire* et non par oreille. Tout candidat passe par `substitutionValide`.

## Écarts assumés par rapport à la spec

Chacun est matérialisé par un test nommé, qui tombera si la décision change.

| Point | Spec | Retenu |
|---|---|---|
| `notesCommunes` mineur | « une seule arête dévie » (III–V) | **deux** : III–V → 1 et III–VII → 0. Cause unique : III est le seul accord au VII° naturel face à la sensible haussée. |
| Quadrant vide (§5) | vide dans l'absolu | vide en **majeur** ; en mineur, III–VII y tombe (arc D partagé, 0 note commune). `estFonctionSansSonorite` le repère, `diagnostiquer` le classe `degre_voisin` comme prévu. |
| Test « III pour V ⟹ `sonorite_sur_fonction` » | — | **faux** : distance 1 + arc D partagé ⟹ `degre_voisin`. Les 4 vraies paires sont I–V, V–II, VII–IV, IV–I. |
| Vocabulaire croissant 2→7 | monotone | rompu en **3→4**, volontairement : le niveau 4 resserre sur I-IV-V pour isoler le renversement. |
| Perturbation `'mode'` | — | inexprimable dans `Accord` : champ **additif** `modeInverse?: boolean`. |
| `perturbationsPossibles` non vide | « tout index valide » | **intérieur** seulement : aux bornes, changer de degré violerait la contrainte n°1. |
| Niveau 5, longueur `[3, 5]` | — | aucun gabarit de 5 accords → refus explicite. |
| Niveau 0 en mineur | vocabulaire `[1,4,5,2,6]` | le II y est **diminué** : écarté du tirage, la réponse attendue étant « majeur ou mineur ». |

## Conventions V1 — `// TODO Matthieu`

Encore ouvertes, isolées pour être changeables en une ligne : `METRIQUE_V1` (durée 1, index pair =
temps fort), `POIDS_RENVERSEMENT_V1`, `PROBA_SEPTIEME_V1`, les poids des deux matrices, la formule
de `indiceDeDeduction`. **Elles se tranchent à l'oreille au banc, pas sur le papier.**

## `DIFFICULTE_BASE` — révisé au banc d'écoute (2026-07-31)

La spec plaçait `mode` à .60, en 4ᵉ position. À l'écoute c'est **la plus saillante de toutes** :
c'est la seule perturbation du module qui **sorte de la tonalité**, toutes les autres étant des
substitutions diatoniques. Différence de nature, pas de degré. Elle passe à .10 ; le reste de
l'ordre est inchangé.

`mode` .10 › `fonction_lointaine` .15 › `renversement` .35 › `cardinalite` .45 ›
`fonction_proche` .70 › `degre_associe` .90

`renversement` et `cardinalite` se sont révélés **impossibles à départager** : leur écart de .10 est
une convention qui garde le tri déterministe, pas une affirmation.

⚠ Cet ordre n'est **pas** celui de `PERTURBATIONS_PAR_NIVEAU`, et ne doit pas l'être : le premier
mesure ce que l'élève **perçoit**, le second ce qu'il sait **analyser**. `mode` s'entend
immédiatement mais suppose le vocabulaire chromatique, d'où son arrivée au niveau 7.

## Décidé avec Matthieu (2026-07-31)

- **Doublure académique** : fondamentale ; **tierce** sur les accords diminués ; **basse (la
  quinte)** au 6/4 ; aucune doublure sur les accords de septième.
- **`modeInverse?: boolean`** — champ additif sur `Accord`, seul moyen d'exprimer la perturbation
  `'mode'` puisque la qualité n'est jamais stockée.
- **Niveau 0 en mineur** — le II diminué est écarté du tirage : la tâche binaire majeur/mineur
  n'aurait pas de réponse.
- **Niveau 3 en mineur** — le ii° du gabarit `I-VI-II-V` est promu en ii°6, bien que le niveau
  n'enseigne pas encore les renversements. L'alternative était musicalement fausse.

## Tests

`npm run test` depuis `apps/web/`. 7 fichiers `harmonie*.test.ts`, 103 tests, graines fixes. Les
tables dures (`qualite`, `notesCommunes`, `TABLE_DISPOSITIONS`) sont vérifiées **entrée par entrée**
contre `harmonieRef.ts`, qui reconstruit les accords indépendamment.

## Activité « détection d'erreur » — `/harmonie`

**A se LIT, B s'ENTEND.** L'élève lit le chiffrage à l'écran, entend UNE version — celle où un
accord a été substitué — et touche l'accord qui s'écarte de l'écrit. La tâche exige d'anticiper
intérieurement les accords lus : c'est de l'audiation, pas une comparaison de deux mémoires
auditives.

⚠ **RÈGLE À NE PAS DÉFAIRE** : `▶ Écouter ce qui était écrit` (A) n'apparaît **qu'après la
réponse**. L'exposer avant supprime l'audiation. C'est le pendant du « jamais de son avant la
réponse » du module Notes.

Une référence est indispensable : le moteur garantit que le substitut ne viole aucune contrainte
dure, donc la version entendue est toujours grammaticalement plausible — sans référence, « quel
accord est faux ? » n'aurait pas de réponse.

- **Niveaux 2 à 7** : 0 et 1 n'admettent aucune perturbation (annexe §4).
- Ce qui est affiché est **toujours lisible au niveau de l'élève**, par construction : borné par
  `vocabulaire` / `renversements` / `septiemeSur`. Vérifié par test sur un large échantillon.
- **Rampe de difficulté** : la cible croît de `DIFFICULTE_CIBLE_DEBUT` à `_FIN`, et la longueur de
  progression suit — plus de positions = faute plus dure à localiser. Les deux facteurs sont liés
  exprès, pour que la rampe reste lisible.
- ⚠ **`DIFFICULTE_CIBLE_DEBUT` est couplée au plancher de `DIFFICULTE_BASE`.** Quand `mode` est
  passé à .10, une rampe partant de .20 le rendait **injouable** — battu à tous les coups par
  `fonction_lointaine` (.15). Bouger l'un oblige à revoir l'autre.
- La tonalité change à chaque item (`// TODO Matthieu`) : sinon tout se jouerait en do et l'élève
  pourrait s'appuyer sur une mémoire de hauteurs absolues au lieu d'entendre des fonctions.

### Persistance

`useModuleProgress('harmonie')` — 2 écritures par session — plus `addSession({ module: 'harmonie' })`
pour l'XP globale. **`lib/modules.ts` porte `active: false`** : le Hub affiche « Bientôt », la route
reste testable. Passer à `true` quand les matrices sont validées.

### Le log est auto-descriptif — et prépare le glyphe

Le champ `flags` d'`EncodedItem` porte le type de perturbation **et le `VecteurErreur` complet** :

```
bits 0-2 type · 3-5 angulaire · 6-8 radial · 9-10 cardinalite · 11 arcFranchi · 12 modeInverse
```

**Ne pas remplacer par un rejeu depuis la graine.** Les poids des matrices vont bouger ;
`genererProgression` rendra alors d'autres progressions pour les mêmes graines et tout log antérieur
deviendrait ininterprétable. La spec §5 tranche : « le log persiste le `VecteurErreur` complet ; la
classification peut évoluer, les données brutes ne se rejouent pas. »

⚠ **La perturbation `mode` est invisible aux quatre canaux** — même degré, même renversement, même
cardinalité, même arc : le vecteur serait nul et `diagnostiquer` répondrait `'exact'` sur un accord
pourtant faux. D'où le **bit 12**. `vecteurErreur` refuse d'ailleurs les accords à qualité inversée,
à juste titre : ne pas relâcher cette garde pour « faire marcher » le glyphe, cela produirait des
vecteurs nuls trompeurs.

## Le glyphe de correction A/B — `glyphe.ts` + `Glyphes.tsx` (2026-08-01)

Mappage **fixé par l'ordre de déclaration de `VecteurErreur`**, pas à réinventer :

| donnée | canal visuel |
|---|---|
| `angulaire` −3…3 | position angulaire (inclinaison) |
| `radial` −3…3 | renflement |
| `cardinalite` −1…1 | hauteur de colonne |
| `arcFranchi` | teinte — violet `#c084fc` interne, rouge `#f87171` arc franchi |
| *(hors vecteur)* `modeInverse` | ambre `#fbbf24` **en pointillés** |

**Deux rendus selon l'écran** (décidé avec Matthieu) :

- **`<CercleTierces>`** au feedback de l'item — les 7 degrés d'`ORDRE_TIERCES`, I au sommet, l'écrit
  en anneau creux, l'entendu en disque plein, la corde entre les deux teintée par `arcFranchi`. Le
  modèle du module rendu visible.
- **`<GlypheColonne>`** au bilan — abstrait mais **sériable** : les dix items en une ligne, et
  l'élève voit que ses fautes penchent toutes du même côté. Accompagné de `LegendeColonne`, sans
  laquelle il serait décoratif.
- **`<EcartEmpilement>`** complète le cercle : l'accord en barres, le NOMBRE de barres dit la
  cardinalité, la barre accentuée dit quel son est à la basse. Les deux canaux que le cercle ne
  porte pas. Rendu seulement si la basse ou la septième a bougé.

⚠ **Le piège du cercle** : dès que le degré n'a pas bougé — toujours sur `mode`, mais aussi sur
`renversement` et `cardinalite` — les deux marqueurs se **superposent** et le cercle n'affiche qu'un
rond qui ne montre rien. D'où l'anneau concentric : « même degré, autre chose a bougé ».

⚠ `PAS_ANGULAIRE_DEG = 18` est une **convention de lisibilité, pas une dérivation géométrique**.
L'écart réel sur le cercle vaut 360/7 ≈ 51,4° par pas : à trois pas la colonne serait couchée à 154°.

`lireDrapeaux` rend la phrase française (« deux tierces plus bas · même fonction · septième
ajoutée ») et sert **deux fois** : sous le cercle, et comme `aria-label` des SVG. Un glyphe abstrait
sans équivalent textuel est inaccessible — ce n'est pas un supplément.

### Trajectoire animée sur le cercle — correction seulement (2026-08-02)

Pendant la réécoute, le cercle ne montre plus seulement l'écart d'un accord : il montre le
**parcours** de la progression, synchronisé au son via `onAccord` (déjà exposé par `jouerSuite`).

- **A reste en fantôme permanent** — pointillés pâles, opacité .22. La version qu'on joue s'anime
  par-dessus. Les deux traits sont confondus jusqu'à l'accord fautif, où ils divergent **à l'instant
  où la faute sonne**. C'est là que le module tient sa promesse : voir l'écart, pas se le rappeler.
- **Persistance de 3 accords** (`PERSISTANCE_ACCORDS`), intensité décroissante via `intensiteTrace`.
- **Traîne sur les arcs** : `arcEntreDegres` suit le cercle **dans le sens du déplacement le plus
  court** (`distanceAngulaireSignee`) au lieu de le traverser en corde — le trait parcourt donc
  réellement le cercle des tierces. L'écart maximal valant 3 pas ≈ 154°, le grand arc SVG est
  toujours à 0 (test dédié).
- **Teinte saut par saut** : `franchitArc` → rouge si le déplacement change de fonction, violet
  sinon. Même convention que le glyphe statique, rien de nouveau à apprendre.
- **Piste intérieure** (`RETRAIT_TRAINE`) : l'anneau extérieur est la carte des sept degrés, la
  piste intérieure le chemin parcouru. Sans ce retrait la traîne passerait sous les étiquettes.
- **Fin de lecture** : `{ phase: 'figee' }` — la persistance cède et tout le parcours reste affiché.
  Seul état où l'écart complet se lit sans réécouter.

⚠ **APRÈS LA RÉPONSE UNIQUEMENT** (`anime = repondu !== null`). Animer la trajectoire de B pendant
que l'élève cherche encore lui donnerait les degrés entendus un par un, donc la réponse. C'est la
même règle que « ▶ A n'existe qu'après la réponse ».

⚠ **Décalage du contexte tonal** : quand `spec.contexteTonal`, la tonique sonne EN TÊTE de la suite,
donc l'index d'`onAccord` est décalé d'un cran (`decalageContexte`). L'index −1 pendant la tonique
ne trace rien, volontairement.

### Le bilan dessine depuis `flags`, jamais depuis `ItemDetection`

`ReponseDetection` porte un champ `flags` — exactement les bits persistés. Le bilan les **décode**.
Ce n'est pas un détour : si le rendu est juste, c'est la preuve que les 13 bits suffisent à
reconstruire le glyphe, donc qu'un futur écran d'historique lisant Firestore affichera les mêmes
signes. L'invariant est gravé dans `harmonieGlyphe.test.ts` (« reconstructible depuis les seuls bits
persistés »), qui compare la géométrie décodée à celle calculée directement depuis l'item, sur les
deux modes × les niveaux 3→7 × trois graines.

## Les activités — `/harmonie` est un choix, pas une activité (2026-08-02)

La détection démarrait au niveau 3 : **les niveaux 0 à 2 n'avaient aucune porte d'entrée**, et
`evaluerBasse` dormait depuis le premier jour. `HarmoniePage` ouvre le module par le bas du barème.

| Route | Activité | Barème |
|---|---|---|
| `/harmonie` | choix d'activité | — |
| `/harmonie/basse` | dictée de basse | niveau 1 |
| `/harmonie/binaire` | choix binaire | niveaux 2, 4, 5 |
| `/harmonie/cadences` | reconnaissance de cadences | niveau 3 + palier « toutes » hors barème |
| `/harmonie/detection` | détection d'erreur | niveaux 3-7 |
| `/harmonie/flux` | chiffrage en flux | niveaux 6-7 |
| `/harmonie/intervalles` | reconnaissance d'intervalles | **hors barème** |

Chaque activité est une **page à part entière**, avec sa route et son en-tête — pas un composant
monté dans un conteneur. Deux en-têtes empilés sinon, et `DetectionPage` n'aurait pas pu rester
intacte (seule sa flèche retour vise désormais `/harmonie`).

Les intervalles sont **hors `NIVEAUX`** (décidé avec Matthieu) : reconnaître une tierce majeure
n'est pas une compétence de fonction harmonique. Aucune renumérotation, donc aucune clé Firestore
cassée. Les clés `levels` sont désormais **préfixées** — `basse:1`, `intervalles:moyen` — additif,
la clé historique `"4"` de la détection n'est pas réécrite.

## La roue figée — `roue.ts` + `RoueFigee.tsx`

⚠ **À ne pas confondre avec `modules/notes/RadialWheel.tsx`**, qui est un menu radial *relatif* : on
pose le doigt n'importe où, la roue naît sous le contact, on tire, on relâche (sa spec §5). Celle-ci
est **figée** : affichée en permanence, on appuie SUR un secteur, et le glissement vertical choisit
la qualité. Deux origines de calcul différentes, d'où deux fonctions (`secteurAuPoint` depuis le
centre de la roue, `qualiteAuDrag` depuis le point d'appui).

Le module Notes **n'est pas modifié** et n'est pas importé : la géométrie est *adaptée*, comme
`rng.ts` l'avait été. Généralisée à des secteurs quelconques, elle sert les deux activités.

⚠ **Le glissement n'a pas le même vocabulaire selon le secteur**, et c'est musical :

| activité | secteurs | bas → haut | repos |
|---|---|---|---|
| dictée | do…si | ♭ · ♮ · ♯ | ♮ |
| intervalles | 2de 3ce 6te 7e | mineure · Majeure | **aucun** |
| intervalles | 1re 4te 5te | diminuée · juste · augmentée | juste |
| flux | I…VII | septièmes renversées · **5** · 6 · 6/4 | **5** (cf. `echelleEtats`) |

Il n'existe pas de tierce « neutre » : sur ces secteurs `SecteurRoue.defaut` vaut `null` et **le clic
sec ne valide rien**. Ne pas « corriger » en mettant Majeure par défaut — l'élève validerait une
qualité qu'il n'a pas choisie.

⚠ **Taille en pixels réels, pas de mise à l'échelle** : les seuils sont en pixels client. Un SVG
redimensionné ferait diverger les frontières visibles des secteurs et le calcul.

## L'orthographieur — `tonalites.ts`

Le module ne connaissait que des **demi-tons** (`Disposition.basse`, `Progression.tonique` en classe
de hauteur 0-11). Ça suffit pour sonner, pas pour **nommer** : 3 demi-tons au-dessus de do s'écrit
mi♭ et non ré♯, et une classe de hauteur ne tranche pas (6 = fa♯ ou sol♭).

`gammeNommee` marche les sept **lettres** depuis la tonique puis calcule l'altération de chaque
degré. Invariant testé sur les 24 tonalités : une gamme emploie les sept lettres, chacune une fois —
c'est ce test qui attrape « ré♯ » là où on attend « mi♭ ». Les toniques usuelles sont une **table**
et non une règle, comme `notesCommunes` : fa♯ majeur contre sol♭ majeur est un usage.

⚠ **Découverte : sol♯ mineur harmonique exige un fa♯♯.** Hausser la sensible d'un mineur dont le 7ᵉ
degré est déjà dièse donne un double dièse. C'est juste, et c'est le seul cas sur les douze toniques
retenues — un test le verrouille précisément là. Sans effet sur la dictée : le niveau 1 n'emploie que
I, IV et V, donc le 7ᵉ degré ne descend jamais à la basse.

## Dictée de basse — `dictee.ts`

⚠ **`evaluerBasse` n'est pas réutilisée et n'est pas modifiée.** Elle compare des **degrés** (1-7) :
mi et mi♭ y tombent tous deux sur le degré 3, la faute d'altération serait invisible. La roue fait
saisir des notes **nommées**, d'où `evaluerBasseNommee`, qui sépare faute de lettre (d'oreille) et
faute d'altération (de tonalité).

La tonique sonne ET la tonalité est écrite : on mesure l'audition de la basse, pas l'oreille absolue.
Les items sont **transposés** — sans quoi la basse ne porterait jamais d'altération au niveau 1
(vocabulaire `[1,4,5]` à l'état fondamental) et le geste ♯/♭ ne servirait jamais. C'est l'ARMURE qui
amène les altérations, pas les accords. Un test garde cette raison d'être.

## Intervalles — `intervalles.ts`

Sept nombres, pas d'octave (la roue n'a que sept secteurs). `demiTons` **refuse** les combinaisons
impossibles — une quinte majeure, une tierce juste — plutôt que de les tolérer en silence. Le triton
est nommable des deux façons (4te augmentée, 5te diminuée) et `memeIntervalle` ne les confond pas.
Alternance arpégé/plaqué **stricte, un item sur deux** : au hasard, la difficulté serait illisible
d'une session à l'autre. Un test vérifie que tout intervalle des pools est **saisissable à la roue**.

## Choix binaire — `binaire.ts`

Trois niveaux, **une seule tâche** (`tache: 'choix_binaire'`) mais trois questions, donc un seul
écran paramétré : dominante ou sous-dominante (2), fondamental ou renversé (4), avec ou sans
septième (5). L'élève entend la suite et répond sur UN accord désigné par sa **position**.

⚠ **L'équilibrage des réponses est la pièce maîtresse.** Laissé au générateur, le tirage est biaisé :
`POIDS_RENVERSEMENT_V1` met l'état fondamental à .60, donc au niveau 4 « fondamental » serait la
bonne réponse trois fois sur cinq et répondre toujours la même chose paierait. La session impose
donc autant de 0 que de 1 (`reponsesEquilibrees`) **puis mélange cet ordre** — une alternance
stricte serait équilibrée mais tout aussi devinable. Le builder cherche ensuite une progression dont
un accord intérieur porte la réponse voulue. Deux tests gardent ça.

⚠ **`reponseAttendue` rend `null`**, et ce n'est pas un cas dégénéré : c'est l'honnêteté de l'item.
Demander « avec ou sans septième ? » sur un degré hors de `septiemeSur` donnerait une question à
réponse unique ; demander « dominante ou sous-dominante ? » sur une tonique n'a pas de sens. Ces
accords sont écartés des cibles.

⚠ **Le chiffrage n'est jamais affiché avant la réponse** — il donnerait le degré, la basse ET la
septième, c'est-à-dire les trois questions à la fois. Seule la position est montrée ; le chiffrage
apparaît au feedback. Même règle que le « ▶ A après la réponse » de la détection.

## Notation française académique — `chiffrage.ts` (2026-08-02)

Migration depuis les figures anglo-saxonnes (`I64`, `V65`, `V43`, `V2`). Chiffre romain conservé à
côté du chiffrage : les activités reposent sur la lecture du degré.

**3 sons** — `5` · `6` · `6/4`

**4 sons, septième de DOMINANTE** — le `+` marque la **sensible**, et le chiffre dit à quel
intervalle elle se trouve au-dessus de la basse. C'est ce qui rend la table cohérente plutôt
qu'arbitraire (V7 en do = sol si ré fa, sensible = si) :

| Renv. | Basse | Sensible | Chiffrage |
|---|---|---|---|
| fondamental | sol | tierce | `7` sur `+` (le `+` seul = tierce sensible) |
| 1er | **si** — la sensible EST la basse | — | `6` sur `5̸` (quinte diminuée si–fa) |
| 2e | ré | sixte | `+6` |
| 3e | fa | quarte augmentée fa–si | `+4` |

**4 sons, septièmes ordinaires** — `7` · `6/5` · `4/3` · `2`, sans `+` ni barre.

⚠ **Ne pas étendre les formes de dominante « à tout accord contenant la sensible ».** La tentation
est réelle — III en majeur et I7 au niveau 8 en contiennent une — mais la septième de dominante est
un objet nommé et précis de la pédagogie française, pas une famille déduite. La règle est
`degre === 5 && septieme`, et `modeInverse` retombe sur les figures ordinaires : la bascule M→m
détruit la sensible, le `+` n'aurait plus rien à marquer.

⚠ **`gabarits.ts` = syntaxe de SAISIE, `chiffrage.ts` = notation d'AFFICHAGE.** Les confondre
obligerait à réécrire toutes les formules. Le round-trip `formatGabarit ∘ parseGabarit` reste
l'identité, et un test le garde.

⚠ **`chiffrageObsolete.ts` n'est branché nulle part** mais reste testé (`harmonieChiffrage.test.ts`
épingle ses sorties) : un fichier gardé « au cas où » sans test pourrit en silence. Sa procédure de
rebranchement est dans son en-tête.

**Ouvert** : le V à trois sons ne porte pas de `+` (sa tierce est pourtant la sensible). La table
fournie par Matthieu ne donne que `5` · `6` · `6/4` pour les trois sons, et on s'y tient.

## Fiche PDF des chiffrages

`npm run generate:chiffrages` → `docs/chiffrages-harmonie.pdf` (4 pages). **Générée depuis le code**
par `apps/web/scripts/generer-chiffrages.ts`, qui lit `chiffrage.ts`, `gabarits.ts`, `niveaux.ts` et
`contraintes.ts`. Ne jamais l'éditer à la main : c'est un document que des élèves auront en main, et
une fiche retapée diverge en silence. Rendu par Chrome headless — **aucune dépendance npm ajoutée**.

## Chiffrage en flux — `flux.ts` (2026-08-02)

La tâche `identification` des niveaux 6-8. **La seule activité qui remplit les quatre canaux** :
partout ailleurs la réponse est un choix (quel accord est faux, dominante ou sous-dominante), donc
`vecteurErreur` n'a rien à mesurer. Ici l'élève produit un chiffrage complet face à un chiffrage
attendu, et les sept diagnostics de `metrique.ts` prennent enfin leur sens.

C'est aussi la seule activité qui exploite **`indiceDeDeduction`**, écrit depuis le premier jour et
jamais appelé : sur les seules fautes, à quel point l'élève a répondu l'enchaînement le plus attendu
plutôt que ce qui a sonné. Élevé = il devine par le style au lieu d'écouter.

⚠ Calculé **par item** (`indiceDeductionSession`) et non sur la session mise bout à bout :
`indiceDeDeduction` conditionne chaque réponse sur l'accord précédent, et le précédent du premier
chiffrage d'une suite appartiendrait à la suite d'avant.

**Saisie en un seul geste** — `echelleEtats` (2026-08-03, remplace la bande d'états à deux gestes).
On appuie sur le degré, on glisse verticalement, on relâche :

```
  6/4   ↑ haut     trois sons renversés            (niveau 7 seulement)
   6
 ▸ 5    repos      trois sons fondamental          ← un simple appui suffit
   7    ↓ bas      septième, de plus en plus
  6/5̸              renversée
```

L'échelle est bornée par le niveau **et par le degré choisi** — au niveau 6 la septième n'est offerte
que sur V et II (`septiemeSur`), donc I n'a aucun cran vers le bas. `etatsPossibles` reste la source
de vérité de ce qui est saisissable ; `echelleEtats` ne fait que le RANGER pour le geste. Un test
garantit que **tout accord attendu est saisissable**, sans quoi l'élève verrait un accord qu'il ne
peut pas nommer.

⚠ **Le chiffrage plat sert de clé** : `RoueFigee` renvoie le libellé affiché. Un test épingle son
unicité par degré — deux états au même chiffrage rendraient l'un des deux inatteignable, en silence.

⚠ **Le repos du VII est un piège assumé** : la contrainte dure n°2 interdit l'accord diminué en
position fondamentale, que le générateur ne produit donc jamais. Un appui sec sur VII valide malgré
tout `5`, réponse possible et toujours fausse. À revoir si ça gêne à l'usage.

**« En flux » désigne le flux de la MUSIQUE, pas un chronomètre** : la suite s'écoute d'un bloc,
autant de fois qu'on veut. Une contrainte de vitesse mesurerait la dextérité de saisie plutôt que
l'oreille.

⚠ **Niveau 7 sans contexte tonal** (`contexteTonal: false`) : la tonique ne sonne pas, l'élève doit
l'établir lui-même. Ne pas « corriger » en la jouant quand même — c'est la difficulté du niveau.

⚠ **Niveau 8 hors jeu** : `NIVEAU_MAX_FLUX = min(8, NIVEAU_MAX_IMPLEMENTE)`, donc 7 aujourd'hui. La
borne suivra d'elle-même le jour où les degrés secondaires atterriront.

Le score compte les **accords** exacts, pas les suites parfaites : à 4-6 accords par suite, le taux
de suites entièrement justes serait trop grossier pour progresser.

## La correction visuelle du flux (2026-08-03)

Le cercle des tierces servait à la seule détection d'erreur. Il sert maintenant aussi au flux, sans
être dupliqué : `geometrieGlyphe` et `lireDrapeaux` ne lisaient **que `vecteur`**, jamais le type de
perturbation. D'où `EcartGlyphe` dans `glyphe.ts` — `{ vecteur: VecteurErreur | null }`, que
`DrapeauxDetection` satisfait structurellement. Aucun site d'appel n'a bougé.

⚠ **Correspondance à ne pas inverser.** En détection, `ecrit` = la partition (référence, en contour)
et `entendu` = ce qui a sonné (l'écart, en aplat coloré). **En flux c'est le SON qui fait référence
et l'élève qui dévie**, donc `ecrit` ← l'accord attendu et `entendu` ← l'accord saisi. On garde le
sens *visuel*, pas le nom des champs. Constantes `CORRIGE` / `MA_VERSION` dans `ChiffrageFluxPage`.

La détection n'a qu'un accord fautif par item ; une suite peut en compter plusieurs. L'écart tracé
porte donc sur un **accord en focus** — la première faute par défaut, changé en touchant une case ou
une ligne de diagnostic. Suite entièrement juste : pas d'écart à pointer, la trajectoire se fige
d'emblée.

## Les portées SATB — `notation.ts` + `PorteeSATB.tsx` (2026-08-03)

Clef de sol soprano + alto, clef de fa ténor + basse, accolade. Les hauteurs viennent telles quelles
de `realiserProgression`, qui les range déjà dans cet ordre.

**`notation.ts` — on ne devine JAMAIS l'orthographe depuis le MIDI.** Une classe de hauteur ne
tranche pas : 6 s'écrit fa♯ ou sol♭, 3 mi♭ ou ré♯. On part donc de **l'accord** — chaque son est un
degré de la gamme, donc une lettre connue d'avance (`orthographeAccord` → table pc → note écrite,
`ecrireAccord` pour les quatre voix). Trois règles, les mêmes que `dispositions.ts` exprimées sur des
lettres : empilement de tierces · III mineur pris naturel · `modeInverse` altère la seule tierce **en
gardant sa lettre** (c'est ce qui distingue mi♭ de ré♯).

Les deux implémentations sont **épinglées l'une à l'autre** par `harmonieNotation.test.ts` : toute
hauteur réalisée doit se retrouver dans la table — les 24 tonalités, puis les progressions réellement
produites par les quatre générateurs, perturbations comprises.

⚠ **L'octave se déduit de la lettre, pas du MIDI brut** : si♯3 et do4 sonnent la même touche.

**Le toggle a trois positions** (`TogglePortee`) : masquée · tonalité entendue · **remis en Ut**.
« En Ut » vise **Do majeur et la mineur** (décidé avec Matthieu) : armure vide dans les deux modes,
et la sensible du mineur apparaît alors en altération accidentelle — ce qui est précisément ce qu'on
veut faire lire. La remise en Ut **transpose** la réalisation (`transposerVersUt`) au lieu de la
recalculer : registre et disposition restent ceux qu'on a entendus.

Le réglage vit dans `payload.porteeVue`, donc **commun aux quatre activités** et retrouvé d'une
session à l'autre.

⚠ **Jamais avant la réponse** : la portée donne le corrigé. Même règle que « ▶ A n'existe qu'après la
réponse ».

Rendu en deux effets, comme `NotesStaff` : un effet **lourd** qui grave (VexFlow), un effet **léger**
qui recolore. L'accord courant s'illumine ainsi au fil de la réécoute sans reconstruire le SVG. Une
gravure qui échoue affiche « Portée indisponible » et laisse intact le reste de la correction.

| Page | Version montrée |
|---|---|
| `ChiffrageFluxPage` | suit ▶ Corrigé / ▶ Ma version |
| `DetectionPage` | suit ▶ Écouter / ▶ Écouter ce qui était écrit |
| `ChoixBinairePage` | la suite entendue, accord visé marqué |
| `DicteeBassePage` | la suite entendue, basses fautives marquées |

## Reconnaissance de cadences — `cadences.ts` + `chromatiques.ts` (2026-08-04)

Le barème DÉCLARAIT cette activité sans qu'elle existe : `niveaux.ts` donne au niveau 3
`tache: 'choix_multiple'` — « type de cadence : parfaite, demi-cadence, rompue, plagale » — et ses
`finales: [1, 5, 6]` sont exactement les finales de ces quatre cadences. Le palier `niveau3` la
remplit ; le palier `tout`, **hors barème**, ajoute l'imparfaite et les quatre approches
chromatiques. Clés : `cadences:3` et `cadences:tout`. Aucune renumérotation de `NIVEAUX`.

### La couche chromatique — `chromatiques.ts`

⚠ **Ces accords ne sont PAS des accords à degré.** `Degre = 1|…|7` indexe la géométrie, la matrice,
les qualités et les dispositions ; la sixte allemande — `♭6 · 1 · ♭3 · ♯4` — ne s'empile pas en
tierces depuis une fondamentale. Aucune extension de `Degre` ne la produirait. Ils vivent **à côté**
du modèle, jamais dedans, et n'entrent donc ni dans `vecteurErreur`, ni dans la matrice, ni sur le
cercle des tierces — dont l'activité, choix multiple, n'a besoin d'aucun.

⚠ **La table est en (demi-tons, LETTRE), pas en altérations.** La hauteur d'un de ces sons ne dépend
pas du mode, son écriture si : le ♭3 de l'allemande vaut trois demi-tons partout, mais s'écrit mi♭
altéré en majeur et mi♭ diatonique en mineur. `noteSurDegre(degreGamme, demiTons, tonique, mode)`
impose la lettre et déduit l'altération — juste dans les deux modes et sur les douze toniques. Cas
limite épinglé par un test : le ♯4 de **sol♯ mineur s'écrit do♯♯**.

Les trois sixtes augmentées partagent basse (♭6) et sommet (♯4) — dix demi-tons, à l'oreille une
septième mineure. C'est ce qui se trouve **entre** les deux qui les distingue : rien, une seconde,
une tierce.

Le chiffrage seul est **ambigu et c'est assumé** : `+6` désigne déjà le V⁷ au 2ᵉ renversement dans la
table française. D'où l'affichage systématique **chiffre + nom** (décidé avec Matthieu) — le nom lève
ce que le chiffre ne peut pas lever. `ChiffrageBrut` (dans `ChiffrageEmpile.tsx`) rend un chiffrage
qui ne vient pas d'un `Accord`.

### L'axe soprano — `dispositions.ts`

`serrer()` retenait la disposition la plus serrée : le soprano était figé, et le module ne pouvait
pas *vouloir* la tonique au sommet. `dispositionAuSoprano(accord, mode, soprano)` contraint la classe
de hauteur du sommet, puis reprend le même départage. `disposition()` est inchangé — rien ne bouge
pour les autres activités, un test le vérifie.

`dispositionLibre(sons, indexBasse, double)` sert les accords hors modèle. ⚠ **Elle ne permute pas**
les voix supérieures, contrairement à `serrer` : dans une sixte augmentée c'est l'écart ♭6 → ♯4 qui
fait l'accord, réarranger reviendrait à en changer.

### Les deux axes de réponse

⚠ **Une sixte allemande n'est pas un type de cadence** : c'est un accord d'approche, et les quatre
résolvent sur V. La même napolitaine peut précéder une parfaite, une demi ou une rompue. D'où **deux
questions par item** et deux exactitudes **qui ne s'additionnent jamais** — même principe que
`parDiagnostic` en flux. `COMBINAISONS` est une **table** : la plagale n'a pas de dominante, donc
aucune approche chromatique, et aucune formule ne le déduirait.

⚠ **Pas d'imparfaite au niveau 3.** Sa spec impose `renversements: [0]` : l'imparfaite s'y réduirait
au seul critère de soprano, trop fin pour une entrée en matière — et le barème n'énumère que les
quatre autres. L'axe soprano sert malgré tout dès le niveau 3, sans quoi une « parfaite » sonnerait
au hasard avec la tierce au sommet.

⚠ **Pas de question d'approche au niveau 3** : elle n'aurait qu'une réponse possible.

⚠ **La tierce picarde est hors liste** (décidé avec Matthieu) : c'est la qualité de la finale, pas un
type de cadence. Une parfaite peut être picarde.

⚠ **`respecteContraintes` n'est pas appliqué tel quel** : ses `finales` sont celles d'un niveau,
pensées pour une autre activité — le niveau 7 n'admet que I et rejetterait toute demi-cadence.
`violationsCadence` ne retient que les violations d'écriture. Le vrai contrat est `signatureRespectee`,
vérifié sur toutes les cadences générées.

### La partition — `notation.ts`

`PorteeSATB` réalisait et orthographiait à partir d'une `Progression` : impossible pour une suite qui
contient des accords hors modèle. La musique se calcule maintenant dans `notation.ts`
(`Partition { notes, armure }`, `partitionDeProgression`), le dessin dans `PorteeSATB`, et chaque
activité fabrique sa partition comme elle peut (`partitionDeCadence` pour les cadences). Le composant
regrave sur la **signature du contenu**, pas sur l'identité de l'objet — sinon la portée clignoterait
à chaque rendu pendant la réécoute.

## Suite

Exercice à trous · **niveau 0** (`qualite_binaire`, majeur ou mineur — le dernier trou du barème) ·
poids des matrices à régler au banc (c'est ce qui débloque `active: true` sur le Hub) · niveau 8
(degrés secondaires) · écran d'historique consommant les `flags`.

**À décider à l'usage** — le mode reste un réglage de SESSION (comme partout ailleurs), donc le
« tirage privilégiant le mineur » se réduit à un défaut : choisir le palier « toutes » bascule
l'écran en mineur. Un tirage par item demanderait de changer de mode en cours de session.

**Couverture du barème** : 0 aucune activité · 1 dictée · 2 binaire · 3 détection · 4-5 binaire +
détection · 6-7 **flux** + détection · 8 non générable.
