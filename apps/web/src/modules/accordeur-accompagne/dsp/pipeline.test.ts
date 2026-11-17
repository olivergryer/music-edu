// Régression du pipeline sur le jeu A numérique (cas qui ont échoué pendant S2).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construireJeuA } from './banc.ts'
import { analyserEnregistrement } from './pipeline.ts'
import { centsEntre } from './types.ts'

const jeu = construireJeuA({ reduit: true })
const retard = Math.round(0.045 * jeu.fs)
const micro = jeu.micro.subarray(retard)

test('unisson exact (Do4) : la f0 reste Do4, pas sa douzième 3·f0', () => {
  const vn = jeu.verite.notes[4]                    // Do4, écart 0, unisson de la voix 2
  assert.equal(vn.ecartCents, 0)
  const { trames } = analyserEnregistrement(micro, jeu.fs, jeu.planning, { depuisS: vn.tOn - 0.5, jusqueS: vn.tOff })
  const dedans = trames.filter(t => t.t > vn.tOn + 0.1 && t.t < vn.tOff - 0.1)
  assert.ok(dedans.length > 20)
  const bonnes = dedans.filter(t => t.presence && t.f0Hz && Math.abs(centsEntre(t.f0Hz, vn.f0Hz)) < 3)
  assert.ok(bonnes.length / dedans.length > 0.95, `${bonnes.length}/${dedans.length}`)
})

test('fin de note : aucune présence dans le silence qui suit (pas de fenêtre « fantôme »)', () => {
  const vn = jeu.verite.notes[0]
  const { trames } = analyserEnregistrement(micro, jeu.fs, jeu.planning, { depuisS: vn.tOff - 0.3, jusqueS: vn.tOff + 0.5 })
  const silence = trames.filter(t => t.t > vn.tOff + 0.25)
  assert.ok(silence.length >= 3)
  assert.ok(silence.every(t => !t.presence), 'présence résiduelle après la note')
})
