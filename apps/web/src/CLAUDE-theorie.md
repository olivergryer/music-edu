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
`qcm` · `vrai_faux` · `texte` · `vexflow_intervalle` (portée VexFlow + 4 choix)

## Catégories & niveaux
- 6 catégories UI (merged)
- Niveaux difficulté : `C1/1 → C1/2 → ... → C3` (filtre contenu questions — distinct des niveaux XP)
- Timer CSS natif via ref (pas state) pour ne pas re-render
- Limites par défaut : 20s (QCM/VF/VexFlow), 30s (texte) — surpassable via `temps_limite` dans question
- Timer freeze au choix : `TimerBar` capte `revealed` prop → `getBoundingClientRect()` → freeze CSS

## Tutoriel intro
- Composant `TheorieTutorial` dans `TheoriePage.jsx`
- 4 slides : bienvenue (6 catégories) · types de questions · timer · choix de mode
- Affiché **une seule fois** (`localStorage` clé `theorie_tuto_v1`)
- Slide 3 interactif : sélection entraînement/examen → `onDone(mode)` → skip home, va direct setup
- "Ignorer" → `onDone(null)` → retour écran home normal

## Sources de données
- `public/data/questions-base.json` — 112 questions manuelles
- Script `node scripts/generate-questions.js` (depuis `apps/web/`) → 255 générées → 367 total
- **Relancer le script si `questions-base.json` modifié**
- Import CSV enseignant supporté

## Questions VexFlow intervalles (generate-questions.js)
- `IntervalleStaff.jsx` : snapshot SVG avant/après draw → paths portée (`#9ca3af`) vs notes/hampes (`#6b7280`)
- `Accidental` modifier explicite obligatoire (VexFlow ne l'affiche pas depuis la key seule)
- Altérations dans key ex: `f#/4` → `key.split('/')[0].slice(1)` → `'#'`
- Génération : 7 notes départ × 12 intervalles × 2 directions = 168 questions VexFlow
- Double altérations filtrées (skip si `|accSemis| > 1`)
- Descendant sous G3 → transpose octave de départ à 5
- Distracteurs VexFlow : `intervalDistr3SameDegree` (même degré/lettre, altération différente) — plus cohérent musicalement que voisins par demi-ton

## Points d'attention
- `Math.max(string)` → NaN → niveau null : toujours parser les niveaux en int avant comparaison
- `ChoiceQuestion` : condition exhaustive sur tous les types, sinon rendu vide silencieux
- Timer : ref-driven, pas state — évite flash/reset au moindre re-render
- Seuil examen : **35** (pas 38) — 3 occurrences dans TheoriePage.jsx
