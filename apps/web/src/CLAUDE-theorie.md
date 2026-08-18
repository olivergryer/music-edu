# Module Théorie — référence technique

## Fichiers
- `TheoriePage.jsx` — quiz complet Phase 1
- `IntervalleStaff.jsx` — rendu VexFlow portée intervalles

## Flow
`tutoriel (1re fois) → home → setup → quiz → result`

## Modes
- **Entraînement** : 10 questions, feedback immédiat, catégories au choix
- **Examen** : 40 questions, toutes catégories, seuil **35/40**

## Types de questions
`qcm` · `vrai_faux` · `texte` · `vexflow_intervalle` (portée VexFlow + 4 choix) · `vexflow_rythme` (motif rythmique + 4 choix)

### `vexflow_rythme`
Réutilise **`RythmStaff.jsx`** du module Rythme tel quel. La question porte :
```json
"rythme_figures": [{"dur":"qd"}, {"dur":"8r","rest":true}, {"dur":"q"}],
"rythme_timesig": "4/4"
```
- `figures` est un tableau d'**objets** `{dur, rest}` — pas de chaînes. Les silences portent `rest: true` ET un `dur` suffixé `r`.
- Codes de durée : `w h q 8 16 32`, `+d` = pointé, `+r` = silence (cf. `DUR_Q` dans RythmStaff).
- Métriques sûres = celles présentes dans `BEAT_SIZE` : `4/4 3/4 2/4 12/8`. **Éviter 6/8 et les métriques asymétriques** (7/8…) : le groupement des ligatures serait faux.
- La somme des durées doit remplir exactement la mesure.
- Rendu **avant** les propositions (l'élève lit le rythme d'abord), contrairement à `vexflow_intervalle` qui s'affiche après.

## Catégories & niveaux
- 6 catégories UI (merged)
- Niveaux difficulté (= cycle) : `C1/1 → C1/2 → ... → C3` (filtre contenu questions — **distinct du Rang XP** cross-module Apprenti…Maestro ; voir CLAUDE.md)

### Filtre de niveaux — `allowedLevelsFor(mode, level, onlyCurrent)`
| Mode | Case « Niveau actuel seulement » cochée | décochée |
|---|---|---|
| Entraînement | le niveau sélectionné **seul** | **tous** les niveaux de `C1/1` au sélectionné |
| Code de la route musicale | tous les niveaux jusqu'au sélectionné (case ignorée) | idem |

## Timer
- **Aucune temporisation sur tout le cycle 1** — critère = **niveau sélectionné au setup** (`isCycle1(level)`), pas le niveau de la question. Une session C1/x est intégralement sans chrono ; dès C2/1 le chrono s'applique à toutes les questions, y compris celles de niveau C1 incluses dans le pool.
- Porté par `session.noTimer`, posé dans `handleStart()` / `handleTutorialDone()`. `QuizScreen` masque `TimerBar` + le compteur et n'arme pas l'intervalle → `timedOut` reste `false`, donc toujours 1 pt.
- Timer CSS natif via ref (pas state) pour ne pas re-render
- Limites par défaut : 20s (QCM/VF/VexFlow), 30s (texte) — surpassable via `temps_limite` dans question (ignoré au cycle 1)
- Timer freeze au choix : `TimerBar` capte `revealed` prop → `getBoundingClientRect()` → freeze CSS

## Tutoriel intro
- Composant `TheorieTutorial` dans `TheoriePage.jsx`
- 4 slides : bienvenue (6 catégories) · types de questions · timer · choix de mode
- Affiché **une seule fois** (`localStorage` clé `theorie_tuto_v1`)
- Slide 3 interactif : sélection entraînement/examen → `onDone(mode)` → skip home, va direct setup
- "Ignorer" → `onDone(null)` → retour écran home normal

## Sources de données
- `public/data/questions-base.json` — 252 questions manuelles
- Script `node scripts/generate-questions.js` (depuis `apps/web/`) → 165 générées → 417 total
- **Relancer le script si `questions-base.json` modifié**
- Import CSV enseignant supporté

## Catégories fines
`vocabulaire_italien` · `vocabulaire_technique` · `vocabulaire_allemand` · `notation_partition` · `tonalites_alterations` · `intervalles` · `rythme_mesure` · `harmonie_accords` · `cadences` · `formes_musicales` · `histoire_styles` · `compositeurs`

⚠️ Toute nouvelle catégorie fine doit être ajoutée au tableau `includes` de la catégorie UI correspondante dans `CATEGORIES` — sinon ses questions n'apparaissent **jamais** dans le pool (`buildPool` filtre sur les catégories fines des catégories UI sélectionnées) et la catégorie reste grisée.

## Questions Tonalités (generate-questions.js)
Vocabulaire unifié : constante `A_LA_CLEF = "à l'armure / à la clef"` — les deux termes sont toujours enseignés ensemble, jamais l'un sans l'autre.
- `generateArmureQuestions()` → « Que trouve-t-on à l'armure / à la clef en X majeur/mineur ? » (30 q, ids `TCL_<Md|Mb|md|mb>_<note>`). Réponse = `formatAlts()`, distracteurs = armures voisines (`altDistr3`).
- Questions « which » (`TGM_*_which` / `TGm_*_which`) → « Quelle tonalité majeure/mineure a N dièses/bémols à l'armure / à la clef ? ». **Réponses suffixées du mode** (`Ré majeur`, pas `Ré`), distracteurs via `keyDistr3ByCount()` = mêmes mode, armures voisines. Cas 0 altération : « n'a aucune altération ».
- Mineur = armure du relatif majeur (mineur naturel). `explication` auto via `armureExplication()`.
- Niveaux via `altCountToLevel()` : 0→C1/1, 1→C1/4, 2→C2/1, 3→C2/3, 4→C2/4, 5+→C3.

## Questions VexFlow intervalles (generate-questions.js)
- `IntervalleStaff.jsx` : snapshot SVG avant/après draw → paths portée (`#9ca3af`) vs notes/hampes (`#6b7280`)
- `Accidental` modifier explicite obligatoire (VexFlow ne l'affiche pas depuis la key seule)
- Altérations dans key ex: `f#/4` → `key.split('/')[0].slice(1)` → `'#'`
- Génération : 7 notes départ × 12 intervalles × 2 directions = 168 questions VexFlow, **échantillonnées à 48** par `sampleIntervalleVex()` (`VEX_PER_COMBO = 2` par couple intervalle × direction, parcours des lettres avec un pas de 3). Sans cet échantillonnage les intervalles représentaient 52 % du module.
- Double altérations filtrées (skip si `|accSemis| > 1`)
- Descendant sous G3 → transpose octave de départ à 5
- Distracteurs VexFlow : `intervalDistr3SameDegree` (même degré/lettre, altération différente) — plus cohérent musicalement que voisins par demi-ton

## Points d'attention
- `Math.max(string)` → NaN → niveau null : toujours parser les niveaux en int avant comparaison
- `ChoiceQuestion` : condition exhaustive sur tous les types, sinon rendu vide silencieux
- Timer : ref-driven, pas state — évite flash/reset au moindre re-render
- Seuil examen : **35** (pas 38) — 3 occurrences dans TheoriePage.jsx
