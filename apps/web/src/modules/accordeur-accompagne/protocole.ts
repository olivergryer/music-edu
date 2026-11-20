// ─── Protocole de messages entre fil principal, worklet et Worker ─────────────
//
//   fil principal ──(node.port)──▶ worklet     : planning, démarrer, arrêter, port
//   worklet ──(node.port)──▶ fil principal     : stroboscope (~60 Hz), coupures, niveau
//   worklet ◀──(canal dédié)──▶ Worker         : blocs micro/sortie datés, présence
//   fil principal ──(worker)──▶ Worker         : init, arrêter
//   Worker ──(worker)──▶ fil principal         : trames, latence, notes finales, enregistrements

import type { Reglage } from './dsp/reglages.ts'
import type { ReglagesSegmentation } from '../../profilsSegmentation.ts'
import type { NoteAncien } from './ancienMoteur.ts'
import type { PointHauteur } from './sparklines.ts'
import type { ReglagesNouveau } from './reglagesNouveau.ts'
import type { EtatStrobe, NoteFinale, Planning, TrameAnalyse } from './dsp/types.ts'

export type ModeAffichage = 'live' | 'fin'
export type MoteurDetection = 'ancien' | 'nouveau'

// fil principal → worklet
export type VersWorklet =
  | { type: 'port'; port: MessagePort }
  | { type: 'planning'; planning: Planning }
  | { type: 'reglage'; entree: number; role: string; reglage: Reglage }      // son qui sonne : appliqué au prochain bloc
  | { type: 'futur'; planning: Planning; tCoupure: number }                  // changement de structure : à la frontière
  | { type: 'gain'; gain: number }
  | { type: 'demarrer' }
  | { type: 'arreter' }

// worklet → fil principal
export type DepuisWorklet =
  | { type: 'strobe'; etats: EtatStrobe[]; coupures: number; rmsMicro: number; t: number; tCtx: number }
  | { type: 'fini' }

// worklet → Worker (et Worker → worklet pour la présence)
export type WorkletVersWorker =
  | { type: 'micro'; frame0: number; donnees: Float32Array }
  | { type: 'sortie'; frame0: number; donnees: Float32Array }
  // mêmes modifications que celles appliquées par le worklet, à l'instant t (horloge du planning)
  | { type: 'reglage'; t: number; entree: number; role: string; reglage: Reglage }
  | { type: 'futur'; planning: Planning; tCoupure: number }
  | { type: 'gain'; gain: number }
export type WorkerVersWorklet = { type: 'presence'; present: boolean }

// fil principal → Worker
export type VersWorker =
  | { type: 'init'; port: MessagePort; planning: Planning; fs: number; mode: ModeAffichage; diapason: number; analyse: boolean
      moteur?: MoteurDetection; reglagesAncien?: ReglagesSegmentation; latenceSecoursMs?: number | null; reglagesNouveau?: ReglagesNouveau }
  | { type: 'reglagesAncien'; reglages: ReglagesSegmentation }
  | { type: 'arreter' }

// Worker → fil principal
export type DepuisWorker =
  | { type: 'latence'; ms: number; qualite: number }
  | { type: 'trame'; trame: TrameAnalyse; msCalcul: number }
  | { type: 'progression'; texte: string }
  | { type: 'notesAncien'; notes: NoteAncien[]; points: PointHauteur[]; depuisT: number }
  | { type: 'fini'; notes: NoteFinale[]; trames: TrameAnalyse[]; micro: Float32Array; sortie: Float32Array; tempsCalculMs: number[]; offsetMicro: number
      brut?: { hz: Float32Array; clarity: Float32Array; rms: Float32Array }
      planning?: Planning }   // planning tel que le Worker l'a modifié (réglages à chaud)
  | { type: 'erreur'; message: string }

// ─── Recalcul d'une prise déjà enregistrée (autre moteur, autres réglages) ─────────
// fil principal → Worker de recalcul
export type VersRecalcul =
  | { type: 'ancien'; id: number; micro: Float32Array; fs: number }
  | { type: 'nouveau'; id: number; micro: Float32Array; fs: number; offset: number; planning: Planning; diapason: number
      reglages: ReglagesNouveau; trames?: TrameAnalyse[] }      // trames fournies : on saute l'analyse par trame
// Worker de recalcul → fil principal
export type DepuisRecalcul =
  | { type: 'progression'; id: number; texte: string }
  | { type: 'ancien'; id: number; brut: { hz: Float32Array; clarity: Float32Array; rms: Float32Array } }
  | { type: 'nouveau'; id: number; trames: TrameAnalyse[]; notes: NoteFinale[] }
  | { type: 'erreur'; id: number; message: string }
