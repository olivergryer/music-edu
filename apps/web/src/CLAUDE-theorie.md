# Module Théorie — référence technique

## Fichier
- `TheoriePage.jsx` — quiz complet Phase 1

## Flow
`home → setup → quiz → result`

## Modes
- **Entraînement** : 10 questions, feedback immédiat
- **Examen** : 40 questions, seuil 38/40

## Types de questions
`qcm` · `vrai_faux` · `texte` · `vexflow_intervalle` (portée VexFlow + 4 choix)

## Catégories & niveaux
- 6 catégories UI (merged)
- Niveaux difficulté : `C1/1 → C1/2 → ... → C3` (filtre contenu questions — distinct des niveaux XP)
- Timer CSS natif via ref (pas state) pour ne pas re-render
- Limites par défaut : 20s (QCM/VF/VexFlow), 30s (texte) — surpassable via `temps_limite` dans question

## Sources de données
- `questions-base.json` — 112 questions manuelles
- Script `node scripts/generate-questions.js` (depuis `apps/web/`) → 99 générées
- **Relancer le script si `questions-base.json` modifié**
- Import CSV enseignant supporté

## Points d'attention
- `Math.max(string)` → NaN → niveau null : toujours parser les niveaux en int avant comparaison
- `ChoiceQuestion` : condition exhaustive sur tous les types, sinon rendu vide silencieux
- Timer : ref-driven, pas state — évite flash/reset au moindre re-render
