// ─── Réglages partagés avec l'Accordeur et réglages propres à la page (brief UI v1, § 1.8) ──
// Lecture protégée (stockage indisponible, valeurs invalides) : on retombe sur les défauts.

import type { Referentiel } from './references.ts'
import type { Cle } from './notation.ts'
import type { MoteurDetection } from './protocole.ts'

export interface ReglagesAccordeur {
  diapason: number
  transpo: string
  ref: Referentiel
  seuil: number
  tempUser: number[]
}

function lire(cle: string): string | null {
  try { return localStorage.getItem(cle) } catch { return null }
}
export function ecrire(cle: string, v: string): void {
  try { localStorage.setItem(cle, v) } catch { /* stockage indisponible */ }
}

export function lireReglagesAccordeur(): ReglagesAccordeur {
  const d = parseFloat(lire('acc_diapason') ?? '')
  const s = parseInt(lire('acc_seuil') ?? '', 10)
  const r = lire('acc_ref')
  let tempUser: number[] = []
  try { const t = JSON.parse(lire('acc_temperament_user') ?? '[]'); if (Array.isArray(t)) tempUser = t.map(Number).map(x => (Number.isFinite(x) ? x : 0)) } catch { /* défaut */ }
  return {
    diapason: Number.isFinite(d) && d > 400 && d < 480 ? d : 442,
    transpo: lire('acc_transpo') || 'C',
    ref: r === 'tempere' || r === 'utilisateur' || r === '5-limite' ? r : '5-limite',
    seuil: Number.isFinite(s) && s > 0 ? s : 5,
    tempUser,
  }
}

export type ModeAffichageAcc = 'live' | 'fin'
export type VueAccord = 'horloge' | 'echelle'
export type PolitiqueEcho = 'auto' | 'activee' | 'desactivee'

export interface ReglagesPage {
  cle: Cle
  affichage: ModeAffichageAcc
  vueAccord: VueAccord
  echo: PolitiqueEcho
  installVu: boolean
  moteur: MoteurDetection
}

export function lireReglagesPage(): ReglagesPage {
  const c = lire('acc_cle'), a = lire('acc_affichage'), v = lire('acc_vue_accord'), e = lire('acc_echo'), mo = lire('acc_moteur')
  return {
    cle: c === 'fa' ? 'fa' : 'sol',
    affichage: a === 'fin' ? 'fin' : 'live',
    vueAccord: v === 'echelle' ? 'echelle' : 'horloge',
    echo: e === 'activee' || e === 'desactivee' ? e : 'auto',
    installVu: lire('acc_install_vu') === '1',
    moteur: mo === 'nouveau' ? 'nouveau' : 'ancien',
  }
}

/** iPhone seulement (l'iPad n'est pas concerné par le bandeau). */
export function estIPhone(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPhone/.test(ua)
}
export function estIOS(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
}

/** Annulation d'écho : activée sur iOS, désactivée ailleurs (conclusions du spike), sauf choix explicite. */
export function echoEffectif(p: PolitiqueEcho): 'activee' | 'desactivee' {
  if (p === 'activee' || p === 'desactivee') return p
  return estIOS() ? 'activee' : 'desactivee'
}
