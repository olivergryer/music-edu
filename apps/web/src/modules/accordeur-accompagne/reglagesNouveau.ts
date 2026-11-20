// ─── Réglages du nouveau moteur (soustraction de l'accompagnement + modèle conjoint) ───
// Logique pure. Deux groupes :
//   « trame »        : changent le calcul de CHAQUE trame (50 ms) → recalcul complet de la prise ;
//   « segmentation » : changent la découpe en notes et la passe finale → recalcul rapide,
//                      les trames déjà calculées sont conservées.

import { PROFIL_ACCOMPAGNE } from './dsp/soustraction.ts'
import { SIGMA_MPM_DEFAUT_CENTS } from './dsp/fusion.ts'
import type { OptionsFinale, OptionsPipeline } from './dsp/pipeline.ts'

export interface ReglagesNouveau {
  // — trame —
  clarityThreshold: number     // clarté MPM minimale sur le résidu
  gateRelatif: number          // niveau du résidu rapporté à celui du playback
  seuilF: number               // statistique de présence du modèle conjoint
  sigmaMpmCents: number        // incertitude attribuée à la piste rapide dans la fusion
  fenetreMaxS: number          // fenêtre d'affinage du modèle (s)
  gardeAttaqueMs: number       // temps ignoré après chaque attaque du playback (ms)
  fenetreMpm: number           // échantillons de la piste rapide : 1024 (≈ 21 ms) ou 2048 (≈ 43 ms)
  pasMs: number                // pas d'analyse (ms)
  confirmations: number        // trames consécutives pour confirmer une attaque
  amorceMs: number             // fenêtre du modèle pour amorcer / confirmer une note (ms)
  debutStableMs: number        // début de note ignoré avant la mesure fine (ms)
  silenceFinMs: number         // silence qui termine la note suivie (ms)
  // — segmentation —
  silenceDurationMs: number
  noteJumpCents: number
  minNoteDurationMs: number
  reattackDropRatio: number
}

export const NOUVEAU_DEFAUT: ReglagesNouveau = {
  clarityThreshold: PROFIL_ACCOMPAGNE.clarityThreshold,
  gateRelatif: PROFIL_ACCOMPAGNE.gateRelatif,
  seuilF: 60,
  sigmaMpmCents: SIGMA_MPM_DEFAUT_CENTS,
  fenetreMaxS: 1.0,
  gardeAttaqueMs: 40,
  fenetreMpm: 2048,
  pasMs: 50,
  confirmations: 2,
  amorceMs: 80,
  debutStableMs: 60,
  silenceFinMs: 105,
  silenceDurationMs: PROFIL_ACCOMPAGNE.silenceDurationMs,
  noteJumpCents: PROFIL_ACCOMPAGNE.noteJumpCents,
  minNoteDurationMs: PROFIL_ACCOMPAGNE.minNoteDurationMs,
  reattackDropRatio: PROFIL_ACCOMPAGNE.reattackDropRatio,
}

export type GroupeNouveau = 'trame' | 'segmentation'

export interface ChampNouveau {
  cle: keyof ReglagesNouveau
  groupe: GroupeNouveau
  label: string
  unite: string
  min: number; max: number; pas: number
  decimales: number
  aide: string
  /** Valeurs possibles (boutons au lieu d'un curseur). */
  choix?: { valeur: number; label: string }[]
}

export const CHAMPS_NOUVEAU: readonly ChampNouveau[] = [
  { cle: 'clarityThreshold', groupe: 'trame', label: 'Seuil de clarté', unite: '', min: 0.5, max: 0.95, pas: 0.01, decimales: 2,
    aide: 'Netteté minimale de la hauteur détectée une fois l’accompagnement retiré. Plus haut : moins de fausses notes (souffle, résidu), mais les notes douces ou instables sont manquées.' },
  { cle: 'gateRelatif', groupe: 'trame', label: 'Porte relative', unite: '', min: 0.005, max: 0.3, pas: 0.005, decimales: 3,
    aide: 'Niveau minimal de ton jeu comparé à celui de l’accompagnement au micro. Plus haut : ignore ce qui est trop faible devant l’accompagnement ; plus bas : capte un jeu discret, au risque de prendre du résidu pour une note.' },
  { cle: 'seuilF', groupe: 'trame', label: 'Seuil de présence', unite: '', min: 10, max: 200, pas: 5, decimales: 0,
    aide: 'Confiance exigée du modèle conjoint pour dire « l’élève joue ». Plus haut : détection plus sûre mais plus tardive ; plus bas : plus réactif, plus de fausses présences.' },
  { cle: 'sigmaMpmCents', groupe: 'trame', label: 'Poids de la piste rapide', unite: '¢', min: 1, max: 30, pas: 1, decimales: 0,
    aide: 'Incertitude attribuée à la mesure rapide quand on la combine à celle du modèle. Plus bas : la piste rapide pèse davantage ; plus haut : on fait plus confiance au modèle précis.' },
  { cle: 'fenetreMaxS', groupe: 'trame', label: 'Fenêtre d’affinage', unite: 's', min: 0.3, max: 2, pas: 0.1, decimales: 1,
    aide: 'Durée maximale de signal que le modèle utilise pour affiner la hauteur d’une note. Plus long : mesure plus fine sur les notes tenues ; plus court : suit mieux un son qui bouge.' },
  { cle: 'gardeAttaqueMs', groupe: 'trame', label: 'Garde d’attaque', unite: 'ms', min: 0, max: 150, pas: 5, decimales: 0,
    aide: 'Durée ignorée après chaque attaque de l’accompagnement (le clic d’attaque est trop riche pour être retiré proprement). Plus long : plus propre, mais on perd le début des notes jouées sur une attaque.' },
  { cle: 'fenetreMpm', groupe: 'trame', label: 'Fenêtre de la piste rapide', unite: '', min: 1024, max: 2048, pas: 1024, decimales: 0,
    choix: [{ valeur: 1024, label: 'Courte (≈ 21 ms)' }, { valeur: 2048, label: 'Normale (≈ 43 ms)' }],
    aide: 'Durée de signal analysée pour repérer la hauteur. Courte : repère une note plus vite et gêne moins les notes qui tombent sur une attaque de l’accompagnement (notes rapides) ; mais les graves sont moins sûrs. Normale : plus stable.' },
  { cle: 'pasMs', groupe: 'trame', label: 'Pas d’analyse', unite: 'ms', min: 20, max: 100, pas: 5, decimales: 0,
    aide: 'Intervalle entre deux mesures. Plus petit : suit mieux les notes rapides (une double croche à 100 dure 150 ms, soit 3 mesures à 50 ms) ; plus de calcul.' },
  { cle: 'confirmations', groupe: 'trame', label: 'Confirmation d’une attaque', unite: '', min: 1, max: 3, pas: 1, decimales: 0,
    choix: [{ valeur: 1, label: '1 trame' }, { valeur: 2, label: '2 trames' }, { valeur: 3, label: '3 trames' }],
    aide: 'Nombre de mesures consécutives qui valident le début d’une note. 1 : début plus précoce (notes rapides) mais plus sensible aux parasites ; 2 ou 3 : plus sûr.' },
  { cle: 'amorceMs', groupe: 'trame', label: 'Fenêtre d’amorçage', unite: 'ms', min: 30, max: 150, pas: 5, decimales: 0,
    aide: 'Signal que le modèle utilise pour confirmer qu’une note vient de commencer ou change. Court : réagit vite aux notes rapides ; long : plus sûr, mais traîne.' },
  { cle: 'debutStableMs', groupe: 'trame', label: 'Début de note ignoré', unite: 'ms', min: 10, max: 100, pas: 5, decimales: 0,
    aide: 'Temps écarté au début d’une note (attaque du souffle) avant la mesure fine de sa hauteur. Court : mesure aussi les notes brèves ; long : évite l’instabilité de l’attaque.' },
  { cle: 'silenceFinMs', groupe: 'trame', label: 'Silence de fin de note', unite: 'ms', min: 30, max: 200, pas: 5, decimales: 0,
    aide: 'Durée sans son qui termine la note suivie. Court : sépare mieux deux notes détachées rapides ; long : ne coupe pas une note qui vacille.' },
  { cle: 'silenceDurationMs', groupe: 'segmentation', label: 'Silence', unite: 'ms', min: 20, max: 300, pas: 5, decimales: 0,
    aide: 'Durée sans note qui coupe une note. Plus court : sépare les notes legato ; trop court : coupe une note qui vacille.' },
  { cle: 'noteJumpCents', groupe: 'segmentation', label: 'Saut de note', unite: '¢', min: 20, max: 200, pas: 5, decimales: 0,
    aide: 'Écart de hauteur entre deux trames qui sépare deux notes. Petit : sépare les notes proches (legato) ; trop petit : coupe un vibrato ou une note instable.' },
  { cle: 'minNoteDurationMs', groupe: 'segmentation', label: 'Durée minimale', unite: 'ms', min: 30, max: 300, pas: 5, decimales: 0,
    aide: 'Les notes plus courtes sont ignorées.' },
  { cle: 'reattackDropRatio', groupe: 'segmentation', label: 'Ré-attaque', unite: '', min: 0, max: 0.9, pas: 0.05, decimales: 2,
    aide: 'Pour les notes répétées de même hauteur : coupe sur un creux d’amplitude. 0 = désactivé.' },
]

const CLE = 'acc_nouveau_params'

export function lireReglagesNouveau(): ReglagesNouveau {
  const r = { ...NOUVEAU_DEFAUT }
  try {
    const j = JSON.parse(localStorage.getItem(CLE) ?? 'null')
    if (j && typeof j === 'object') for (const c of CHAMPS_NOUVEAU) { const v = Number(j[c.cle]); if (Number.isFinite(v)) r[c.cle] = Math.min(c.max, Math.max(c.min, v)) }
  } catch { /* défauts */ }
  return r
}

export function memoriserReglagesNouveau(r: ReglagesNouveau): void {
  try { localStorage.setItem(CLE, JSON.stringify(r)) } catch { /* stockage indisponible */ }
}

/** Profil de segmentation / de portes passé aux fonctions du moteur. */
export function profilDe(r: ReglagesNouveau): typeof PROFIL_ACCOMPAGNE {
  return {
    ...PROFIL_ACCOMPAGNE,
    clarityThreshold: r.clarityThreshold, gateRelatif: r.gateRelatif,
    silenceDurationMs: r.silenceDurationMs, noteJumpCents: r.noteJumpCents,
    minNoteDurationMs: r.minNoteDurationMs, reattackDropRatio: r.reattackDropRatio,
  }
}

export function optionsPipelineDe(r: ReglagesNouveau): OptionsPipeline {
  return {
    profil: profilDe(r), seuilF: r.seuilF, sigmaMpmCents: r.sigmaMpmCents, fenetreMaxS: r.fenetreMaxS, gardeAttaqueS: r.gardeAttaqueMs / 1000,
    fenetreMpm: r.fenetreMpm, pasS: r.pasMs / 1000, confirmations: r.confirmations, amorceS: r.amorceMs / 1000,
    debutStableS: r.debutStableMs / 1000, silenceFinS: r.silenceFinMs / 1000,
  }
}

export function optionsFinaleDe(r: ReglagesNouveau, diapason: number): OptionsFinale {
  return { diapason, profil: profilDe(r), gardeAttaqueS: r.gardeAttaqueMs / 1000, debutStableS: r.debutStableMs / 1000 }
}

/** Clé des réglages qui déterminent les trames : si elle est inchangée, les trames restent valables. */
export function cleTrames(r: ReglagesNouveau): string {
  return CHAMPS_NOUVEAU.filter(c => c.groupe === 'trame').map(c => r[c.cle]).join('|')
}

export interface PreregalageNouveau { id: string; label: string; aide: string; valeurs: Partial<ReglagesNouveau> }

/** Ensembles de valeurs prêts à l'emploi. « Notes rapides » : validé sur un signal synthétique (16 doubles croches à 100 sur accompagnement à la noire, legato et détaché : 16 notes sur 16 ; les valeurs standard en trouvent 10 en legato et aucune en détaché). */
export const PREREGLAGES_NOUVEAU: readonly PreregalageNouveau[] = [
  { id: 'standard', label: 'Standard', aide: 'Réglages d’origine, adaptés aux notes tenues et aux croches.', valeurs: {} },
  {
    id: 'rapides', label: 'Notes rapides', aide: 'Pour les doubles croches et les passages virtuoses : analyse plus fine et plus réactive.',
    valeurs: { gardeAttaqueMs: 20, fenetreMpm: 1024, pasMs: 25, confirmations: 1, amorceMs: 50, minNoteDurationMs: 60, silenceDurationMs: 30, noteJumpCents: 25 },
  },
]

export function appliquerPreregalage(p: PreregalageNouveau): ReglagesNouveau {
  return { ...NOUVEAU_DEFAUT, ...p.valeurs }
}

/** Préréglage dont les valeurs sont exactement celles courantes, sinon null (réglage libre). */
export function preregalageActif(r: ReglagesNouveau): string | null {
  for (const p of PREREGLAGES_NOUVEAU) {
    const v = appliquerPreregalage(p)
    if ((Object.keys(v) as (keyof ReglagesNouveau)[]).every(k => v[k] === r[k])) return p.id
  }
  return null
}
