# Tessitura — CLAUDE.md

## Stack & déploiement
Turborepo monorepo · React 19 + Vite · TypeScript (nouveaux fichiers `.ts`/`.tsx`, existants `.jsx`) · React Router v6 · App principale : `apps/web/`
Déploiement Vercel via GitHub push (depuis racine `/music-edu/`) :
- `main` → **production** (URL principale)
- `dev` → **preview** (URL `tessitura-git-dev-*.vercel.app`)

Firebase Spark : Firestore + Authentication (email/password). **DB partagée dev/prod** (assumé, comptes test gérés par le user).

## Routes
| URL | Fichier principal | Auth |
|-----|------------------|------|
| `/` | `HubPage.jsx` | public |
| `/rythme` | `RythmApp.jsx` + `RythmStaff.jsx` + `SettingsPage.jsx` | public |
| `/theorie` | `TheoriePage.jsx` | public |
| `/accordeur` | `AccordeurPage.jsx` + `AccordeurStaff.jsx` + `accordeurUtils.js` | public |
| `/accordeur/generateur` | `GenerateurAccordPage.jsx` — accessible uniquement depuis AccordeurPage | public |
| `/notes` | `modules/notes/NotesPage.tsx` + `NotesStaff.tsx` + `RadialWheel.tsx` (+ logique pure `modules/notes/*.ts`) | public |
| `/harmonie` | `modules/harmonie/HarmoniePage.tsx` — choix d'activité (+ noyau pur `modules/harmonie/*.ts`) | public |
| `/harmonie/detection` | `modules/harmonie/DetectionPage.tsx` — détection d'erreur, niveaux 3-7 | public |
| `/harmonie/basse` | `modules/harmonie/DicteeBassePage.tsx` — dictée de basse à la roue figée, niveau 1 | public |
| `/harmonie/binaire` | `modules/harmonie/ChoixBinairePage.tsx` — choix binaire, niveaux 2, 4, 5 | public |
| `/harmonie/flux` | `modules/harmonie/ChiffrageFluxPage.tsx` — chiffrage en flux, niveaux 6-7 | public |
| `/harmonie/cadences` | `modules/harmonie/CadencesPage.tsx` — reconnaissance de cadences, niveau 3 + palier « toutes » hors barème | public |
| `/harmonie/intervalles` | `modules/harmonie/IntervallesPage.tsx` — reconnaissance d'intervalles, hors barème | public |
| `/harmonie/banc` | `modules/harmonie/BancPage.tsx` — banc d'écoute, `IS_DEV` seulement | dev |
| `/profil` | `ProfilPage.jsx` → redirect dashboard selon rôle | protégée |
| `/dashboard/eleve` | `pages/DashboardEleve.tsx` | protégée |
| `/dashboard/prof` | `pages/DashboardProf.tsx` | protégée |
| `/feedback` | `pages/FeedbackPage.tsx` — formulaire retours → Firestore collection `feedback` | public |
| `/login` | `auth/LoginPage.tsx` | public |
| `/register` | `auth/RegisterPage.tsx` | public |

## Structure `src/`
```
src/
  lib/firebase.ts          — init Firebase, exports auth + db
  auth/
    AuthProvider.tsx       — contexte auth (onSnapshot profil temps réel) + useAuth()
    LoginPage.tsx
    RegisterPage.tsx       — choix rôle + génération teacherCode prof
  hooks/
    useProgressFirebase.ts — XP/trophées/streak Firestore (source de vérité progression)
  pages/
    DashboardEleve.tsx     — stats + profs liés + historique
    DashboardProf.tsx      — liste élèves + stats
    FeedbackPage.tsx
  (modules existants à la racine src/)
```

## Firestore — schéma
```
users/{uid}
  role: "eleve" | "prof"
  displayName: string
  teacherCode: string | null   (profs seulement)
  profIds: string[]            (élèves : UIDs des profs rejoints)
  profCodes: string[]          (élèves : codes des profs rejoints)
  profNames: { [code]: string } (élèves : noms des profs)

users/{uid}/progress/data
  xp · streak · trophies · modules { rythme · theorie · accordeur }

users/{uid}/history/{sessionId}
  date · module · xp · medal · createdAt (serverTimestamp)

teacherCodes/{code}
  uid: string
  displayName: string
```

## Fichiers transverses
- `hooks/useProgressFirebase.ts` — progression Firebase (XP, niveaux, trophées, streak)
- `hooks/useSwipe.js` — swipe hook partagé (`onSwipeLeft`, `onSwipeRight`, `onTap`, seuil 50px) — utilisé dans TourGuide + 3 carousels tuto
- `auth/AuthProvider.tsx` — `useAuth()` → `{ user, profile, loading }`
- `ThemeContext.tsx` — `useTheme()` + `ThemeToggleInline` (inline dans headers modules) + `ThemeProvider`
- `TourGuide.jsx` — overlay tour guidé : tap ou swipe gauche = étape suivante, overlay bloquant + scrollIntoView
- `useSheetData.js` — chargement CSV Google Sheets (rythme)

## Design system
- Fond `#030712` · Surface `#0a0f1a` · Accent `#c084fc` / `#7c3aed`
- Texte `#f9fafb` · Secondaire `#6b7280` · Succès `#34d399` · Erreur `#f87171` · Warning `#fbbf24`
- Police corps : `'Poppins', 'Inter', 'Segoe UI', sans-serif` (Google Fonts dans `index.html`)
- Police titres h1 : `'Righteous', 'Inter', sans-serif`
- **Inline styles uniquement** — pas de lib CSS
- Icônes : **SVG inline** — jamais d'emojis comme icônes UI
- Touch targets : min 44px boutons, 64px type-buttons feedback
- `index.css` global : `touch-action: manipulation` (supprime délai 300ms tablette), `cursor: pointer`, focus ring `#c084fc`

## Conventions
- **Inline styles** pour couleurs et valeurs dynamiques + **Tailwind v4** pour layout/spacing — pas de CSS modules ni styled-components
- **Pas de lib externe** sans demande explicite
- **Interface 100% français** — labels, feedback, erreurs
- **Mobile-first** — maxWidth 540px, touch-friendly, min 44px zones cliquables
- **Handlers de tap globaux + boutons enfants** — quand un conteneur capte les taps (`onPointerDown`/`onPointerUp` au niveau racine : tap-to-advance, tap-to-place, zone de frappe…), TOUT bouton/carte interactif imbriqué DOIT `e.stopPropagation()` sur `onPointerDown` (pas seulement `onClick`). Sinon le handler racine se déclenche en premier (pointer events avant click) et avale l'action — bouton « non cliquable » qui déclenche le skip/advance. Ex. RythmApp results : Réécouter/Solution/cartes act 5.
- `vercel.json` — ne jamais supprimer `"rewrites": [{"source":"/(.*)", "destination":"/index.html"}]`
- `RythmApp.jsx` — fichier sensible (~2100 lignes), ne modifier que sur demande explicite
- CSV `/public/formules-rythme-template.csv` — source de vérité formules rythme, ajouter dans le CSV pas dans le code
- Toggle dark/light : **flottant** sur Hub `/` seulement (`ThemeToggleFloating` conditionné sur `pathname`), **inline** dans header des modules via `ThemeToggleInline`
- `vite.config.js` injecte `__BUILD_DATE__` (dernier commit git) → affiché dans footer HubPage
- PWA : `manifest.json` + `icon-192x192.png` + `icon-512x512.png` (`purpose: "any maskable"`) + `apple-touch-icon` dans `index.html`

## Vocabulaire — deux notions distinctes (ne pas confondre)
- **Rang** = expérience **cross-module** (XP). Noms `Apprenti…Maestro`, seuils XP. Code : `RANKS`/`getRank`/`getNextRank` dans `hooks/useProgressFirebase.ts`. Affiché « Rang » dans les dashboards.
- **Niveau** = **cycle scolaire** `C1/1…C3` (par module), définit les formules/contenus. Rythme : colonne `niveau` du CSV → `niveauOrder`/`niveauFormulaIds`, `deriveNiveau`. Théorie : `LEVELS=['C1/1'…'C3']`. **Indexe directement** `DISTRACTOR_CONFIG`/`PALETTE_DISTRACTORS` (pas de mapping). Tu peux être Virtuose (Rang) en C1/1 (Niveau).

## Workflow
- **Plan avant code** — `/plan` avant toute feature non triviale, attendre validation
- **Spec d'abord** — ne pas anticiper des détails non spécifiés
- **Une session par module** — ne pas mélanger les modules
- **Toujours travailler sur `dev`** — `main` = prod Vercel, ne jamais commit dessus directement. Pas de branche de feature.
- **Ne pas committer ni pusher** — l'utilisateur gère `git commit` + `git push` lui-même (sur `dev` → preview, puis merge `dev` → `main` quand stable). Laisser les modifications dans le working tree.

## Commandes
```bash
# Depuis apps/web/
npm run dev
npm run build

# Fiche PDF des chiffrages Harmonie → docs/chiffrages-harmonie.pdf
# Générée DEPUIS LE CODE : relancer après toute modif de chiffrage/gabarits/niveaux.
npm run generate:chiffrages

# Depuis music-edu/ (racine) — travail courant sur dev
git add . && git commit -m "..." && git push

# Promouvoir dev → prod quand stable
git checkout main && git merge dev --ff-only && git push && git checkout dev

# Puis ouvrir le cycle suivant : bump version (reste dans le working tree,
# part avec le 1er commit dev de la session — pas de commit dédié)
cd apps/web && npm run release && cd ../..   # release:minor / release:major sinon

firebase deploy --only firestore:rules
```

## Fichiers de référence par module
Charger en début de session dédiée :
- Rythme → `@apps/web/src/CLAUDE-rythme.md`
- Théorie → `@apps/web/src/CLAUDE-theorie.md`
- Accordeur → `@apps/web/src/CLAUDE-accordeur.md`
- Notes → `@apps/web/src/CLAUDE-notes.md`
- Harmonie → `@apps/web/src/CLAUDE-harmonie.md` (noyau pur + activité « détection d'erreur »)
