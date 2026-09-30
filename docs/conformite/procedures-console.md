# Procédures console — règles Firestore et URL d'action

Les tâches qui ne peuvent pas être faites depuis le dépôt.

> **État au 2026-09-30** — A : **fait**, règles déployées. B : **abandonné**, l'URL
> d'action personnalisée n'est pas retenue ; seule l'étape 1 (domaines autorisés)
> reste à faire au changement de domaine.

---

## A. Déployer les règles Firestore

### Ce qui change

Deux modifications dans `firestore.rules`, déjà écrites dans le working tree :

1. `users/{uid}/sessions/{id}` passe de `allow update, delete: if false` à `allow update: if false` + `allow delete: if request.auth.uid == uid`.
2. La collection `feedback` reçoit sa première règle : `allow create: if true`, tout le reste refusé.

### Pourquoi c'est bloquant

- Sans le point 1, le bouton « Effacer mes données » supprime le profil, la progression et l'historique, **mais laisse toutes les sessions jouées** — des centaines de documents. L'effacement serait annoncé comme complet sans l'être.
- Sans le point 2, le formulaire `/feedback` continue d'échouer en silence : Firestore refuse par défaut ce qu'aucune règle n'autorise. C'est le cas **depuis toujours**, indépendamment de ce chantier.

### Avant de déployer

Le CLI est déjà installé (v15.16.0) et connecté, projet courant `tessitura-97d58`. Vérifier :

```bash
cd /Users/matthieugaillard/Documents/Developpement/ClaudeAI/music-edu
firebase projects:list        # tessitura-97d58 doit être marqué (current)
```

⚠ **Les règles déployées peuvent avoir divergé du fichier versionné.** L'audit a montré que `feedback` n'a aucune règle ici ; si la console en contient une, c'est que quelqu'un a édité en ligne, et le déploiement l'écrasera. À vérifier **avant** :

Console → Firestore Database → onglet **Règles**. Comparer avec `firestore.rules`. Si le contenu diffère, copier la version en ligne quelque part avant de continuer.

### Déployer

```bash
cd /Users/matthieugaillard/Documents/Developpement/ClaudeAI/music-edu
firebase deploy --only firestore:rules
```

Le CLI compile les règles avant de les envoyer : une erreur de syntaxe échoue **sans rien déployer**. Sortie attendue :

```
✔  cloud.firestore: rules file firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

### Vérifier après coup

Console → Firestore Database → Règles → bouton **Simulateur de règles** (« Rules Playground »), en haut à droite.

**Test 1 — la suppression d'une session est autorisée pour son titulaire**
- Type de simulation : `delete`
- Emplacement : `/users/UID_TEST/sessions/abc123`
- Authentifié : **oui**, Fournisseur : Email/Password, UID du fournisseur : `UID_TEST`
- Attendu : **autorisé**

**Test 2 — un autre utilisateur ne peut pas supprimer**
- Même chose, mais UID `AUTRE_UID`
- Attendu : **refusé**

**Test 3 — la modification d'une session reste interdite**
- Type : `update`, même emplacement, UID `UID_TEST`
- Attendu : **refusé** (les sessions sont immuables, seule la suppression a été ouverte)

**Test 4 — le formulaire de retours passe**
- Type : `create`, emplacement `/feedback/xyz`, non authentifié
- Attendu : **autorisé**

**Test 5 — personne ne peut relire les retours**
- Type : `get`, emplacement `/feedback/xyz`, authentifié avec n'importe quel UID
- Attendu : **refusé** (la relecture se fait dans la console, qui contourne les règles)

### Test de bout en bout

Ouvrir `/feedback` sur l'aperçu, envoyer un retour, puis vérifier dans Console → Firestore que la collection `feedback` existe et contient le document.

---

## B. URL d'action de réinitialisation du mot de passe

### Le contexte

`sendPasswordResetEmail` envoie un lien vers l'**URL de gestion des actions** du projet. Par défaut, c'est une page hébergée par Firebase (`tessitura-97d58.firebaseapp.com/__/auth/action`) — **elle fonctionne**.

La page in-app `/reinitialiser` ([ResetPasswordPage.tsx](../../apps/web/src/auth/ResetPasswordPage.tsx)) existe et est complète, mais reste en sommeil tant que l'URL d'action pointe vers la page Firebase. Une tentative précédente (2026-08-16) a échoué avec un message générique : « Une erreur s'est produite lors de la modification de l'URL d'action ».

**Rien n'est cassé aujourd'hui.** Ce point devient bloquant seulement si le mail doit pointer vers `tessitura-musique.fr`.

### Étape 1 — Autoriser le domaine (à faire dans tous les cas)

Console Firebase → **Authentication** → onglet **Settings** → **Domaines autorisés** → *Ajouter un domaine* :

```
tessitura-musique.fr
```

Ne **pas** supprimer `tessitura-97d58.firebaseapp.com` : c'est le domaine de la page d'action par défaut, qui doit continuer de fonctionner.

Cette étape est nécessaire même si tu renonces à l'URL personnalisée : sans elle, la connexion depuis le nouveau domaine peut être refusée.

### Étape 2 — Passer le modèle d'e-mail en français

Console → **Authentication** → onglet **Templates** → *Réinitialisation du mot de passe* → icône crayon.

Le sélecteur de **langue du modèle** est en haut du panneau. Le passer en **Français**. Sans ça, les élèves reçoivent un mail en anglais.

C'est indépendant du blocage ci-dessous, et ça devrait s'enregistrer sans problème.

### Étape 3 — URL d'action personnalisée, et diagnostic de l'échec

Même écran → **Personnaliser l'URL d'action** → saisir :

```
https://tessitura-musique.fr/reinitialiser
```

**Si l'enregistrement échoue à nouveau**, lire le motif réel plutôt que le message générique :

1. Ouvrir les outils de développement (F12) → onglet **Réseau**
2. Filtrer sur `identitytoolkit`
3. Cliquer sur **Enregistrer**
4. Sélectionner la requête en échec (statut 400 ou 403) → onglet **Réponse**
5. Lire le champ `error.message`

Les motifs les plus fréquents, et leur correctif :

| Message | Cause | Correctif |
|---|---|---|
| `INVALID_DOMAIN` / `UNAUTHORIZED_DOMAIN` | Le domaine n'est pas dans les domaines autorisés, ou l'ajout n'a pas encore été propagé | Refaire l'étape 1, attendre quelques minutes, recharger la console |
| `PERMISSION_DENIED` / 403 | Le compte connecté n'a pas le droit `firebaseauth.configs.update` | Se connecter avec le compte **propriétaire** du projet, pas un compte éditeur ou un autre compte Google resté actif dans le navigateur |
| `INVALID_ARGUMENT` | URL mal formée | Exiger `https://`, pas de barre oblique finale, pas de paramètre de requête |
| Erreur sur le corps du modèle | Le modèle a été personnalisé et ne contient plus `%LINK%` | Rétablir le modèle par défaut, enregistrer, puis retenter l'URL d'action |

Le cas **PERMISSION_DENIED** est le plus probable au vu du message générique : la console affiche souvent une erreur vague quand l'appel est refusé en amont. Vérifier le compte actif en haut à droite de la console, et tester en navigation privée avec le seul compte propriétaire.

### Contrainte à connaître

**L'URL d'action est unique pour tout le projet.** Un compte de test créé sur un aperçu `tessitura-git-dev-*.vercel.app` recevra un lien vers la **production**. Sans conséquence — la base Firestore est partagée dev/prod — mais déroutant en test : le mot de passe sera bien réinitialisé, depuis la page de prod.

### Si le blocage persiste

Ne pas s'acharner : la page Firebase par défaut fonctionne et reste un repli correct. Dans ce cas, seule l'étape 1 (domaines autorisés) est réellement obligatoire au changement de domaine, et `/reinitialiser` reste en sommeil sans rien casser.

Une voie de contournement existe — l'API Identity Toolkit Admin, champ `notification.sendEmail.callbackUri` sur `https://identitytoolkit.googleapis.com/admin/v2/projects/tessitura-97d58/config` — mais elle exige un jeton OAuth `cloud-platform`, donc l'installation de `gcloud` (absent de cette machine). À ne considérer que si le diagnostic F12 ne mène à rien.
