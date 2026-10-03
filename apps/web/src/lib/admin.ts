// ─── Comptes administrateurs ─────────────────────────────────────────────────
//
// La liste est écrite en dur, ici ET dans `firestore.rules`. C'est volontaire.
//
// La solution « naturelle » — un champ `role: 'admin'` dans `users/{uid}` —
// serait une faille : la règle d'écriture est `allow write: if request.auth.uid
// == uid`, donc n'importe quel élève pourrait éditer son propre document, s'y
// déclarer admin, et lire les données de tous les autres. Un identifiant en dur
// ne dépend d'aucune donnée modifiable par un utilisateur.
//
// ⚠ Cette constante ne protège RIEN à elle seule : elle ne sert qu'à afficher
// ou masquer l'interface. La protection réelle est dans `firestore.rules`, qui
// seule décide de ce que le serveur accepte de renvoyer. Toute modification ici
// doit être répercutée là-bas, puis déployée.

/** UID des comptes administrateurs. Doit rester synchronisé avec firestore.rules. */
export const ADMIN_UIDS: readonly string[] = [
  '9GDHSCG2zdOfaPZgqZiE4nqq4bD3', // Matthieu GAILLARD — compte prof, code TSXV-54
]

export function estAdmin(uid: string | null | undefined): boolean {
  return !!uid && ADMIN_UIDS.includes(uid)
}

/**
 * Préfixe des comptes créés par le protocole de test (`test-protocol/link-prof.ts`).
 * Ils n'ont pas de compte d'authentification : seulement un document Firestore.
 */
export const PREFIXE_COMPTE_TEST = 'test-protocol-'

export function estCompteTest(uid: string): boolean {
  return uid.startsWith(PREFIXE_COMPTE_TEST)
}
