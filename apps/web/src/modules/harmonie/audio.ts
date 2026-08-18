// ─── Sortie sonore du module Harmonie ────────────────────────────────────────
//
// ⚠ CE FICHIER N'EST PAS DU NOYAU. Le reste de `modules/harmonie/` est constitué
// de fonctions pures testables sans navigateur ; ici on touche au Web Audio.
// Chemin audio UNIQUE du module, partagé par le banc d'écoute (`BancPage.tsx`) et
// par l'activité élève (`DetectionPage.tsx`).
//
// Non-réutilisation assumée de `sampleEngine.js` : ses `INSTRUMENTS` sont les cinq
// vents de l'accordeur, aux tessitures trop étroites (basson 34-74, flûte 59-97)
// pour un accord à quatre voix couvrant MIDI 36-84, et ses helpers de contexte et
// de conversion MIDI→nom sont privés. On en reprend le motif, pas le code.

import Soundfont from 'soundfont-player'
import type { Player } from 'soundfont-player'

import { sortieAudible } from '../../lib/sortieAudible'

// `soundfont-player` déclare son union de noms GM sans l'exporter : on la dérive
// de la signature plutôt que de caster une chaîne libre — une faute de frappe
// reste ainsi une erreur de compilation.
type NomGM = Parameters<typeof Soundfont.instrument>[1]

export type NomInstrument = 'piano' | 'cordes'

// La spec §6 raisonne en quatuor à cordes, mais anticipe explicitement le timbre
// piano (« conserver la contrainte vocale même en timbre piano »).
export const INSTRUMENTS_BANC: Record<NomInstrument, { label: string; gm: NomGM }> = {
  piano: { label: 'Piano', gm: 'acoustic_grand_piano' },
  cordes: { label: 'Cordes', gm: 'string_ensemble_1' },
}

const NOMS_MIDI = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export function midiVersNom(midi: number): string {
  return NOMS_MIDI[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
}

// AudioContext singleton : un seul contexte pour toute la session, comme dans
// `sampleEngine.js`. Les navigateurs en limitent le nombre.
//
// Création PARESSEUSE, jamais à l'import : la politique d'autoplay de Chrome
// laisse suspendu tout contexte créé hors geste utilisateur, et
// `Soundfont.instrument` ne résout alors jamais sa promesse. L'appelant doit
// déclencher le chargement depuis un vrai clic (cf. `BancPage.tsx`).
let contexte: AudioContext | null = null

function obtenirContexte(): AudioContext {
  if (!contexte || contexte.state === 'closed') {
    contexte = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (contexte.state === 'suspended') void contexte.resume()
  return contexte
}

const charges = new Map<NomInstrument, Player>()
const enCours = new Map<NomInstrument, Promise<Player>>()

export async function chargerInstrument(nom: NomInstrument): Promise<Player> {
  const dejaLa = charges.get(nom)
  if (dejaLa) return dejaLa
  const enVol = enCours.get(nom)
  if (enVol) return enVol

  // `destination` : sortie audible partagée — sans elle, soundfont-player branche
  // en dur sur `ctx.destination`, muet sous le switch silence d'iOS.
  const contexteJeu = obtenirContexte()
  const promesse = Soundfont.instrument(contexteJeu, INSTRUMENTS_BANC[nom].gm, {
    destination: sortieAudible(contexteJeu),
  })
    .then((joueur) => {
      charges.set(nom, joueur)
      enCours.delete(nom)
      return joueur
    })
    .catch((erreur: unknown) => {
      enCours.delete(nom)
      throw erreur
    })

  enCours.set(nom, promesse)
  return promesse
}

export function instrumentPret(nom: NomInstrument): boolean {
  return charges.has(nom)
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export interface OptionsLecture {
  bpm?: number
  instrument?: NomInstrument
  gain?: number
  // Pulsations par accord, dans l'ordre. Défaut : 1 partout, dernier accord tenu
  // deux fois plus longtemps — le seul geste musical qu'on s'autorise ici.
  durees?: number[]
  onAccord?: (index: number) => void
}

let compteurLecture = 0
const minuteries: ReturnType<typeof setTimeout>[] = []

export function arreter(): void {
  compteurLecture++
  while (minuteries.length > 0) clearTimeout(minuteries.pop())
  // `soundfont-player` sonne en one-shot avec `duration` : rien à couper de
  // force, on laisse s'éteindre ce qui a déjà démarré.
}

// `accords` : une entrée = les hauteurs MIDI simultanées d'un accord. Renvoie la
// durée totale en millisecondes.
export async function jouerSuite(
  accords: readonly number[][],
  options: OptionsLecture = {},
): Promise<number> {
  const { bpm = 66, instrument = 'piano', gain = 0.8, onAccord } = options
  if (accords.length === 0) return 0

  const joueur = await chargerInstrument(instrument)
  const ctx = obtenirContexte()

  arreter()
  const lecture = compteurLecture

  const pulsation = 60 / bpm
  const durees =
    options.durees ?? accords.map((_, i) => (i === accords.length - 1 ? 2 : 1))

  const depart = ctx.currentTime + 0.12
  let decalage = 0

  accords.forEach((hauteurs, index) => {
    const tenue = durees[index] * pulsation
    for (const midi of hauteurs) {
      joueur.play(midiVersNom(midi), depart + decalage, {
        duration: tenue * 0.98,
        gain,
      })
    }
    if (onAccord) {
      minuteries.push(
        setTimeout(
          () => {
            if (lecture === compteurLecture) onAccord(index)
          },
          (0.12 + decalage) * 1000,
        ),
      )
    }
    decalage += tenue
  })

  return decalage * 1000
}

// Accord isolé, sans séquence — pour le contexte tonal et l'écoute accord par accord.
export async function jouerAccord(
  hauteurs: readonly number[],
  options: OptionsLecture = {},
): Promise<number> {
  return jouerSuite([[...hauteurs]], { ...options, durees: [2] })
}
