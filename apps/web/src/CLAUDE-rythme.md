# Module Rythme — référence technique

## Fichiers
- `RythmApp.jsx` — composant principal ~1400 lignes, **sensible**
- `RythmStaff.jsx` — rendu VexFlow SVG, ResizeObserver mobile
- `SettingsPage.jsx` — catalogue formules + Google Sheets + offset flash

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
- `rhythmBeep()` : son rythme (triangle 330 Hz, 150 ms) — toujours appelé avec `false`
- `tapBeep()` : bruit blanc 40 ms
- `rhythmPulse()` : rhythmBeep + flash visuel
- Toggles son via refs (`rhythmSoundRef`, `tapSoundRef`) — assignés dans render body, pas useEffect
- Beat 1 : vérifier `!pat.figs[0]?.rest` avant jouer le son
- `tidsRef` = timers jeu · `audioTidsRef` = timers audio (clearés séparément)

## Scoring act 1 & 2
- `scoreTap(actual, expected, beatMs)` → `{ label, pts, grade, dev }`
- Tolérances : perfect 10%, good 18%, ok 30% du beat
- `dev` signé : + = tard, − = tôt, null si raté
- Offset optimal calculé en results : `optOffset = clamp(-mean(tap−expected), −200, 200)`
- `scoreDevs` prop RythmStaff : figIdx → dev signé ms · `sessionBpm` requis
- `compact` prop RythmStaff : limite formatWidth (usage dans SettingsPage catalogue)

## Scoring act 3 & 4 (QCM)
- 100 pts si correct, 0 si faux
- Distracteurs filtrés par `attackFingerprint(figs)` — rejette homorythmes

## Niveaux XP (Parcours musicien)
`Apprenti → Musicien → Instrumentiste → Soliste → Concertiste → Virtuose → Maestro`
- `LEVEL_ORDER` + `LEVEL_FORMULA_IDS` dans `RythmApp.jsx` (sélection formules par niveau)
- Seuils XP : `hooks/useProgressFirebase.ts` (0 / 2500 / 6000 / 12500 / 45000 / 80000 / 140000)

## Navigation home page
Ordre des blocs : activités → **Commencer** → Mode de jeu → Niveaux → Tempo → Reveal beat
`handleNext` — callback centralisé pour passer à l'exercice suivant / fin de série.
Appelé par le bouton Commencer/Suivant ET par clic sur le bloc portée en `phase === "results"` (acts 1 & 2).

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
- Chunk size warning build = normal (VexFlow volumineux)
- `RythmApp.jsx` n'utilise pas React Router → navigation interne via `currentPage` state (`"game"` | `"settings"` | `"series-end"`)
- `attackFingerprint(figs)` : onsets non-silences × 1000 → string (évite flottants)
- Dots timing (RythmStaff) : gauche = tôt, droite = tard · miss = pas de dot
