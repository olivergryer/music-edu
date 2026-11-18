// Intégration worklet ↔ Worker sans navigateur : le vrai processeur (avec des globales
// AudioWorklet simulées) et le vrai Worker (avec un `self` simulé), reliés par un vrai
// MessageChannel. Le « micro » est la sortie du worklet retardée de 45 ms + un élève.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ajouterNote } from './dsp/eleveSynthetique.ts'
import { construirePlanning } from './dsp/synthese.ts'
import { centsEntre } from './dsp/types.ts'
import type { DepuisWorker, VersWorker } from './protocole.ts'

const FS = 48000
type Proc = { port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void }; process: (i: Float32Array[][], o: Float32Array[][]) => boolean }
const g = globalThis as unknown as Record<string, unknown>
const sortieWorklet: unknown[] = []
g.sampleRate = FS
g.currentFrame = 0
g.currentTime = 0
g.AudioWorkletProcessor = class { port = { onmessage: null as unknown, postMessage: (m: unknown) => { sortieWorklet.push(m) } } }
let Ctor: (new () => Proc) | null = null
g.registerProcessor = (_: string, c: new () => Proc) => { Ctor = c }
const venantDuWorker: DepuisWorker[] = []
const faux = { postMessage: (m: DepuisWorker) => { venantDuWorker.push(m) }, onmessage: null as ((e: { data: VersWorker }) => void) | null }
g.self = faux
await import('./processeurAccompagne.worklet.ts')
await import('./analyseAccompagne.worker.ts')

const attendre = (ms: number) => new Promise(r => setTimeout(r, ms))

async function session(mode: 'live' | 'fin', secondes: number, eleve: { f0: number; t0: number; t1: number }, pacer: boolean) {
  venantDuWorker.length = 0; sortieWorklet.length = 0
  const planning = construirePlanning({ accordId: 'I', accordage: 'juste', formule: 'tenu', duree: secondes + 2, sampleRate: FS, tDebut: 0.3 })
  const proc = new Ctor!()
  const canal = new MessageChannel()
  const versProc = (d: unknown) => proc.port.onmessage!({ data: d })
  faux.onmessage!({ data: { type: 'init', port: canal.port1, planning, fs: FS, mode, diapason: 442, analyse: true } })
  versProc({ type: 'port', port: canal.port2 })
  versProc({ type: 'planning', planning })
  versProc({ type: 'demarrer' })

  const N = Math.round(secondes * FS)
  const el = new Float32Array(N)
  ajouterNote(el, FS, { tDebut: eleve.t0, duree: eleve.t1 - eleve.t0, f0Hz: eleve.f0, famille: 'corde', niveau: 0.05 })
  const histo = new Float32Array(N), retard = Math.round(0.045 * FS)
  const B = 128
  for (let k = 0; k + B <= N; k += B) {
    g.currentFrame = k
    g.currentTime = k / FS
    const entree = new Float32Array(B)
    for (let i = 0; i < B; i++) entree[i] = (k + i >= retard ? histo[k + i - retard] : 0) + el[k + i]
    const out = [new Float32Array(B), new Float32Array(B)]
    proc.process([[entree]], [out])
    histo.set(out[0], k)
    if (pacer && (k / B) % 9 === 8) await attendre(24)      // ~ temps réel : 9 blocs ≈ 24 ms
    else if (!pacer && (k / B) % 400 === 399) await attendre(0)
  }
  await attendre(100)
  versProc({ type: 'arreter' })
  await attendre(100)
  const fini = new Promise<Extract<DepuisWorker, { type: 'fini' }>>((ok, ko) => {
    const t = setInterval(() => {
      const f = venantDuWorker.find(m => m.type === 'fini') as Extract<DepuisWorker, { type: 'fini' }> | undefined
      const e = venantDuWorker.find(m => m.type === 'erreur') as Extract<DepuisWorker, { type: 'erreur' }> | undefined
      if (f) { clearInterval(t); ok(f) } else if (e) { clearInterval(t); ko(new Error(e.message)) }
    }, 50)
  })
  faux.onmessage!({ data: { type: 'arreter' } })
  return fini
}

test('mode Fin : latence 45 ms retrouvée, enregistrements complets, note finale juste', async () => {
  const f0 = 698.46 * Math.pow(2, 6 / 1200)          // Fa5 +6 ¢ (étrangère à l'accord I)
  const r = await session('fin', 6, { f0, t0: 2.0, t1: 5.0 }, false)
  const lat = venantDuWorker.find(m => m.type === 'latence') as Extract<DepuisWorker, { type: 'latence' }> | undefined
  assert.ok(lat, 'latence signalée')
  assert.ok(Math.abs(lat!.ms - 45) < 0.1, `latence ${lat!.ms}`)
  assert.ok(r.micro.length >= 5.9 * FS && r.sortie.length === r.micro.length, `${r.micro.length}/${r.sortie.length}`)
  assert.equal(sortieWorklet.filter(m => (m as { coupures?: number }).coupures).length, 0, 'aucune coupure')
  assert.equal(r.notes.length, 1, `notes : ${r.notes.length}`)
  assert.ok(Math.abs(centsEntre(r.notes[0].f0Hz, f0)) < 0.5, `erreur ${centsEntre(r.notes[0].f0Hz, f0).toFixed(3)} ¢`)
})

test('mode Live : trames au fil de l’eau, note retrouvée, présence relayée au worklet', async () => {
  const f0 = 698.46 * Math.pow(2, -4 / 1200)
  const r = await session('live', 6, { f0, t0: 2.0, t1: 4.5 }, true)
  const trames = venantDuWorker.filter(m => m.type === 'trame') as Extract<DepuisWorker, { type: 'trame' }>[]
  assert.ok(trames.length > 40, `${trames.length} trames`)
  const bonnes = trames.filter(m => m.trame.presence && m.trame.f0Hz && Math.abs(centsEntre(m.trame.f0Hz, f0)) < 1)
  assert.ok(bonnes.length > 20, `${bonnes.length} trames correctes`)
  assert.ok(trames.filter(m => m.trame.t < 1.8).every(m => !m.trame.presence), 'aucune fausse note avant l’élève')
  assert.ok(r.notes.length >= 1 && Math.abs(centsEntre(r.notes[0].f0Hz, f0)) < 0.5)
  const strobes = sortieWorklet.filter(m => (m as { type: string }).type === 'strobe')
  assert.ok(strobes.length > 100, `${strobes.length} messages stroboscope`)
})

test('réglages à chaud : le worklet applique cents, volume, muet, planning futur et gain sans coupure ni valeur invalide', async () => {
  const { PHRASES_FOURNIES } = await import('./phrase.ts')
  const { construirePlanningPhrase } = await import('./planningPhrase.ts')
  const { prochaineFrontiere } = await import('./dsp/reglages.ts')
  venantDuWorker.length = 0; sortieWorklet.length = 0
  const cad = PHRASES_FOURNIES[0]
  const { planning } = construirePlanningPhrase({ ...cad, tempo: 120 }, { sampleRate: FS, dureeS: 8 })
  const futur = construirePlanningPhrase({ ...cad, tempo: 120, entrees: { ...cad.entrees, 8: { ...cad.entrees[8], degre: 2 } } }, { sampleRate: FS, dureeS: 8 }).planning
  const proc = new Ctor!()
  const canal = new MessageChannel()
  const recus: { type: string; t?: number }[] = []
  canal.port1.onmessage = (e: MessageEvent) => { recus.push(e.data) }
  const versProc = (d: unknown) => proc.port.onmessage!({ data: d })
  versProc({ type: 'port', port: canal.port2 })
  versProc({ type: 'planning', planning })
  versProc({ type: 'demarrer' })
  const B = 128, N = Math.round(3 * FS)
  let maxi = 0, valide = true, dernier = 0
  for (let k = 0; k + B <= N; k += B) {
    g.currentFrame = k; g.currentTime = k / FS
    if (k === 20 * B) versProc({ type: 'reglage', entree: 0, role: '3', reglage: { cents: 8, volume: 0.5 } })
    if (k === 40 * B) versProc({ type: 'reglage', entree: 0, role: '5', reglage: { muet: true } })
    if (k === 60 * B) versProc({ type: 'futur', planning: futur, tCoupure: prochaineFrontiere(planning, k / FS)! })
    if (k === 80 * B) versProc({ type: 'gain', gain: planning.gain * 0.5 })
    const out = [new Float32Array(B), new Float32Array(B)]
    proc.process([[new Float32Array(B)]], [out])
    for (let i = 0; i < B; i++) {
      const v = out[0][i]
      if (!Number.isFinite(v)) valide = false
      maxi = Math.max(maxi, Math.abs(v - dernier)); dernier = v
    }
  }
  await attendre(50)
  assert.ok(valide, 'valeurs finies')
  assert.ok(maxi < 0.5, `pas de saut brutal (${maxi})`)
  assert.equal(sortieWorklet.filter(m => (m as { coupures?: number }).coupures).length, 0)
  const types = recus.map(m => m.type)
  assert.ok(types.includes('reglage') && types.includes('futur') && types.includes('gain'), types.join(','))
  const r = recus.filter(m => m.type === 'reglage')
  assert.equal(r.length, 2)
  assert.ok(Math.abs(r[0].t! - 20 * B / FS) < 1e-9)               // l'instant exact est transmis au Worker
})
