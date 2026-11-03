import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cleTonalite, completerNiveaux, exercicesPour, idExercice, niveauxDisponibles, parserGammesCsv, tonalitesDisponibles } from './gammesData.ts'
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
niveau,tonalite,exercice,tempo
C1,Do M,diatonique-lie,60
C1,Sol M,diatonique-lie,56
C3,Do M,arpeges,88
C3,Do M,Mon exercice,50
C3,Zz M,arpeges,50`
  const lignes = parserGammesCsv(csv)
  it('ignore les lignes invalides, garde les exercices inconnus', () => {
    assert.equal(lignes.length, 4)
    assert.equal(lignes[3].libelle, 'Mon exercice')
  })
  it('dérive niveaux et tonalités', () => {
    assert.deepEqual(niveauxDisponibles(lignes), ['C1', 'C3'])
    assert.deepEqual([...tonalitesDisponibles(lignes, 'C1')], ['Do M', 'Sol M'])
    assert.deepEqual(exercicesPour(lignes, 'C3', 'Do M').map(l => l.exercice), ['arpeges', 'mon-exercice'])
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

describe('format large (feuille = niveau)', () => {
  const csv = ',Do M,La m,Fa#/Solb M,Ré#/Mib m\nDiatonique détaché,92,80,,\nArpèges,60,,70,\n,1,2,3,4\n'
  const l = parserGammesCsv(csv, 'C2/1')
  it('niveau = nom de la feuille, cases vides ignorées', () => {
    assert.equal(l.length, 4)
    assert.ok(l.every(x => x.niveau === 'C2/1'))
    assert.deepEqual(l.map(x => `${x.tonalite}|${x.exercice}|${x.tempo}`),
      ['Do M|diatonique-detache|92', 'La m|diatonique-detache|80', 'Do M|arpeges|60', 'Fa# M|arpeges|70'])
  })
  it('exercices connus sans libellé', () => assert.equal(l[0].libelle, undefined))
  it('idExercice ignore accents et casse', () => {
    assert.equal(idExercice('Secondes doublées'), 'secondes-doublees')
    assert.equal(idExercice(' Arpèges '), 'arpeges')
  })
  it('cleTonalite garde la 1re variante enharmonique', () => assert.equal(cleTonalite('Ré#/Mib m'), 'Ré# m'))
})

describe('niveaux alias', () => {
  const base = parserGammesCsv('niveau,tonalite,exercice,tempo\nC2/1,Do M,Tierces,60\nC2/3,Do M,Tierces,80\nC2/4,Sol M,Tierces,99')
  it('duplique C2/1 → C2/2 mais ne touche pas un niveau déjà présent', () => {
    const l = completerNiveaux(base)
    assert.deepEqual(niveauxDisponibles(l), ['C2/1', 'C2/2', 'C2/3', 'C2/4'])
    assert.equal(l.find(x => x.niveau === 'C2/2')?.tempo, 60)
    assert.equal(l.filter(x => x.niveau === 'C2/4').length, 1)
  })
})
