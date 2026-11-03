// ─── Carnet de gammes — qui voit l'icône du Hub (raccourci) ───────────────────
//
// Pur confort de navigation (utile depuis la PWA, où l'on ne tape pas d'URL) :
// la route /carnet/gammes reste accessible par son adresse et ne protège rien.
// Visible pour les comptes admin et les élèves rattachés au prof de la classe.

import { ADMIN_UIDS, estAdmin } from '../../lib/admin'

/** Code prof de la classe (même code que dans lib/admin.ts). */
export const CODES_PROF_CARNET: readonly string[] = ['TSXV-54']

export function peutVoirCarnet(
  uid: string | null | undefined,
  profil: { profCodes?: string[]; profIds?: string[] } | null | undefined,
): boolean {
  if (estAdmin(uid)) return true
  const codes = profil?.profCodes ?? []
  const ids = profil?.profIds ?? []
  return codes.some(c => CODES_PROF_CARNET.includes(c.trim().toUpperCase()))
    || ids.some(id => ADMIN_UIDS.includes(id))
}
