// ─── Moteur du métronome (Web Audio) ──────────────────────────────────────────
//
// Planification par anticipation : une minuterie courte (25 ms) ne sert qu'à
// REMPLIR une fenêtre de 150 ms de clics datés sur l'horloge audio. La justesse
// vient de `ctx.currentTime`, jamais de la minuterie → pas de dérive, même si
// l'onglet est ralenti. Un changement de tempo ou de figure s'applique au temps
// suivant.
//
// Retour visuel : les événements sont aussi mis en file avec leur date audio, et
// une boucle rAF les restitue quand l'horloge les atteint (visuel calé sur le son).

import { FIGURES, type FigureDef } from './figures.ts'

export type GenreTick = 'appui' | 'sub'

const FENETRE = 0.15      // s planifiées à l'avance
const PAS_MINUTERIE = 25  // ms

interface Evenement { t: number; genre: GenreTick }

export class MoteurMetronome {
  bpm = 80
  figure: FigureDef = FIGURES[0]
  son = true
  onTick?: (genre: GenreTick) => void

  private ctx: AudioContext | null = null
  private sortie: GainNode | null = null
  private minuterie: number | null = null
  private raf = 0
  private prochainTemps = 0
  private file: Evenement[] = []
  private actif = false

  get enMarche() { return this.actif }

  start() {
    if (this.actif) return
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
    }
    void this.ctx.resume()
    this.sortie = this.ctx.createGain()
    this.sortie.connect(this.ctx.destination)
    this.prochainTemps = this.ctx.currentTime + 0.08
    this.actif = true
    this.planifier()
    this.boucleVisuelle()
  }

  stop() {
    this.actif = false
    if (this.minuterie !== null) window.clearTimeout(this.minuterie)
    this.minuterie = null
    cancelAnimationFrame(this.raf)
    this.file = []
    // Coupe les clics déjà planifiés dans la fenêtre d'anticipation.
    try { this.sortie?.disconnect() } catch { /* déjà déconnecté */ }
    this.sortie = null
  }

  dispose() {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }

  private planifier = () => {
    if (!this.actif || !this.ctx) return
    while (this.prochainTemps < this.ctx.currentTime + FENETRE) {
      this.planifierTemps(this.prochainTemps)
      this.prochainTemps += 60 / this.bpm
    }
    this.minuterie = window.setTimeout(this.planifier, PAS_MINUTERIE)
  }

  private planifierTemps(t: number) {
    const duree = 60 / this.bpm
    const { onsets } = this.figure
    // Appui silencieux (demi-soupir sur le temps) : signalé visuellement seulement.
    if (!onsets.includes(0)) this.file.push({ t, genre: 'appui' })
    for (const pos of onsets) {
      const date = t + pos * duree
      const genre: GenreTick = pos === 0 ? 'appui' : 'sub'
      if (this.son) this.clic(date, genre)
      this.file.push({ t: date, genre })
    }
  }

  private clic(t: number, genre: GenreTick) {
    if (!this.ctx || !this.sortie) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const appui = genre === 'appui'
    osc.type = 'triangle'
    osc.frequency.value = appui ? 1500 : 900
    const crete = appui ? 0.5 : 0.28
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(crete, t + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
    osc.connect(gain)
    gain.connect(this.sortie)
    osc.start(t)
    osc.stop(t + 0.07)
  }

  private boucleVisuelle = () => {
    if (!this.actif || !this.ctx) return
    const now = this.ctx.currentTime
    while (this.file.length && this.file[0].t <= now) {
      const e = this.file.shift()!
      this.onTick?.(e.genre)
    }
    this.raf = requestAnimationFrame(this.boucleVisuelle)
  }
}
