// ─── Couche audio isolée (spec §4) ────────────────────────────────────────────
// Interface `MoteurAudioAccompagne` : démarrer, arrêter, s'abonner. Une implémentation
// native (Capacitor) pourra remplacer `MoteurWeb` sans toucher à l'analyse ni aux pages.

import { construirePlanning, type OptionsPlanning } from './dsp/synthese.ts'
import type { Reglage } from './dsp/reglages.ts'
import type { EtatStrobe, NoteFinale, Planning, TrameAnalyse } from './dsp/types.ts'
import { latenceSortieS, tempsAudible } from './temps.ts'
import type { ReglagesSegmentation } from '../../profilsSegmentation.ts'
import type { NoteAncien } from './ancienMoteur.ts'
import type { ReglagesNouveau } from './reglagesNouveau.ts'
import type { DepuisWorker, DepuisWorklet, ModeAffichage, MoteurDetection, VersWorker, VersWorklet } from './protocole.ts'
// `?worker&url` : bundle le worklet avec ses imports (un `?url` d'un .ts ne le transpilerait pas)
import { REGLAGES_PAR_DEFAUT } from '../../profilsSegmentation.ts'
import urlWorklet from './processeurAccompagne.worklet.ts?worker&url'

export type VarianteEcho = 'desactivee' | 'activee' | 'all'
export type SessionAudioIOS = 'defaut' | 'play-and-record'

export type OptionsSession = {
  planning?: Omit<OptionsPlanning, 'sampleRate'>        // planning de test (accord unique)
  planningPhrase?: (sampleRate: number) => Planning    // planning de phrase entière (page de production)
  mode: ModeAffichage
  echo: VarianteEcho
  sessionIOS: SessionAudioIOS
  analyse: boolean            // false : étape 0, on enregistre seulement
  diapason: number
  latenceMemoriseeMs?: number // valeur mémorisée (`acc_latence`), utilisée pour le temps audible avant la mesure
  moteur?: MoteurDetection    // défaut : 'nouveau'
  reglagesAncien?: ReglagesSegmentation
  reglagesNouveau?: ReglagesNouveau
}

export type Resultat = {
  planning: Planning; sampleRate: number
  notes: NoteFinale[]; trames: TrameAnalyse[]
  micro: Float32Array; sortie: Float32Array
  tempsCalculMs: number[]; latenceMs: number | null; coupures: number
  infoAudio: Record<string, string>
  offsetMicro?: number        // retard de boucle (échantillons) : micro[i] ↔ planning (i − offset)/fs
  brut?: { hz: Float32Array; clarity: Float32Array; rms: Float32Array }   // ancien moteur
}

export type Abonnes = {
  trame?: (t: TrameAnalyse, msCalcul: number) => void
  strobe?: (etats: EtatStrobe[], rmsMicro: number, coupures: number) => void
  latence?: (ms: number, qualite: number) => void
  progression?: (texte: string) => void
  erreur?: (message: string) => void
  notesAncien?: (notes: NoteAncien[]) => void
}

export interface MoteurAudioAccompagne {
  demarrer(o: OptionsSession, abonnes: Abonnes): Promise<void>
  arreter(): Promise<Resultat>
  enCours(): boolean
  /** Cents / volume / muet d'un son qui sonne : appliqué au prochain bloc, transition de 30 ms. */
  reglerSon(entree: number, role: string, reglage: Reglage): void
  /** Changement de structure : le nouveau planning prend le relais à `tCoupure` (frontière d'entrée). */
  remplacerPlanning(nouveau: Planning, tCoupure: number): void
  definirGain(gain: number): void
  /** Ancien moteur : nouveaux seuils pour le Live en cours. */
  reglerAncien(reglages: ReglagesSegmentation): void
  /** Temps du planning actuellement entendu (s), ou null avant le départ. */
  tempsAudible(): number | null
  tempsCourant(): number | null
}

export class MoteurWeb implements MoteurAudioAccompagne {
  private ctx: AudioContext | null = null
  private flux: MediaStream | null = null
  private noeud: AudioWorkletNode | null = null
  private worker: Worker | null = null
  private planning: Planning | null = null
  private latenceMs: number | null = null
  private coupures = 0
  private dernierStrobe: { t: number; tCtx: number } | null = null
  private latenceRefMs = 0
  private sansMicro = false
  private infoAudio: Record<string, string> = {}
  private attenteFin: ((r: Resultat) => void) | null = null
  private rejetFin: ((e: Error) => void) | null = null

  enCours(): boolean { return this.ctx !== null }

  async demarrer(o: OptionsSession, ab: Abonnes): Promise<void> {
    if (this.ctx) throw new Error('Session déjà en cours')
    this.latenceMs = null; this.coupures = 0; this.dernierStrobe = null; this.latenceRefMs = o.latenceMemoriseeMs ?? 0
    // iOS : session audio (WebKit) — à documenter à l'étape 0
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    this.infoAudio['audioSession.type avant'] = nav.audioSession?.type ?? 'non disponible'
    if (o.sessionIOS === 'play-and-record' && nav.audioSession) nav.audioSession.type = 'play-and-record'

    // micro : aucune correction du navigateur par défaut (comme l'Accordeur existant)
    const echo = o.echo === 'all' ? 'all' : o.echo === 'activee'
    const audio: MediaTrackConstraints = { echoCancellation: echo as unknown as boolean, noiseSuppression: false, autoGainControl: false }
    this.sansMicro = false
    try {
      this.flux = await navigator.mediaDevices.getUserMedia({ audio })
    } catch (err) {
      // pas de micro : la phrase se joue quand même, sans mesure (le refus d'autorisation, lui, est remonté)
      if (!/NotFound|DevicesNotFound|Overconstrained/i.test(String((err as Error)?.name ?? err))) throw err
      this.flux = null; this.sansMicro = true
      o = { ...o, analyse: false }
      ab.erreur?.('micro-absent')
    }
    const reglages = this.flux?.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { echoCancellation?: unknown }) | undefined
    this.infoAudio['echoCancellation obtenu'] = String(reglages?.echoCancellation)
    this.infoAudio['étiquette du micro'] = this.flux?.getAudioTracks()[0]?.label ?? (this.sansMicro ? 'aucun' : '')

    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx = ctx
    await ctx.resume()
    this.infoAudio['sampleRate'] = String(ctx.sampleRate)
    this.infoAudio['baseLatency'] = String(ctx.baseLatency)
    this.infoAudio['outputLatency'] = String((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 'n/a')
    this.infoAudio['audioSession.type après'] = nav.audioSession?.type ?? 'non disponible'

    const planning = o.planningPhrase
      ? o.planningPhrase(ctx.sampleRate)
      : construirePlanning({ ...(o.planning as NonNullable<OptionsSession['planning']>), sampleRate: ctx.sampleRate, tDebut: 0.3 })
    this.planning = planning

    await ctx.audioWorklet.addModule(urlWorklet)
    const noeud = new AudioWorkletNode(ctx, 'processeur-accompagne', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
    this.noeud = noeud
    if (this.flux) ctx.createMediaStreamSource(this.flux).connect(noeud)
    noeud.connect(ctx.destination)

    const worker = new Worker(new URL('./analyseAccompagne.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    const canal = new MessageChannel()
    worker.onmessage = (e: MessageEvent<DepuisWorker>) => {
      const m = e.data
      if (m.type === 'trame') ab.trame?.(m.trame, m.msCalcul)
      else if (m.type === 'latence') { this.latenceMs = m.ms; ab.latence?.(m.ms, m.qualite) }
      else if (m.type === 'progression') ab.progression?.(m.texte)
      else if (m.type === 'notesAncien') ab.notesAncien?.(m.notes)
      else if (m.type === 'erreur') { if (this.sansMicro) return; ab.erreur?.(m.message); this.rejetFin?.(new Error(m.message)) }
      else if (m.type === 'fini') {
        const r: Resultat = {
          planning: m.planning ?? planning, sampleRate: ctx.sampleRate, notes: m.notes, trames: m.trames, micro: m.micro, sortie: m.sortie,
          tempsCalculMs: m.tempsCalculMs, latenceMs: this.latenceMs, coupures: this.coupures, infoAudio: this.infoAudio, offsetMicro: m.offsetMicro, brut: m.brut,
        }
        this.attenteFin?.(r)
      }
    }
    noeud.port.onmessage = (e: MessageEvent<DepuisWorklet>) => {
      const m = e.data
      if (m.type === 'strobe') { this.coupures = m.coupures; this.dernierStrobe = { t: m.t, tCtx: m.tCtx }; ab.strobe?.(m.etats, m.rmsMicro, m.coupures) }
    }
    const init: VersWorker = { type: 'init', port: canal.port1, planning, fs: ctx.sampleRate, mode: o.mode, diapason: o.diapason, analyse: o.analyse,
      moteur: o.moteur ?? 'nouveau', reglagesAncien: o.reglagesAncien ?? REGLAGES_PAR_DEFAUT, latenceSecoursMs: o.latenceMemoriseeMs ?? null, reglagesNouveau: o.reglagesNouveau }
    worker.postMessage(init, [canal.port1])
    const p1: VersWorklet = { type: 'port', port: canal.port2 }
    noeud.port.postMessage(p1, [canal.port2])
    const p2: VersWorklet = { type: 'planning', planning }
    noeud.port.postMessage(p2)
    const p3: VersWorklet = { type: 'demarrer' }
    noeud.port.postMessage(p3)
  }

  reglerSon(entree: number, role: string, reglage: Reglage): void {
    const m: VersWorklet = { type: 'reglage', entree, role, reglage }
    this.noeud?.port.postMessage(m)
  }

  remplacerPlanning(nouveau: Planning, tCoupure: number): void {
    this.planning = nouveau
    const m: VersWorklet = { type: 'futur', planning: nouveau, tCoupure }
    this.noeud?.port.postMessage(m)
  }

  definirGain(gain: number): void {
    const m: VersWorklet = { type: 'gain', gain }
    this.noeud?.port.postMessage(m)
  }

  reglerAncien(reglages: ReglagesSegmentation): void {
    const m: VersWorker = { type: 'reglagesAncien', reglages }
    this.worker?.postMessage(m)
  }

  tempsAudible(): number | null {
    const c = this.ctx
    if (!c || !this.dernierStrobe) return null
    const tPlanning = this.dernierStrobe.t + (c.currentTime - this.dernierStrobe.tCtx)
    const ctx = c as AudioContext & { outputLatency?: number }
    return tempsAudible(tPlanning, latenceSortieS({ outputLatency: ctx.outputLatency, baseLatency: c.baseLatency, latenceBoucleMs: this.latenceMs ?? this.latenceRefMs }))
  }

  /** Instant du planning en cours de synthèse (sans correction de latence), ou null avant le départ. */
  tempsCourant(): number | null {
    const c = this.ctx
    if (!c || !this.dernierStrobe) return null
    return this.dernierStrobe.t + (c.currentTime - this.dernierStrobe.tCtx)
  }

  async arreter(): Promise<Resultat> {
    if (!this.ctx || !this.noeud || !this.worker) throw new Error('Aucune session')
    const fin = new Promise<Resultat>((ok, ko) => { this.attenteFin = ok; this.rejetFin = ko })
    const a: VersWorklet = { type: 'arreter' }
    this.noeud.port.postMessage(a)
    // laisser le worklet vider ses derniers blocs vers le Worker avant d'arrêter
    await new Promise(r => setTimeout(r, 150))
    const b: VersWorker = { type: 'arreter' }
    this.worker.postMessage(b)
    try { return await fin } finally { await this.liberer() }
  }

  private async liberer(): Promise<void> {
    this.flux?.getTracks().forEach(t => t.stop())
    this.worker?.terminate()
    this.noeud?.disconnect()
    try { await this.ctx?.close() } catch { /* déjà fermé */ }
    this.ctx = null; this.flux = null; this.noeud = null; this.worker = null
    this.attenteFin = null; this.rejetFin = null
  }
}
