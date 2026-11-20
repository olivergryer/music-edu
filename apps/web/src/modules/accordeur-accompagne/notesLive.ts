// ─── Suivi des notes en direct à partir des trames d'analyse (mode Live) ──────────────
// Les valeurs sont PROVISOIRES : à l'arrêt, la passe finale du moteur les remplace.

import type { TrameAnalyse } from './dsp/types.ts'
import type { NoteBrute } from './annotation.ts'

export const DUREE_MIN_NOTE_S = 0.1
export const SAUT_NOTE_CENTS = 60
export const SILENCE_FIN_NOTE_S = 0.1

export interface NoteEnCours extends NoteBrute { ouverte: boolean }

const mediane = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

export interface OptionsSuivi { dureeMinS: number; silenceFinS: number; sautCents: number }

export class SuiviNotes {
  readonly notes: NoteEnCours[] = []
  private o: OptionsSuivi = { dureeMinS: DUREE_MIN_NOTE_S, silenceFinS: SILENCE_FIN_NOTE_S, sautCents: SAUT_NOTE_CENTS }
  regler(o: OptionsSuivi): void { this.o = o }
  private courante: { note: NoteEnCours; hz: number[]; dernierT: number } | null = null

  /** Intègre une trame ; renvoie la note touchée (ouverte ou tout juste fermée), sinon null. */
  ajouter(t: TrameAnalyse): NoteEnCours | null {
    const c = this.courante
    if (t.presence && t.f0Hz) {
      if (c && Math.abs(1200 * Math.log2(t.f0Hz / mediane(c.hz.slice(-5)))) > this.o.sautCents) this.fermer()
      if (!this.courante) {
        const note: NoteEnCours = { tOn: t.t, tOff: t.t, f0Hz: t.f0Hz, sigmaCents: t.sigmaCents, ouverte: true }
        this.courante = { note, hz: [], dernierT: t.t }
      }
      const cc = this.courante!
      cc.hz.push(t.f0Hz); cc.dernierT = t.t
      cc.note.tOff = t.t
      cc.note.f0Hz = mediane(cc.hz.slice(-8))
      cc.note.sigmaCents = t.sigmaCents
      if (t.t - cc.note.tOn >= this.o.dureeMinS && !this.notes.includes(cc.note)) this.notes.push(cc.note)
      return this.notes.includes(cc.note) ? cc.note : null
    }
    if (c && t.t - c.dernierT >= this.o.silenceFinS) return this.fermer()
    return null
  }

  private fermer(): NoteEnCours | null {
    const c = this.courante
    this.courante = null
    if (!c) return null
    c.note.ouverte = false
    return this.notes.includes(c.note) ? c.note : null
  }

  /** Note en cours (ouverte) si elle a déjà la durée minimale. */
  get enCours(): NoteEnCours | null {
    return this.courante && this.notes.includes(this.courante.note) ? this.courante.note : null
  }

  reinitialiser(): void { this.notes.length = 0; this.courante = null }
}
