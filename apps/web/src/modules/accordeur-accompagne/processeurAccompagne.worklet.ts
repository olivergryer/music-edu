// ─── AudioWorklet « processeur-accompagne » (spec §4) ─────────────────────────
// Cinq tâches : synthétise le playback par synthèse additive (phase exacte de chaque
// partiel), reçoit le micro, calcule le stroboscope, envoie au Worker les blocs micro
// et sortie datés par currentFrame, envoie l'état du stroboscope au fil principal.
//
// Ce fichier est chargé par audioWorklet.addModule via un import `?worker&url`
// (Vite le bundle avec ses imports ; un simple `?url` ne transpilerait pas le .ts).

import { genererChirp } from './dsp/chirp.ts'
import { appliquerReglage, remplacerAPartirDe } from './dsp/reglages.ts'
import { contributionPartiel, enveloppe, signalClic, voixSonnantes, DUREE_CLIC_S } from './dsp/synthese.ts'
import { Strobe } from './dsp/strobe.ts'
import type { EvenementAccord, Planning } from './dsp/types.ts'
import type { DepuisWorklet, VersWorklet, WorkerVersWorklet, WorkletVersWorker } from './protocole.ts'

declare const currentFrame: number
declare const sampleRate: number
declare const currentTime: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(nom: string, ctor: new () => AudioWorkletProcessor): void

const TAILLE_ENVOI = 4096          // échantillons accumulés avant envoi au Worker
const PERIODE_STROBE_S = 1 / 60

class ProcesseurAccompagne extends AudioWorkletProcessor {
  private planning: Planning | null = null
  private portWorker: MessagePort | null = null
  private actif = false
  private frameDepart = 0
  private frameAttendue = -1
  private coupures = 0
  private idx = 0                        // événement courant (progression monotone)
  private idxClic = 0
  private gainLisse = -1
  private chirp = genererChirp(sampleRate)
  private strobe = new Strobe(sampleRate)
  private evStrobe: EvenementAccord | null = null
  private dernierStrobe = 0
  private accMicro = new Float32Array(TAILLE_ENVOI)
  private accSortie = new Float32Array(TAILLE_ENVOI)
  private nAcc = 0
  private frameAcc = 0
  private sommeMic2 = 0
  private nMic2 = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<VersWorklet>) => {
      const m = e.data
      if (m.type === 'port') {
        this.portWorker = m.port
        m.port.onmessage = (ev: MessageEvent<WorkerVersWorklet>) => {
          if (ev.data.type === 'presence') this.strobe.definirPresence(ev.data.present)
        }
      } else if (m.type === 'planning') { this.planning = m.planning; this.idx = 0; this.idxClic = 0; this.gainLisse = -1 }
      else if (m.type === 'reglage' && this.planning) {
        // l'instant exact (horloge du planning) est transmis au Worker : les deux plannings restent identiques
        const t = this.frameDepart >= 0 && this.frameAttendue >= 0 ? (this.frameAttendue - this.frameDepart) / sampleRate : 0
        this.planning = appliquerReglage(this.planning, m.entree, m.role, m.reglage, t)
        this.repositionner(t)
        const a: WorkletVersWorker = { type: 'reglage', t, entree: m.entree, role: m.role, reglage: m.reglage }
        this.portWorker?.postMessage(a)
      } else if (m.type === 'futur' && this.planning) {
        this.planning = remplacerAPartirDe(this.planning, m.planning, m.tCoupure)
        this.repositionner(this.frameDepart >= 0 && this.frameAttendue >= 0 ? (this.frameAttendue - this.frameDepart) / sampleRate : 0)
        const a: WorkletVersWorker = { type: 'futur', planning: m.planning, tCoupure: m.tCoupure }
        this.portWorker?.postMessage(a)
      } else if (m.type === 'gain' && this.planning) {
        this.planning = { ...this.planning, gain: m.gain }
        const a: WorkletVersWorker = { type: 'gain', gain: m.gain }
        this.portWorker?.postMessage(a)
      }
      else if (m.type === 'demarrer') { this.actif = true; this.frameDepart = -1; this.frameAttendue = -1; this.idx = 0; this.idxClic = 0; this.gainLisse = -1; this.coupures = 0; this.nAcc = 0 }
      else if (m.type === 'arreter') {
        this.envoyer()
        this.actif = false
        const fini: DepuisWorklet = { type: 'fini' }
        this.port.postMessage(fini)
      }
    }
  }

  /** Après modification du planning : le premier événement non terminé à l'instant t. */
  private repositionner(t: number): void {
    const ev = this.planning?.evenements ?? []
    let i = 0
    while (i < ev.length && t >= ev[i].tFin) i++
    this.idx = i
    this.evStrobe = null
  }

  private envoyer(): void {
    if (!this.portWorker || this.nAcc === 0) return
    const mic = this.accMicro.slice(0, this.nAcc), sortie = this.accSortie.slice(0, this.nAcc)
    const a: WorkletVersWorker = { type: 'micro', frame0: this.frameAcc, donnees: mic }
    const b: WorkletVersWorker = { type: 'sortie', frame0: this.frameAcc, donnees: sortie }
    this.portWorker.postMessage(a, [mic.buffer])
    this.portWorker.postMessage(b, [sortie.buffer])
    this.nAcc = 0
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const sortie = outputs[0]
    const entree = inputs[0]?.[0]
    const n = sortie[0].length
    if (!this.actif || !this.planning) { for (const c of sortie) c.fill(0); return true }
    if (this.frameDepart < 0) this.frameDepart = currentFrame
    if (this.frameAttendue >= 0 && currentFrame !== this.frameAttendue) this.coupures++
    this.frameAttendue = currentFrame + n

    const fs = sampleRate
    const ev = this.planning.evenements
    const clics = this.planning.clics ?? []
    const gainCible = this.planning.gain
    if (this.gainLisse < 0) this.gainLisse = gainCible
    for (let i = 0; i < n; i++) {
      this.gainLisse += (gainCible - this.gainLisse) * 0.002        // ~10 ms : pas de clic sur un changement de volume
      const gain = this.gainLisse
      const k = currentFrame + i - this.frameDepart
      const t = k / fs
      let s = 0
      if (k < this.chirp.length) s = this.chirp[k]
      while (this.idxClic < clics.length && t >= clics[this.idxClic].t + DUREE_CLIC_S) this.idxClic++
      if (this.idxClic < clics.length && t >= clics[this.idxClic].t) s += signalClic(t - clics[this.idxClic].t, clics[this.idxClic].accent)
      while (this.idx < ev.length && t >= ev[this.idx].tFin) this.idx++
      const e = this.idx < ev.length ? ev[this.idx] : null
      if (e && t >= e.tDebut) {
        const env = enveloppe(t, e)
        const tau = t - e.tDebut
        let acc = 0
        for (const v of e.voix) for (const p of v.partiels) acc += contributionPartiel(p, tau, e.glissS)
        s += gain * env * acc
        if (e !== this.evStrobe) { this.evStrobe = e; this.strobe.definirVoix(voixSonnantes(e).map(v => v.freqHz)) }
      }
      for (const c of sortie) c[i] = s
      if (this.nAcc === 0 && i === 0) this.frameAcc = currentFrame
      const x = entree ? entree[i] : 0
      this.accMicro[this.nAcc] = x
      this.accSortie[this.nAcc] = s
      this.nAcc++
      this.sommeMic2 += x * x; this.nMic2++
    }
    if (entree) this.strobe.traiter(entree)
    if (this.nAcc >= TAILLE_ENVOI) this.envoyer()

    const tc = (currentFrame - this.frameDepart) / fs
    if (tc - this.dernierStrobe >= PERIODE_STROBE_S) {
      this.dernierStrobe = tc
      const msg: DepuisWorklet = { type: 'strobe', etats: this.strobe.etats(), coupures: this.coupures, rmsMicro: Math.sqrt(this.sommeMic2 / Math.max(1, this.nMic2)), t: tc, tCtx: currentTime }
      this.sommeMic2 = 0; this.nMic2 = 0
      this.port.postMessage(msg)
    }
    return true
  }
}

registerProcessor('processeur-accompagne', ProcesseurAccompagne as unknown as new () => AudioWorkletProcessor)
