# Protocole de test — Comptes utilisateurs (one-shot)

Valide le système de progression (XP / streak / rangs / trophées / compteurs par module)
sur 10 profils × 7 jours d'usage simulé, avec vraie persistence Firestore.

## Setup (une seule fois)

### 1. Générer un service account Firebase

1. https://console.firebase.google.com/ → projet Tessitura
2. ⚙️ **Project Settings** → **Service Accounts**
3. **Generate new private key** → télécharge un fichier JSON
4. Sauvegarder à `apps/web/test-protocol/service-account.json`
   (le `.gitignore` local ignore déjà ce nom de fichier — **ne PAS le commiter**)

### 2. Installer la dépendance

```bash
cd apps/web
npm install
```

`firebase-admin` est en `devDependency`.

## Lancer le protocole

```bash
cd apps/web
npm run test:protocol
```

Durée : ~30 secondes à 2 minutes selon la latence réseau Firestore.

## Consulter les résultats

Tous les rapports sont générés dans **`docs/test-protocol/`** (à la racine du repo) :

- `PLAN.md` — vue d'ensemble : qui fait quoi quand, prédictions
- `day-1.md` ... `day-7.md` — rapport quotidien : prédit vs réel par profil
- `FINAL.md` — synthèse + matrice 10×7 + détails des échecs

## Nettoyer Firestore après la validation

```bash
npm run test:protocol -- --cleanup
```

Supprime tous les documents `users/test-protocol-*` créés pendant le run.

## Suppression complète une fois la validation terminée

Quand tu n'as plus besoin du protocole :

```bash
# 1. Nettoyer Firestore
npm run test:protocol -- --cleanup

# 2. Supprimer le dossier de test et les rapports
rm -rf apps/web/test-protocol/
rm -rf docs/test-protocol/

# 3. Retirer firebase-admin du package.json
cd apps/web
npm uninstall firebase-admin

# 4. Retirer le script test:protocol du package.json (manuellement)
```

**À CONSERVER** : `apps/web/src/hooks/progressLogic.ts` — c'est un refactor utile en prod
(sépare la logique métier de l'I/O Firebase), pas du code de test.
