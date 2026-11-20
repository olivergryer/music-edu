// ─── Worker de recalcul : rejoue l'analyse d'une prise déjà enregistrée ───────────────
// Sert à comparer les deux moteurs sur le MÊME enregistrement et à recalculer quand un
// réglage change, sans bloquer l'interface ni rejouer.

import { SerieBrute } from './ancienMoteur.ts'
import { analyserEnregistrement, passeFinale } from './dsp/pipeline.ts'
import type { DepuisRecalcul, VersRecalcul } from './protocole.ts'
import { optionsFinaleDe, optionsPipelineDe } from './reglagesNouveau.ts'

const ctx = self as unknown as { postMessage: (m: DepuisRecalcul, t?: Transferable[]) => void; onmessage: ((e: MessageEvent<VersRecalcul>) => void) | null }

ctx.onmessage = (e: MessageEvent<VersRecalcul>) => {
  const m = e.data
  try {
    if (m.type === 'ancien') {
      ctx.postMessage({ type: 'progression', id: m.id, texte: 'Analyse avec l’ancien moteur…' })
      const s = new SerieBrute()
      s.avancer(m.micro, m.fs)
      ctx.postMessage({ type: 'ancien', id: m.id, brut: s.exporter() })
    } else {
      const alignee = m.micro.subarray(Math.max(0, m.offset))
      let trames = m.trames
      if (!trames) {
        ctx.postMessage({ type: 'progression', id: m.id, texte: 'Analyse avec le nouveau moteur (trame par trame)…' })
        trames = analyserEnregistrement(alignee, m.fs, m.planning, optionsPipelineDe(m.reglages)).trames
      }
      ctx.postMessage({ type: 'progression', id: m.id, texte: 'Passe finale…' })
      const notes = passeFinale(alignee, m.fs, m.planning, trames, optionsFinaleDe(m.reglages, m.diapason))
      ctx.postMessage({ type: 'nouveau', id: m.id, trames, notes })
    }
  } catch (err) {
    ctx.postMessage({ type: 'erreur', id: m.id, message: String((err as Error)?.message ?? err) })
  }
}
