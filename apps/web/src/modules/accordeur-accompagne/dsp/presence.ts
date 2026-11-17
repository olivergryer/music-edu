// ─── Présence à l'unisson et aux multiples exactement justes (spec §6.6) ──────
// Quand toutes les paires sont non résolues, le modèle ne distingue plus l'élève du
// playback. On apprend le niveau au micro de chaque partiel du playback pendant les
// phases sans élève ; l'élève est présent si ce niveau s'en écarte.

export class NiveauPlaybackAppris {
  private niveaux = new Map<string, number>()   // clé = fréquence arrondie au 0,1 Hz
  private alpha: number
  constructor(alpha = 0.2) { this.alpha = alpha }

  private cle(f: number) { return f.toFixed(1) }

  /** À appeler pendant les phases sans élève. `amps[j]` = |Ĉ_j| du partiel de fréquence `freqs[j]`. */
  apprendre(freqs: number[], amps: number[]): void {
    freqs.forEach((f, j) => {
      const k = this.cle(f)
      const prev = this.niveaux.get(k)
      this.niveaux.set(k, prev === undefined ? amps[j] : prev + this.alpha * (amps[j] - prev))
    })
  }

  /** Écarts en dB entre niveau mesuré et niveau appris (NaN si rien d'appris). */
  ecartsDb(freqs: number[], amps: number[]): number[] {
    return freqs.map((f, j) => {
      const ref = this.niveaux.get(this.cle(f))
      return ref && ref > 0 && amps[j] > 0 ? 20 * Math.log10(amps[j] / ref) : NaN
    })
  }

  /** Présent si |écart| > seuil sur au moins `nMin` partiels. */
  present(freqs: number[], amps: number[], seuilDb = 1.5, nMin = 2): boolean {
    return this.ecartsDb(freqs, amps).filter(e => Number.isFinite(e) && Math.abs(e) > seuilDb).length >= nMin
  }

  oublier(): void { this.niveaux.clear() }
}

/** Détection d'attaque large bande : saut d'énergie entre deux trames successives. */
export function attaqueLargeBande(rmsPrecedent: number, rmsCourant: number, facteur = 2): boolean {
  return rmsPrecedent > 0 ? rmsCourant / rmsPrecedent > facteur : rmsCourant > 0
}

/**
 * Cas dégénéré : parmi les candidats, celui dont les harmoniques k·f tombent (à ±0,5 Hz)
 * sur les partiels du playback qui dépassent le plus leur niveau appris (en dB).
 */
export function choisirCandidatDegenere(cands: number[], freqsPartiels: number[], ecartsDb: number[]): number | null {
  let meilleur: number | null = null, score = 0
  for (const f of cands) {
    let s = 0
    for (let k = 1; k * f < 6000; k++) {
      freqsPartiels.forEach((fp, j) => {
        if (Math.abs(fp - k * f) < 0.5 && Number.isFinite(ecartsDb[j])) s += Math.abs(ecartsDb[j])
      })
    }
    if (s > score) { score = s; meilleur = f }
  }
  return meilleur
}
