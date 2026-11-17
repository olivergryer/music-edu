// ─── Évaluation contre la vérité (spec §9 et §10) ────────────────────────────

import { PitchDetector } from 'pitchy'
import { preEmphasis, frameRMS, HZ_MIN, HZ_MAX } from '../../../accordeurUtils.js'
import type { NoteVerite, Verite } from './banc.ts'
import { DIAPASON_PAR_DEFAUT, hzVersMidi, type NoteFinale, type TrameAnalyse } from './types.ts'

export type LigneNote = {
  i: number; accordage: string; famille: string; reference: string; relation: string
  ecartVrai: number; tOn: number
  trouve: boolean; midiOk: boolean; erreurCents: number | null; sigma: number | null
  dansSigma: boolean | null; dansDeuxSigma: boolean | null
  premierAffichageMs: number | null
  conv: Record<string, number | null>
  erreurs: string[]
}

export type ResumeEvaluation = {
  nNotes: number
  fausseNotes: number; fausseTrames: number; tramesSansEleve: number
  erreurMediane: number; erreurP90: number
  noteIdentifiee: number
  presenceMultiplesJustes: { n: number; trouve: number }
  premierAffichageMedianMs: number
  partDansSigma: number; partDansDeuxSigma: number
  convergence: Record<string, number>
  calculP95Ms: number
  parRelation: Record<string, { n: number; mediane: number; manquees: number }>
  taxonomie: Record<string, number>
}

const med = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const pct = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const cents = (f: number, r: number) => 1200 * Math.log2(f / r)

export function evaluerNouvelleChaine(
  verite: Verite, finales: NoteFinale[], trames: TrameAnalyse[], tempsCalculMs: number[], diapason = DIAPASON_PAR_DEFAUT,
): { resume: ResumeEvaluation; lignes: LigneNote[] } {
  const lignes: LigneNote[] = []
  const utilisees = new Set<number>()
  const taxo: Record<string, number> = { E1: 0, E2: 0, E3: 0, E4: 0, E5: 0, E7: 0 }
  verite.notes.forEach((vn, i) => {
    let best = -1, bestOv = 0
    finales.forEach((f, j) => {
      const ov = Math.min(f.tOff, vn.tOff) - Math.max(f.tOn, vn.tOn)
      if (ov > bestOv) { bestOv = ov; best = j }
    })
    const erreurs: string[] = []
    const ok = best >= 0 && bestOv > 0.3 * (vn.tOff - vn.tOn)
    if (ok) utilisees.add(best)
    const f = ok ? finales[best] : null
    const midiVrai = Math.round(hzVersMidi(vn.f0Hz, diapason))
    const err = f ? cents(f.f0Hz, vn.f0Hz) : null
    const midiOk = !!f && f.midi === midiVrai
    if (!f) { erreurs.push('E2'); taxo.E2++ }
    else if (!midiOk) { erreurs.push('E3'); taxo.E3++ }
    else {
      if (Math.abs(err!) > 6) { erreurs.push('E4'); taxo.E4++; if (vn.vibrato) { erreurs.push('E7'); taxo.E7++ } }
      if (Number.isFinite(f.sigmaCents) && Math.abs(err!) > 2 * f.sigmaCents) { erreurs.push('E5'); taxo.E5++ }
    }
    // premier affichage et convergence (valeurs provisoires)
    const tr = trames.filter(t => t.t >= vn.tOn && t.t <= vn.tOff)
    const prem = tr.find(t => t.presence && t.f0Hz)
    const conv: Record<string, number | null> = {}
    for (const ms of [100, 200, 500, 1000]) {
      const dernier = [...tr].reverse().find(t => t.t <= vn.tOn + ms / 1000 && t.presence && t.f0Hz)
      conv[`${ms}ms`] = dernier?.f0Hz ? Math.abs(cents(dernier.f0Hz, vn.f0Hz)) : null
    }
    const sig = f && Number.isFinite(f.sigmaCents) ? f.sigmaCents : null
    lignes.push({
      i, accordage: vn.accordage, famille: vn.famille, reference: vn.reference,
      relation: vn.relation ? `q=${vn.relation.q}` : 'étrangère', ecartVrai: vn.ecartCents, tOn: vn.tOn,
      trouve: !!f, midiOk, erreurCents: err, sigma: sig,
      dansSigma: sig !== null && err !== null ? Math.abs(err) <= sig : null,
      dansDeuxSigma: sig !== null && err !== null ? Math.abs(err) <= 2 * sig : null,
      premierAffichageMs: prem ? (prem.t - vn.tOn) * 1000 : null, conv, erreurs,
    })
  })
  // fausses notes : notes finales sans note vraie, trames présentes en phase sans élève
  const fausseNotes = finales.filter((f, j) => !utilisees.has(j) && !verite.notes.some(n => Math.min(f.tOff, n.tOff) - Math.max(f.tOn, n.tOn) > 0)).length
  taxo.E1 = fausseNotes
  const enSilence = (t: number) => verite.phasesSansEleve.some(([a, b]) => t >= a + 0.2 && t <= b) &&
    !verite.notes.some(n => t >= n.tOn - 0.1 && t <= n.tOff + 0.2)
  const trSil = trames.filter(t => enSilence(t.t))
  const fausseTrames = trSil.filter(t => t.presence && t.f0Hz).length

  const trouvees = lignes.filter(l => l.erreurCents !== null && l.midiOk)
  const errs = trouvees.map(l => Math.abs(l.erreurCents!))
  const mult = lignes.filter((l, k) => verite.notes[k].relation && Math.abs(verite.notes[k].ecartCents) < 1e-9)
  const avecSigma = lignes.filter(l => l.sigma !== null && l.midiOk)
  const premiers = lignes.map(l => l.premierAffichageMs).filter((x): x is number => x !== null)
  const parRel: ResumeEvaluation['parRelation'] = {}
  for (const l of lignes) {
    const r = (parRel[l.relation] ??= { n: 0, mediane: NaN, manquees: 0 })
    r.n++; if (!l.trouve) r.manquees++
  }
  for (const k of Object.keys(parRel)) parRel[k].mediane = med(lignes.filter(l => l.relation === k && l.erreurCents !== null).map(l => Math.abs(l.erreurCents!)))
  const convergence: Record<string, number> = {}
  for (const ms of ['100ms', '200ms', '500ms', '1000ms']) convergence[ms] = med(lignes.map(l => l.conv[ms]).filter((x): x is number => x !== null))
  return {
    lignes,
    resume: {
      nNotes: verite.notes.length, fausseNotes, fausseTrames, tramesSansEleve: trSil.length,
      erreurMediane: med(errs), erreurP90: pct(errs, 0.9),
      noteIdentifiee: lignes.filter(l => l.midiOk).length / Math.max(1, lignes.length),
      presenceMultiplesJustes: { n: mult.length, trouve: mult.filter(l => l.trouve).length },
      premierAffichageMedianMs: med(premiers),
      partDansSigma: avecSigma.filter(l => l.dansSigma).length / Math.max(1, avecSigma.length),
      partDansDeuxSigma: avecSigma.filter(l => l.dansDeuxSigma).length / Math.max(1, avecSigma.length),
      convergence, calculP95Ms: pct(tempsCalculMs, 0.95), parRelation: parRel, taxonomie: taxo,
    },
  }
}

// ─── Chaîne actuelle (étape 1) : boucle live de l'Accordeur rejouée sur l'enregistrement ──
export type ResumeChaineActuelle = {
  parametres: { clarte: number; gate: number }
  tramesSansEleve: number; fausseNotes: number
  tramesAvecEleve: number; bonnes: number; octave: number; autres: number; rien: number
}

export function evaluerChaineActuelle(micro: Float32Array, fs: number, verite: Verite, clarte = 0.82, gate = 0.02, diapason = DIAPASON_PAR_DEFAUT): ResumeChaineActuelle {
  const det = PitchDetector.forFloat32Array(2048)
  const r: ResumeChaineActuelle = { parametres: { clarte, gate }, tramesSansEleve: 0, fausseNotes: 0, tramesAvecEleve: 0, bonnes: 0, octave: 0, autres: 0, rien: 0 }
  const pas = Math.round(0.1 * fs)         // RAF 100 ms comme la boucle live
  for (let i = 0; i + 2048 <= micro.length; i += pas) {
    const t = (i + 2048) / fs
    const tr = micro.subarray(i, i + 2048)
    let detecte: number | null = null
    if ((frameRMS(tr) as unknown as number) >= gate) {   // le JSDoc de frameRMS (accordeurUtils.js) est celui d'analyserBuffer
      const [hz, c] = det.findPitch(preEmphasis(tr), fs)
      if (c >= clarte && hz >= HZ_MIN && hz <= HZ_MAX) detecte = Math.round(hzVersMidi(hz, diapason))
    }
    const vn = verite.notes.find((n: NoteVerite) => t - 2048 / fs >= n.tOn + 0.1 && t <= n.tOff)
    const sil = !vn && verite.phasesSansEleve.some(([a, b]) => t - 2048 / fs >= a + 0.2 && t <= b) && !verite.notes.some(n => t >= n.tOn - 0.1 && t <= n.tOff + 0.2)
    if (sil) { r.tramesSansEleve++; if (detecte !== null) r.fausseNotes++ }
    else if (vn) {
      r.tramesAvecEleve++
      const m = Math.round(hzVersMidi(vn.f0Hz, diapason))
      if (detecte === null) r.rien++
      else if (detecte === m) r.bonnes++
      else if ((detecte - m) % 12 === 0) r.octave++
      else r.autres++
    }
  }
  return r
}

// ─── Rapport Markdown ───────────────────────────────────────────────────────
const f1 = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a')
const ok = (c: boolean) => (c ? '✅' : '❌')

export function rapportMarkdown(titre: string, meta: Record<string, string>, nouvelle: ReturnType<typeof evaluerNouvelleChaine> | null, actuelle: ResumeChaineActuelle[]): string {
  const L: string[] = [`# ${titre}`, '', '## Contexte', ...Object.entries(meta).map(([k, v]) => `- **${k}** : ${v}`), '']
  if (actuelle.length) {
    L.push('## Chaîne actuelle (étape 1)', '', '| Clarté | Gate | Trames sans élève | Fausses notes | Trames élève | Bonne note | Octave | Autre note | Rien |', '|---|---|---|---|---|---|---|---|---|')
    for (const a of actuelle) L.push(`| ${a.parametres.clarte} | ${a.parametres.gate} | ${a.tramesSansEleve} | **${a.fausseNotes}** | ${a.tramesAvecEleve} | ${a.bonnes} | ${a.octave} | ${a.autres} | ${a.rien} |`)
    L.push('')
  }
  if (nouvelle) {
    const r = nouvelle.resume
    const pm = r.presenceMultiplesJustes
    L.push('## Nouvelle chaîne — seuils du §9', '', '| Mesure | Valeur | Seuil | |', '|---|---|---|---|',
      `| Fausses notes (notes finales / trames sans élève) | ${r.fausseNotes} / ${r.fausseTrames} sur ${r.tramesSansEleve} | 0 | ${ok(r.fausseNotes === 0 && r.fausseTrames === 0)} |`,
      `| Erreur finale, médiane | ${f1(r.erreurMediane)} ¢ | ≤ 3 ¢ | ${ok(r.erreurMediane <= 3)} |`,
      `| Erreur finale, 90e centile | ${f1(r.erreurP90)} ¢ | ≤ 6 ¢ | ${ok(r.erreurP90 <= 6)} |`,
      `| Note identifiée (MIDI) | ${f1(100 * r.noteIdentifiee, 1)} % | ≥ 95 % | ${ok(r.noteIdentifiee >= 0.95)} |`,
      `| Présence aux multiples exactement justes | ${pm.trouve}/${pm.n} | ≥ 90 % | ${ok(pm.n === 0 || pm.trouve / pm.n >= 0.9)} |`,
      `| Premier affichage (médiane) | ${f1(r.premierAffichageMedianMs, 0)} ms | ≤ 150 ms | ${ok(r.premierAffichageMedianMs <= 150)} |`,
      `| Dans ±σ | ${f1(100 * r.partDansSigma, 0)} % | 60–75 % | ${ok(r.partDansSigma >= 0.6 && r.partDansSigma <= 0.75)} |`,
      `| Dans ±2σ | ${f1(100 * r.partDansDeuxSigma, 0)} % | ≥ 90 % | ${ok(r.partDansDeuxSigma >= 0.9)} |`,
      `| Mise à jour du calcul (p95) | ${f1(r.calculP95Ms, 0)} ms | ≤ 50 ms | ${ok(r.calculP95Ms <= 50)} |`, '',
      '### Convergence des valeurs provisoires (erreur médiane, ¢)', '',
      '| 100 ms | 200 ms | 500 ms | 1000 ms |', '|---|---|---|---|',
      `| ${['100ms', '200ms', '500ms', '1000ms'].map(k => f1(r.convergence[k])).join(' | ')} |`, '',
      '### Par relation à l’accord', '', '| Relation | Notes | Erreur médiane (¢) | Manquées |', '|---|---|---|---|',
      ...Object.entries(r.parRelation).map(([k, v]) => `| ${k} | ${v.n} | ${f1(v.mediane)} | ${v.manquees} |`), '',
      '### Taxonomie des erreurs (§10)', '', Object.entries(r.taxonomie).map(([k, v]) => `${k} : ${v}`).join(' · '), '',
      'E6 (attaques du playback) et E8 (plateforme) ne sont pas mesurables en simulation.', '')
  }
  return L.join('\n')
}

export function csvNotes(lignes: LigneNote[]): string {
  const h = 'i,accordage,famille,reference,relation,ecartVrai,tOn,trouve,midiOk,erreurCents,sigma,premierAffichageMs,conv100,conv200,conv500,conv1000,erreurs'
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  return [h, ...lignes.map(l => [l.i, l.accordage, l.famille, l.reference, l.relation, l.ecartVrai, l.tOn.toFixed(3), l.trouve, l.midiOk, v(l.erreurCents?.toFixed(3)), v(l.sigma?.toFixed(3)), v(l.premierAffichageMs?.toFixed(0)), v(l.conv['100ms']?.toFixed(3)), v(l.conv['200ms']?.toFixed(3)), v(l.conv['500ms']?.toFixed(3)), v(l.conv['1000ms']?.toFixed(3)), l.erreurs.join('|')].join(','))].join('\n')
}
