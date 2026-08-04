// Table de dispositions, réalisation MIDI, plage de transposition (spec §6).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TABLE_DISPOSITIONS,
  TESSITURES,
  cleDisposition,
  disposition,
  dispositionAuSoprano,
  dispositionLibre,
  hauteursReelles,
  plageTransposition,
  realiserProgression,
} from './dispositions.ts'
import { genererProgression, longueursDisponibles } from './generateur.ts'
import { NIVEAU_MAX_IMPLEMENTE, niveauSpec } from './niveaux.ts'
import { accordDeSeptieme, triade } from './harmonieRef.ts'
import {
  DEGRES,
  MODES,
  creerAccord,
  qualite,
  type Mode,
  type Progression,
  type Renversement,
} from './types.ts'

function echantillon(nombre: number): Progression[] {
  const liste: { mode: Mode; niveau: number; longueur: number }[] = []
  for (let niveau = 0; niveau <= NIVEAU_MAX_IMPLEMENTE; niveau++) {
    for (const longueur of longueursDisponibles(niveauSpec(niveau))) {
      for (const mode of MODES) liste.push({ mode, niveau, longueur })
    }
  }
  return Array.from({ length: nombre }, (_, i) => {
    const { mode, niveau, longueur } = liste[i % liste.length]
    return genererProgression(mode, niveau, longueur, 9000 + i)
  })
}

// ── La table ─────────────────────────────────────────────────────────────────

test('TABLE_DISPOSITIONS couvre tous les couples valides, et eux seuls', () => {
  // 2 modes × 7 degrés × (3 renversements de triade + 4 d'accord de septième)
  assert.equal(TABLE_DISPOSITIONS.size, 2 * 7 * 7)
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const renversement of [0, 1, 2] as Renversement[]) {
        assert.ok(TABLE_DISPOSITIONS.has(cleDisposition(mode, degre, renversement, false)))
        assert.ok(TABLE_DISPOSITIONS.has(cleDisposition(mode, degre, renversement, true)))
      }
      assert.ok(TABLE_DISPOSITIONS.has(cleDisposition(mode, degre, 3, true)))
      // Le renversement 3 sans septième n'existe pas (contrainte §1).
      assert.ok(!TABLE_DISPOSITIONS.has(cleDisposition(mode, degre, 3, false)))
    }
  }
})

test('chaque entrée de la table emploie exactement les sons de son accord', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const septieme of [false, true]) {
        const attendus = new Set(
          (septieme ? accordDeSeptieme(mode, degre) : triade(mode, degre)).map((n) => n % 12),
        )
        const renversements: Renversement[] = septieme ? [0, 1, 2, 3] : [0, 1, 2]
        for (const renversement of renversements) {
          const accord = creerAccord(0, { degre, renversement, septieme })
          const { basse, voix } = disposition(accord, mode)
          const employes = [basse, ...voix].map((n) => ((n % 12) + 12) % 12)
          for (const son of employes) {
            assert.ok(attendus.has(son), `${mode} ${degre} renv ${renversement} : son ${son} étranger`)
          }
          // Les quatre voix couvrent tout l'accord.
          assert.equal(new Set(employes).size, attendus.size, `${mode} ${degre} renv ${renversement}`)
        }
      }
    }
  }
})

test('la basse est bien le son du renversement demandé', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const septieme of [false, true]) {
        const sons = (septieme ? accordDeSeptieme(mode, degre) : triade(mode, degre)).map(
          (n) => n % 12,
        )
        const renversements: Renversement[] = septieme ? [0, 1, 2, 3] : [0, 1, 2]
        for (const renversement of renversements) {
          const accord = creerAccord(0, { degre, renversement, septieme })
          assert.equal(disposition(accord, mode).basse, sons[renversement], `${mode} ${degre}`)
        }
      }
    }
  }
})

test('doublure académique : fondamentale, tierce sur les diminués, basse au 6/4', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      const sons = triade(mode, degre).map((n) => n % 12)
      const compte = (renversement: Renversement) => {
        const { basse, voix } = disposition(creerAccord(0, { degre, renversement }), mode)
        const tous = [basse, ...voix].map((n) => ((n % 12) + 12) % 12)
        return sons.map((son) => tous.filter((x) => x === son).length)
      }
      const estDim = qualite(mode, degre) === 'dim'

      // État fondamental et premier renversement.
      for (const renversement of [0, 1] as Renversement[]) {
        const doubles = compte(renversement)
        assert.deepEqual(
          doubles,
          estDim ? [1, 2, 1] : [2, 1, 1],
          `${mode} ${degre} renv ${renversement}`,
        )
      }
      // 6/4 : la basse (la quinte) est doublée — sauf accord diminué, où la
      // tierce garde la priorité.
      assert.deepEqual(compte(2), estDim ? [1, 2, 1] : [1, 1, 2], `${mode} ${degre} renv 2`)
    }
  }
})

test('accord de septième : quatre sons distincts, aucune doublure', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const renversement of [0, 1, 2, 3] as Renversement[]) {
        const { basse, voix } = disposition(creerAccord(0, { degre, renversement, septieme: true }), mode)
        assert.equal(new Set([basse, ...voix].map((n) => ((n % 12) + 12) % 12)).size, 4)
      }
    }
  }
})

test('cas de référence : V7 majeur et le 6/4 cadentiel', () => {
  // V7 en do majeur : sol si ré fa, basse sol.
  const v7 = disposition(creerAccord(0, { degre: 5, septieme: true }), 'majeur')
  assert.equal(v7.basse, 7)
  assert.deepEqual(v7.voix, [11, 14, 17]) // si ré fa, position serrée

  // I 6/4 : basse sol, do mi sol au-dessus — la quinte est doublée.
  const cadentiel = disposition(creerAccord(0, { degre: 1, renversement: 2 }), 'majeur')
  assert.equal(cadentiel.basse, 7)
  assert.deepEqual(cadentiel.voix, [12, 16, 19])

  // VII6 majeur : basse ré, si ré fa au-dessus — tierce doublée.
  const vii6 = disposition(creerAccord(0, { degre: 7, renversement: 1 }), 'majeur')
  assert.equal(vii6.basse, 2)
  assert.deepEqual(vii6.voix, [11, 14, 17])
})

test('position serrée : les trois voix supérieures tiennent dans l’octave', () => {
  for (const [, disp] of TABLE_DISPOSITIONS) {
    const [tenor, alto, soprano] = disp.voix
    assert.ok(tenor > disp.basse, 'ténor sous la basse')
    assert.ok(alto > tenor && soprano > alto, 'voix non ordonnées')
    assert.ok(soprano - tenor <= 12, `écart ténor-soprano de ${soprano - tenor}`)
  }
})

test('mode inversé : seule la tierce bouge, d’un demi-ton', () => {
  const normal = disposition(creerAccord(0, { degre: 1 }), 'majeur')
  const inverse = disposition(creerAccord(0, { degre: 1, modeInverse: true }), 'majeur')
  assert.equal(normal.basse, inverse.basse)
  // do mi sol → do mi♭ sol : la tierce descend de 4 à 3 demi-tons.
  const tierces = [normal, inverse].map((d) => [d.basse, ...d.voix].map((n) => n % 12))
  assert.ok(tierces[0].includes(4) && !tierces[0].includes(3))
  assert.ok(tierces[1].includes(3) && !tierces[1].includes(4))
})

// ── Réalisation MIDI ─────────────────────────────────────────────────────────

test('realiserProgression : quatre voix ordonnées, basse dans sa tessiture', () => {
  for (const prog of echantillon(300)) {
    for (const accord of realiserProgression(prog)) {
      assert.equal(accord.length, 4, prog.id)
      for (let j = 1; j < 4; j++) assert.ok(accord[j] > accord[j - 1], `${prog.id} : voix croisées`)
      assert.ok(
        accord[0] >= TESSITURES.basse[0] && accord[0] <= TESSITURES.basse[1],
        `${prog.id} : basse ${accord[0]} hors tessiture`,
      )
    }
  }
})

test('realiserProgression : la basse prend l’octave la plus proche parmi celles qui tiennent', () => {
  const bornes = [TESSITURES.basse, TESSITURES.tenor, TESSITURES.alto, TESSITURES.soprano]
  for (const prog of echantillon(200)) {
    const realisation = realiserProgression(prog)
    for (let i = 1; i < realisation.length; i++) {
      const basse = realisation[i][0]
      const ecart = Math.abs(basse - realisation[i - 1][0])
      const intervalles = realisation[i].map((h) => h - basse)

      // Aucune octave alternative, tenable dans les tessitures, ne serait plus
      // proche de la basse précédente.
      for (const decalage of [-12, 12]) {
        const alternative = basse + decalage
        if (alternative < TESSITURES.basse[0] || alternative > TESSITURES.basse[1]) continue
        if (Math.abs(alternative - realisation[i - 1][0]) >= ecart) continue
        const tenable = [0, 1, 2].some((octaveBloc) =>
          intervalles.every((intervalle, j) => {
            const hauteur = alternative + intervalle + (j === 0 ? 0 : 12 * octaveBloc)
            return hauteur >= bornes[j][0] && hauteur <= bornes[j][1]
          }),
        )
        assert.ok(!tenable, `${prog.id} : saut de basse évitable à l'index ${i}`)
      }
    }
  }
})

test('hauteursReelles : cohérent avec la réalisation complète', () => {
  const prog = genererProgression('majeur', 6, 6, 17)
  const realisation = realiserProgression(prog)
  prog.accords.forEach((accord, i) => {
    assert.deepEqual(hauteursReelles(accord, prog), realisation[i])
  })
  assert.throws(
    () => hauteursReelles(creerAccord(99, { degre: 1 }), prog),
    /absent/,
  )
})

// ── Transposition ────────────────────────────────────────────────────────────

test('plageTransposition : intervalle non vide et contenant 0', () => {
  for (const prog of echantillon(300)) {
    const [minimum, maximum] = plageTransposition(prog)
    assert.ok(minimum <= maximum, `${prog.id} : plage vide [${minimum}, ${maximum}]`)
    assert.ok(minimum <= 0 && maximum >= 0, `${prog.id} : 0 hors de [${minimum}, ${maximum}]`)
  }
})

test('plageTransposition : « typiquement 6 à 9 valeurs » sur les progressions écrites', () => {
  // La spec §6 annonce cet ordre de grandeur. Il se vérifie sur les niveaux à
  // génération libre (4 à 8 accords) ; un accord isolé, lui, est bien plus libre.
  const tailles: number[] = []
  for (let i = 0; i < 200; i++) {
    const prog = genererProgression(i % 2 ? 'majeur' : 'mineur', 6 + (i % 2), 4 + (i % 5), i)
    const [minimum, maximum] = plageTransposition(prog)
    tailles.push(maximum - minimum + 1)
  }
  tailles.sort((a, b) => a - b)
  const mediane = tailles[Math.floor(tailles.length / 2)]
  assert.ok(mediane >= 6 && mediane <= 9, `médiane ${mediane}, attendue entre 6 et 9`)
})

test('plageTransposition : toute transposition admissible respecte les tessitures', () => {
  const bornes = [TESSITURES.basse, TESSITURES.tenor, TESSITURES.alto, TESSITURES.soprano]
  for (const prog of echantillon(120)) {
    const [minimum, maximum] = plageTransposition(prog)
    for (const demiTons of [minimum, 0, maximum]) {
      for (const accord of realiserProgression(prog)) {
        accord.forEach((hauteur, j) => {
          const transposee = hauteur + demiTons
          assert.ok(
            transposee >= bornes[j][0] && transposee <= bornes[j][1],
            `${prog.id} : voix ${j} à ${transposee} hors [${bornes[j].join(', ')}] (t=${demiTons})`,
          )
        })
      }
    }
  }
})

test('plageTransposition : une demi-ton de plus sort des tessitures', () => {
  const bornes = [TESSITURES.basse, TESSITURES.tenor, TESSITURES.alto, TESSITURES.soprano]
  const dedans = (prog: Progression, demiTons: number) =>
    realiserProgression(prog).every((accord) =>
      accord.every((h, j) => h + demiTons >= bornes[j][0] && h + demiTons <= bornes[j][1]),
    )
  for (const prog of echantillon(60)) {
    const [minimum, maximum] = plageTransposition(prog)
    assert.equal(dedans(prog, minimum - 1), false, `${prog.id} : borne basse non serrée`)
    assert.equal(dedans(prog, maximum + 1), false, `${prog.id} : borne haute non serrée`)
  }
})

// ─── L'axe soprano (2026-08-04) ──────────────────────────────────────────────
//
// Ajouté pour la reconnaissance de cadences : sans lui, une « parfaite » sonnerait
// au hasard avec la tierce au sommet, et ne serait donc pas parfaite.

test('dispositionAuSoprano met bien le son demandé au sommet', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const renversement of [0, 1] as Renversement[]) {
        const accord = creerAccord(0, { degre, renversement })
        const sons = triade(mode, degre)
        for (const souhaite of sons) {
          const basse = sons[renversement] % 12
          if (souhaite % 12 === basse) continue // le son est à la basse, pas au sommet
          const disp = dispositionAuSoprano(accord, mode, souhaite)
          assert.equal(
            disp.voix[2] % 12,
            ((souhaite % 12) + 12) % 12,
            `${mode} degré ${degre} renv ${renversement} : sommet ${disp.voix[2] % 12}`,
          )
        }
      }
    }
  }
})

test('dispositionAuSoprano garde les voix ordonnées au-dessus de la basse', () => {
  const disp = dispositionAuSoprano(creerAccord(0, { degre: 1 }), 'majeur', 0)
  assert.ok(disp.voix[0] > disp.basse)
  assert.ok(disp.voix[1] > disp.voix[0])
  assert.ok(disp.voix[2] > disp.voix[1])
})

// Quand le sommet demandé est celui que la position serrée aurait choisi, la
// contrainte ne doit rien changer : c'est la preuve qu'elle filtre sans réordonner.
test('sans contrainte utile, dispositionAuSoprano retombe sur disposition', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      const accord = creerAccord(0, { degre })
      const libre = disposition(accord, mode)
      const contrainte = dispositionAuSoprano(accord, mode, libre.voix[2])
      assert.deepEqual(contrainte, libre, `${mode} degré ${degre}`)
    }
  }
})

test('un sommet étranger à l’accord est refusé', () => {
  // Le do♯ n'appartient à aucun accord de I en do majeur.
  assert.throws(
    () => dispositionAuSoprano(creerAccord(0, { degre: 1 }), 'majeur', 1),
    /aucun arrangement/,
  )
})

// ─── Dispositions hors modèle ────────────────────────────────────────────────

test('dispositionLibre empile les sons donnés sans les permuter', () => {
  // Sixte allemande en do : la♭ do mi♭ fa♯.
  const disp = dispositionLibre([8, 12, 15, 18], 0, null)
  assert.equal(disp.basse, 8)
  assert.deepEqual(disp.voix, [12, 15, 18])
  // Le sommet reste le ♯4 : c'est l'écart basse → sommet qui fait la sixte augmentée.
  assert.equal(disp.voix[2] - disp.basse, 10)
})

test('dispositionLibre place la doublure une octave au-dessus', () => {
  // Sixte italienne : trois sons, la tonique doublée pour tenir quatre voix.
  const disp = dispositionLibre([8, 12, 18], 0, 1)
  assert.equal(disp.basse, 8)
  assert.deepEqual(disp.voix, [12, 18, 24])
})

test('dispositionLibre refuse une basse ou une doublure hors bornes', () => {
  assert.throws(() => dispositionLibre([8, 12, 18], 3, null), /basse hors bornes/)
  assert.throws(() => dispositionLibre([8, 12, 18], 0, 9), /doublure hors bornes/)
  assert.throws(() => dispositionLibre([8, 12], 0, null), /au moins 3/)
})
