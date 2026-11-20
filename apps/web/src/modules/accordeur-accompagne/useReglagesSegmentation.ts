// ─── État des réglages de segmentation (profils + valeurs libres) ───────────────────
// Mêmes clés `acc_*` que l'Accordeur : modifier ici modifie là-bas. Profil par défaut :
// « Phrasé legato » tant que rien n'a été choisi.

import { useCallback, useMemo, useState } from 'react'
import {
  lireProfil, memoriserSegmentation, profilsEffectifs, PROFILS_DEFAUT, reglagesDuProfil, supprimerOverrideProfils,
  type NomProfil, type Profil, type ReglagesSegmentation,
} from '../../profilsSegmentation.ts'

export interface EtatSegmentation {
  profil: Profil
  reglages: ReglagesSegmentation
  appliquerProfil: (p: Profil) => void
  modifier: (cle: keyof ReglagesSegmentation, v: number) => void
  retourDefaut: () => void
}

export function useReglagesSegmentation(): EtatSegmentation {
  const [etat, setEtat] = useState<{ profil: Profil; reglages: ReglagesSegmentation }>(() => {
    const profil = lireProfil('legato')
    return { profil, reglages: reglagesDuProfil(profil) }
  })

  const appliquerProfil = useCallback((p: Profil) => {
    setEtat(e => {
      const reglages = p === 'custom' ? e.reglages : profilsEffectifs()[p]
      memoriserSegmentation(p, reglages)
      return { profil: p, reglages }
    })
  }, [])

  // modifier un réglage à la main bascule en « personnalisé »
  const modifier = useCallback((cle: keyof ReglagesSegmentation, v: number) => {
    setEtat(e => {
      const reglages = { ...e.reglages, [cle]: v }
      memoriserSegmentation('custom', reglages)
      return { profil: 'custom', reglages }
    })
  }, [])

  // retour aux valeurs d'usine : supprime l'override de calibration, garde le profil (legato si personnalisé)
  const retourDefaut = useCallback(() => {
    supprimerOverrideProfils()
    setEtat(e => {
      const nom: NomProfil = e.profil === 'custom' ? 'legato' : e.profil
      const reglages = { ...PROFILS_DEFAUT[nom] }
      memoriserSegmentation(nom, reglages)
      return { profil: nom, reglages }
    })
  }, [])

  return useMemo(() => ({ ...etat, appliquerProfil, modifier, retourDefaut }), [etat, appliquerProfil, modifier, retourDefaut])
}
