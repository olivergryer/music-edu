# Tessitura — CLAUDE.md

## Présentation

App web pédagogique pour la musique. Hub multi-modules nommé **Tessitura**, déployé sur Vercel via GitHub.

- **Stack** : Turborepo monorepo, React 19 + Vite, React Router v6
- **App principale** : `apps/web/`
- **Déploiement** : Vercel (framework Vite, SPA rewrites configurés)

## Routes

| URL | Module | État |
|-----|--------|------|
| `/` | Hub Tessitura | Actif |
| `/rythme` | Module Rythme | Complet |
| `/theorie` | Module Théorie | Complet (Phase 1) |
| `/accordeur` | Module Accordeur | Complet (V2) |

## Structure `apps/web/src/`

| Fichier | Rôle |
|---------|------|
| `App.jsx` | BrowserRouter + Routes |
| `HubPage.jsx` | Page d'accueil hub (3 cartes modules) |
| `RythmApp.jsx` | Module Rythme — 4 activités (~1350 lignes) |
| `RythmStaff.jsx` | Rendu VexFlow (portée musicale SVG), ResizeObserver mobile |
| `SettingsPage.jsx` | Sélection formules + chargement Google Sheet + offset flash |
| `useSheetData.js` | Hook : chargement CSV local + Google Sheets, parsing, localStorage |
| `TheoriePage.jsx` | Module Théorie — quiz complet (Phase 1) |
| `AccordeurPage.jsx` | Module Accordeur — accordeur chromatique V2 |
| `AccordeurStaff.jsx` | Portée VexFlow accordeur |
| `accordeurUtils.js` | Utilitaires pitch, cents, structures toniques |
| `useProgress.js` | **MORT — non utilisé.** Remplacé par `hooks/useProgressFirebase.ts` (Firebase). Ne pas modifier ni importer. |
| `hooks/useProgressFirebase.ts` | Hook XP/niveaux/trophées Firebase — source de vérité pour la progression élève |

## Module Rythme (`RythmApp.jsx`)

### 4 activités
1. **Reproduire vu** — portée visible, l'élève tape/chante le rythme
2. **Reproduire entendu** — portée cachée pendant jeu, révélée après
3. **Reconnaître écrit** — rythme joué audio, 4 portées proposées, clic
4. **Reconnaître joué** — portée affichée, 4 boutons audio A/B/C/D, validation

### Machine à états (`phase`)
`idle` → `countdown` → (`listening` act 2 seulement) → `playing` → `results`

Act 2 : après `listening`, retour `countdown` avec beat muet (`countdownN=null`) puis beats 3 & 4 sonores.
Act 4 : pas de countdown, `setPhase("playing")` direct.

### Audio — 3 sons distincts
- `beep(strong)` : métronome (sine 1000/700 Hz, 80 ms)
- `rhythmBeep()` : son rythme (triangle 330 Hz uniforme, 150 ms). Toujours `false` — pas de pitch différent sur beat 1.
- `tapBeep()` : son tap (bruit blanc, 40 ms)
- `rhythmPulse()` : rhythmBeep + flash visuel
- Toggle son rythme / son tap via refs (`rhythmSoundRef`, `tapSoundRef`) — assignés dans render body, pas useEffect (évite stale closure dans setTimeout)
- Beat 1 de playing : vérifier `!pat.figs[0]?.rest` avant de jouer le son
- Timers jeu : `tidsRef`. Timers audio indépendants : `audioTidsRef`

### Scoring — act 1 & 2
- Précision temporelle → grades perfect/good/ok/miss → pts
- `scoreTap(actual, expected)` retourne `{ label, pts, grade, dev }` — `dev` = signé (+ = tard, - = tôt, null si manqué)
- Flèches décalage au-dessus des notes dans RythmStaff : `scoreDevs` (figIdx → dev ms) + `sessionBpm` → `attackFingerprint` en % du temps

### Scoring — act 3 & 4 (QCM)
- 100 pts si correct, 0 + -1 vie si faux (`handleChoice`)
- Distracteurs filtrés par **empreinte d'attaques** (`attackFingerprint`) — rejette les homorythmes (noire == croche+demi-soupir, etc.)
- `totalPts` accumulé sur la session, `lives` (max 5)

### Formules rythmiques
- Source de vérité : `/public/formules-rythme-template.csv` — chargé au démarrage via `useSheetData(fallback, "/formules-rythme-template.csv")`
- Fallback hardcodé dans `FORMULA_CATALOG` si fetch échoue
- Chargement custom via Google Sheets CSV (URL publiée ou ID sheet)
- Param URL `?sheet=ID` pour partage direct
- `useSheetData.js` gère chargement CSV local + Google Sheets, parsing, `localStorage`

### Figures rythmiques (codes)
`q` noire, `h` blanche, `qd` noire pointée, `hd` blanche pointée,
`8` croche, `16` double croche. Suffixe `r` = silence, `t` = triolet.
Groupes : `binary` (4/4) ou `ternary` (12/8).

## Design system

- Background : `#030712`
- Surface : `#0a0f1a`
- Accent primaire : `#c084fc` / `#7c3aed`
- Texte : `#f9fafb`
- Texte secondaire : `#4b5563` / `#6b7280`
- Succès : `#34d399`, Erreur : `#f87171`, Warning : `#fbbf24`
- Police : `'Inter', 'Segoe UI', sans-serif`
- Pas de lib CSS — inline styles partout

## Commandes

```bash
npm run dev      # dev server (depuis racine ou apps/web)
npm run build    # build prod
git add . && git commit -m "..." && git push   # depuis racine /music-edu/, déclenche Vercel
```

## Principes de conception

### Langue
- Interface **100% en français** — labels, messages d'erreur, placeholders, feedback
- Terminologie musicale française (noire, croche, soupir, portée…)

### Centré élève
- L'élève est le seul utilisateur qui compte — chaque décision UX part de ses besoins
- Feedback immédiat et lisible après chaque action (résultat visible en < 1 s)
- Jamais de message négatif sec — une erreur = une indication de progression
- Progression visible : score, vies, niveau — l'élève sait où il en est à tout moment
- Pas de friction inutile : minimum de clics pour commencer à jouer

### Accessibilité
- Contraste suffisant sur tous les textes (pas de gris sur gris)
- Zones cliquables généreuses (min ~44px sur mobile)
- Touch-friendly en priorité — l'app est utilisée sur tablette/téléphone en classe
- Pas de dépendance à la souris — tout doit fonctionner au doigt

### Ludique
- Animations et feedback visuels pour rendre l'interaction vivante (flash, transitions)
- Scoring gamifié (points, vies) sans être punitif
- Formulations encourageantes, ton direct et positif
- Progression par niveaux claire et motivante

### Interface
- Pas de navigation complexe — une action principale par écran
- Bouton d'action principal toujours visible et évident
- États du jeu (countdown, playing, results) clairement distingués visuellement
- Mobile-first : maxWidth 540px, padding généreux, pas de scroll horizontal

## Workflow de développement

- **Plan avant code** — toujours passer par plan mode (`/plan`) avant d'implémenter une fonctionnalité non triviale. Attendre validation explicite avant de coder.
- **Une session par module** — ouvrir une session Claude Code dédiée par module (`/rythme`, `/theorie`, `/accordeur`). Ne pas mélanger les modules dans une même session.
- **Spec d'abord** — le user transmet la spec complète avant que Claude commence à planifier. Ne pas anticiper des détails non spécifiés.

## Conventions techniques

- **Inline styles uniquement** — pas de lib CSS (Tailwind, styled-components, CSS modules…). Cohérent avec l'existant.
- **Pas de lib externe sans demande** — n'introduire une nouvelle dépendance que si explicitement nécessaire et validé.
- **`vercel.json`** — ne jamais supprimer `"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]`. Critique pour SPA routing en production.
- **`RythmApp.jsx`** — fichier sensible (~1350 lignes). Ne pas modifier pour implémenter d'autres modules. Toute modification doit être explicitement demandée.
- **CSV catalogue rythme** — `/public/formules-rythme-template.csv` est la source de vérité. Ajouter formules dans le CSV, pas dans le code.
- **Google Sheets CSV** — pattern disponible pour tout module nécessitant des données éditables par l'enseignant (voir `useSheetData.js` + `SettingsPage.jsx`).

## Points d'attention

- `vercel.json` a `"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]` — ne pas supprimer (SPA routing)
- `RythmApp.jsx` n'utilise pas React Router — navigation interne via `currentPage` state (`"game"` | `"settings"`)
- VexFlow 5 : `Beam.draw()` n'appelle pas `applyStyle()` — couleur ligatures via `ctx.setFillStyle/setStrokeStyle` avant draw
- Chunk size warning build = normal (VexFlow + pitchy volumineux), pas une erreur
- `totalMs = 4 * beatMs` pour 4/4 et 12/8 (mesure = 4 temps dans les deux cas)
- `rhythmBeep` toujours appelé avec `false` — jamais de pitch différent sur beat 1
- `attackFingerprint(figs)` : onsets non-silences × 1000 → string. Évite flottants. Utilisé pour filtrer homorythmes dans `generateDistractors`.
- `scoreDevs` prop de `RythmStaff` : object figIdx → dev signé ms. `sessionBpm` prop requis pour calcul % tempo.
- Git push depuis racine `/music-edu/` — pas depuis `apps/web/`
