// ─── Pipeline d'analyse par trame + passe finale (spec §6.3 à §6.9) ───────────
// Version « enregistrement » : traite un micro déjà aligné sur le planning (t = 0 au
// chirp). Le même code tournera dans le Worker (S3) en lui passant les blocs au fil
// de l'eau ; ici on l'appelle sur un tampon complet, ce qui sert au script hors ligne.

import { fusionnerEstimations, genererCandidats, ecartOctave, SIGMA_MPM_DEFAUT_CENTS, type Estimation } from './fusion.ts'
import { fusionnerPartiels } from './fusionPartiels.ts'
import { ajusterF0, amplitudesPlaybackSeul, creerContexte, type ResultatModele } from './modeleConjoint.ts'
import { NiveauPlaybackAppris, choisirCandidatDegenere } from './presence.ts'
import { reechantillonner } from './reechantillonnage.ts'
import { segmenterTrames } from './segmentation.ts'
import { detecterSurResidu, mpm, PROFIL_ACCOMPAGNE } from './soustraction.ts'
import {
  DIAPASON_PAR_DEFAUT, hzVersMidi, midiVersHz,
  type Battement, type EvenementAccord, type NoteFinale, type Planning, type TrameAnalyse, type Voix,
} from './types.ts'

export const FS_MODELE = 16000
const FENETRE_MPM = 2048
const GARDE_ATTAQUE_S = 0.040        // §6.9 : à calibrer
const FENETRE_AMORCE_S = 0.080
const DEBUT_STABLE_S = 0.060
const FENETRE_MAX_S = 1.0
const SILENCE_FIN_S = 0.105

export type OptionsPipeline = {
  diapason?: number
  pasS?: number                 // pas de mise à jour (50 ms)
  depuisS?: number              // analyse partielle (débogage / banc) : début
  jusqueS?: number              // … et fin
  profil?: typeof PROFIL_ACCOMPAGNE
  fenetreMaxS?: number
  seuilF?: number
  sigmaMpmCents?: number
  surTrame?: (t: number, trame: TrameAnalyse) => void
}

export type SortiePipeline = { trames: TrameAnalyse[]; tempsCalculMs: number[] }

const evenementA = (p: Planning, t: number): EvenementAccord | null =>
  p.evenements.find(e => t >= e.tDebut && t < e.tFin) ?? null

/** Instant de la dernière attaque du playback avant t (latence déjà absorbée par l'alignement). */
function derniereAttaque(p: Planning, t: number): number {
  let a = -Infinity
  for (const e of p.evenements) for (const x of e.attaques) if (x <= t && x > a) a = x
  return a + p.latenceBoucleMs / 1000
}

const centsDe = (f: number, ref: number) => 1200 * Math.log2(f / ref)

/** Accès au micro (déjà aligné sur le planning) : tampon complet hors ligne, fenêtre glissante dans le Worker. */
export type AccesMicro = {
  /** 2048 échantillons à fsMic à partir de t0 (tableau plus court si les données manquent). */
  trame: (t0: number) => Float32Array
  /** Signal à 16 kHz entre t0 et t1. */
  tranche16: (t0: number, t1: number) => Float32Array
}

/**
 * Crée l'analyseur par trame. L'état (note en cours, niveaux appris) vit dans la
 * fermeture ; `etape(t)` produit la trame d'analyse à l'instant t. Le même code sert
 * au script hors ligne et au Worker (S3).
 */
export function creerAnalyseurFlux(fsMic: number, planning: Planning, acces: AccesMicro, o: OptionsPipeline = {}): (t: number) => TrameAnalyse {
  const profil = o.profil ?? PROFIL_ACCOMPAGNE
  const fenMax = o.fenetreMaxS ?? FENETRE_MAX_S
  const sigmaMpm = o.sigmaMpmCents ?? SIGMA_MPM_DEFAUT_CENTS
  const appris = new NiveauPlaybackAppris()
  let actif: { onset: number; f0: number; sigma: number; vu: number } | null = null
  let evPrec: EvenementAccord | null = null
  let rmsPrec = 0
  let precedenteBrute = false       // présence brute à la trame précédente (confirmation d'attaque)
  const tranche16 = acces.tranche16

  return function etape(t: number): TrameAnalyse {
    const ev = evenementA(planning, t)
    const voix: Voix[] = ev ? ev.voix : []
    if (ev !== evPrec) { if (!evPrec || !ev || evPrec.accordId !== ev.accordId || evPrec.accordage !== ev.accordage) appris.oublier(); evPrec = ev }
    const tAtt = ev ? derniereAttaque(planning, t) : -Infinity
    const debutPropre = tAtt + GARDE_ATTAQUE_S

    // ── piste rapide : soustraction + MPM sur le résidu ──
    let f0Mpm: number | null = null, rmsResidu = 0
    const tMpm0 = t - FENETRE_MPM / fsMic
    if (tMpm0 >= debutPropre) {
      const trame = acces.trame(tMpm0)
      if (trame.length === FENETRE_MPM) {
        if (voix.length) {
          const d = detecterSurResidu(trame, fsMic, voix, profil)
          f0Mpm = d.f0Hz; rmsResidu = d.rmsResidu
        } else {
          const d = mpm(trame, fsMic, profil.clarityThreshold)
          let s = 0; for (let i = 0; i < trame.length; i++) s += trame[i] * trame[i]
          rmsResidu = Math.sqrt(s / trame.length)
          f0Mpm = rmsResidu >= profil.gateAbsolu ? d.f0Hz : null
        }
      }
    }
    // changement de note : MPM s'écarte nettement de la note en cours
    if (actif && f0Mpm && Math.abs(centsDe(f0Mpm, actif.f0)) > 40) {
      // MPM s'écarte de la note en cours : nouvelle note, ou résidu trompeur (multiple) ?
      // Le modèle court tranche : si l'ancienne note sonne encore, MPM est ignoré.
      const ws = Math.max(t - FENETRE_AMORCE_S, debutPropre)
      let encore = false
      if (t - ws >= 0.06) {
        const ys = tranche16(ws, t)
        const rs = ajusterF0(creerContexte(ys, FS_MODELE, fusionnerPartiels(voix, ys.length / FS_MODELE, 6000)), [actif.f0], { demiLargeurCents: 4 })
        encore = rs.presence && !rs.degenere
      }
      if (encore) f0Mpm = null; else actif = null
    }
    const attaqueLarge = rmsPrec > 0 && rmsResidu / rmsPrec > 2.5
    if (attaqueLarge && actif && f0Mpm) actif = null
    rmsPrec = rmsResidu

    // ── piste précise : modèle conjoint sur fenêtre croissante ──
    const wDebut: number = actif ? Math.max(actif.onset + DEBUT_STABLE_S, t - fenMax, debutPropre) : Math.max(t - FENETRE_AMORCE_S, debutPropre)
    let res: ResultatModele | null = null
    let cands0: number[] = []
    let ctxPresence: ReturnType<typeof creerContexte> | null = null
    if (t - wDebut >= 0.06) {
      const y = tranche16(wDebut, t)
      const T = y.length / FS_MODELE
      const pb = fusionnerPartiels(voix, T, 6000)
      const ctx = creerContexte(y, FS_MODELE, pb, o.seuilF ? { seuilF: o.seuilF } : {})
      ctxPresence = ctx
      let cands: number[]
      cands0 = []
      let demi = 60
      if (actif) {
        cands = [actif.f0]
        if (f0Mpm) cands.push(f0Mpm)
        demi = Math.max(2, Math.min(60, 4 * (Number.isFinite(actif.sigma) ? actif.sigma : 20) + 1))
      } else cands = genererCandidats(voix, f0Mpm, null)
      cands0 = cands
      res = ajusterF0(ctx, cands, { demiLargeurCents: demi })
    }

    // ── présence : toujours sur une fenêtre COURTE et récente. La fenêtre longue de
    //    l'affinage contient encore la note qui vient de finir et resterait « présente ». ──
    let resPres: ResultatModele | null = res
    if (actif && res) {
      const ws = Math.max(t - FENETRE_AMORCE_S, debutPropre)
      resPres = null
      if (t - ws >= 0.06) {
        const ys = tranche16(ws, t)
        const ctxS = creerContexte(ys, FS_MODELE, fusionnerPartiels(voix, ys.length / FS_MODELE, 6000), o.seuilF ? { seuilF: o.seuilF } : {})
        ctxPresence = ctxS
        resPres = ajusterF0(ctxS, [actif.f0], { demiLargeurCents: 4 })
      }
    }
    let presenceModele = !!resPres?.presence
    let degenereF0: number | null = null
    if (resPres && !presenceModele && resPres.degenere && ctxPresence && ctxPresence.P > 0) {
      // cas dégénéré : le niveau appris pendant les silences décide (§6.6)
      const pbRef = fusionnerPartiels(voix, 0.1, 6000)
      const cr = creerContexte(tranche16(Math.max(wDebut, t - 0.1), t), FS_MODELE, pbRef)
      const fr = pbRef.map(p => p.freqHz), am = amplitudesPlaybackSeul(cr)
      presenceModele = appris.present(fr, am)
      if (presenceModele) {
        // Les candidats sont indiscernables pour le modèle : on retient celui dont les
        // harmoniques tombent sur les partiels qui dépassent le plus le niveau appris.
        const choix = choisirCandidatDegenere(cands0, fr, appris.ecartsDb(fr, am))
        if (choix) degenereF0 = choix
      }
    }
    // Une attaque doit être confirmée sur deux trames consécutives : sur enregistrement réel,
    // des trames isolées apparaissent (variations de niveau du haut-parleur) sans élève.
    const brute = presenceModele || f0Mpm !== null
    const presence = brute && (actif !== null || precedenteBrute)
    precedenteBrute = brute
    if (!brute && voix.length && t - Math.max(t - 0.1, debutPropre) >= 0.1) {
      const pbRef = fusionnerPartiels(voix, 0.1, 6000)
      const cr = creerContexte(tranche16(t - 0.1, t), FS_MODELE, pbRef)
      appris.apprendre(pbRef.map(p => p.freqHz), amplitudesPlaybackSeul(cr))
    }

    // ── fusion des deux pistes ──
    const estMpm: Estimation | null = f0Mpm ? { f0Hz: f0Mpm, sigmaCents: sigmaMpm } : null
    const estMod: Estimation | null = res?.f0Hz && presenceModele && !res.degenere && Number.isFinite(res.sigmaCents) ? { f0Hz: res.f0Hz, sigmaCents: Math.max(res.sigmaCents, 0.02) } : null
    let fus = fusionnerEstimations(estMpm, estMod)
    if (estMpm && estMod && ecartOctave(estMod.f0Hz, estMpm.f0Hz)) fus = { ...estMod, source: 'modele' }
    let f0Hz: number | null = fus?.f0Hz ?? null
    let sigmaCents = fus?.sigmaCents ?? Infinity
    if (!f0Hz && presenceModele && (degenereF0 ?? res?.f0Hz)) { f0Hz = degenereF0 ?? res!.f0Hz; sigmaCents = Infinity }   // dégénéré : « juste à ±σ »

    const trame: TrameAnalyse = {
      t, f0Hz: presence ? f0Hz : null, sigmaCents, source: fus?.source ?? 'modele',
      candidats: res ? res.scores.map(s => s.f0Hz) : [], presence, rmsResidu,
      battements: res?.battements ?? [],
      mpmHz: f0Mpm, modeleHz: estMod?.f0Hz ?? null, statF: resPres?.statF, gainRel: resPres?.gainRel,
    }

    // ── suivi de la note en cours ──
    if (presence && f0Hz) {
      if (!actif) actif = { onset: Math.max(wDebut, t - FENETRE_AMORCE_S), f0: f0Hz, sigma: sigmaCents, vu: t }
      else { actif.f0 = f0Hz; actif.sigma = sigmaCents; actif.vu = t }
    } else if (actif && t - actif.vu >= SILENCE_FIN_S) actif = null
    return trame
  }
}

export function analyserEnregistrement(micro: Float32Array, fsMic: number, planning: Planning, o: OptionsPipeline = {}): SortiePipeline {
  const pas = o.pasS ?? 0.05
  const micro16 = reechantillonner(micro, fsMic, FS_MODELE)
  const duree = micro.length / fsMic
  const acces: AccesMicro = {
    trame: t0 => { const i0 = Math.round(t0 * fsMic); return micro.subarray(i0, i0 + FENETRE_MPM) },
    tranche16: (t0, t1) => micro16.subarray(Math.max(0, Math.round(t0 * FS_MODELE)), Math.min(micro16.length, Math.round(t1 * FS_MODELE))),
  }
  const etape = creerAnalyseurFlux(fsMic, planning, acces, o)
  const trames: TrameAnalyse[] = []
  const temps: number[] = []
  for (let t = Math.max(FENETRE_MPM / fsMic + 0.02, o.depuisS ?? 0); t <= Math.min(duree, o.jusqueS ?? duree); t += pas) {
    const c0 = performance.now()
    const trame = etape(t)
    trames.push(trame)
    o.surTrame?.(t, trame)
    temps.push(performance.now() - c0)
  }
  return { trames, tempsCalculMs: temps }
}

// ─── Passe finale (non causale), §6.8 ────────────────────────────────────────
export type OptionsFinale = { diapason?: number; profil?: typeof PROFIL_ACCOMPAGNE }

export function passeFinale(micro: Float32Array, fsMic: number, planning: Planning, trames: TrameAnalyse[], o: OptionsFinale = {}): NoteFinale[] {
  const diapason = o.diapason ?? DIAPASON_PAR_DEFAUT
  const segs = segmenterTrames(trames, diapason, o.profil ?? PROFIL_ACCOMPAGNE) as unknown as {
    debutMs: number; finMs: number; midiCible: number; frames: { tMs: number; hz: number }[]
  }[]
  const micro16 = reechantillonner(micro, fsMic, FS_MODELE)
  const notes: NoteFinale[] = []
  for (const s of segs) {
    const tOn = s.debutMs / 1000, tOff = s.finMs / 1000
    const milieu = 0.5 * (tOn + tOff)
    const ev = evenementA(planning, milieu)
    const voix = ev?.voix ?? []
    const a = Math.max(tOn + DEBUT_STABLE_S, ev ? derniereAttaque(planning, milieu) + GARDE_ATTAQUE_S : -Infinity)
    const b = Math.min(tOff - 0.03, ev ? ev.tFin - 0.06 : Infinity)
    const hzs = s.frames.map(f => f.hz).sort((x, y) => x - y)
    const medHz = hzs[Math.floor(hzs.length / 2)]
    const midi = Math.round(hzVersMidi(medHz, diapason))
    if (b - a < 0.06) {
      notes.push({ tOn, tOff, midi, f0Hz: medHz, centsTempere: centsDe(medHz, midiVersHz(midi, diapason)), sigmaCents: Infinity, sigmaIntraCents: 0, poids: 0, battements: [] })
      continue
    }
    const y = micro16.subarray(Math.round(a * FS_MODELE), Math.round(b * FS_MODELE))
    const T = y.length / FS_MODELE
    const ctx = creerContexte(y, FS_MODELE, fusionnerPartiels(voix, T, 6000))
    const res = ajusterF0(ctx, [medHz, ...genererCandidats(voix, null, null).filter(f => Math.abs(centsDe(f, medHz)) < 40)], { demiLargeurCents: 12 })
    const f0 = res.f0Hz ?? medHz
    // variabilité intra-note : fenêtres glissantes de 160 ms (comme calculerEcarts)
    const ests: number[] = []
    for (let w0 = a; w0 + 0.16 <= b + 1e-9; w0 += 0.08) {
      const yw = micro16.subarray(Math.round(w0 * FS_MODELE), Math.round((w0 + 0.16) * FS_MODELE))
      const cw = creerContexte(yw, FS_MODELE, fusionnerPartiels(voix, 0.16, 6000))
      const rw = ajusterF0(cw, [f0], { demiLargeurCents: 10 })
      if (rw.f0Hz && !rw.degenere) ests.push(centsDe(rw.f0Hz, f0))
    }
    const mu = ests.reduce((x, y2) => x + y2, 0) / Math.max(ests.length, 1)
    const sigmaIntra = ests.length > 1 ? Math.sqrt(ests.reduce((x, y2) => x + (y2 - mu) ** 2, 0) / (ests.length - 1)) : 0
    const sigma = res.sigmaCents
    notes.push({
      tOn, tOff, midi: Math.round(hzVersMidi(f0, diapason)), f0Hz: f0,
      centsTempere: centsDe(f0, midiVersHz(Math.round(hzVersMidi(f0, diapason)), diapason)),
      sigmaCents: sigma, sigmaIntraCents: sigmaIntra,
      poids: Number.isFinite(sigma) && sigma > 0 ? 1 / (sigma * sigma) : 0,
      battements: res.battements as Battement[],
    })
  }
  return notes
}
