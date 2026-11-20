// ─── Profils de segmentation de l'Accordeur (source unique) ────────────────────
// Partagés par AccordeurPage.jsx et par la page « Accordeur accompagné ». Mêmes clés
// localStorage (`acc_*`) : un réglage fait d'un côté se retrouve de l'autre.
//
// Défauts calibrés (méthode : centre de l'intersection des plages valides sur toutes
// les sessions de calibration). Régénérer via `npm run calibrate:defaults`, puis coller
// le bloc dans PROFILS_DEFAUT. Override possible via localStorage `acc_profiles_custom`
// (page calibration interne).
// Legato : valeurs validées sur iPad avec accompagnement à 1 m (2026-11-20).

export interface ReglagesSegmentation {
  clarityThreshold: number
  gateLevel: number
  silenceDurationMs: number
  noteJumpCents: number
  minNoteDurationMs: number
  reattackDropRatio: number
}

export type NomProfil = 'legato' | 'detache' | 'rapide'
export type Profil = NomProfil | 'custom'

export const PROFILS_DEFAUT: Record<NomProfil, ReglagesSegmentation> = {
  legato:  { clarityThreshold: 0.70, gateLevel: 0.015,  silenceDurationMs: 30,  noteJumpCents: 25, minNoteDurationMs: 60, reattackDropRatio: 0.60 },
  detache: { clarityThreshold: 0.75, gateLevel: 0.0175, silenceDurationMs: 105, noteJumpCents: 58, minNoteDurationMs: 65, reattackDropRatio: 0 },
  rapide:  { clarityThreshold: 0.70, gateLevel: 0.0275, silenceDurationMs: 105, noteJumpCents: 25, minNoteDurationMs: 80, reattackDropRatio: 0 },
}

export const LIBELLES_PROFILS: Record<NomProfil, string> = { legato: 'Phrasé legato', detache: 'Détaché', rapide: 'Articulé rapide' }
export const NOMS_PROFILS: readonly NomProfil[] = ['legato', 'detache', 'rapide']

/** Valeurs de repli d'un réglage personnalisé jamais enregistré. */
export const REGLAGES_PAR_DEFAUT: ReglagesSegmentation = { clarityThreshold: 0.82, gateLevel: 0.02, silenceDurationMs: 40, noteJumpCents: 30, minNoteDurationMs: 100, reattackDropRatio: 0 }

export const CLES_SEGMENTATION: Record<keyof ReglagesSegmentation, string> = {
  silenceDurationMs: 'acc_silence', noteJumpCents: 'acc_noteJump', clarityThreshold: 'acc_clarity',
  gateLevel: 'acc_gate', minNoteDurationMs: 'acc_minDuration', reattackDropRatio: 'acc_reattack',
}

function lire(cle: string): string | null {
  try { return localStorage.getItem(cle) } catch { return null }
}
function ecrire(cle: string, v: string): void {
  try { localStorage.setItem(cle, v) } catch { /* stockage indisponible */ }
}

/** Profils effectifs : défauts + éventuel override de la page de calibration (relu à chaque appel). */
export function profilsEffectifs(): Record<NomProfil, ReglagesSegmentation> {
  let o: Partial<Record<NomProfil, Partial<ReglagesSegmentation>>> | null = null
  try {
    const raw = lire('acc_profiles_custom')
    const j = raw ? JSON.parse(raw) : null
    if (j?.legato && j?.detache && j?.rapide) o = j
  } catch { /* override illisible : défauts */ }
  return {
    legato: { ...PROFILS_DEFAUT.legato, ...(o?.legato ?? {}) },
    detache: { ...PROFILS_DEFAUT.detache, ...(o?.detache ?? {}) },
    rapide: { ...PROFILS_DEFAUT.rapide, ...(o?.rapide ?? {}) },
  }
}

export function supprimerOverrideProfils(): void {
  try { localStorage.removeItem('acc_profiles_custom') } catch { /* stockage indisponible */ }
}

/** Profil mémorisé ; sans choix mais avec d'anciens réglages libres, on reste en « custom » (comme l'Accordeur). */
export function lireProfil(parDefaut: NomProfil): Profil {
  const p = lire('acc_profile')
  if (p === 'legato' || p === 'detache' || p === 'rapide' || p === 'custom') return p
  const ancien = ['acc_clarity', 'acc_gate', 'acc_silence', 'acc_noteJump'].some(k => lire(k) !== null)
  return ancien ? 'custom' : parDefaut
}

export function lireReglagesLibres(): ReglagesSegmentation {
  const r = { ...REGLAGES_PAR_DEFAUT }
  for (const k of Object.keys(CLES_SEGMENTATION) as (keyof ReglagesSegmentation)[]) {
    const v = parseFloat(lire(CLES_SEGMENTATION[k]) ?? '')
    if (Number.isFinite(v)) r[k] = v
  }
  return r
}

export function reglagesDuProfil(p: Profil): ReglagesSegmentation {
  return p === 'custom' ? lireReglagesLibres() : profilsEffectifs()[p]
}

export function memoriserSegmentation(p: Profil, r: ReglagesSegmentation): void {
  ecrire('acc_profile', p)
  for (const k of Object.keys(CLES_SEGMENTATION) as (keyof ReglagesSegmentation)[]) ecrire(CLES_SEGMENTATION[k], String(r[k]))
}
