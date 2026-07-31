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
| `chiffrage.ts` | `chiffrer` / `romainChiffre` — casse et « ° » DÉRIVÉS de `qualite(mode, degre)`. Partagé par les deux écrans. |
| `detection.ts` | Activité de détection, **pur** : `construireSession`, rampe de difficulté, `scorerSession`, `encoderDrapeaux`/`decoderDrapeaux`. |
| `audio.ts` | Chemin audio unique du module (soundfont GM). Hors de la règle « fonctions pures » : Web Audio. |
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
vecteurs nuls trompeurs. Le glyphe devra décider d'un 5ᵉ canal ou d'un état visuel distinct.

## Suite

Rendu du glyphe à 4 canaux (position angulaire, renflement, hauteur de colonne, teinte) sur la
correction A/B — les données sont déjà là. Puis chiffrage en flux et exercice à trous.
