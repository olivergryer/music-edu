// Analyse hors ligne du spike « Accordeur accompagné » (spec §7.4).
//
//   node scripts/analyse-accompagne.ts --simule [--complet] [--seed 7] [--mode les-deux]
//   node scripts/analyse-accompagne.ts --dossier <dossier d'enregistrement> [--mode nouvelle|actuelle|les-deux]
//
// Un dossier d'enregistrement contient : micro.wav, sortie.wav, planning.json, meta.json
// et, pour l'élève synthétique, verite.json. Sorties dans le même dossier :
// rapport.md, notes.csv, trames.csv.
// Le mode « nouvelle chaîne » rejoue exactement le code d'analyse du Worker.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { construireJeuA } from '../src/modules/accordeur-accompagne/dsp/banc.ts'
import { reechantillonner } from '../src/modules/accordeur-accompagne/dsp/reechantillonnage.ts'
import { trouverChirp } from '../src/modules/accordeur-accompagne/dsp/chirp.ts'
import { csvNotes, evaluerChaineActuelle, evaluerNouvelleChaine, rapportMarkdown } from '../src/modules/accordeur-accompagne/dsp/evaluation.ts'
import { analyserEnregistrement, passeFinale } from '../src/modules/accordeur-accompagne/dsp/pipeline.ts'
import { ecrireWav, lireWav } from '../src/modules/accordeur-accompagne/dsp/wav.ts'
import type { Verite } from '../src/modules/accordeur-accompagne/dsp/banc.ts'
import type { Planning } from '../src/modules/accordeur-accompagne/dsp/types.ts'

const args = process.argv.slice(2)
const a = (nom: string) => { const i = args.indexOf(`--${nom}`); return i >= 0 ? (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]) : undefined }
const mode = (a('mode') as string) ?? 'les-deux'
const racine = resolve(import.meta.dirname, '../../../docs/accordeur-accompagne/enregistrements')

let dossier: string
let micro: Float32Array, fs: number
let planning: Planning, verite: Verite | null = null
let meta: Record<string, string> = {}

if (a('simule')) {
  const seed = Number(a('seed') ?? 7)
  const jeu = construireJeuA({ reduit: !a('complet'), seed })
  dossier = join(racine, `simule-${a('complet') ? 'complet' : 'reduit'}-seed${seed}`)
  mkdirSync(dossier, { recursive: true })
  writeFileSync(join(dossier, 'micro.wav'), ecrireWav({ sampleRate: jeu.fs, donnees: jeu.micro }))
  writeFileSync(join(dossier, 'sortie.wav'), ecrireWav({ sampleRate: jeu.fs, donnees: jeu.sortie }))
  writeFileSync(join(dossier, 'planning.json'), JSON.stringify(jeu.planning))
  writeFileSync(join(dossier, 'verite.json'), JSON.stringify(jeu.verite))
  meta = { appareil: 'simulation numérique (aucun passage acoustique)', jeu: a('complet') ? 'A complet' : 'A réduit', graine: String(seed) }
  writeFileSync(join(dossier, 'meta.json'), JSON.stringify(meta, null, 2))
} else if (typeof a('dossier') === 'string') {
  dossier = resolve(String(a('dossier')))
} else {
  console.error('Usage : --simule [--complet] | --dossier <chemin>'); process.exit(1)
}

const w = lireWav(new Uint8Array(readFileSync(join(dossier, 'micro.wav'))))
micro = w.donnees; fs = w.sampleRate
planning = JSON.parse(readFileSync(join(dossier, 'planning.json'), 'utf8'))
if (existsSync(join(dossier, 'verite.json'))) verite = JSON.parse(readFileSync(join(dossier, 'verite.json'), 'utf8'))
if (existsSync(join(dossier, 'meta.json'))) meta = { ...JSON.parse(readFileSync(join(dossier, 'meta.json'), 'utf8')), ...meta }

// ── alignement sur le chirp : t = 0 au chirp ; l'écart est la latence de boucle ──
const { indice, qualite } = trouverChirp(micro, fs)
const latenceMs = (indice / fs) * 1000
micro = micro.subarray(indice)
planning = { ...planning, latenceBoucleMs: 0 }
console.log(`Chirp trouvé à ${latenceMs.toFixed(1)} ms (qualité ${qualite.toFixed(1)}) — micro aligné sur le planning.`)
meta['latence de boucle mesurée'] = `${latenceMs.toFixed(1)} ms (qualité du pic ${qualite.toFixed(1)})`

// ── élève synthétique sur un second appareil : son chirp est le 2e du micro, verite.json y est relative ──
if (verite && !a('simule') && !a('sans-chirp-eleve')) {
  const m12 = reechantillonner(micro, fs, 12000)
  const r2 = trouverChirp(m12, 12000, m12.length / 12000, 0.05, 2.0)
  if (r2.qualite >= 8) {
    const dt = r2.indice / 12000
    verite = {
      ...verite,
      notes: verite.notes.map(n => ({ ...n, tOn: n.tOn + dt, tOff: n.tOff + dt })),
      phasesSansEleve: verite.phasesSansEleve.map(([x, y]) => [x + dt, y + dt] as [number, number]),
    }
    meta['chirp de l’élève synthétique'] = `à ${dt.toFixed(3)} s du chirp de l’appareil (qualité ${r2.qualite.toFixed(1)})`
    console.log(`Chirp de l'élève synthétique trouvé à ${dt.toFixed(3)} s.`)
  } else console.warn(`Chirp de l'élève synthétique introuvable (qualité ${r2.qualite.toFixed(1)}) : verite.json non recalée. Utiliser --sans-chirp-eleve si c'est voulu.`)
}

const actuelle = []
if (verite && (mode === 'actuelle' || mode === 'les-deux')) {
  actuelle.push(evaluerChaineActuelle(micro, fs, verite, 0.82, 0.02))
  actuelle.push(evaluerChaineActuelle(micro, fs, verite, 0.70, 0.015))
}

let nouvelle = null
if (mode === 'nouvelle' || mode === 'les-deux') {
  const t0 = performance.now()
  const { trames, tempsCalculMs } = analyserEnregistrement(micro, fs, planning)
  const finales = passeFinale(micro, fs, planning, trames)
  meta['durée de calcul'] = `${((performance.now() - t0) / 1000).toFixed(0)} s pour ${(micro.length / fs).toFixed(0)} s d’enregistrement`
  console.log(`${trames.length} trames, ${finales.length} notes finales.`)
  writeFileSync(join(dossier, 'trames.csv'), ['t,f0Hz,sigmaCents,source,presence,rmsResidu', ...trames.map(t => [t.t.toFixed(3), t.f0Hz?.toFixed(3) ?? '', Number.isFinite(t.sigmaCents) ? t.sigmaCents.toFixed(3) : '', t.source, t.presence, t.rmsResidu.toExponential(3)].join(','))].join('\n'))
  if (verite) {
    nouvelle = evaluerNouvelleChaine(verite, finales, trames, tempsCalculMs)
    writeFileSync(join(dossier, 'notes.csv'), csvNotes(nouvelle.lignes))
  }
}
writeFileSync(join(dossier, 'rapport.md'), rapportMarkdown('Rapport d’analyse — accordeur accompagné', meta, nouvelle, actuelle))
console.log(`Rapport : ${join(dossier, 'rapport.md')}`)
