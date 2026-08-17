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
} as const
