# Rapport — conformité légale et référencement

Suite de [`audit.md`](audit.md). Option retenue : **(a) adapter les textes au code réel**, puis livrer les phases 2 à 7.

Tout est dans le working tree de `dev` : **aucun commit, aucune branche, aucun push** — conformément à `CLAUDE.md`, qui prévaut sur la consigne `feat/conformite-seo` de la spec (écart n° 1 ci-dessous, validé avant reprise).

---

## 1. Modifications par phase

### Phase 2 — corrections techniques

| Fichier | Modification |
|---|---|
| `apps/web/seo/site.mjs` | **nouveau** — `SITE_URL = 'https://tessitura-musique.fr'`, source unique |
| `apps/web/src/lib/site.ts` | **nouveau** — réexporte `SITE_URL` pour le code applicatif, expose `SITE_HOST` (domaine sans protocole) |
| `src/components/PwaInstallTutorial.jsx` | `tessitura-music.vercel.app` en dur → `{SITE_HOST}` |
| `index.html` | icône `/icone.png` (fichier inexistant) → `/icon-192x192.png` ; 3 balises Google Fonts supprimées ; 2 `@font-face` locaux + 2 `preload` ajoutés |
| `public/fonts/` | **nouveau** — `inter-latin-var.woff2` (48 Ko), `righteous-latin-400.woff2` (12,7 Ko), `OFL-Inter.txt`, `OFL-Righteous.txt` |
| `public/manifest.json` | `purpose: "any maskable"` → `"any"` ; clé `permissions` (hors standard) supprimée ; `lang`, `scope`, `id` ajoutés |
| `public/manifest.dev.json` | mêmes corrections — il portait les mêmes défauts |
| `public/favicon.svg` | **supprimé** (référencé nulle part) |
| `public/formules-rythme-template_backup.csv` | **supprimé** — orphelin, et il contenait une URL `vercel.app` qui faisait échouer le critère 2 |
| `public/sw.js` | caches `v4` → `v5` ; polices précachées ; branche Google Fonts remplacée par une branche same-origin `/fonts/` |
| `vite.config.js` | la substitution du titre en build `dev` visait la chaîne fixe `<title>Tessitura</title>`, que le bloc SEO remplace → passée en expression régulière |

Aucun fichier `icone.png` n'existait : la balise pointait dans le vide depuis le début.

### Phase 3 — données personnelles

| Fichier | Modification |
|---|---|
| `src/lib/donneesPersonnelles.ts` | **nouveau** — `dateExpiration()`, `effacerMesDonnees()`, `effacerStockageLocal()` |
| `src/pages/legal/BoutonEffacerMesDonnees.tsx` | **nouveau** — confirmation en deux temps, langage enfant |
| `src/AccordeurPage.jsx` | mention micro ajoutée au-dessus des commandes de démarrage (bloc statique, aucune logique touchée) |
| `src/hooks/useProgressFirebase.ts` | `expireAt` joint au `setDoc` existant de `progress/data` |
| `src/auth/RegisterPage.tsx` | `expireAt` joint au `setDoc` existant de `users/{uid}` |
| `src/pages/DashboardEleve.tsx` | `expireAt` joint aux deux `updateDoc` existants de `users/{uid}` |
| `src/hooks/progressLogic.ts` | `mergeWithDefaults` retire `expireAt` à la lecture |
| `firestore.rules` | `delete` autorisé sur `sessions` ; règle créée pour `feedback` |

Aucune écriture Firestore supplémentaire : `expireAt` accompagne des écritures qui existaient déjà.

Le retrait dans `mergeWithDefaults` n'est pas cosmétique : le `...d` de cette fonction aurait fait entrer `expireAt` dans l'état de progression, d'où il serait ressorti à l'écriture suivante — et, chez un invité, jusque dans le `localStorage`.

### Phase 4 — pages légales

| Fichier | Rôle |
|---|---|
| `src/pages/legal/PageLegale.tsx` | gabarit commun : `Section`, `P`, `Liste`, `Tableau`, `LienContact`, `DerniereMiseAJour` |
| `src/pages/legal/MentionsLegalesPage.tsx` | `/mentions-legales` |
| `src/pages/legal/ConfidentialitePage.tsx` | `/confidentialite` — tableau des données, identifiant + bouton Copier, bouton d'effacement |
| `src/pages/legal/CreditsPage.tsx` | `/credits` |
| `src/App.jsx` | 3 routes, en `lazy` comme le reste |
| `src/HubPage.jsx` | pied de page : phrase de description + 3 liens |
| `scripts/generate-notices.mjs` | **nouveau** — produit `dist/THIRD_PARTY_NOTICES.txt` (123 paquets) |
| `src/globals.d.ts` | **nouveau** — déclare `__BUILD_DATE__` / `__APP_VERSION__`, jusque-là utilisés seulement depuis du `.jsx` non typé |

L'app disposant déjà de React Router, les trois pages sont de vraies routes. Rien n'a été ajouté dans les écrans d'exercice.

### Phase 5 — référencement

| Fichier | Rôle |
|---|---|
| `seo/routes.mjs` | **nouveau** — 9 pages indexables |
| `scripts/seo-build.mjs` | **nouveau** — écrit un HTML par page, le JSON-LD sur `/`, et `sitemap.xml` |
| `index.html` | bloc `<!--SEO:START/END-->` avec les valeurs de `/` |
| `public/robots.txt` | **nouveau** |
| `public/og/README.md` | **nouveau** — format attendu pour l'image à fournir |
| `vercel.json` (apps/web) | `cleanUrls` et `trailingSlash` ajoutés ; réécriture SPA conservée |
| `package.json` | `build` = `vite build && node scripts/seo-build.mjs && node scripts/generate-notices.mjs` |

---

## 2. Règles Firestore — diff et faiblesses

```diff
       match /sessions/{sessionId} {
         allow create: if request.auth.uid == uid && request.resource.data.schemaVersion is int;
-        allow update, delete: if false;
+        allow update: if false;
+        allow delete: if request.auth.uid == uid;
       }

+    match /feedback/{id} {
+      allow create: if true;
+      allow read, update, delete: if false;
+    }
```

Sur `users/{uid}`, `progress` et `history`, aucun changement n'était nécessaire : leur `allow write` couvrait déjà `delete`.

**Faiblesses relevées, volontairement NON corrigées :**

1. **`allow write` non décomposé** sur `users/{uid}`, `progress/{doc}` et `history/{session}`. Un `write` global autorise création, modification et suppression sans distinction. Ça tombe bien ici, mais c'est un effet de bord, pas une intention.
2. **`teacherCodes` est lisible en entier** par tout compte authentifié : `allow read: if request.auth != null`, sans contrainte sur le document. N'importe quel élève peut énumérer la collection et lire le `displayName` de tous les professeurs. Restreindre supposerait de revoir le mécanisme de rattachement — hors périmètre.
3. **`request.auth.uid == uid` sans test de nullité préalable** sur `users/{uid}`. Fonctionne parce qu'un `null.uid` est évalué comme faux, mais le reste du fichier écrit `request.auth != null && …`.
4. **`feedback` : `allow create: if true`.** La page est publique et un invité doit pouvoir signaler un bug, mais rien ne limite le volume : la collection est ouverte à l'écriture par n'importe qui. Un App Check ou une limite de taux serait la réponse, hors périmètre ici.

✅ **Règles déployées le 2026-09-30** sur `tessitura-97d58`.

---

## 3. `[[À COMPLÉTER]]` — tous comblés

| Manque | Valeur retenue | Source |
|---|---|---|
| Licence de la banque de sons MusyngKite | **CC BY-SA 3.0** | README de `gleitz/midi-js-soundfonts`, qui indique la licence de chaque soundfont rendue |
| Téléphone de l'hébergeur | « non publié par l'hébergeur » | Vercel n'en diffuse aucun (pages Contact et Legal vérifiées) |
| Année du © | Année du dernier déploiement, calculée | Décision : `__BUILD_DATE__`, comme le pied de page du Hub — deux années différentes sur le même site se remarqueraient |
| Base légale | **Art. 6.1.b** (exécution du service) + **art. 8** (accord parental sous 15 ans) | Décision |
| Région Firestore | **`eur3`** (multi-région Europe : Belgique + Pays-Bas) | Console Firebase |
| Origine des échantillons R2 | University of Iowa Electronic Music Studios | Confirmée par le propriétaire (2026-09-30) |

Le nom de famille n'a jamais été un manque : il figurait déjà dans le pied de page du Hub.

**Conséquence de `eur3` sur le texte** : la section « Transferts hors de l'Union européenne » disait que tout partait aux États-Unis. C'est faux — la base est en Europe. Elle distingue désormais les **données applicatives** (comptes, progression, historique : UE) des **données techniques** (IP, journaux de serveur : possiblement hors UE, encadrées par le Data Privacy Framework).

---

## 4. Écarts par rapport à la spec, et pourquoi

1. **Git.** Pas de branche `feat/conformite-seo`, pas de commit par phase. `CLAUDE.md` l'interdit explicitement et vous gérez git vous-même. Arbitré avec vous avant reprise.

2. **`SITE_URL` vit dans `seo/`, pas dans `src/`.** Seul le build a besoin d'une URL absolue (canonique, Open Graph, sitemap) ; toutes les URL internes de l'app sont relatives. Placer la constante côté Node évite un pont ESM/TypeScript. `src/lib/site.ts` la réexporte pour l'unique usage applicatif.

3. **Une seule URL en dur existait**, et l'audit l'avait ratée : `tessitura-music.vercel.app` dans `PwaInstallTutorial.jsx:119`. Ma recherche portait sur `https://`, or la chaîne est du texte affiché, sans protocole. C'est le critère 2 sur `dist/` qui l'a fait apparaître. Corrigée.

4. **Le sous-ensemble `latin` suffit** — la spec s'en inquiétait implicitement : il couvre `Œ`/`œ` (U+0152-0153) et l'apostrophe typographique (U+2019). Aucun besoin de `latin-ext`. Inter est pris en version **variable** : une seule requête de 48 Ko couvre les graisses 400 à 900, là où la spec envisageait un fichier par graisse.

5. **Table SEO élargie** de 7 à 9 entrées : `/notes` et `/harmonie` manquaient. Les 7 sous-activités d'Harmonie sont volontairement exclues — on ne les atteint que depuis `/harmonie` et elles partageraient toutes la même intention de recherche. `/login`, `/register`, `/feedback` et `/reinitialiser` sont exclus pour la même raison.

6. **Textes de confidentialité réécrits**, faute de quoi ils auraient été faux (voir `audit.md` § 13). Trois affirmations de la spec ont dû sauter : « Tu n'as pas besoin de donner ton nom, ton adresse e-mail », « ne collecte aucune donnée permettant d'identifier directement un enfant », et la base légale d'intérêt légitime. Le texte distingue désormais **mode invité** (rien ne sort de l'appareil) et **mode connecté** (e-mail + nom d'affichage).

7. **Base légale laissée en `[[À COMPLÉTER]]`.** L'intérêt légitime (art. 6.1.f) est difficilement tenable pour un compte nominatif d'enfant de 7 à 11 ans. La page propose l'exécution du service (6.1.b) et le consentement parental (art. 8 RGPD) — c'est un arbitrage juridique, pas une décision de développement.

8. **L'effacement supprime aussi le compte d'authentification** (`deleteUser`), ce que la spec ne demandait pas — elle ne parlait que des documents Firestore. Les laisser aurait conservé l'adresse e-mail chez Google : le droit à l'effacement n'aurait pas été honoré. Firebase exige une connexion récente pour cette suppression ; en cas de refus, les données sont tout de même effacées et l'utilisateur est invité à se reconnecter puis à recommencer.

9. **L'effacement refuse de s'exécuter hors ligne.** Les suppressions Firestore seraient mises en file d'attente dans IndexedDB, que l'étape suivante détruit : l'utilisateur croirait ses données parties alors qu'elles seraient intactes sur le serveur.

10. **`localStorage.clear()` plutôt qu'une liste de clés.** L'origine n'héberge que Tessitura, et l'audit y recense 36 clés réparties sur 12 fichiers : une liste explicite aurait vieilli au premier module suivant.

11. **Pas de lien légal dans un écran Réglages** : il n'existe aucun écran de réglages transverse. `SettingsPage.jsx` est le panneau du module Rythme. Les liens sont donc au pied du Hub uniquement, comme le prévoyait le repli de la spec.

12. **`GitHub Inc.` ajouté aux sous-traitants** — quatrième tiers non prévu, contacté pour les banques de sons d'instruments à vent.

13. **CREPE remplacé par `pitchy`** partout : le modèle n'existe pas dans le projet.

14. **La liste des bibliothèques de la page Crédits est écrite en dur** (8 lignes lisibles), la référence qui fait foi étant `THIRD_PARTY_NOTICES.txt`, généré au build avec les 123 paquets transitifs. Générer la page depuis le build aurait supposé d'écrire un fichier dans `src/` pendant le build.

15. **`vercel.json` racine (0 octet) laissé tel quel.** Modifier un fichier dont on ignore s'il est lu — la racine de déploiement est configurée côté Vercel, hors dépôt — risquait de casser le déploiement. À trancher (voir tâches manuelles).

---

## 5. Œuvres musicales

**Rien à signaler.** Les exercices ne reproduisent aucune œuvre : hauteurs et formules rythmiques sont générées par l'application. Des noms de compositeurs (Bach, Debussy…) apparaissent uniquement comme réponses de quiz dans `public/data/questions.json` — citer un nom n'engage pas le droit d'auteur.

Aucun compositeur mort après 1955 n'est concerné par un usage d'œuvre, puisqu'aucune œuvre n'est utilisée.

En revanche, **deux banques de sons** posent une question de licence, pas de droit d'auteur musical :

- les échantillons R2 : University of Iowa Electronic Music Studios, confirmé par le propriétaire — domaine public déclaré par l'université, attribution portée par la page Crédits ;
- **Musyng Kite**, en **CC BY-SA 3.0**. L'attribution est désormais portée par la page Crédits, ce qui satisfait le « BY ». Le « SA » ne mord pas tant que les fichiers ne sont ni redistribués ni modifiés : aujourd'hui ils sont chargés depuis `gleitz.github.io` à l'exécution. Il mordrait en revanche si les sons étaient réhébergés sur R2 — auquel cas la copie devrait être accompagnée de la même licence.

---

## 6. Vérifications (phase 6)

| # | Critère | Résultat |
|---|---|---|
| 1 | build, types, lint | **OK.** Build vert. `tsc --noEmit` : aucune erreur nouvelle (15 erreurs préexistantes dans `calibrationUtils.test.ts`, `rythmActivity5.ts`, `FeedbackPage.tsx`). ESLint : 143 erreurs avant comme après — aucune introduite. Les `.tsx` ne sont pas couverts par la config ESLint, qui ne cible que `**/*.{js,jsx}`. |
| 2 | `grep -r "fonts.googleapis\|fonts.gstatic\|vercel.app" dist/` | **OK, vide.** Trois occurrences trouvées au premier passage, toutes corrigées : le tutoriel PWA, le CSV de sauvegarde, et deux de mes propres commentaires qui citaient les domaines. |
| 3 | `<title>`, canonique et `og:*` par page | **OK** sur les 9 pages, vérifié par `curl` sur `vite preview`. 10 balises `og:*` par page. JSON-LD présent sur `/` seulement. |
| 4 | `sitemap.xml`, `robots.txt`, `THIRD_PARTY_NOTICES.txt` | **OK** — 200, respectivement 1047 o, 74 o et 204 Ko. |
| 5 | Righteous sans requête externe | **OK**, vérifié par capture : Righteous, Inter 900 et Inter 400 s'affichent depuis `/fonts/`, avec `Œ` et `à`. C'est une **correction** : la police n'était chargée par aucune feuille de style et l'écran de démarrage retombait silencieusement sur Inter. |
| 6 | Mode hors ligne | **Vérifié structurellement, pas en mode avion.** Les deux `woff2` sont dans `PRECACHE`, et étant désormais same-origin ils passent par `cacheDAbord(FONT_CACHE)`. Le bump `v4`→`v5` force la réinstallation. **À tester réellement sur l'aperçu Vercel.** |
| 7 | Effacement | **Non exécuté** — suppose un compte réel et des règles déployées. Voir tâches manuelles. |
| 8 | 3 pages accessibles en un geste, lisibles en sombre | **OK**, vérifié par capture des trois pages (le rendu headless est en thème sombre). Liens au pied du Hub. |
| 9 | Aucun écran d'exercice modifié | **OK.** Seul `AccordeurPage.jsx` est touché, par l'ajout d'un bloc de texte statique avant les commandes de démarrage. Aucun scoring, aucune mécanique, aucune donnée d'exercice. Les 476 tests passent. |

Sur le critère 1 : une alerte visuelle initiale sur un débordement horizontal des pages légales s'est révélée être un artefact du navigateur headless, qui borne la largeur de fenêtre et rogne la capture — la page `/feedback` préexistante est coupée à l'identique. Aucun débordement réel.

---

## 7. Note sur `THIRD_PARTY_NOTICES.txt`

Le fichier liste `@firebase/analytics` et `@firebase/ai` : ce sont des **dépendances transitives du paquet `firebase`**, présentes dans `node_modules` mais **jamais importées** par l'application (vérifié à l'audit, § 5). Leur présence dans les avis de licence ne signale aucun traçage.

---

## 8. Tâches manuelles

Reprises de la spec, corrigées et complétées de ce qui est apparu en chemin.

### Bloquant avant mise en production

Les deux premières ont leur procédure détaillée dans [`procedures-console.md`](procedures-console.md).

1. ~~**Déployer les règles Firestore**~~ — **fait le 2026-09-30.** Compilation et publication réussies sur `tessitura-97d58`. Divergence console/dépôt vérifiée au préalable : aucune. Reste à confirmer par un envoi réel depuis `/feedback`.
2. ~~**Trancher le `vercel.json` racine vide**~~ — **fait le 2026-09-30, fichier supprimé.** Vérification empirique sur la production : `/harmonie/cadences` renvoie 200, alors que le préréglage Vite de Vercel n'ajoute aucun repli SPA de lui-même. C'est donc la réécriture d'`apps/web/vercel.json` qui s'applique, et la racine de déploiement Vercel est `apps/web`. Le fichier racine (0 octet, donc JSON invalide) n'était pas lu — sinon les déploiements auraient échoué. `cleanUrls` est au bon endroit.

### Hygiène, non bloquant

**Domaines autorisés Firebase** — ajouter `tessitura-musique.fr` dans Authentication → Settings.

Contrairement à ce qu'annonçait la spec, ce n'est **pas** bloquant ici : la liste des domaines autorisés régit les redirections OAuth et les liens d'action porteurs d'un `continueUrl`. Or le projet n'utilise **que** l'e-mail/mot de passe (aucun `signInWithPopup`, `signInWithRedirect` ni fournisseur OAuth) et appelle `sendPasswordResetEmail(auth, email)` **sans** `ActionCodeSettings`. La connexion fonctionne donc depuis n'importe quelle origine.

L'ajout reste recommandé : il ne coûte rien et devient nécessaire le jour où une connexion Google ou un `continueUrl` est introduit.

### Sujet ouvert : les sons d'instruments à vent

Ils sont chargés à l'exécution depuis `gleitz.github.io`, une page GitHub Pages. Trois conséquences, aucune bloquante mais toutes réelles :

1. **Hors ligne, ils ne fonctionnent pas.** Le service worker ne met en cache que `r2.dev/samples/` et les polices ; tout autre cross-origin passe en direct. En mode avion, flûte, hautbois, clarinette, saxophone et basson sont muets.
2. **L'IP de chaque élève est adressée à GitHub (Microsoft)** — d'où sa présence dans la liste des sous-traitants.
3. **Fiabilité** : un dépôt GitHub Pages tiers peut disparaître ou changer d'arborescence sans préavis.

Les réhéberger sur le bucket R2 existant règlerait les trois points d'un coup, en joignant la licence CC BY-SA 3.0 à la copie. Ce n'est pas dans le périmètre de cette spec.

### Ensuite

4. **Créer `public/og/og-default.png`** (1200 × 630, < 300 Ko) — format détaillé dans `public/og/README.md`.
5. **Vercel → Domains** : rediriger `tessitura-music.vercel.app` vers `tessitura-musique.fr`.
6. **Politique TTL** sur `expireAt`. Le champ est écrit sur `users/{uid}` et `users/{uid}/progress/data` ; il faut une politique **par collection**. ⚠ Les politiques TTL relèvent du plan **Blaze** — en Spark, prévoir une purge manuelle annuelle, sinon la promesse de 24 mois faite dans la politique de confidentialité n'est pas tenue.
7. **Tester réellement le mode hors ligne** (critère 6) et **l'effacement** (critère 7) sur l'aperçu Vercel, avec un compte de test.
8. Vérifier sur dataprivacyframework.gov la certification de Vercel, Google, Cloudflare — **et GitHub**, ajouté à la liste.
9. Google Search Console : validation par TXT dans la zone DNS OVHcloud, puis soumission de `sitemap.xml`.
10. Tester les aperçus de liens avec l'outil de débogage de partage de Facebook (il garde l'ancienne version en cache).
11. Prévenir les bêta-testeurs du changement d'adresse (progression et PWA à réinstaller).
12. Hors code : accord écrit avec la collègue de FM ; dépôt e-Soleau à l'INPI.
