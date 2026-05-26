# Module Rythme — référence technique

## Fichiers
- `RythmApp.jsx` — composant principal ~2100 lignes, **sensible**
- `RythmStaff.jsx` — rendu VexFlow SVG, ResizeObserver mobile
- `SettingsPage.jsx` — réglages avancés : catalogue formules + Google Sheets + offset flash calibration

## 4 activités
1. **Reproduire vu** — portée visible, l'élève tape/chante
2. **Reproduire entendu** — portée cachée pendant jeu, révélée après
3. **Reconnaître écrit** — rythme joué, 4 portées proposées, clic
4. **Reconnaître joué** — portée affichée, 4 boutons audio A/B/C/D

## Machine à états (`phase`)
`idle` → `countdown` → (`listening` act 2 seulement) → `playing` → `results`

- Act 2 : après `listening`, retour `countdown` beat muet (`countdownN=null`) puis beats 3 & 4 sonores
- Act 4 : pas de countdown, `setPhase("playing")` direct

## Audio
- `beep(strong)` : métronome (sine 1000/700 Hz, 80 ms)
- `rhythmBeep(strong, forced)` : son rythme (triangle 330 Hz, 150 ms) — `forced=true` bypass toggle
- `tapBeep(forced)` : bruit blanc 40 ms — `forced=true` bypass toggle
- `rhythmPulse()` : rhythmBeep + flash visuel
- `playPatternAudio(pat, bpm, delayMs, forced)` : joue pattern avec option forced
- Toggles son via refs (`rhythmSoundRef`, `tapSoundRef`) — assignés dans render body, pas useEffect
- Act 2/3/4 : `rhythmSoundOn` forcé à `true` via `useEffect([activity])` — son toujours actif
- Beat 1 : vérifier `!pat.figs[0]?.rest` avant jouer le son
- `tidsRef` = timers jeu · `audioTidsRef` = timers audio (clearés séparément)

## Scoring act 1 & 2
- `scoreTap(actual, expected, beatMs)` → `{ label, pts, grade, dev }`
- Tolérances : perfect 10%, good 18%, ok 30% du beat
- `dev` signé : + = tard, − = tôt, null si raté
- Offset optimal calculé en results : `optOffset = clamp(-mean(tap−expected), −200, 200)`
- `scoreDevs` prop RythmStaff : figIdx → dev signé ms · `sessionBpm` requis
- `compact` prop RythmStaff : limite formatWidth (usage dans SettingsPage catalogue)
- RythmStaff **auto-fit** : rend à `drawWidth = max(renderWidth, noteStartX + minNotesW*1.15 + 22)` puis `viewBox` calé sur **`getBBox()` réel** (après dessin complet, dots inclus) + `preserveAspectRatio="xMidYMid meet"` width/height 100% → remplit le conteneur, zéro clipping H et V. `preCalculateMinTotalWidth` seul sous-estime (ligatures, crochets triolets, hampes) → getBBox indispensable. `width` prop = cap max (div `maxWidth`). `compact` garde drawWidth=renderWidth.
- Résultats : boutons **▶ Mes taps** + **▶ Solution** — appellent forced=true (indépendants des toggles son)

## Scoring act 3 & 4 (QCM)
- 100 pts si correct, 0 si faux
- Distracteurs `generateDistractors` : 4 sources en cascade → permutations slots (`generateDistractorPermutation`, shuffle/rotation circulaire) · variant 1 temps · mesures aléatoires · variant sans contrainte
- Toutes les réponses ont le **même nombre de notes** (non-rest) que la cible · jamais de mesure vide ou 1 note
- `attackFingerprint(figs)` rejette homorythmes · `noteCount(figs)` = figures non-rest

## Mode Extrême (act 1)
- `extremeMode = activity===1 && !rhythmSoundOn && !flashBorderOn` — son rythme ET flash off
- Score ×2, cumul multiplicatif avec REVEAL_BONUS : `earned = round(raw * (1+bonus) * 2)`
- `scoreWasExtreme` fige l'état au calcul du score (`maxPts` ×2 aussi → `pct` ≤ 100%)
- Animation overlay `extreme-pop` (keyframe `index.css`) + badge "⚡ ×2 Extrême" dans results

## Niveaux XP (Parcours musicien)
`Apprenti → Musicien → Instrumentiste → Soliste → Concertiste → Virtuose → Maestro`
- `LEVEL_ORDER` + `LEVEL_FORMULA_IDS` dans `RythmApp.jsx` (sélection formules par niveau)
- Seuils XP : `hooks/useProgressFirebase.ts` (0 / 2500 / 6000 / 12500 / 45000 / 80000 / 140000)

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
- VexFlow `staveY` : **offset réel = +40px** — `getYForLine(0) = staveY + 40`, `getYForLine(4) = staveY + 80`. Formule correcte pour centrer : `staveY = max(4, round(height/2 - 60))`. Pour h<150 seulement (h≥150 → staveY=24 hardcodé). Pour h=90 la ligne du bas sortirait du SVG → utiliser h≥100 pour les petits blocs (act 3 choices : `height={100}`, width cap 260 en paysage / 520 en portrait).
- Act 3 : `choiceCols` piloté par orientation (`innerWidth > innerHeight` → 2 cols paysage, sinon 1 col portrait) + listener `resize`/`orientationchange`. Hook AVANT early return.
- `staveY` dans `RythmStaff.jsx` : `height >= 150 ? 24 : Math.max(4, Math.round(height / 2 - 60))`
- RythmStaff div : `height: height` (prop) en style explicite — empêche le flex-stretch dans les cartes
- Chunk size warning build = normal (VexFlow volumineux)
- `attackFingerprint(figs)` : onsets non-silences × 1000 → string (évite flottants)
- Dots timing (RythmStaff) : gauche = tôt, droite = tard · miss = pas de dot
- Act 2 : bouton son rythme masqué (son toujours actif, essentiel à l'écoute)
- Act 3 : `opacity: 1` constant sur la grille portées (pas de fade pendant countdown)
