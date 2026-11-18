// ─── Web Worker « analyseAccompagne » (spec §4) ───────────────────────────────
// Reçoit les blocs micro et sortie du worklet, détecte le chirp (latence de boucle),
// lance l'analyse par trame (mode Live) ou tout à l'arrêt (mode Fin), puis la passe
// finale. Le code d'analyse est celui des tests et du script hors ligne.

import { trouverChirp } from './dsp/chirp.ts'
import { creerAnalyseurFlux, FS_MODELE, analyserEnregistrement, passeFinale, type AccesMicro } from './dsp/pipeline.ts'
import { reechantillonner } from './dsp/reechantillonnage.ts'
import { appliquerReglage, remplacerAPartirDe } from './dsp/reglages.ts'
import type { TrameAnalyse } from './dsp/types.ts'
import type { DepuisWorker, VersWorker, WorkerVersWorklet, WorkletVersWorker } from './protocole.ts'

const ctx = self as unknown as { postMessage: (m: DepuisWorker, t?: Transferable[]) => void; onmessage: ((e: MessageEvent<VersWorker>) => void) | null }

const DUREE_MAX_S = 600
const POUR_CHIRP_S = 1.2

class Tampon {
  donnees: Float32Array
  n = 0
  constructor(secondes: number, fs: number) { this.donnees = new Float32Array(Math.round(secondes * fs)) }
  ajouter(bloc: Float32Array) {
    const place = Math.min(bloc.length, this.donnees.length - this.n)
    this.donnees.set(bloc.subarray(0, place), this.n); this.n += place
  }
  vue() { return this.donnees.subarray(0, this.n) }
}

let port: MessagePort | null = null
let fs = 48000
let planning: Parameters<typeof creerAnalyseurFlux>[1] | null = null
let mode: 'live' | 'fin' = 'live'
let analyse = true
let micro: Tampon, sortie: Tampon
let offset = -1                         // échantillons : retard de boucle (chirp)
let prochainT = 0
let etape: ((t: number) => TrameAnalyse) | null = null
let minuteur: ReturnType<typeof setInterval> | null = null
const trames: TrameAnalyse[] = []
const temps: number[] = []
let presencePrec = false

function chercherChirp(): void {
  if (offset >= 0 || micro.n < POUR_CHIRP_S * fs) return
  const r = trouverChirp(micro.vue(), fs, 1.0)
  if (r.qualite < 8) { ctx.postMessage({ type: 'erreur', message: `Chirp introuvable dans le micro (qualité ${r.qualite.toFixed(1)}). Micro muet, sortie coupée ou son trop faible ?` }); offset = 0; return }
  offset = r.indice
  ctx.postMessage({ type: 'latence', ms: (offset / fs) * 1000, qualite: r.qualite })
  if (analyse && mode === 'live') demarrerLive()
}

function acces(): AccesMicro {
  return {
    trame: t0 => { const i0 = Math.round(t0 * fs) + offset; return micro.vue().subarray(i0, i0 + 2048) },
    tranche16: (t0, t1) => {
      const a = Math.max(0, Math.round(t0 * fs) + offset), b = Math.min(micro.n, Math.round(t1 * fs) + offset)
      return reechantillonner(micro.vue().subarray(a, b), fs, FS_MODELE)
    },
  }
}

function demarrerLive(): void {
  if (!planning) return
  etape = creerAnalyseurFlux(fs, planning, acces())
  prochainT = 0.15
  minuteur = setInterval(avancer, 25)
}

function avancer(): void {
  if (!etape || offset < 0) return
  // une seule étape par tick : le calcul doit rester sous le pas de 50 ms
  const tDispo = (micro.n - offset) / fs
  if (prochainT > tDispo) return
  const c0 = performance.now()
  const trame = etape(prochainT)
  const ms = performance.now() - c0
  trames.push(trame); temps.push(ms)
  if (trame.presence !== presencePrec) {
    presencePrec = trame.presence
    const m: WorkerVersWorklet = { type: 'presence', present: presencePrec }
    port?.postMessage(m)
  }
  ctx.postMessage({ type: 'trame', trame, msCalcul: ms })
  prochainT += 0.05
  // rattrapage si on a pris du retard (sans dépasser 4 étapes d'affilée)
  if ((micro.n - offset) / fs - prochainT > 0.3) prochainT = (micro.n - offset) / fs - 0.1
}

function arreter(): void {
  if (minuteur) { clearInterval(minuteur); minuteur = null }
  if (!planning) return
  const v = micro.vue()
  if (offset < 0) chercherChirpForce()
  const alignee = v.subarray(Math.max(0, offset))
  let tr = trames, tc = temps
  try {
    if (analyse && (mode === 'fin' || !trames.length)) {
      ctx.postMessage({ type: 'progression', texte: 'Analyse de l’enregistrement…' })
      const s = analyserEnregistrement(alignee, fs, planning)
      tr = s.trames; tc = s.tempsCalculMs
    }
    ctx.postMessage({ type: 'progression', texte: 'Passe finale…' })
    const notes = analyse ? passeFinale(alignee, fs, planning, tr) : []
    const micro0 = v.slice(), sortie0 = sortie.vue().slice()
    ctx.postMessage({ type: 'fini', notes, trames: tr, micro: micro0, sortie: sortie0, tempsCalculMs: tc, offsetMicro: Math.max(0, offset) }, [micro0.buffer, sortie0.buffer])
  } catch (e) {
    ctx.postMessage({ type: 'erreur', message: String((e as Error)?.message ?? e) })
  }
}

function chercherChirpForce(): void {
  const r = trouverChirp(micro.vue(), fs, Math.min(1.0, micro.n / fs - 0.06))
  offset = r.qualite >= 8 ? r.indice : 0
}

ctx.onmessage = (e: MessageEvent<VersWorker>) => {
  const m = e.data
  if (m.type === 'init') {
    port = m.port; fs = m.fs; planning = m.planning; mode = m.mode; analyse = m.analyse
    micro = new Tampon(DUREE_MAX_S, fs); sortie = new Tampon(DUREE_MAX_S, fs)
    offset = -1; trames.length = 0; temps.length = 0; presencePrec = false
    port.onmessage = (ev: MessageEvent<WorkletVersWorker>) => {
      const b = ev.data
      if (b.type === 'micro') { micro.ajouter(b.donnees); chercherChirp() }
      else if (b.type === 'sortie') sortie.ajouter(b.donnees)
      else if (!planning) return
      // modifications du planning, appliquées à l'instant transmis par le worklet : l'objet `planning`
      // est muté en place car l'analyseur par trame le tient par référence.
      else if (b.type === 'reglage') Object.assign(planning, appliquerReglage(planning, b.entree, b.role, b.reglage, b.t))
      else if (b.type === 'futur') Object.assign(planning, remplacerAPartirDe(planning, b.planning, b.tCoupure))
      else if (b.type === 'gain') planning.gain = b.gain
    }
  } else if (m.type === 'arreter') arreter()
}
