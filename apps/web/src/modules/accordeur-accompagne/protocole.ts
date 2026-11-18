// ─── Protocole de messages entre fil principal, worklet et Worker ─────────────
//
//   fil principal ──(node.port)──▶ worklet     : planning, démarrer, arrêter, port
//   worklet ──(node.port)──▶ fil principal     : stroboscope (~60 Hz), coupures, niveau
//   worklet ◀──(canal dédié)──▶ Worker         : blocs micro/sortie datés, présence
//   fil principal ──(worker)──▶ Worker         : init, arrêter
//   Worker ──(worker)──▶ fil principal         : trames, latence, notes finales, enregistrements

import type { Reglage } from './dsp/reglages.ts'
import type { EtatStrobe, NoteFinale, Planning, TrameAnalyse } from './dsp/types.ts'

export type ModeAffichage = 'live' | 'fin'

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
  | { type: 'init'; port: MessagePort; planning: Planning; fs: number; mode: ModeAffichage; diapason: number; analyse: boolean }
  | { type: 'arreter' }

// Worker → fil principal
export type DepuisWorker =
  | { type: 'latence'; ms: number; qualite: number }
  | { type: 'trame'; trame: TrameAnalyse; msCalcul: number }
  | { type: 'progression'; texte: string }
  | { type: 'fini'; notes: NoteFinale[]; trames: TrameAnalyse[]; micro: Float32Array; sortie: Float32Array; tempsCalculMs: number[]; offsetMicro: number }
  | { type: 'erreur'; message: string }
