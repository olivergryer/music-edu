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
  // Régularité (incl. drift via résidus — bornée haut pour ne pas écraser un enfant qui dérive)
  regMaxMs: 200,
  regExp: 0.8,
  // Décalage (assoupli : flag à 200 ms, zéro seulement au-delà de 400 ms)
  offsetMaxMs: 400,
  // Tempo (zone de tolérance ±5%, saturation à 0 seulement au-delà de ±30%)
  tempoTolRel: 0.05,
  tempoMaxRel: 0.25,
  // Dérive (flag uniquement, pas de composante dédiée — seuil relâché)
  driftThresholdRel: 0.18,
  // Pondérations (offset abaissé : décalage systématique = défaut mineur, facile à corriger)
  wRegularity: 1.0,
  wOffset: { 1: 0.3, 2: 0.3 },
  wTempo:  { 1: 0.7, 2: 0.0 }, // act. 2 : tempo libre → non pénalisé
  // Motifs courts
  minNotesForTempo: 5,
};
