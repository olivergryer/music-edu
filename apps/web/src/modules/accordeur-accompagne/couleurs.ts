// ─── Palette signée de la page (brief UI v1, § 8) ─────────────────────────────
// juste = vert de l'app ; trop bas = bleu ; trop haut = orange foncé. Dans le seuil :
// vert pur. Au-delà : de 35 % à 100 % de la couleur extrême, atteinte à 25 ¢,
// interpolation en OKLCH. Le juste est l'état le plus clair (daltonisme).
// On n'utilise PAS `couleurJustesse` : ici le sens de l'écart compte.

export const JUSTE = '#34d399'
export const TROP_BAS = '#3b82f6'
export const TROP_HAUT = '#ea580c'
export const ECART_EXTREME_CENTS = 25
export const SATURATION_MIN = 0.35

type Triplet = [number, number, number]

function hexVersRgb(h: string): Triplet {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Triplet
}
const versLineaire = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const versGamma = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

/** sRGB (0–1) → OKLCH [L, C, h en degrés]. */
export function rgbVersOklch([r, g, b]: Triplet): Triplet {
  const [lr, lg, lb] = [r, g, b].map(versLineaire)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

/** OKLCH → sRGB (0–1), borné. */
export function oklchVersRgb([L, C, h]: Triplet): Triplet {
  const A = C * Math.cos((h * Math.PI) / 180)
  const B = C * Math.sin((h * Math.PI) / 180)
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [lr, lg, lb].map((c) => Math.min(1, Math.max(0, versGamma(Math.min(1, Math.max(0, c)))))) as Triplet
}

function rgbVersHex(rgb: Triplet): string {
  return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
}

/** Interpolation OKLCH par le plus court chemin de teinte. */
export function melangerOklch(a: string, b: string, t: number): string {
  const [L1, C1, h1] = rgbVersOklch(hexVersRgb(a))
  const [L2, C2, h2] = rgbVersOklch(hexVersRgb(b))
  let dh = h2 - h1
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  return rgbVersHex(oklchVersRgb([L1 + (L2 - L1) * t, C1 + (C2 - C1) * t, (h1 + dh * t + 360) % 360]))
}

/** Luminosité perceptuelle OKLab d'une couleur hexadécimale (pour les tests de clarté). */
export function luminositeOklab(hex: string): number {
  return rgbVersOklch(hexVersRgb(hex))[0]
}

/** Part de la couleur extrême : 0 dans le seuil, 0,35 juste au-delà, 1 à 25 ¢. */
export function saturationEcart(ecart: number, seuil: number): number {
  const a = Math.abs(ecart)
  if (a <= seuil) return 0
  const t = ECART_EXTREME_CENTS <= seuil ? 1 : Math.min((a - seuil) / (ECART_EXTREME_CENTS - seuil), 1)
  return SATURATION_MIN + (1 - SATURATION_MIN) * t
}

/** Couleur d'un écart signé (négatif = trop bas). */
export function couleurEcart(ecart: number, seuil: number): string {
  const k = saturationEcart(ecart, seuil)
  if (k === 0) return JUSTE
  return melangerOklch(JUSTE, ecart < 0 ? TROP_BAS : TROP_HAUT, k)
}

/** Libellé signé : « +6,0 ¢ », « −12,0 ¢ », « ±0,0 ¢ ». */
export function formaterEcart(c: number, decimales = 1): string {
  const signe = c > 0.05 ? '+' : c < -0.05 ? '−' : '±'
  return `${signe}${Math.abs(c).toFixed(decimales).replace('.', ',')} ¢`
}
