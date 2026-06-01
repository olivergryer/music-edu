// ─── Paramètres par défaut du moteur de scoring rythmique ─────────────────────
// Valeurs de départ : à calibrer empiriquement (device + population cible).
// `inputNoiseFloorMs` et `regMaxMs` notamment doivent être ajustés après mesures.

import type { ScoringParams } from "./rythmScoringTypes.ts";

export const DEFAULT_PARAMS: ScoringParams = {
  // Alignement
  gapFactor: 0.5,
  maxIter: 3,
  // Bruit & dead-zone (TODO calibration : viser ~15 ms tactile, peut bouger 10-25 ms)
  inputNoiseFloorMs: 15,
  // Régularité
  regMaxMs: 80,
  regExp: 0.8,
  // Décalage
  offsetMaxMs: 200,
  // Tempo
  tempoTolRel: 0.02,
  tempoMaxRel: 0.05,
  // Dérive
  driftThresholdRel: 0.08,
  // Pondérations
  wRegularity: 1.0,
  wOffset: { 1: 0.5, 2: 0.5 },
  wTempo:  { 1: 0.7, 2: 0.0 }, // act. 2 : tempo libre → non pénalisé
  // Motifs courts
  minNotesForTempo: 4,
};
