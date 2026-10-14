// ─── Textes transverses ──────────────────────────────────────────────────────
// Textes partagés par plusieurs modules. Les textes propres à un module vivent
// dans `content/<module>.ts` — voir `content/rythme.ts` pour les conventions de
// rédaction (tutoiement, phrases courtes, français intégral).

export const COMMUN = {
  avertissementSon: {
    titre: 'Avant de jouer',
    corps:
      'Mets ton appareil en mode son et monte le volume, le son est nécessaire pour la plupart de ces exercices (désactive le mode silencieux, concentration ou autre).',
    valider: 'J’ai compris',
  },

  // ── Jauge de la journée (Hub, Rythme, Théorie) ─────────────────────────────
  // 10 points valident la journée, tous modules confondus. Au-delà, la jauge
  // repart de zéro et affiche un multiplicateur.
  jauge: {
    titre: 'Ta journée',
    validee: 'Journée validée',
    rattrapage: 'Rattrapage de série',
    reparee: 'Série réparée',
    reste: (n: number) =>
      n === 1 ? 'Encore 1 point pour valider ta journée.' : `Encore ${n} points pour valider ta journée.`,
    resteRattrapage: (n: number, serie: number) =>
      `Encore ${n} point${n > 1 ? 's' : ''} pour réparer ta série de ${serie} jour${serie > 1 ? 's' : ''}.`,
    detailValidee: 'Ta série continue. Chaque point en plus compte pour ton volume du jour.',
    detailReparee: (jours: number) => `Ta série repart à ${jours} jours.`,
    // Barème rappelé selon l'endroit où la jauge est affichée.
    bareme: {
      hub: '1 point par exercice de rythme isolé, 5 par série de théorie, 10 par session complète.',
      rythme: '1 point par exercice isolé, 10 pour une série de 10.',
      theorie: '5 points par série d’entraînement, 10 pour le Code de la route.',
    },
  },

  // ── Pop-up de rattrapage, à l'ouverture de l'app ───────────────────────────
  rattrapage: {
    titre: 'Ta série est en pause',
    corps: (serie: number, manques: number, multiple: number, points: number) =>
      `Ta série de ${serie} jour${serie > 1 ? 's' : ''} est rompue depuis ${manques} jour${manques > 1 ? 's' : ''}. `
      + `Tu peux la réparer aujourd’hui seulement : valide ${multiple} journées, soit ${points} points, `
      + `et les jours manqués compteront.`,
    valider: 'Je relève le défi',
  },
} as const
