// ─── Types du spike « Accordeur accompagné » (spec §5) ────────────────────────
// Code pur : aucun DOM, aucun Web Audio. Tourne dans le Worker, les tests node
// et le script hors ligne.

export const DIAPASON_PAR_DEFAUT = 442   // `DIAPASON_DEFAULT` n'existe pas dans le dépôt

// ─── Playback ────────────────────────────────────────────────────────────────
export type Partiel = { k: number; freqHz: number; amp: number; phase0: number }
export type Voix = { midi: number; cents: number; freqHz: number; partiels: Partiel[] }
export type Formule = 'tenu' | 'blanche' | 'noire' | 'croche' | 'clignotant'
export type Accordage = 'juste' | 'tempere'

export type EvenementAccord = {
  tDebut: number; tFin: number               // secondes, horloge du contexte audio
  accordId: string
  accordage: Accordage
  voix: Voix[]
  formule: Formule
  attaques: number[]                         // instants d'attaque du playback
}
export type Planning = {
  sampleRate: number
  latenceBoucleMs: number
  evenements: EvenementAccord[]
  gain: number                               // gain maître appliqué à la synthèse
}

// ─── Analyse ─────────────────────────────────────────────────────────────────
export type Battement = {
  voix: number; kEleve: number; mPlayback: number
  deltaHz: number        // signé : partiel élève − partiel playback
  intensite: number      // 0–1 : min(|S|,|C|) / max(|S|,|C|), au micro
  resolu: boolean        // false si |delta| < 1/(2T)
}
export type TrameAnalyse = {
  t: number
  f0Hz: number | null
  sigmaCents: number
  source: 'mpm' | 'modele' | 'fusion'
  candidats: number[]
  presence: boolean
  rmsResidu: number
  battements: Battement[]
  mpmHz?: number | null      // piste rapide seule (affichage « côte à côte »)
  modeleHz?: number | null   // modèle conjoint seul
  statF?: number             // statistique de présence du modèle (calibration)
  gainRel?: number           // part d'énergie expliquée par l'élève (calibration)
}
export type EtatStrobe = { voix: number; m: number; angle: number; vitesseHz: number; intensite: number }
export type NoteFinale = {
  tOn: number; tOff: number; midi: number; f0Hz: number
  centsTempere: number
  sigmaCents: number      // incertitude d'estimation
  sigmaIntraCents: number // variabilité dans la note (comme calculerEcarts)
  poids: number           // 1/sigma², pour les bilans
  battements: Battement[] // moyens, par voix
}

// ─── Utilitaires de conversion ────────────────────────────────────────────────
export const centsEntre = (hz: number, hzRef: number): number => 1200 * Math.log2(hz / hzRef)
export const midiVersHz = (midi: number, diapason = DIAPASON_PAR_DEFAUT): number =>
  diapason * Math.pow(2, (midi - 69) / 12)
export const hzVersMidi = (hz: number, diapason = DIAPASON_PAR_DEFAUT): number =>
  69 + 12 * Math.log2(hz / diapason)
