# Module Rythme — référence technique

## Fichiers
- `RythmApp.jsx` — composant principal ~2700 lignes, **sensible**
- `RythmStaff.jsx` — rendu VexFlow SVG, ResizeObserver mobile, strip décalage par note
- `SettingsPage.jsx` — réglages avancés : catalogue formules + Google Sheets + offset flash calibration
- `MicCalibration.jsx` — modale guidée 3 étapes (ambient → piano → forte) + détection onset/offset hystérésis adaptative au bruit ambiant
- **Moteur scoring act 1/2** (module TS pur, framework-agnostic) :
  - `rythmScoringTypes.ts` — types (`RhythmAttempt`, `Alignment`, `FitResult`, `RhythmScore`, `RhythmDiagnosis`, `ScoringParams`)
  - `rythmScoringParams.ts` — `DEFAULT_PARAMS` (toutes constantes tunables)
  - `rythmScoringAlign.ts` — Needleman-Wunsch DP monotone + backtrack ⇒ pairs / missing / extras
  - `rythmScoringFit.ts` — Theil-Sen robuste + boucle EM (align ⇄ fit, ≤3 tours)
  - `rythmScoringAnalyze.ts` — MAD (1.4826 × MAD) + drift (pente Theil-Sen de `localTempo_k`) + dead-zone
  - `rythmScoringDiagnose.ts` — taxonomie flags (clés i18n)
  - `rythmScoringScore.ts` — façade `scoreRhythm(attempt, params)` (orchestre tout)
  - `rythmScoring.test.ts` — 27 tests + non-régression `EXTRA_TAP`/`MISSED_NOTE` ≈ `PERFECT` (preuve alignement protège fit)

## 5 activités
1. **Reproduire vu** — portée visible, l'élève tape/chante
2. **Reproduire entendu** — portée cachée pendant jeu, révélée après
3. **Reconnaître écrit** — rythme joué, 4 portées proposées, clic
4. **Reconnaître joué** — portée affichée, 4 boutons audio A/B/C/D
5. **Reconstituer** — rythme entendu (tenu), reconstruit par **tap-to-place** de cellules sur une portée vide, score **partiel**

## Machine à états (`phase`)
`idle` → `countdown` → (`listening` act 2 seulement) → `playing` → `results`

- Act 2 : après `listening`, retour `countdown` beat muet (`countdownN=null`) puis beats 3 & 4 sonores
- Act 4 : pas de countdown, `setPhase("playing")` direct
- Act 5 : pas de countdown, `idle` → **`building`** (joue la solution tenue, portée cachée ; pose libre) → `results`

## Audio
- `beep(strong)` : métronome (sine 1000/700 Hz, 80 ms)
- `rhythmBeep(strong, forced, volMult=1)` : son rythme (triangle 330 Hz, 150 ms fixe) — `forced=true` bypass toggle, `volMult` scale le gain
- `rhythmSustain(durMs, forced, volMult=1)` : note **tenue** (triangle 330 Hz, enveloppe ≈ durée note) — distingue tenue vs attaque+silence
- `tapBeep(forced)` : bruit blanc 40 ms — `forced=true` bypass toggle
- `rhythmPulse(strong, volMult=1)` : rhythmBeep + flash visuel
- `playPatternAudio(pat, bpm, delayMs, forced, sustain, isAct5)` : joue pattern · `sustain=true` → `rhythmSustain` par note (durée ≈ `figDur × quarterMs × 0.9`) · `isAct5=true` → palette d'accentuation plus douce. **Act 3/4 uniquement** (lecture + Rejouer + boutons A/B/C/D) ; act 1/2 gardent le bip percussif.
- Toggles son via refs (`rhythmSoundRef`, `tapSoundRef`) — assignés dans render body, pas useEffect
- Act 2/3/4 : `rhythmSoundOn` forcé à `true` via `useEffect([activity])` — son toujours actif
- Beat 1 : vérifier `!pat.figs[0]?.rest` avant jouer le son
- `tidsRef` = timers jeu · `audioTidsRef` = timers audio (clearés séparément)
- **Reprise après verrouillage / passage arrière-plan** : `resumeAudio()` + `ensureMicAlive()` sur `visibilitychange`/`focus`. `ensureMicAlive` re-acquière le flux si les pistes sont `ended` (cas typique iOS lock).

### Accentuation des temps (boost de volume on-beat)
Multiplicateur de gain appliqué **uniquement aux notes qui tombent sur un temps musical** (tolérance 5 ms, pas aux subdivisions internes).
- `BEAT_WEIGHTS` act 1-4 (contraste marqué) : 4 temps → `[2.5, 1.6, 2.1, 1.6]`, 3 temps → `[2.5, 1.6, 1.6]`, 2 temps → `[2.5, 1.6]`.
- `BEAT_WEIGHTS_ACT5` (plus doux, écoute tenue) : `[2.0, 1.4, 1.8, 1.4]` etc.
- `beatVolMult(timeSig, ts, beatMs, isAct5)` : retourne 1.0 hors temps. Appliqué dans `playPatternAudio`, lecture modèle act 2, jeu act 1 (note 1 + rhythmPulse suivantes).
- `beatsPerMeasure(timeSig)` : 4 (4/4, 12/8) · 3 (3/4, 9/8) · 2 (2/4, 6/8).

## Scoring act 1 & 2 — moteur `scoreRhythm` (module pur)

### Pipeline
`useEffect` résultats construit un `RhythmAttempt` :
- `targetOnsets` en pulsations (`timestamps[i] / beatMs` pour notes non-rest)
- `userOnsets` = `tapTimesRef.current` (ms relatifs à `playStartRef`)
- `targetTempoMsPerUnit = 60000 / sessionBpm`
- `activity` (1 ou 2)

Appel `scoreRhythm(attempt, DEFAULT_PARAMS)` orchestre :
1. **`fitWithAlignment`** : init pente (`targetTempoMsPerUnit` ou rapport des empans), boucle EM align ⇄ Theil-Sen (≤3 tours, sort si paires stables).
2. **`alignOnsets`** : DP Needleman-Wunsch sur `pred = a·target + b` vs `user`, `gap = gapFactor × medianTargetIOIms`. Backtrack → `pairs`, `missingTargetIdx`, `extraUserIdx`.
3. **`theilSenFit`** : pente = médiane des `(u_j-u_i)/(t_j-t_i)`, intercept = médiane des `u_i - a·t_i`. Robuste à 1 outlier énorme.
4. **`analyzeResiduals`** : `regularityMs = 1.4826 × MAD` sur résidus dead-zonés ; drift = pente robuste de `localTempo_k = (u_{k+1}-u_k)/(t_{k+1}-t_k)` vs `k`, déclenché si `|totalChange / medTempo| > driftThresholdRel`.
5. **`scoreRhythm`** : composantes ∈ [0,1] :
   - `completeness = pairs / (pairs + 0.5·(missing+extra))`
   - `regularity = clamp(1 - regularityMs/regMaxMs, 0, 1)^regExp`
   - `offset = clamp(1 - |deadzone(b)|/offsetMaxMs, 0, 1)`
   - `tempo = clamp(1 - max(0, |a/target-1| - tempoTolRel)/tempoMaxRel, 0, 1)`
   - **Agrégation produit pondéré** : `total = completeness · regularity^wReg · offset^wOff[act] · tempo^wTempo[act]`.
   - **Motifs courts** : si `targetOnsets.length < minNotesForTempo` ⇒ `wTempo` forcé à 0 (override prioritaire). Si `=== minNotesForTempo` ⇒ flag `LOW_CONFIDENCE_REGULARITY`.
6. **`diagnose`** : flags (clés i18n) `OFFSET_LATE/EARLY`, `TEMPO_FAST/SLOW`, `DRIFT_ACCEL/DECEL`, `IRREGULAR`, `EXTRA_ONSETS`, `MISSING_ONSETS`, `LOW_CONFIDENCE_REGULARITY`.

### Mapping adaptateur → UI existante
- **`scores[]` par cible** : appariée ⇒ `dev = résidu`, grade dérivé via `scoreTap(deadzone(dev), 0, beatMs)` (cohérent avec régularité — un résidu sous le plancher de bruit = `Parfait`). `dev` retourné = brut (pour badge dépliable + point sur portée). Manquée ⇒ `{ label:"Manqué ✕", pts:0, grade:"miss", dev:null }`.
- **Score combiné** : `combinedTotal = result.total × perNoteAvg` où `perNoteAvg = Σpts / (playableCount×100)`. Réintroduit la sensibilité par-tap qu'absorbe le MAD (un « Bien » isolé baisse le total, n'est plus noyé dans la robustesse).
- **`earnedFinal = round(combinedTotal × 100 × (1+bonus) × extremeMult)`** — **plafonné à 100 pts/exercice** (× révélation × extrême), aligné avec act 3/4/5 et autres modules. Pas de `×playableCount`.
- `maxPts = 100 × bonusMult × extremeMult` (act 5 : 100 brut).
- **`tapAnalysis`** : champs hérités (`hasTempo`, `tempoErr`, `offsetMs`, `regularityStd`, `malusPts`) + nouveaux (`flags`, `drift`, `extras`, `missing`, `components`, `total`).

### `DEFAULT_PARAMS` tunables (`rythmScoringParams.ts`)
| param | défaut | rôle |
|---|---|---|
| `gapFactor` | 0.5 | GAP DP = `gapFactor × medianTargetIOIms` |
| `maxIter` | 3 | boucle EM |
| `inputNoiseFloorMs` | 25 | dead-zone (jitter tactile) — TODO calibration device |
| `regMaxMs` | 200 | dispersion à laquelle régularité → 0 |
| `regExp` | 0.8 | exposant régularité |
| `offsetMaxMs` | 400 | borne enveloppe offset (zéro à 400 ms) |
| `tempoTolRel` | 0.05 | tolérance avant pénalité (±5 %) |
| `tempoMaxRel` | 0.25 | borne tempo (zéro à ±30 % au-delà de tolerance) |
| `driftThresholdRel` | 0.18 | seuil flag DRIFT_* |
| `wRegularity` | 1.0 | poids régularité |
| `wOffset` | `{1:0.3, 2:0.3}` | poids offset (assoupli — défaut mineur, facile à corriger) |
| `wTempo` | `{1:0.7, 2:0}` | act 2 : tempo libre → non pénalisé |
| `minNotesForTempo` | 5 | sous ce nb de notes cibles, `wTempo` forcé à 0 |

### TapDiagnostics (composant inline RythmApp.jsx)
Libellés FR pilotés par les flags. Lignes :
- **Tempo** : `TEMPO_FAST`/`SLOW` → message+%, sinon « Tempo juste » (vert) ou « — ».
- **Décalage** : `OFFSET_LATE`/`EARLY` → message+ms, sinon « Bien calé ».
- **Régularité** : `IRREGULAR` → « Ton tempo est en dents de scie » (rouge), sinon ratio `regularityStd/beatMs` → « Très régulier » … « Assez régulier ».
- **Dérive** (conditionnelle) : `DRIFT_ACCEL` → « Tu accélères vers la fin », `DRIFT_DECEL` → « Tu ralentis ».
- **Frappes en trop / manquées** (conditionnelles) : nombre.

### RythmStaff — strip décalage par note
- `scoreGrades`/`scoreDevs` prop : figIdx → grade/dev signé ms (rempli en phase results par l'adaptateur).
- **Marker par note (DANS la portée, sous la note)** : guide vertical (note → strip), axe horizontal court tôt/tard, repère « pile » central, dot coloré par grade (palettes désaturées `DOT_FILL` + glow `DOT_GLOW`). Amplitude horizontale ×2 (`(dev/halfMs)*2`), centré sur le milieu de la tête de note (`getNoteHeadBeginX/EndX`).
- `w` (largeur ½ axe) borné `clamp(0.42 × minGap, 6, 16)` → comparable entre notes, jamais de chevauchement.
- Légende mini-réplique du marker (note + guide + axe + pile, **sans dot**), positionnée **absolute bottom-left** de la card portée (forme verticale, taller-than-wide).
- Notes : couleur classique (`#4b5563`), pas de recoloration par grade (info portée par les dots).

### Pré-tap
- Act 1 ET act 2 : `handleTap` accepte le pre-tap pendant `countdown` dans la fenêtre `t >= -TOL.ok` (TOL.ok = 280 ms).
- `playStartRef` = origine, taps en `performance.now() - playStartRef`.

### Compact / rendu staff (inchangé)
- `compact` prop RythmStaff : limite formatWidth (usage SettingsPage catalogue)
- RythmStaff rend à taille **native** : SVG `renderWidth × height` px (`renderWidth = min(conteneur, width)` via ResizeObserver). `width` prop = cap max (div `maxWidth`, `overflow:hidden`).
- **Réduction adaptative downscale-only** : après dessin, `getBBox()` ; si `contentW > renderWidth` → viewBox + `meet` réduit. Sinon AUCUN scaling. Adaptatif sur tout device.
- Résultats : boutons **▶ Réécouter** + **▶ Solution** (`forced=true`, indépendants des toggles son), bordure flash pilotée par `beatFlash` en phase `results` (act 1 ET 2 ; en phase de jeu act 1 utilise `metroDotFlash` calibré).

## Scoring act 3 & 4 (QCM)
- 100 pts si correct, 0 si faux · essai unique (scoring non modifié par le moteur distracteurs)
- 4 propositions = 1 correcte + 3 distracteurs (3 propositions = 1 + 2 en dernier recours)

## Distracteurs act 3 & 4 — `rythmDistractors.ts`
Moteur de mutations typées piloté par une **table de difficulté par niveau** (`DISTRACTOR_CONFIG`, 9 clés `C1/1…C3`).
- **Niveau (cycle) dérivé de la sélection** (pas de niveau stocké) : `deriveNiveau()` = plus haut niveau `C1/1…C3` dont toutes les formules cumulées sont sélectionnées (logique `isNiveauActif`), défaut niveau le plus bas. Le niveau EST une clé C → indexe `DISTRACTOR_CONFIG` directement (plus de mapping). ⚠️ Niveau (cycle) ≠ Rang XP — voir CLAUDE.md.
- **Config par clé** : `nMutations` (BAS = proche = plus dur), `finestUnit` (`"8"`/`"16"`, pas de déplacement), `lockAttackCount`, `mutations[]`.
- **Grille libre + filtre** : on grille une unité de formule (1–2 temps, auto-contenue), on mute, puis on **rejette** si le résultat ne se décompose pas en formules de la **sélection active** (`matchGridToSelection`). Représentation FIXE double-croche (binaire /4, ternaire /6) + triolet /3 ; `finestUnit` ne pilote que le pas.
- **Mutations** : `shiftAttack` (±pas) · `dottedSwap` (onset interne ±1 cellule) · `binaryTernarySwap` (ee↔ttt /2↔/3) · `holdRestSwap` (attaque+silence↔tenue) · `addRemoveAttack` (change le nb d'attaques ; interdit si `lockAttackCount`).
- **Gating** : (1) résultat ⊆ sélection ; (2) pré-filtre des types selon la sélection (`eligibleTypes`) ; (3) replis si <3 uniques : (a) `nMutations+1`, (b) si niveau ≥ C1/3 autoriser `addRemoveAttack`, (c) 3 propositions au lieu de 4 — **chaque repli loggé `console.warn`** ; (4) **unicité AUDIBLE** via `audibleFingerprint`.
- **Blocage propre** : si <2 distracteurs uniques après tous les replis → `blocked:true` → `startGame` set `act34Error` + reste en `idle` (bannière warning + lien réglages). `act34Error` effacé par `useEffect([selectedFormulas, activity])`.
- `audibleFingerprint(figs)` = `(onset:durée)` des notes non-silences → distingue tenue vs attaque+silence (remplace l'ancien `attackFingerprint`). **Nécessite la lecture tenue** (sinon hold/silence identiques à l'oreille).
- Anciens `generateDistractors` / `generateDistractorPermutation` / `generateDistractorVariant` / `attackFingerprint` / `noteCount` **supprimés**.

## Activité 5 — reconstituer (tap-to-place)
- **Flux** `building` : joue la solution tenue (`playPatternAudio(...,sustain=true)`), portée cachée. L'élève **tape** une cellule de la palette → ajoutée en fin de séquence (`act5Placed`) ; **tape** une cellule posée → retirée. « ▶ Réécouter » **libre** (sans malus). « Valider » → scoring.
- **Modèle de grille partagé** : `rhythmGrid.ts` (`figDur`, `groupOf`, `beatQuarters`, `attackCount`, `toTimelineCells`). `rythmDistractors.ts` en importe les primitives (le matching distracteurs garde sa propre représentation interne /4–/6).
- **Palette** `rythmActivity5.ts` `buildPalette()` : toutes les cellules de la solution (toujours constructible) + jusqu'à **N proches** par cellule (même temps, même nb d'attaques, issus de la sélection). N = `PALETTE_DISTRACTORS[niveau]` (niveau = clé C directe ; 0 en C1/1·C1/2 → 4 en C2/x·C3). Repli silencieux loggé si < N proches.
- **Conformité mesure** (`measureStatus`) : à la validation, si la somme des durées ≠ 4 temps (incomplète/trop longue) → **exercice NON VALIDE** : 0 point, pas de %, **trait oblique rouge sur la métrique** (`RythmStaff strikeMeter`). Indicateur live en `building` (complète/incomplète/trop longue).
- **Scoring partiel** `scoreActivity5()` (mesures CONFORMES uniquement) : `toTimelineCells` (grille uniforme `ticksPerBeat = base×3`, absorbe les triolets, finestUnit fixé `"16"`) pour solution ET réponse, comparaison case à case ; `pct = identiques / max(longueurs)`. **Jamais figure par figure.** `earnedPts = pct`, `maxPts = 100`.
- **UI** : portée `building` toujours affichée (métrique dès le départ, `compact` = pas de re-scaling/étirement VexFlow), cellules de palette **sans card**, tap-to-place.
- **Tests** `node --test` (`npm test`) : `rythmActivity5.test.ts` (scoring + palette). Imports `.ts` explicites entre modules (`allowImportingTsExtensions` déjà actif) → résolus par Vite ET node --test.
- **Intégration** : `ACTIVITIES`/`ACT_ICONS[5]`/`ACT_SHORT[5]`, grille home (dernière carte pleine largeur si nombre impair), tuto slides `[1..5]`, son forcé via `activity >= 2`.

## Mode Extrême (act 1)
- `extremeMode = activity===1 && !rhythmSoundOn && !flashBorderOn` — son rythme ET flash off
- Score ×2, cumul multiplicatif avec `REVEAL_BONUS` : `earnedFinal = round(combinedTotal × 100 × (1+bonus) × 2)`
- `scoreWasExtreme` fige l'état au calcul du score (`maxPts` ×2 aussi → `pct` ≤ 100%)
- Animation overlay `extreme-pop` (keyframe `index.css`) + badge "⚡ ×2 Extrême" dans results

## Rang XP (cross-module) ≠ Niveau (cycle)  — voir CLAUDE.md
- **Rang** (XP, cross-module) : `Apprenti → … → Maestro`. `RANKS`/`getRank` dans `hooks/useProgressFirebase.ts`, seuils XP (0 / 2500 / 6000 / 12500 / 45000 / 80000 / 140000). Affiché « Rang » dans les dashboards.
- **Niveau** (cycle scolaire, spécifique rythme) : `C1/1…C3`. Source = colonne `niveau` du CSV → `niveauOrder`/`niveauFormulaIds` (fallback hardcodé `NIVEAUX`/`NIVEAU_FORMULA_IDS` dans `RythmApp.jsx`). `deriveNiveau` = plus haut cycle entièrement sélectionné. Pilote la difficulté distracteurs/leurres (clé directe).

## Navigation & pages
`currentPage` state : `"home"` | `"game"` | `"settings"` | `"series-end"`

**Home page** : grille 2×2 activités (icônes SVG `ACT_ICONS`) + résumé réglages cliquable + bouton Commencer
**Modal réglages** : overlay bottom-sheet, accordion 5 sections (Saisie · Tempo · Niveau · Mode · Révélation)
- `settingsModalOpen` state · `openAccordion` state (section ouverte par défaut : `"saisie"`)
- ⚙ home page et ⚙ header jeu ouvrent la modal (pas SettingsPage)
- "Réglages avancés" dans modal → `setCurrentPage("settings")`

**Tutorial premier lancement** :
- `ENABLE_TUTORIAL` : `true` (toujours) | `false` (jamais) | `"once"` (une fois, localStorage)
- `TUTORIAL_VERSION` : incrémenter force réaffichage en mode `"once"`
- 4 slides plein écran — **interactif** : l'utilisateur choisit activité (slide 2), mode saisie (slide 3), niveau (slide 4)
- "Commencer !" applique les choix et lance le jeu directement
- `handleTutorialDone(selections)` : `selections=null` si "Ignorer" (pas de lancement jeu) ; sinon `{ activity, inputMode, level }`
- Lancement différé via `pendingTutoStartRef` (ref flag) + `useEffect` sans deps — attend que `startGame` ait des closures fraîches après les setters d'état
- ⚠️ ce `useEffect` (et tout hook) DOIT rester avant l'early return `if (currentPage==="settings")` sinon crash Rules of Hooks (page réglages vierge)
- Toggle thème dark/light disponible pendant le tuto via le bouton global (ThemeContext)

## Persistance réglages (localStorage)
- Clé `rythm-settings-v1` : `selectedFormulas` (array), `tempoMode`, `bpmFixed`, `bpmMin`, `bpmMax`, `revealBeat`, `inputMode`
- `userSheetLoadRef` : reset formules seulement quand sheet chargée manuellement (pas au mount async CSV)

## Flash portée
- `flashBorderOn` state : toggle ⚡ SVG top-right du bloc portée (act 1 & 2)
- Stem des notes : pas de changement de couleur pendant la lecture (activeIdx ignoré dans `noteColor`)

## Formules rythmiques
- Source de vérité : `/public/formules-rythme-template.csv` chargé via `useSheetData`
- Fallback hardcodé dans `FORMULA_CATALOG`
- Google Sheets custom via URL publiée ou `?sheet=ID`

## Figures rythmiques (codes dur)
`q` noire · `h` blanche · `qd` noire pointée · `hd` blanche pointée
`8` croche · `16` double croche · suffixe `r` = silence · triplet via prop `triplet`
Groupes : `binary` (4/4) ou `ternary` (12/8) · `totalMs = 4 * beatMs` pour les deux

## Points d'attention
- VexFlow 5 : `Beam.draw()` n'appelle pas `applyStyle()` → couleur ligatures via `ctx.setFillStyle/setStrokeStyle` avant draw
- VexFlow `staveY` : **offset réel = +40px** — `getYForLine(0) = staveY + 40`, `getYForLine(4) = staveY + 80`. Formule correcte pour centrer : `staveY = max(4, round(height/2 - 60))`. Pour h<150 seulement (h≥150 → staveY=24 hardcodé). Pour h=90 la ligne du bas sortirait du SVG → utiliser h≥100 pour les petits blocs (act 3 choices : `height={120}`, width cap 440 paysage / 520 portrait).
- Act 3 : `choiceCols` piloté par `matchMedia('(orientation: landscape)')` (2 cols paysage, 1 col portrait) — fiable au changement d'orientation en plein exercice (event `change`). Hook AVANT early return. Re-fit via ResizeObserver de RythmStaff (dep `width`).
- Act 3 paysage : la grille déborde le cap `max-w-xl` (576) via `width:'min(94vw,960px)'` + `maxWidth:'none'` (parent flex `items-center` recentre) → cellules assez larges pour éviter la réduction `meet`.
- `staveY` dans `RythmStaff.jsx` : `height >= 150 ? 24 : Math.max(4, Math.round(height / 2 - 60))`
- RythmStaff div : `height: height` (prop) en style explicite — empêche le flex-stretch dans les cartes
- Chunk size warning build = normal (VexFlow volumineux)
- `attackFingerprint(figs)` : onsets non-silences × 1000 → string (évite flottants)
- Strip décalage RythmStaff : marker par note SOUS la portée (pas au-dessus, ≠ ancien comportement). gauche = tôt, droite = tard, pile = centre. Tap manqué = pile + guide sans dot.
- Act 2 : bouton son rythme masqué (son toujours actif, essentiel à l'écoute)
- Act 3 : `opacity: 1` constant sur la grille portées (pas de fade pendant countdown)
- **Plafond pts par exercice = 100** (× révélation × extrême) — aligné act 3/4/5 et autres modules. Pas `× playableCount`.
- **`scoreTap` conservé** uniquement pour dériver le grade par note dans l'adaptateur (à partir du résidu dead-zoné). Tolérances grade : `pf = beatMs×0.02` (Parfait), `gd = ×0.18` (Bien), `ok = ×0.30` (Moyen), au-delà = Raté.
- Anciens helpers supprimés : `fitAffine`, `MIN_TAPS_FOR_TEMPO`, `TEMPO_COMP_LIMIT`, `TEMPO_MALUS_COEFF`, `TEMPO_MALUS_MAX`, `clamp` local. Remplacés par moteur TS pur.
