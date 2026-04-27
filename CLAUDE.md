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
| `/theorie` | Module Théorie | Placeholder |
| `/accordeur` | Module Accordeur | Placeholder |

## Structure `apps/web/src/`

| Fichier | Rôle |
|---------|------|
| `App.jsx` | BrowserRouter + Routes |
| `HubPage.jsx` | Page d'accueil hub (3 cartes modules) |
| `RythmApp.jsx` | Module Rythme — 4 activités (~1250 lignes) |
| `RythmStaff.jsx` | Rendu VexFlow (portée musicale SVG) |
| `SettingsPage.jsx` | Sélection formules + chargement Google Sheet |
| `useSheetData.js` | Hook : chargement/parsing CSV Google Sheets |
| `TheoriePage.jsx` | Placeholder module Théorie |
| `AccordeurPage.jsx` | Placeholder module Accordeur |

## Module Rythme (`RythmApp.jsx`)

### 4 activités
1. **Reproduire vu** — portée visible, l'élève tape/chante le rythme
2. **Reproduire entendu** — portée cachée pendant jeu, révélée après
3. **Reconnaître écrit** — rythme joué audio, 4 portées proposées, clic
4. **Reconnaître joué** — portée affichée, 4 boutons audio A/B/C/D, validation

### Machine à états (`phase`)
`idle` → `countdown` → (`listening` act 2 seulement) → `playing` → `results`

Act 2 spécifique : après `listening`, retour à `countdown` avec 1 beat muet (`countdownN=null`) puis beats 3 & 4 sonores avant `playing`.

### Audio
- `beep(strong)` : son aigu si `strong=true` (beat 1), grave sinon
- `pulse(strong)` : beep + flash visuel (`beatFlash`, `beatStrong`)
- `playPatternAudio(pat, bpm)` : joue rythme en audio seul (act 3 & 4)
- Timers jeu : `tidsRef`. Timers audio indépendants : `audioTidsRef`

### Scoring
- Act 1 & 2 (tap/mic) : précision temporelle → grades perfect/good/ok/miss → pts
- Act 3 & 4 (QCM) : 100 pts si correct, 0 + -1 vie si faux (`handleChoice`)
- `totalPts` accumulé sur la session, `lives` (max 5)

### Formules rythmiques
- Catalogue par défaut dans `RythmApp.jsx` (const `DEFAULT_CATALOG`)
- Chargement custom via Google Sheets CSV (URL publiée ou ID sheet)
- Param URL `?sheet=ID` pour partage direct
- `useSheetData.js` gère chargement, parsing, `localStorage`

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
- **`RythmApp.jsx`** — fichier sensible (~1250 lignes). Ne pas modifier pour implémenter d'autres modules. Toute modification doit être explicitement demandée.
- **Google Sheets CSV** — pattern disponible pour tout module nécessitant des données éditables par l'enseignant (voir `useSheetData.js` + `SettingsPage.jsx` pour référence).

## Points d'attention

- `vercel.json` a `"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]` — ne pas supprimer (SPA routing)
- `RythmApp.jsx` n'utilise pas React Router — navigation interne via `currentPage` state (`"game"` | `"settings"`)
- VexFlow 5 : `Beam.draw()` n'appelle pas `applyStyle()` — couleur ligatures via `ctx.setFillStyle/setStrokeStyle` avant draw
- Chunk size warning build = normal (VexFlow + Tone.js volumineux), pas une erreur
- `totalMs = 4 * beatMs` pour 4/4 et 12/8 (mesure = 4 temps dans les deux cas)
