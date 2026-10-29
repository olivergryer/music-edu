import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cleTonalite, exercicesPour, niveauxDisponibles, parserGammesCsv, tonalitesDisponibles } from './gammesData.ts'
import { statsExercice } from './carnetStats.ts'
import type { Seance } from './carnetStorage.ts'

describe('cleTonalite', () => {
  it('normalise les saisies', () => {
    assert.equal(cleTonalite('do M'), 'Do M')
    assert.equal(cleTonalite('Fa♯ m'), 'Fa# m')
    assert.equal(cleTonalite('Si♭ M'), 'Sib M')
    assert.equal(cleTonalite('re m'), 'Ré m')
    assert.equal(cleTonalite('Xx M'), null)
    assert.equal(cleTonalite('Do'), null)
  })
})

describe('parserGammesCsv', () => {
  const csv = `# commentaire
niveau,tonalite,exercice,tempo,figure
C1,Do M,diatonique-lie,60,noire
C1,Sol M,diatonique-lie,56,
C3,Do M,arpeges,88,triolet
C3,Do M,inconnu,50,
C3,Zz M,arpeges,50,`
  const lignes = parserGammesCsv(csv)
  it('ignore les lignes invalides', () => assert.equal(lignes.length, 3))
  it('dérive niveaux et tonalités', () => {
    assert.deepEqual(niveauxDisponibles(lignes), ['C1', 'C3'])
    assert.deepEqual([...tonalitesDisponibles(lignes, 'C1')], ['Do M', 'Sol M'])
    assert.deepEqual(exercicesPour(lignes, 'C3', 'Do M').map(l => l.exercice), ['arpeges'])
    assert.equal(lignes[2].figure, 'triolet')
  })
})

describe('statsExercice', () => {
  const mk = (id: string, date: string, t: number): Seance => ({
    id, date, maj: date, niveau: 'C1', tonalite: 'Do M', objectifs: {}, saisis: { arpeges: t }, schemaVersion: 1,
  })
  const liste = [mk('a', '2026-01-01', 60), mk('b', '2026-02-01', 72), mk('c', '2026-03-01', 66)]
  it('max et précédent pour une nouvelle séance', () => {
    assert.deepEqual(statsExercice(liste, 'C1', 'Do M', 'arpeges'), { max: 72, precedent: 66 })
  })
  it('exclut la séance éditée et prend la précédente antérieure', () => {
    assert.deepEqual(statsExercice(liste, 'C1', 'Do M', 'arpeges', { id: 'b', date: '2026-02-01' }), { max: 66, precedent: 60 })
  })
  it('vide si rien', () => assert.deepEqual(statsExercice(liste, 'C2', 'Do M', 'arpeges'), {}))
})
