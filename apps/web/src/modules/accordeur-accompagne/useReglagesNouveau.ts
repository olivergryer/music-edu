// ─── État des réglages du nouveau moteur (mémorisés dans `acc_nouveau_params`) ──────────
import { useCallback, useMemo, useState } from 'react'
import { lireReglagesNouveau, memoriserReglagesNouveau, NOUVEAU_DEFAUT, type ReglagesNouveau } from './reglagesNouveau.ts'

export interface EtatNouveau {
  reglages: ReglagesNouveau
  modifier: (cle: keyof ReglagesNouveau, v: number) => void
  remplacer: (r: ReglagesNouveau) => void
  retourDefaut: () => void
}

export function useReglagesNouveau(): EtatNouveau {
  const [reglages, setReglages] = useState<ReglagesNouveau>(lireReglagesNouveau)
  const modifier = useCallback((cle: keyof ReglagesNouveau, v: number) => {
    setReglages(r => { const n = { ...r, [cle]: v }; memoriserReglagesNouveau(n); return n })
  }, [])
  const remplacer = useCallback((r: ReglagesNouveau) => { memoriserReglagesNouveau(r); setReglages(r) }, [])
  const retourDefaut = useCallback(() => { memoriserReglagesNouveau(NOUVEAU_DEFAUT); setReglages({ ...NOUVEAU_DEFAUT }) }, [])
  return useMemo(() => ({ reglages, modifier, remplacer, retourDefaut }), [reglages, modifier, remplacer, retourDefaut])
}
