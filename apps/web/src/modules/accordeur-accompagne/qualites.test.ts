import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chiffrer } from '../harmonie/chiffrage.ts'
import { creerAccord, DEGRES, type Degre, type Mode, type Renversement } from '../harmonie/types.ts'
import { tonalite, type EntreeSlot, type QualiteAccord } from './phrase.ts'
import {
  QUALITES, avecDegre, avecNombreDeSons, avecQualite, avecRenversement, avecTonalite, chiffrerEntree, estHorsTonalite,
  libelleRenversement, nbSons, nomCourt, qualiteDiatonique, qualitesProposees,
} from './qualites.ts'

function e(nom: string, mode: Mode, degre: Degre, qualite: QualiteAccord, renversement: Renversement = 0): EntreeSlot {
  return { tonalite: tonalite(nom, mode), degre, qualite, renversement, formule: 'tenu', accordage: 'juste', sons: {} }
}

test('qualités diatoniques, majeur', () => {
  const q3 = DEGRES.map((d) => qualiteDiatonique('majeur', d, 3))
  assert.deepEqual(q3, ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'])
  const q4 = DEGRES.map((d) => qualiteDiatonique('majeur', d, 4))
  assert.deepEqual(q4, ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'hdim7'])
})

test('qualités diatoniques, mineur harmonique (III naturel), dont le i7 → minmaj7', () => {
  const q3 = DEGRES.map((d) => qualiteDiatonique('mineur', d, 3))
  assert.deepEqual(q3, ['min', 'dim', 'maj', 'min', 'maj', 'maj', 'dim'])
  const q4 = DEGRES.map((d) => qualiteDiatonique('mineur', d, 4))
  assert.deepEqual(q4, ['minmaj7', 'hdim7', 'maj7', 'min7', 'dom7', 'maj7', 'dim7'])
})

test('hors tonalité : seule une qualité différente de la diatonique est repérée', () => {
  assert.ok(!estHorsTonalite(e('Do', 'majeur', 5, 'dom7')))
  assert.ok(estHorsTonalite(e('Do', 'majeur', 2, 'dom7')))      // Ré7 en do majeur
  assert.ok(estHorsTonalite(e('Do', 'majeur', 1, 'min')))
  assert.ok(!estHorsTonalite(e('La', 'mineur', 1, 'minmaj7')))
})

test('chiffrerEntree = chiffrer d’Harmonie sur tout accord diatonique (2 modes, 7 degrés, 3 et 4 sons, tous renversements)', () => {
  let n = 0
  for (const mode of ['majeur', 'mineur'] as Mode[]) for (const d of DEGRES) for (const sons of [3, 4] as const) {
    const q = qualiteDiatonique(mode, d, sons)!
    for (let r = 0; r < sons; r++) {
      const attendu = chiffrer(creerAccord(0, { degre: d, renversement: r as Renversement, septieme: sons === 4 }), mode)
      assert.equal(chiffrerEntree(e('Do', mode, d, q, r as Renversement)), attendu, `${mode} ${d} ${sons} ${r}`)
      n++
    }
  }
  assert.equal(n, 2 * 7 * (3 + 4))
})

test('chiffrage hors tonalité : casse, ° et figures', () => {
  assert.equal(chiffrerEntree(e('Do', 'majeur', 2, 'dom7')), 'II 7')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 2, 'dom7', 1)), 'II 6/5')             // pas de 6/5̸ : table réservée au V7
  assert.equal(chiffrerEntree(e('Do', 'majeur', 1, 'min')), 'i 5')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 1, 'min', 2)), 'i 6/4')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 5, 'dim7')), 'v° 7')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 4, 'hdim7', 3)), 'iv° 2')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 6, 'maj')), 'VI 5')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 3, 'maj7', 2)), 'III 4/3')
  assert.equal(chiffrerEntree(e('Do', 'majeur', 5, 'min7')), 'v 7')                  // V non dominante
})

test('noms courts', () => {
  assert.equal(nomCourt(e('Do', 'majeur', 5, 'dom7')), 'Sol7')
  assert.equal(nomCourt(e('Do', 'majeur', 1, 'maj7')), 'Do 7M')
  assert.equal(nomCourt(e('Do', 'majeur', 2, 'min7')), 'Ré m7')
  assert.equal(nomCourt(e('Do', 'majeur', 7, 'hdim7')), 'Si ø')
  assert.equal(nomCourt(e('La', 'mineur', 7, 'dim7')), 'Sol♯ °7')
  assert.equal(nomCourt(e('La', 'mineur', 1, 'minmaj7')), 'La m7M')
  assert.equal(nomCourt(e('Do', 'majeur', 1, 'maj')), 'Do')
  assert.equal(nomCourt(e('Do', 'majeur', 1, 'min')), 'Do m')
  assert.equal(nomCourt(e('Do', 'majeur', 7, 'dim')), 'Si °')
  assert.equal(nomCourt(e('Réb', 'majeur', 1, 'maj')), 'Ré♭')
})

test('choix imbriqués : tonalité, degré et nombre de sons remettent la qualité diatonique', () => {
  const base = e('Do', 'majeur', 5, 'dom7', 2)
  const deg = avecDegre(base, 2)
  assert.equal(deg.qualite, 'min7')
  assert.equal(deg.renversement, 2)                      // encore valide à 4 sons
  assert.equal(avecDegre(avecQualite(base, 'min'), 6).qualite, 'min')   // 3 sons conservés : vi mineur
  const tonal = avecTonalite(avecQualite(e('Do', 'majeur', 1, 'min'), 'min'), tonalite('La', 'mineur'))
  assert.equal(tonal.qualite, 'min')                     // i en la mineur
  assert.equal(avecTonalite(e('Do', 'majeur', 7, 'dom7'), tonalite('La', 'mineur')).qualite, 'dim7')
  assert.equal(avecNombreDeSons(e('Do', 'majeur', 5, 'maj'), 4).qualite, 'dom7')
  const trois = avecNombreDeSons(e('Do', 'majeur', 5, 'dom7', 3), 3)
  assert.equal(trois.qualite, 'maj')
  assert.equal(trois.renversement, 0)                    // 3e renversement impossible à 3 sons
})

test('changer de qualité garde le renversement s’il reste valide, sinon 0', () => {
  assert.equal(avecQualite(e('Do', 'majeur', 5, 'dom7', 2), 'min7').renversement, 2)
  assert.equal(avecQualite(e('Do', 'majeur', 5, 'dom7', 3), 'maj').renversement, 0)
  assert.throws(() => avecRenversement(e('Do', 'majeur', 1, 'maj'), 3))
})

test('pastilles : 3 ou 4 sons, libellés de CHORD_TYPES, libellés de renversement', () => {
  assert.deepEqual(qualitesProposees(3), ['maj', 'min', 'dim'])
  assert.equal(qualitesProposees(4).length, 6)
  assert.equal(QUALITES.hdim7.label, 'Septième demi-diminuée')
  assert.equal(nbSons('minmaj7'), 4)
  const v7 = e('Do', 'majeur', 5, 'dom7')
  assert.deepEqual([0, 1, 2, 3].map((r) => libelleRenversement(v7, r as Renversement)), ['7/+', '6/5̸', '+6', '+4'])
  assert.deepEqual([0, 1, 2].map((r) => libelleRenversement(e('Do', 'majeur', 1, 'maj'), r as Renversement)), ['5', '6', '6/4'])
})
