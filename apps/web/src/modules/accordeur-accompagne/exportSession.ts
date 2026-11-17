// ─── Export d'un enregistrement : les cinq fichiers de la section 5 ───────────
import { ecrireWav } from './dsp/wav.ts'
import type { Resultat } from './moteurAudio.ts'

export type MetaSession = Record<string, string>

export type FichierExport = { nom: string; blob: Blob }

export function fichiersExport(r: Resultat, meta: MetaSession, verite: string | null): FichierExport[] {
  const wav = (d: Float32Array) => new Blob([ecrireWav({ sampleRate: r.sampleRate, donnees: d }) as BlobPart], { type: 'audio/wav' })
  const planning = { ...r.planning, latenceBoucleMs: r.latenceMs ?? 0 }
  const metaComplete: MetaSession = {
    ...meta, ...r.infoAudio,
    'latence de boucle (ms)': r.latenceMs === null ? 'non mesurée' : r.latenceMs.toFixed(1),
    'coupures audio': String(r.coupures),
    'user agent': navigator.userAgent,
    date: new Date().toISOString(),
  }
  const out: FichierExport[] = [
    { nom: 'micro.wav', blob: wav(r.micro) },
    { nom: 'sortie.wav', blob: wav(r.sortie) },
    { nom: 'planning.json', blob: new Blob([JSON.stringify(planning)], { type: 'application/json' }) },
    { nom: 'meta.json', blob: new Blob([JSON.stringify(metaComplete, null, 2)], { type: 'application/json' }) },
  ]
  if (verite) out.push({ nom: 'verite.json', blob: new Blob([verite], { type: 'application/json' }) })
  return out
}

export function telecharger(f: FichierExport, prefixe: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(f.blob)
  a.download = `${prefixe}-${f.nom}`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
