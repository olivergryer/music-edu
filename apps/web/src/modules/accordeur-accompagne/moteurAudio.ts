// ─── Couche audio isolée (spec §4) ────────────────────────────────────────────
// Interface `MoteurAudioAccompagne` : démarrer, arrêter, s'abonner. Une implémentation
// native (Capacitor) pourra remplacer `MoteurWeb` sans toucher à l'analyse ni aux pages.

import { construirePlanning, type OptionsPlanning } from './dsp/synthese.ts'
import type { EtatStrobe, NoteFinale, Planning, TrameAnalyse } from './dsp/types.ts'
import type { DepuisWorker, DepuisWorklet, ModeAffichage, VersWorker, VersWorklet } from './protocole.ts'
// `?worker&url` : bundle le worklet avec ses imports (un `?url` d'un .ts ne le transpilerait pas)
import urlWorklet from './processeurAccompagne.worklet.ts?worker&url'

export type VarianteEcho = 'desactivee' | 'activee' | 'all'
export type SessionAudioIOS = 'defaut' | 'play-and-record'

export type OptionsSession = {
  planning: Omit<OptionsPlanning, 'sampleRate'>
  mode: ModeAffichage
  echo: VarianteEcho
  sessionIOS: SessionAudioIOS
  analyse: boolean            // false : étape 0, on enregistre seulement
  diapason: number
}

export type Resultat = {
  planning: Planning; sampleRate: number
  notes: NoteFinale[]; trames: TrameAnalyse[]
  micro: Float32Array; sortie: Float32Array
  tempsCalculMs: number[]; latenceMs: number | null; coupures: number
  infoAudio: Record<string, string>
}

export type Abonnes = {
  trame?: (t: TrameAnalyse, msCalcul: number) => void
  strobe?: (etats: EtatStrobe[], rmsMicro: number, coupures: number) => void
  latence?: (ms: number, qualite: number) => void
  progression?: (texte: string) => void
  erreur?: (message: string) => void
}

export interface MoteurAudioAccompagne {
  demarrer(o: OptionsSession, abonnes: Abonnes): Promise<void>
  arreter(): Promise<Resultat>
  enCours(): boolean
}

export class MoteurWeb implements MoteurAudioAccompagne {
  private ctx: AudioContext | null = null
  private flux: MediaStream | null = null
  private noeud: AudioWorkletNode | null = null
  private worker: Worker | null = null
  private planning: Planning | null = null
  private latenceMs: number | null = null
  private coupures = 0
  private infoAudio: Record<string, string> = {}
  private attenteFin: ((r: Resultat) => void) | null = null
  private rejetFin: ((e: Error) => void) | null = null

  enCours(): boolean { return this.ctx !== null }

  async demarrer(o: OptionsSession, ab: Abonnes): Promise<void> {
    if (this.ctx) throw new Error('Session déjà en cours')
    this.latenceMs = null; this.coupures = 0
    // iOS : session audio (WebKit) — à documenter à l'étape 0
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    this.infoAudio['audioSession.type avant'] = nav.audioSession?.type ?? 'non disponible'
    if (o.sessionIOS === 'play-and-record' && nav.audioSession) nav.audioSession.type = 'play-and-record'

    // micro : aucune correction du navigateur par défaut (comme l'Accordeur existant)
    const echo = o.echo === 'all' ? 'all' : o.echo === 'activee'
    const audio: MediaTrackConstraints = { echoCancellation: echo as unknown as boolean, noiseSuppression: false, autoGainControl: false }
    this.flux = await navigator.mediaDevices.getUserMedia({ audio })
    const reglages = this.flux.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { echoCancellation?: unknown }
    this.infoAudio['echoCancellation obtenu'] = String(reglages?.echoCancellation)
    this.infoAudio['étiquette du micro'] = this.flux.getAudioTracks()[0]?.label ?? ''

    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx = ctx
    await ctx.resume()
    this.infoAudio['sampleRate'] = String(ctx.sampleRate)
    this.infoAudio['baseLatency'] = String(ctx.baseLatency)
    this.infoAudio['outputLatency'] = String((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 'n/a')
    this.infoAudio['audioSession.type après'] = nav.audioSession?.type ?? 'non disponible'

    const planning = construirePlanning({ ...o.planning, sampleRate: ctx.sampleRate, tDebut: 0.3 })
    this.planning = planning

    await ctx.audioWorklet.addModule(urlWorklet)
    const noeud = new AudioWorkletNode(ctx, 'processeur-accompagne', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
    this.noeud = noeud
    const source = ctx.createMediaStreamSource(this.flux)
    source.connect(noeud); noeud.connect(ctx.destination)

    const worker = new Worker(new URL('./analyseAccompagne.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    const canal = new MessageChannel()
    worker.onmessage = (e: MessageEvent<DepuisWorker>) => {
      const m = e.data
      if (m.type === 'trame') ab.trame?.(m.trame, m.msCalcul)
      else if (m.type === 'latence') { this.latenceMs = m.ms; ab.latence?.(m.ms, m.qualite) }
      else if (m.type === 'progression') ab.progression?.(m.texte)
      else if (m.type === 'erreur') { ab.erreur?.(m.message); this.rejetFin?.(new Error(m.message)) }
      else if (m.type === 'fini') {
        const r: Resultat = {
          planning, sampleRate: ctx.sampleRate, notes: m.notes, trames: m.trames, micro: m.micro, sortie: m.sortie,
          tempsCalculMs: m.tempsCalculMs, latenceMs: this.latenceMs, coupures: this.coupures, infoAudio: this.infoAudio,
        }
        this.attenteFin?.(r)
      }
    }
    noeud.port.onmessage = (e: MessageEvent<DepuisWorklet>) => {
      const m = e.data
      if (m.type === 'strobe') { this.coupures = m.coupures; ab.strobe?.(m.etats, m.rmsMicro, m.coupures) }
    }
    const init: VersWorker = { type: 'init', port: canal.port1, planning, fs: ctx.sampleRate, mode: o.mode, diapason: o.diapason, analyse: o.analyse }
    worker.postMessage(init, [canal.port1])
    const p1: VersWorklet = { type: 'port', port: canal.port2 }
    noeud.port.postMessage(p1, [canal.port2])
    const p2: VersWorklet = { type: 'planning', planning }
    noeud.port.postMessage(p2)
    const p3: VersWorklet = { type: 'demarrer' }
    noeud.port.postMessage(p3)
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
