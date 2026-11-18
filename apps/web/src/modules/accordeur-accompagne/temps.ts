// ─── Temps audible, datation, mémoire de la latence (brief UI v1, § 4.4.3 et 4.4.5) ──
// Logique pure (le stockage est protégé par try/catch).

/**
 * Temps du planning actuellement ENTENDU : l'instant en cours de synthèse (`tPlanning`)
 * moins la latence de sortie. La latence de sortie est `outputLatency + baseLatency`
 * quand le navigateur les donne, sinon une part fixe de la latence de boucle mesurée.
 */
export function latenceSortieS(o: { outputLatency?: number; baseLatency?: number; latenceBoucleMs?: number }, part = 0.5): number {
  const ol = o.outputLatency
  if (typeof ol === 'number' && Number.isFinite(ol) && ol > 0) return ol + (o.baseLatency ?? 0)
  return ((o.latenceBoucleMs ?? 0) / 1000) * part
}

export function tempsAudible(tPlanning: number, latenceSortie: number): number {
  return tPlanning - latenceSortie
}

/**
 * Date d'une note de l'élève dans l'horloge du planning. Le micro de l'analyse est déjà aligné
 * sur le chirp (latence de boucle = sortie + entrée + trajet acoustique retranchée) : un élève
 * qui joue avec l'accompagnement entendu tombe donc dans la bonne mesure. Si l'on part d'un
 * temps de micro BRUT, on retranche la latence de boucle.
 */
export function tempsPlanningDeNote(tMicroBrut: number, latenceBoucleS: number): number {
  return tMicroBrut - latenceBoucleS
}

// ─── Mémoire de la latence par appareil : `acc_latence` ───────────────────────

const CLE = 'acc_latence'

/** Clé stable d'un appareil : plateforme, micro et fréquence d'échantillonnage. */
export function cleAppareil(o: { userAgent: string; micro?: string; sampleRate: number }): string {
  const ua = o.userAgent
  const plate =
    /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'autre'
  return `${plate}|${o.micro ?? ''}|${o.sampleRate}`
}

export function lireLatences(): Record<string, number> {
  try {
    const x = JSON.parse(localStorage.getItem(CLE) ?? '{}')
    return x && typeof x === 'object' ? x : {}
  } catch { return {} }
}

export function lireLatence(cle: string): number | null {
  const v = lireLatences()[cle]
  return typeof v === 'number' && v > 0 && v < 2000 ? v : null
}

export function memoriserLatence(cle: string, ms: number): void {
  if (!(ms > 0 && ms < 2000)) return
  try { localStorage.setItem(CLE, JSON.stringify({ ...lireLatences(), [cle]: Math.round(ms * 10) / 10 })) } catch { /* stockage indisponible */ }
}
