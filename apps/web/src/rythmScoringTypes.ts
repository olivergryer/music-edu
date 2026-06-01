// ─── Types partagés du moteur de scoring rythmique (act. 1 & 2) ───────────────
// Module pur, framework-agnostic. Aucune dépendance React/Firebase.

export type Activity = 1 | 2;

export interface RhythmAttempt {
  /** Onsets cibles en temps-partition canonique (ex. en pulsations / beats), PAS en ms. */
  targetOnsets: number[];
  /** Onsets utilisateur captés, en millisecondes réelles. */
  userOnsets: number[];
  /** ms par unité de temps-partition (clic imposé). `undefined` ⇒ tempo libre (act. 2 par défaut). */
  targetTempoMsPerUnit?: number;
  activity: Activity;
}

export interface AlignedPair {
  targetIdx: number;
  userIdx: number;
  targetTime: number; // unité = temps-partition
  userTime: number;   // ms
}

export interface Alignment {
  pairs: AlignedPair[];
  /** Indices des cibles non frappées (délétions). */
  missingTargetIdx: number[];
  /** Indices des frappes sans cible (insertions). */
  extraUserIdx: number[];
}

export interface FitResult {
  /** Pente : ms par unité de temps-partition (= tempo effectif de l'utilisateur). */
  a: number;
  /** Ordonnée à l'origine : ms (avance/retard systématique au départ). */
  b: number;
  /** Résidus en ms, alignés sur `Alignment.pairs` (même ordre). */
  residuals: number[];
}

export type Drift = "none" | "accelerating" | "decelerating";

export interface RhythmDiagnosis {
  offsetMs: number;      // = b après dead-zone
  tempoRatio: number;    // a / targetTempoMsPerUnit (1 si tempo libre)
  regularityMs: number;  // dispersion robuste (MAD × 1.4826) des résidus
  drift: Drift;
  extraCount: number;
  missingCount: number;
  flags: string[];       // clés i18n (OFFSET_LATE, TEMPO_FAST, DRIFT_ACCEL, …)
}

export interface RhythmScoreComponents {
  completeness: number; // 0..1
  regularity: number;   // 0..1
  offset: number;       // 0..1
  tempo: number;        // 0..1
}

export interface RhythmScore {
  total: number;        // 0..1 — produit pondéré des composantes
  components: RhythmScoreComponents;
  diagnosis: RhythmDiagnosis;
  alignment: Alignment;
  fit: FitResult;
}

export interface ScoringParams {
  // Alignement
  gapFactor: number;          // GAP = gapFactor × medianTargetIOIms
  maxIter: number;            // boucle EM
  // Bruit & dead-zone
  inputNoiseFloorMs: number;  // À MESURER PAR DEVICE — défaut conservateur
  // Régularité
  regMaxMs: number;           // dispersion à laquelle regularity → 0
  regExp: number;             // exposant de la composante régularité
  // Décalage
  offsetMaxMs: number;        // borne enveloppe
  // Tempo
  tempoTolRel: number;        // tolérance avant pénalité (ex. 0.02 = ±2 %)
  tempoMaxRel: number;        // borne enveloppe (ex. 0.05 = ±5 %)
  // Dérive
  driftThresholdRel: number;  // variation relative déclenchant le flag
  // Pondérations agrégation
  wRegularity: number;
  wOffset: Record<Activity, number>;
  wTempo:  Record<Activity, number>;
  // Motifs courts
  minNotesForTempo: number;   // sous ce nb de NOTES CIBLES, wTempo forcé à 0
}
