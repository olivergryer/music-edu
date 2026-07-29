// ─── Géométrie de la roue radiale (pure — spec §5, §12) ───────────────────────
//
// 7 secteurs de 51,4°, `do` à 12 h, sens horaire (do, re, mi, fa, sol, la, si).
// Repère écran : y vers le bas. atan2(dy,dx) → droite=0, bas=+90°, haut=−90°.
// « angleFromUp » = angle horaire depuis le haut, dans [0,360). Zone morte
// centrale (rayon ~20 px) : renvoie null (annulation sans pénalité).

import { NOTE_NAMES, type NoteName } from './types.ts'

export const SECTOR_COUNT = 7
export const SECTOR_DEG = 360 / SECTOR_COUNT       // 51.428…
export const DEFAULT_DEAD_RADIUS_PX = 20
const HALF_SECTOR = SECTOR_DEG / 2

function mod360(d: number): number {
  return ((d % 360) + 360) % 360
}

// Index de secteur (0=do … 6=si) depuis un angle écran en radians.
export function sectorIndexFromAngle(angleRad: number): number {
  const angleFromUp = mod360(angleRad * (180 / Math.PI) + 90)
  return Math.floor(mod360(angleFromUp + HALF_SECTOR) / SECTOR_DEG) % SECTOR_COUNT
}

// Angle → nom de note. `distPx`/`deadRadiusPx` : si fournis et sous le rayon mort,
// renvoie null (zone morte). Sans distance, l'angle est toujours résolu.
export function angleToNoteName(
  angleRad: number,
  distPx?: number,
  deadRadiusPx: number = DEFAULT_DEAD_RADIUS_PX,
): NoteName | null {
  if (distPx != null && distPx < deadRadiusPx) return null
  return NOTE_NAMES[sectorIndexFromAngle(angleRad)]
}

// Convenience : depuis le vecteur origine→pointeur (dx, dy en px écran).
export function noteNameFromVector(
  dx: number,
  dy: number,
  deadRadiusPx: number = DEFAULT_DEAD_RADIUS_PX,
): NoteName | null {
  const dist = Math.hypot(dx, dy)
  if (dist < deadRadiusPx) return null
  return angleToNoteName(Math.atan2(dy, dx), dist, deadRadiusPx)
}

// Angle du CENTRE d'un secteur (radians écran) — pour dessiner/étiqueter la roue.
export function sectorCenterAngle(index: number): number {
  const angleFromUp = index * SECTOR_DEG          // 0 = haut
  return (angleFromUp - 90) * (Math.PI / 180)     // retour en repère écran
}
