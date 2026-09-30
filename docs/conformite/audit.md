# Audit de conformité — Tessitura

Phase 1 de la spec « Conformité légale et référencement ». **Lecture seule : aucun fichier applicatif n'a été modifié.**

Périmètre : dépôt `music-edu`, branche `dev`, commit de départ `44622d1` + working tree.
Date : 2026-09-29.

> **Résultat : les conditions d'arrêt de la section 0 sont déclenchées.** Voir § 12. La phase 2 n'a pas été entamée.

---

## 0. Écart majeur entre la spec et le code réel

La spec décrit une application à **trois modules** (Rythme, Théorie, Accordeur), sans compte utilisateur, dont la détection de hauteur reposerait sur **CREPE / TensorFlow.js**.

Le code réel comporte :

- **six modules** : Rythme, Théorie, Accordeur, Notes, Harmonie (7 activités), plus un module Calibration réservé au dev ;
- un **système de comptes complet** : Firebase Auth e-mail/mot de passe, rôles élève/professeur, tableaux de bord, liaison élève↔professeur par code ;
- **aucune trace de CREPE ni de TensorFlow.js**. La détection de hauteur utilise [`pitchy`](https://www.npmjs.com/package/pitchy) v4.1.0 (MIT), exécuté localement.

Une grande partie des textes légaux et de la table SEO de la spec est donc incomplète ou inexacte. Les conséquences sont listées au § 13.

---

## 1. Firestore

### 1.1 Configuration

`src/lib/firebase.ts` — projet `tessitura-97d58`, clés publiques en dur (normal pour Firebase Web).
Cache local persistant activé (`persistentLocalCache` + `persistentMultipleTabManager`) → **IndexedDB**, avec repli mémoire si indisponible.

### 1.2 Lectures et écritures

| Collection / document | Opération | Champs | Origine de l'ID | Fichier |
|---|---|---|---|---|
| `users/{uid}` | `setDoc` (création) | `role`, `displayName`, `teacherCode`, `profIds` | UID Firebase Auth | [RegisterPage.tsx:31](../../apps/web/src/auth/RegisterPage.tsx#L31) |
| `users/{uid}` | `onSnapshot` (temps réel) | profil complet | UID courant | [AuthProvider.tsx:47](../../apps/web/src/auth/AuthProvider.tsx#L47) |
| `users/{uid}` | `updateDoc` | `profIds`, `profCodes`, `profNames` (arrayUnion/arrayRemove) | UID courant | [DashboardEleve.tsx:55](../../apps/web/src/pages/DashboardEleve.tsx#L55) |
| `users` (requête) | `getDocs` `where('profIds','array-contains',uid)` | — | — | [DashboardProf.tsx:80](../../apps/web/src/pages/DashboardProf.tsx#L80) |
| `users/{uid}/progress/data` | `getDoc` + `setDoc` | `xp`, `streak`, `trophies`, `modules`, compteurs quotidiens, `highestRankIdx` | fixe (`data`) | [useProgressFirebase.ts:54,78](../../apps/web/src/hooks/useProgressFirebase.ts#L54) |
| `users/{uid}/progress/{moduleId}` | `getDoc` + `setDoc` | progression par module, `levels`, `payload`, `totals` | id de module | [useModuleProgress.ts:64](../../apps/web/src/hooks/useModuleProgress.ts#L64), [moduleProgress.ts:184](../../apps/web/src/lib/moduleProgress.ts#L184) |
| `users/{uid}/history/{auto}` | `addDoc` | `date`, `module`, `xp`, `medal`, `createdAt`, détails de session | auto-ID Firestore | [useProgressFirebase.ts:80](../../apps/web/src/hooks/useProgressFirebase.ts#L80) |
| `users/{uid}/history` | `getDocs` `orderBy('createdAt','desc')` | — | — | [DashboardEleve.tsx:38](../../apps/web/src/pages/DashboardEleve.tsx#L38), [DashboardProf.tsx:88](../../apps/web/src/pages/DashboardProf.tsx#L88) |
| `users/{uid}/sessions/{auto}` | `setDoc` (création) | `schemaVersion`, `moduleId`, `startedAt`, items encodés, résumé | auto-ID Firestore | [moduleProgress.ts:167](../../apps/web/src/lib/moduleProgress.ts#L167) |
| `users/{uid}/calibrations/{auto}` | `addDoc`, `getDocs`, `deleteDoc` | `nom`, `instrument`, `transpoKey`, `exercises` (seuils numériques), `suggestedProfiles` | auto-ID | [CalibrationPage.jsx:226,284](../../apps/web/src/pages/CalibrationPage.jsx#L226) |
| `teacherCodes/{code}` | `setDoc`, `getDoc` | `uid`, `displayName` | code généré à l'inscription | [RegisterPage.tsx:38](../../apps/web/src/auth/RegisterPage.tsx#L38), [DashboardEleve.tsx:49](../../apps/web/src/pages/DashboardEleve.tsx#L49) |
| `feedback/{auto}` | `addDoc` | **`prenom`**, `uid`, `role`, `appareil`, `module`, `fonctionnalite`, `type`, `description`, `note`, `createdAt` | auto-ID | [FeedbackPage.tsx:62](../../apps/web/src/pages/FeedbackPage.tsx#L62) |

**Aucun `deleteDoc` n'existe hors module Calibration.** Il n'y a aujourd'hui aucun moyen, pour un utilisateur, d'effacer ses données.

### 1.3 Firebase Auth

**Authentification e-mail / mot de passe**, non anonyme :

- `createUserWithEmailAndPassword` — [RegisterPage.tsx:29](../../apps/web/src/auth/RegisterPage.tsx#L29)
- `signInWithEmailAndPassword` — [LoginPage.tsx:24](../../apps/web/src/auth/LoginPage.tsx#L24)
- `sendPasswordResetEmail` — [LoginPage.tsx:38](../../apps/web/src/auth/LoginPage.tsx#L38)

Aucun `signInAnonymously`. **Il n'existe donc aucun « identifiant technique aléatoire d'appareil »** : l'identifiant est un UID Firebase lié à une adresse e-mail. Les utilisateurs non connectés jouent en mode invité, leur progression restant en `localStorage` (clé `guest-progress-v1`).

### 1.4 Règles de sécurité (`firestore.rules`, état actuel)

- `users/{uid}` : lecture par soi-même **ou** par un professeur dont l'UID figure dans `profIds` ; écriture par soi-même uniquement.
- `users/{uid}/progress/{doc}`, `history/{session}` : même schéma.
- `users/{uid}/sessions/{id}` : `create` par soi-même si `schemaVersion is int` ; `update, delete: if false` (documents immuables).
- `users/{uid}/calibrations/{id}` : lecture/écriture par soi-même.
- `teacherCodes/{code}` : lecture par tout utilisateur authentifié ; écriture si `request.resource.data.uid == request.auth.uid`.

**Faiblesses relevées (non corrigées, conformément à la spec) :**

1. **`feedback` n'a aucune règle.** Firestore refuse par défaut ce qui n'est pas explicitement autorisé : **le formulaire de retours échoue silencieusement en production** (le `catch` de [FeedbackPage.tsx:70](../../apps/web/src/pages/FeedbackPage.tsx#L70) affiche « Erreur réseau »). À vérifier en console : si des documents `feedback` existent, c'est qu'un jeu de règles plus permissif est déployé et diverge du fichier versionné.
2. **`allow write` non décomposé** sur `users/{uid}`, `progress` et `history` : `write` couvre `create`, `update` **et** `delete`. La suppression y est donc déjà permise pour le titulaire — la phase 3.2 n'aurait à ajuster que `sessions`, où `delete: if false` bloquerait l'effacement.
3. **`teacherCodes` expose le `displayName` de tout professeur** à n'importe quel compte authentifié, sans connaître le code (la collection est lisible en entier).
4. `request.auth.uid == uid` sans test `request.auth != null` préalable (lignes `allow read`/`write` de `users/{uid}`) : fonctionne, mais par accident du typage des règles.

---

## 2. Stockage navigateur

### 2.1 `localStorage` — 36 clés

| Clé | Contenu | Fichier |
|---|---|---|
| `theme` | `dark` / `light` | ThemeContext.tsx:19 |
| `guest-progress-v1` | **progression complète de l'invité** (XP, streak, trophées, compteurs) | progressLogic.ts:384 |
| `rythm-settings-v1` | réglages du module Rythme | RythmApp.jsx:993 |
| `rythm-tuto-hide-{version}` | tutoriel Rythme masqué | RythmApp.jsx:973 |
| `rhythmSheetId` | identifiant du Google Sheet de formules | useSheetData.js:116 |
| `theorie_level_v1`, `theorie_only_current_v1`, `theorie_tuto_v1` | niveau, filtre, tutoriel Théorie | TheoriePage.jsx:298,522,957 |
| `theorie_questions_comments_v1` | commentaires (outil admin dev) | QuestionsAdminPage.jsx:14 |
| `acc_diapason`, `acc_transpo`, `acc_ref`, `acc_seuil`, `acc_silence`, `acc_noteJump`, `acc_clarity`, `acc_gate`, `acc_minDuration`, `acc_reattack`, `acc_profile`, `acc_profiles_custom`, `acc_temperament_user`, `acc_temperament_presets`, `acc_tuto_v1` | réglages Accordeur | AccordeurPage.jsx:697-758, calibrationUtils.js:372 |
| `accordeur_instrument_preference`, `accordeur_visu_toggles`, `accordeur_structures`, `accordeur_sessions` | préférences et travaux Accordeur | AccordeurPage.jsx, AccordeurStaff.jsx:152, accordeurUtils.js:516,529 |
| `notes_instrument`, `notes_phase`, `notes_couleur`, `notes_son`, `notes_wheelmode`, `notes_custom`, `notes_stringcfg` | préférences module Notes | NotesPage.tsx:207-226 |
| `pwa-inapp-off`, `pwa-tuto-hub-off`, `pwa-tuto-hub-last`, `pwa-tuto-dash-off`, `pwa-tuto-dash-last` | invites d'installation PWA | usePwaInstall.ts:71 |
| `tessitura-avert-son` | date du dernier avertissement sonore | AvertissementSon.tsx:35 |
| `consigne-v{n}-{clé}` | consignes « ne plus afficher » (clé dynamique) | ConsigneOverlay.jsx:34 |

Aucun usage de `sessionStorage`.

### 2.2 IndexedDB

| Base | Store | Contenu | Fichier |
|---|---|---|---|
| `tessitura` (v1) | `sessionBuffers` | tampon de session en cours : `uid`, `moduleId`, `sessionId`, items joués, résumé — checkpoint toutes les 30 s | [sessionBuffer.ts:13](../../apps/web/src/lib/sessionBuffer.ts#L13) |
| `firebaseLocalStorageDb` | — | session Firebase Auth (jeton, UID, e-mail) | SDK Firebase |
| `firestore/…` | — | cache Firestore persistant (réplique locale des documents utilisateur) | SDK Firebase |

### 2.3 Cookies

Aucun cookie posé par le code applicatif. Le SDK Firebase Auth utilise IndexedDB, pas de cookie.

### 2.4 Caches du service worker (`public/sw.js`, version `v4`)

| Cache | Contenu |
|---|---|
| `tessitura-html-v4` | `/`, `/manifest.json`, icônes 192/512, `/formules-rythme-template.csv`, navigations |
| `tessitura-assets-v4` | chunks `/assets/*` hachés, préchargés en masse via le message `PRECACHE` |
| `audio-samples-v2` | échantillons audio servis depuis `r2.dev/samples/` |
| `tessitura-fonts-v1` | **réponses de `fonts.googleapis.com` et `fonts.gstatic.com`** |

---

## 3. Réseau — domaines tiers contactés

| Domaine | Rôle | Déclenchement | Source |
|---|---|---|---|
| `fonts.googleapis.com`, `fonts.gstatic.com` | police Inter | **à chaque chargement**, en render-blocking | [index.html:21](../../apps/web/index.html#L21) |
| `pub-bcb45c74de5d47c598fedde0a9f6a474.r2.dev` (Cloudflare R2) | échantillons instrumentaux | à la lecture d'un son | [sampleEngine.js:6](../../apps/web/src/sampleEngine.js#L6) |
| `gleitz.github.io` (GitHub Pages) | **soundfonts MusyngKite** pour flûte, hautbois, clarinette, saxophone, basson | à la lecture Accordeur / Générateur d'accords | [windEngine.js:27](../../apps/web/src/windEngine.js#L27) |
| `*.googleapis.com`, `*.firebaseio.com`, `identitytoolkit.googleapis.com` | Firestore + Auth | connexion, progression | SDK Firebase |
| `docs.google.com` | CSV de formules Rythme | **uniquement** si un `?sheet=` est passé ou si `rhythmSheetId` est en cache | [useSheetData.js:23,110](../../apps/web/src/useSheetData.js#L23) |

`gleitz.github.io` n'apparaît ni dans la spec ni dans la liste des sous-traitants prévue : c'est un quatrième tiers, hébergé par **GitHub Inc. (Microsoft)**, dont les requêtes portent l'adresse IP de l'élève.

---

## 4. Micro — chemin du flux audio

Cinq points d'entrée `getUserMedia` : [AccordeurPage.jsx:781,882](../../apps/web/src/AccordeurPage.jsx#L781), [GenerateurAccordPage.jsx:209](../../apps/web/src/GenerateurAccordPage.jsx#L209), [RythmApp.jsx:1230](../../apps/web/src/RythmApp.jsx#L1230), [JeuGamme.jsx:123](../../apps/web/src/JeuGamme.jsx#L123), [CalibrationPage.jsx:123](../../apps/web/src/pages/CalibrationPage.jsx#L123).

Chemin complet : `getUserMedia` → `AudioContext.createMediaStreamSource` → `AnalyserNode` → `pitchy` (autocorrélation, en mémoire) → f0 en Hz → écarts en cents → affichage.

Des `MediaRecorder` produisent des `Blob` audio dans l'Accordeur, JeuGamme et Calibration, mais ils servent à la **relecture locale** : aucun `firebase/storage`, aucun `FormData`, aucun `fetch` sortant ne les transporte (vérifié par recherche sur tout le dépôt).

**Conclusion : l'audio du micro ne quitte pas l'appareil.** Ce qui part vers Firestore dans le module Calibration (`exercises`, `suggestedProfiles`) est une liste de seuils numériques de détection, pas un signal audio ni une empreinte vocale.

---

## 5. SDK tiers

| Type | Présent ? |
|---|---|
| Analytics (`getAnalytics`, gtag, Plausible, Matomo, PostHog, Mixpanel) | **non** |
| Suivi d'erreurs (Sentry…) | **non** |
| Publicité | **non** |
| `firebase/storage` | **non** |

---

## 6. Licences

### Dépendances de production

| Paquet | Version | Licence |
|---|---|---|
| react | 19.2.5 | MIT |
| react-dom | 19.2.5 | MIT |
| react-router-dom | 7.14.2 | MIT |
| firebase | 12.12.1 | Apache-2.0 |
| pitchy | 4.1.0 | MIT |
| tone | 15.1.22 | MIT |
| vexflow | 5.0.0 | MIT |
| soundfont-player | 0.12.0 | MIT |
| tailwindcss | 4.2.4 | MIT |
| @tailwindcss/vite | 4.2.4 | MIT |

Apache-2.0 (Firebase) impose la distribution du texte de licence et du fichier `NOTICE` — d'où le `THIRD_PARTY_NOTICES.txt` prévu en phase 4.

### Modèle de détection de hauteur

**Aucun modèle CREPE, aucun poids à créditer** : `pitchy` est un algorithme d'autocorrélation (McLeod), MIT, sans données entraînées.

### Polices

- **Inter** — chargée depuis Google Fonts, graisses 400 à 900. SIL Open Font License 1.1.
- **Righteous** — `#boot-titre` la demande en `font-family` ([index.html:44](../../apps/web/index.html#L44)) mais **elle n'est déclarée dans aucun `@font-face` et ne figure pas dans la feuille Google Fonts chargée**. L'écran de démarrage retombe donc silencieusement sur Inter. Idem pour les titres `h1` décrits dans `CLAUDE.md`. À corriger en phase 2.4.

### Sons

- **R2** : `pub-…r2.dev/samples/` — échantillons à créditer (University of Iowa selon la spec, non vérifiable depuis le code : aucun fichier de licence ni de provenance dans le dépôt). **[[À COMPLÉTER : confirmation de l'origine des échantillons R2]]**
- **MusyngKite** via `gleitz.github.io` : soundfont redistribuée par le projet `midi-js-soundfonts`. Licence à vérifier avant publication — **[[À COMPLÉTER : licence MusyngKite]]**.

---

## 7. Assets

- Icônes PWA : `icon-192x192.png`, `icon-512x512.png`, cinq `apple-touch-icon-*`, `favicon.svg`, `icon-dev.svg`, `icons.svg` dans `public/`.
- **`public/icone.png` n'existe pas** : la balise `<link rel="icon" href="/icone.png">` pointait dans le vide. Le working tree contient déjà la correction de la phase 2.2 (non commitée).
- `favicon.svg` n'est référencé nulle part (candidat à la suppression, phase 2.2).
- Fichiers de test présents en production : `test-clarinette.wav`, `test-syrinx-flute.wav`, `formules-rythme-template_backup.csv`.

### Œuvres musicales

Les exercices ne rejouent aucune œuvre : les modules synthétisent des notes et des formules rythmiques. Des **noms de compositeurs** apparaissent en revanche comme réponses de quiz dans `public/data/questions.json` (Bach, Debussy…). Citer un nom dans une question n'engage pas le droit d'auteur. Une revue du fichier complet reste à faire si des incipit ou extraits de partitions y étaient ajoutés plus tard.

---

## 8. Navigation

React Router v7 (`react-router-dom` 7.14.2), routage par URL. Routes déclarées dans [App.jsx:82-113](../../apps/web/src/App.jsx#L82) :

**Publiques** : `/`, `/rythme`, `/theorie`, `/accordeur`, `/accordeur/generateur`, `/notes`, `/harmonie`, `/harmonie/detection`, `/harmonie/basse`, `/harmonie/intervalles`, `/harmonie/binaire`, `/harmonie/flux`, `/harmonie/cadences`, `/feedback`, `/login`, `/register`, `/reinitialiser`.
**Protégées** : `/profil`, `/dashboard/eleve`, `/dashboard/prof`, `/dashboard/prof/eleve/:uid`.
**Dev uniquement** (`IS_DEV`) : `/theorie/questions`, `/harmonie/banc`, `/accordeur/calibration`.
`*` → redirection vers `/`.

Aucune route `/mentions-legales`, `/confidentialite` ni `/credits`.

---

## 9. URL absolues en dur

`grep -rn "vercel.app" src/ public/` → **aucune occurrence**. Le seul rappel du domaine est un commentaire dans [ResetPasswordPage.tsx:15](../../apps/web/src/auth/ResetPasswordPage.tsx#L15) (« `https://<domaine-de-prod>/reinitialiser` »), sans URL réelle.

En revanche, le domaine de production est **configuré hors dépôt**, dans la console Firebase (URL d'action des e-mails de réinitialisation, domaines autorisés OAuth). Le changement de domaine imposera de l'y mettre à jour, sans quoi la réinitialisation de mot de passe cassera.

---

## 10. Configuration Vercel

- **`vercel.json` à la racine : fichier de 0 octet.** Un JSON vide est invalide ; selon la racine de déploiement configurée côté Vercel, c'est soit ignoré, soit une erreur de build. À trancher avant toute modification (phase 5.4).
- `apps/web/vercel.json` :
  ```json
  { "framework": "vite", "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
  Ni `cleanUrls`, ni `trailingSlash`, ni en-têtes.

---

## 11. Écrans existants

- `SettingsPage.jsx` **n'est pas un écran de réglages global** : c'est le panneau de configuration du module Rythme, rendu depuis [RythmApp.jsx:1908](../../apps/web/src/RythmApp.jsx#L1908).
- Il n'existe **aucun écran Réglages transverse**. Les points d'accroche possibles pour les liens légaux sont le pied de page de `HubPage.jsx` (lignes 181-194, qui affiche déjà « Conçue et développée par Matthieu GAILLARD © {année} ») et les tableaux de bord.
- `/profil` redirige vers le tableau de bord correspondant au rôle.

---

## 12. Conditions d'arrêt (section 0, règle 4)

| Condition | Verdict |
|---|---|
| L'audio du micro ou des données dérivées quittent l'appareil | **Non** — § 4 |
| SDK d'analytics, de publicité ou de suivi d'erreurs | **Non** — § 5 |
| **Donnée directement identifiante collectée ou stockée** | **OUI — arrêt** |

Trois constats indépendants déclenchent la troisième condition :

1. **Adresse e-mail** — obligatoire à l'inscription et à la connexion (Firebase Auth), conservée par Google dans le projet `tessitura-97d58`.
2. **Nom d'affichage** — `displayName` saisi à l'inscription et stocké dans `users/{uid}`, puis recopié dans `teacherCodes/{code}` pour les professeurs. Rien n'empêche un élève d'y mettre ses nom et prénom réels ; c'est même ce que l'affichage côté professeur suppose.
3. **Prénom** — champ `prenom` du formulaire de retours, écrit dans la collection `feedback` ([FeedbackPage.tsx:63](../../apps/web/src/pages/FeedbackPage.tsx#L63)).

**Je m'arrête donc avant la phase 2.**

---

## 13. Conséquences sur les phases 2 à 7

Les sections suivantes de la spec ne sont plus applicables telles quelles :

| Section | Problème | Ce qu'il faut décider |
|---|---|---|
| 3.3 « Identifiant visible » | Il n'existe aucun identifiant technique anonyme d'appareil : l'identité est un compte e-mail | Afficher l'UID Firebase ? Ou l'e-mail, que l'éditeur connaît déjà ? |
| 4.3 « Tu n'as pas besoin de donner ton nom, ton adresse e-mail ou ton âge » | **Faux** dès qu'un compte est créé | Réécrire : distinguer le mode invité du mode connecté |
| 4.3 « ne collecte aucune donnée permettant d'identifier directement un enfant » | **Faux** | Réécrire |
| 4.3 base légale « intérêt légitime » (art. 6.1.f) | Difficilement tenable pour un compte nominatif d'enfant de 7-11 ans. Le **consentement parental** (art. 8 RGPD) ou l'exécution du contrat (6.1.b) sont à considérer | Arbitrage juridique |
| 4.3 sous-traitants | GitHub Inc. (soundfonts MusyngKite) manque à la liste | Ajouter, ou auto-héberger les soundfonts |
| 4.4 crédits CREPE | Le modèle n'existe pas dans le projet | Créditer `pitchy` à la place |
| 5.1 table SEO | Ignore `/notes`, `/harmonie` et ses 7 sous-pages | Compléter la table |
| 3.2 « effacer les documents Firestore de l'identifiant courant » | `users/{uid}/sessions` est en `delete: if false` ; un compte supprimé dans Firestore laisse le compte Auth (e-mail) vivant | Décider si l'effacement supprime aussi le compte Auth (`deleteUser`) |
| 3.4 `expireAt` 24 mois | Le plan Spark n'offre pas les politiques TTL (fonctionnalité Blaze) | Écrire le champ quand même, et purger à la main ? |

---

## 14. Anomalies relevées en chemin (hors périmètre de la spec)

1. **Le formulaire de retours est probablement cassé en production** : la collection `feedback` n'a aucune règle Firestore (§ 1.4).
2. **Righteous n'est jamais chargée** alors que deux feuilles de style la demandent (§ 6).
3. **`vercel.json` racine vide** (§ 10).
4. **Fichiers de test livrés en production** : deux `.wav`, un CSV de sauvegarde (§ 7).
5. `teacherCodes` est lisible en entier par tout compte authentifié (§ 1.4).
