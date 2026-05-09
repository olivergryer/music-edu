# Tessitura — CLAUDE.md

## Stack & déploiement
Turborepo monorepo · React 19 + Vite · TypeScript (nouveaux fichiers `.ts`/`.tsx`, existants `.jsx`) · React Router v6 · App principale : `apps/web/`
Déploiement : Vercel via GitHub push (depuis racine `/music-edu/`).
Firebase Spark : Firestore + Authentication (email/password).

## Routes
| URL | Fichier principal | Auth |
|-----|------------------|------|
| `/` | `HubPage.jsx` | public |
| `/rythme` | `RythmApp.jsx` + `RythmStaff.jsx` + `SettingsPage.jsx` | public |
| `/theorie` | `TheoriePage.jsx` | public |
| `/accordeur` | `AccordeurPage.jsx` + `AccordeurStaff.jsx` + `accordeurUtils.js` | public |
| `/accordeur/generateur` | `GenerateurAccordPage.jsx` — accessible uniquement depuis AccordeurPage | public |
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
- `auth/AuthProvider.tsx` — `useAuth()` → `{ user, profile, loading }`
- `useSheetData.js` — chargement CSV Google Sheets (rythme)
- `useProgress.js` — **MORT**, non utilisé, ne pas importer

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
- **Tailwind v4** pour layout/spacing (classes utilitaires) + **inline styles** pour couleurs et valeurs dynamiques — pas de CSS modules ni styled-components
- **Pas de lib externe** sans demande explicite
- **Interface 100% français** — labels, feedback, erreurs
- **Mobile-first** — maxWidth 540px, touch-friendly, min 44px zones cliquables
- `vercel.json` — ne jamais supprimer `"rewrites": [{"source":"/(.*)", "destination":"/index.html"}]`
- `RythmApp.jsx` — fichier sensible (~1400 lignes), ne modifier que sur demande explicite
- CSV `/public/formules-rythme-template.csv` — source de vérité formules rythme, ajouter dans le CSV pas dans le code

## Workflow
- **Plan avant code** — `/plan` avant toute feature non triviale, attendre validation
- **Spec d'abord** — ne pas anticiper des détails non spécifiés
- **Une session par module** — ne pas mélanger les modules

## Commandes
```bash
# Depuis apps/web/
npm run dev
npm run build

# Depuis music-edu/ (racine)
git add . && git commit -m "..." && git push
firebase deploy --only firestore:rules
```

## Fichiers de référence par module
Charger en début de session dédiée :
- Rythme → `@apps/web/src/CLAUDE-rythme.md`
- Théorie → `@apps/web/src/CLAUDE-theorie.md`
- Accordeur → `@apps/web/src/CLAUDE-accordeur.md`
