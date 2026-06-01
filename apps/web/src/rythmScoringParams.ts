// ─── Paramètres par défaut du moteur de scoring rythmique ─────────────────────
// Valeurs de départ : à calibrer empiriquement (device + population cible).
// `inputNoiseFloorMs` et `regMaxMs` notamment doivent être ajustés après mesures.

import type { ScoringParams } from "./rythmScoringTypes.ts";

export const DEFAULT_PARAMS: ScoringParams = {
  // Alignement
  gapFactor: 0.5,
  maxIter: 3,
  // Bruit & dead-zone (TODO calibration ; 25 ms = jitter tactile usuel tablette/portable)
  inputNoiseFloorMs: 25,
  // Régularité
  regMaxMs: 150,   // MAD à laquelle régularité → 0 (assoupli : un enfant jouant avec 50 ms MAD garde une bonne note)
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
  minNotesForTempo: 5,
};
