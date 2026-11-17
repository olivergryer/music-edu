// Tests node:test — étape 2a (validation numérique du modèle conjoint).
// node --test "src/modules/accordeur-accompagne/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { transformeeHann, hann } from './fenetre.ts'
import { voixDeAccord } from './synthese.ts'
import { fusionnerPartiels } from './fusionPartiels.ts'
import { creerContexte, ajusterF0 } from './modeleConjoint.ts'
import { ajouterNote } from './eleveSynthetique.ts'
import { centsEntre } from './types.ts'
import { relationMultiple } from './fusion.ts'

const FS = 16000

test('transformée de Hann en forme close = somme directe', () => {
  const N = 777, w = hann(N), out = new Float64Array(2)
  for (const om of [0, 0.01, 0.3, 1.234, 2.9, -0.7, 2 * Math.PI / N * 1.5]) {
    let re = 0, im = 0
    for (let n = 0; n < N; n++) { re += w[n] * Math.cos(om * n); im += w[n] * Math.sin(om * n) }
    transformeeHann(om, N, out)
    assert.ok(Math.abs(out[0] - re) < 1e-8 * N, `Re ${om}`)
    assert.ok(Math.abs(out[1] - im) < 1e-8 * N, `Im ${om}`)
  }
})

/** Mélange playback tenu (juste) + élève synthétique. */
function melange(T: number, accord: string, f0Eleve: number | null, famille: Parameters<typeof ajouterNote>[2]['famille'] = 'corde', niveauEleve = 0.1) {
  const voix = voixDeAccord(accord, 'juste')
  const N = Math.round(T * FS)
  const x = new Float32Array(N)
  for (const v of voix) for (const p of v.partiels) {
    for (let n = 0; n < N; n++) x[n] += 0.04 * p.amp * Math.sin(2 * Math.PI * p.freqHz * n / FS + 0.7 * v.midi)
  }
  if (f0Eleve) ajouterNote(x, FS, { tDebut: 0, duree: T + 1, f0Hz: f0Eleve, famille, niveau: niveauEleve })
  return { voix, x }
}

function estimer(T: number, accord: string, f0Eleve: number | null, candidatApprox: number, famille?: Parameters<typeof melange>[3]) {
  const { voix, x } = melange(T, accord, f0Eleve, famille)
  const pb = fusionnerPartiels(voix, T, 6000)
  const ctx = creerContexte(x, FS, pb)
  return { res: ajusterF0(ctx, [candidatApprox]), voix, ctx }
}

test('f0 retrouvée à 0,1 ¢ sur Ré5 (douzième de Sol3) avec playback', () => {
  const f0 = 587.33 * Math.pow(2, 6 / 1200)
  const { res } = estimer(0.25, 'I', f0, 587.33)
  assert.ok(res.f0Hz)
  const err = centsEntre(res.f0Hz!, f0)
  assert.ok(Math.abs(err) < 0.1, `erreur ${err.toFixed(3)} ¢`)
  assert.ok(res.presence, 'présence détectée')
})

test('f0 retrouvée à 0,1 ¢ sur note réellement étrangère (Fa5) avec playback', () => {
  const f0 = 698.46 * Math.pow(2, -4 / 1200)
  const { res, voix } = estimer(0.25, 'I', f0, 698.46)
  assert.equal(relationMultiple(698.46, voix), null, 'Fa5 n’est multiple d’aucune voix de I')
  assert.ok(Math.abs(centsEntre(res.f0Hz!, f0)) < 0.1)
})

test('SPEC : Ré5, donnée « étrangère » au §8, est la douzième de Sol3 dans l’accord I (q = 3)', () => {
  const voix = voixDeAccord('I', 'juste')
  const r = relationMultiple(587.33, voix)
  assert.ok(r && r.q === 3 && r.voix === 1, JSON.stringify(r))
})

test('pas de présence quand l’élève se tait', () => {
  const { res } = estimer(0.25, 'I', null, 587.33)
  assert.equal(res.presence, false)
})

// ─── Multiples de l'accord : unisson, octave, douzième ──────────────────────
import { Strobe } from './strobe.ts'
import { NiveauPlaybackAppris } from './presence.ts'
import { reechantillonner } from './reechantillonnage.ts'
import { fusionnerEstimations, genererCandidats, ecartOctave } from './fusion.ts'
import { detecterSurResidu, soustrairePlayback, mpm } from './soustraction.ts'
import { amplitudesPlaybackSeul } from './modeleConjoint.ts'
import { HZ_MAX, HZ_MIN } from './constantes.ts'
import { HZ_MAX as HZ_MAX_APP, HZ_MIN as HZ_MIN_APP } from '../../../accordeurUtils.js'

test('constantes miroir identiques à accordeurUtils', () => {
  assert.equal(HZ_MIN, HZ_MIN_APP); assert.equal(HZ_MAX, HZ_MAX_APP)
})

test('unisson à 9 ¢ sur 1 s : battement résolu, signe de Δ correct', () => {
  const voix = voixDeAccord('I', 'juste')
  const mi4 = voix[3].freqHz
  for (const [ecart, signe] of [[+9, 1], [-9, -1]] as const) {
    const f0 = mi4 * Math.pow(2, ecart / 1200)
    const { res } = estimer(1.0, 'I', f0, f0, 'corde')
    assert.ok(res.f0Hz && Math.abs(centsEntre(res.f0Hz, f0)) < 0.3, `f0 ${res.f0Hz}`)
    const b = res.battements.find(x => x.kEleve === 1 && x.voix === 3 && x.mPlayback === 1)
    assert.ok(b, 'battement k=1 trouvé')
    assert.equal(Math.sign(b!.deltaHz), signe)
    assert.ok(b!.resolu)
  }
})

test('unisson exact : paires non résolues signalées, harmoniques hautes libres', () => {
  const voix = voixDeAccord('I', 'juste')
  const f0 = voix[3].freqHz                   // Mi4 exactement juste
  const { res } = estimer(0.25, 'I', f0, f0, 'corde')
  assert.ok(res.nonResolues.includes(1), 'k=1 non résolue')
  assert.ok(res.battements.some(b => !b.resolu))
  assert.ok(res.libres.length > 0, 'les harmoniques > 8 restent libres')
  assert.ok(res.f0Hz && Math.abs(centsEntre(res.f0Hz, f0)) < 0.5)
})

test('octave (Mi5) à −5 ¢ : f0 retrouvée', () => {
  const voix = voixDeAccord('I', 'juste')
  const f0 = 2 * voix[3].freqHz * Math.pow(2, -5 / 1200)
  const { res } = estimer(0.5, 'I', f0, 2 * voix[3].freqHz, 'ancheSimple')
  assert.ok(res.f0Hz)
  assert.ok(Math.abs(centsEntre(res.f0Hz!, f0)) < 0.5, `erreur ${centsEntre(res.f0Hz!, f0).toFixed(2)} ¢`)
})

test('garde-fou d’octave : un candidat à l’octave inférieure perd', () => {
  const f0 = 587.33
  const { voix, x } = melange(0.5, 'I', f0, 'corde')
  const ctx = creerContexte(x, FS, fusionnerPartiels(voix, 0.5, 6000))
  const res = ajusterF0(ctx, [f0 / 2, f0, f0 * 2])
  assert.ok(res.f0Hz && Math.abs(centsEntre(res.f0Hz, f0)) < 0.5)
})

test('σ du modèle de l’ordre de l’erreur observée (bruit blanc ajouté)', () => {
  const erreurs: number[] = [], sigmas: number[] = []
  for (let seed = 1; seed <= 8; seed++) {
    const f0 = 587.33 * Math.pow(2, (seed - 4) / 1200)
    const { voix, x } = melange(0.25, 'I', f0, 'corde')
    let a = seed * 7919
    for (let n = 0; n < x.length; n++) { a = (a * 1664525 + 1013904223) >>> 0; x[n] += 0.01 * ((a / 4294967296) - 0.5) }
    const res = ajusterF0(creerContexte(x, FS, fusionnerPartiels(voix, 0.25, 6000)), [587.33])
    erreurs.push(centsEntre(res.f0Hz!, f0)); sigmas.push(res.sigmaCents)
  }
  const rmsErr = Math.sqrt(erreurs.reduce((s, e) => s + e * e, 0) / erreurs.length)
  const sigMoy = sigmas.reduce((s, e) => s + e, 0) / sigmas.length
  console.log(`   σ moyen ${sigMoy.toFixed(3)} ¢, erreur rms ${rmsErr.toFixed(3)} ¢`)
  assert.ok(Number.isFinite(sigMoy) && sigMoy > 0)
  assert.ok(rmsErr < 5 * sigMoy + 0.1, 'σ ne sous-estime pas de plus d’un facteur 5')
})

test('soustraction : playback seul → plus de fausse note ; élève → note retrouvée par MPM', () => {
  const FS48 = 48000, N = 2048
  const voix = voixDeAccord('I', 'juste')
  const faire = (f0: number | null) => {
    const x = new Float32Array(N)
    for (const v of voix) for (const p of v.partiels)
      for (let n = 0; n < N; n++) x[n] += 0.05 * p.amp * Math.sin(2 * Math.PI * p.freqHz * n / FS48 + 0.3 * v.midi)
    if (f0) ajouterNote(x, FS48, { tDebut: 0, duree: 1, f0Hz: f0, famille: 'corde', niveau: 0.05 })
    return x
  }
  const brut = mpm(faire(null), FS48, 0.8)
  console.log(`   chaîne actuelle sur playback seul : f0=${brut.hzBrut.toFixed(1)} Hz, clarté ${brut.clarte.toFixed(3)} → ${brut.f0Hz ? 'FAUSSE NOTE' : 'rien'}`)
  const seul = detecterSurResidu(faire(null), FS48, voix)
  assert.equal(seul.f0Hz, null, 'aucune note sur le résidu du playback seul')
  const f0 = 587.33
  const avec = detecterSurResidu(faire(f0), FS48, voix)
  assert.ok(avec.f0Hz, 'élève détecté sur le résidu')
  assert.ok(Math.abs(centsEntre(avec.f0Hz!, f0)) < 15, `MPM ${avec.f0Hz}`)
  assert.ok(soustrairePlayback(faire(null), FS48, voix).rmsResidu < 1e-3)
})

test('niveau appris : élève absent → pas de détection ; élève à l’unisson → détection', () => {
  const voix = voixDeAccord('I', 'juste')
  const pb = fusionnerPartiels(voix, 0.25, 6000)
  const appr = new NiveauPlaybackAppris()
  const freqs = pb.map(p => p.freqHz)
  for (let i = 0; i < 5; i++) {
    const { x } = melange(0.25, 'I', null)
    appr.apprendre(freqs, amplitudesPlaybackSeul(creerContexte(x, FS, pb)))
  }
  const seul = melange(0.25, 'I', null).x
  assert.equal(appr.present(freqs, amplitudesPlaybackSeul(creerContexte(seul, FS, pb))), false)
  // élève à l'unisson exact de Mi4 : mêmes fréquences, la phase décide (ici en phase)
  const unisson = melange(0.25, 'I', voix[3].freqHz, 'corde', 0.06).x
  assert.equal(appr.present(freqs, amplitudesPlaybackSeul(creerContexte(unisson, FS, pb))), true)
})

test('stroboscope : vitesse de rotation = Δ signé, retard raisonnable', () => {
  const f = 440, mesurer = (delta: number) => {
    const fs = 16000, st = new Strobe(fs)
    st.definirVoix([f])
    const bloc = (t0: number, d: number, avecEleve: boolean) => {
      const x = new Float32Array(d * fs)
      for (let n = 0; n < x.length; n++) {
        const t = t0 + n / fs
        x[n] = 0.1 * Math.sin(2 * Math.PI * f * t + 0.4) + (avecEleve ? 0.08 * Math.sin(2 * Math.PI * (f + delta) * t + 1.1) : 0)
      }
      return x
    }
    st.definirPresence(false); st.traiter(bloc(0, 1, false))
    st.definirPresence(true); st.traiter(bloc(1, 1.5, true))
    const e = st.etats()[0]
    return e.vitesseHz
  }
  for (const d of [+3, -3, +7.5, -12]) {
    const v = mesurer(d)
    assert.ok(Math.abs(v - d) < 0.4, `Δ=${d} → ${v.toFixed(2)}`)
  }
})

test('stroboscope : saut de fréquence suivi en ≤ 50 ms', () => {
  const fs = 16000, f = 440, st = new Strobe(fs)
  st.definirVoix([f])
  const gen = (t0: number, d: number, delta: number, phi0: number, eleve: boolean) => {
    const x = new Float32Array(Math.round(d * fs))
    for (let n = 0; n < x.length; n++) {
      const t = t0 + n / fs
      x[n] = 0.1 * Math.sin(2 * Math.PI * f * t) + (eleve ? 0.08 * Math.sin(2 * Math.PI * (f + delta) * t + phi0) : 0)
    }
    return x
  }
  st.definirPresence(false); st.traiter(gen(0, 1, 0, 0, false))
  st.definirPresence(true); st.traiter(gen(1, 1.0, 4, 0, true))
  // le battement passe de +4 à +10 Hz à t = 2 s (phase continue)
  const phi = 2 * Math.PI * 4 * 1.0
  let tSaut = 2.0, retard = -1
  for (let i = 0; i < 40; i++) {      // pas de 5 ms
    const x = new Float32Array(80)
    for (let n = 0; n < 80; n++) {
      const t = tSaut + i * 0.005 + n / fs
      x[n] = 0.1 * Math.sin(2 * Math.PI * f * t) + 0.08 * Math.sin(2 * Math.PI * (f + 10) * t + phi - 2 * Math.PI * 6 * 2.0)
    }
    st.traiter(x)
    const v = st.etats()[0].vitesseHz
    if (retard < 0 && v > 4 + 0.9 * 6) retard = (i + 1) * 5
  }
  console.log(`   retard stroboscope (90 % du saut) : ${retard} ms`)
  assert.ok(retard > 0 && retard <= 50, `retard ${retard} ms`)
})

test('rééchantillonnage 44,1 kHz → 16 kHz conserve la fréquence', () => {
  const n = 44100, x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 1234 * i / 44100)
  const y = reechantillonner(x, 44100, 16000)
  assert.equal(y.length, Math.floor((n - 1) * 16000 / 44100) + 1)
  const ctx = creerContexte(y.subarray(1000, 5096), 16000, [])
  const res = ajusterF0(ctx, [1234])
  assert.ok(Math.abs(centsEntre(res.f0Hz!, 1234)) < 0.1)
})

test('fusion : moyenne pondérée par 1/σ², relations multiples, candidats', () => {
  const f = fusionnerEstimations({ f0Hz: 440, sigmaCents: 4 }, { f0Hz: 440 * Math.pow(2, 2 / 1200), sigmaCents: 1 })!
  assert.equal(f.source, 'fusion')
  assert.ok(Math.abs(centsEntre(f.f0Hz, 440) - 2 * (1 / 1) / (1 / 16 + 1)) < 1e-9 + 0.01)
  assert.ok(f.sigmaCents < 1)
  assert.equal(fusionnerEstimations({ f0Hz: 440, sigmaCents: 4 }, { f0Hz: 440, sigmaCents: Infinity })!.source, 'mpm')
  const voix = voixDeAccord('I', 'juste')
  assert.deepEqual(relationMultiple(voix[3].freqHz * 2 * Math.pow(2, 10 / 1200), voix)?.q, 2)
  assert.equal(relationMultiple(698.46, voix), null)
  assert.ok(genererCandidats(voix, 500, 300).length >= 3)
  assert.ok(ecartOctave(1000, 500) && !ecartOctave(1000, 700))
})
