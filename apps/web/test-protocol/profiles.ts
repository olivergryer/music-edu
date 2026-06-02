// 10 profils de test, chacun avec un planning sur 7 jours et l'état attendu en fin de journée.
// Les prédictions sont calculées MANUELLEMENT pour servir d'oracle : si le code diverge → bug.
//
// Les dates simulées vont du 2026-06-01 (lundi) au 2026-06-07 (dimanche).

import type { AddSessionParams, ProgressState } from '../src/hooks/progressLogic.ts'

export const DAYS: string[] = [
  '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
  '2026-06-05', '2026-06-06', '2026-06-07',
]

export interface ProfileDay {
  day: number               // 1..7
  actions: AddSessionParams[]
  predicted: {
    xp: number
    streak: ProgressState['streak']
    modules: ProgressState['modules']
    dailyRythmeIndiv: ProgressState['dailyRythmeIndiv']
    trophies: string[]      // ordre alphabétique pour comparaison
  }
}

export interface Profile {
  id: number
  name: string
  description: string
  days: ProfileDay[]
}

// ─── Helpers pour réduire la répétition dans les prédictions ──────────────────

const def = {
  rythme:    { seriesPlayed: 0, exercisesPlayed: 0, xpTotal: 0 },
  theorie:   { sessionsPlayed: 0, xpTotal: 0 },
  accordeur: { sessionsPlayed: 0, xpTotal: 0 },
}

const noIndiv = { date: null, count: 0 }

const trSorted = (arr: string[]) => [...arr].sort()

// ─── Profils ──────────────────────────────────────────────────────────────────

// 1 — Apprenti régulier : 1 série rythme par jour (+50 XP, 🥇)
const SERIE_SIMPLE: AddSessionParams = { module: 'rythme', xpEarned: 50, medal: '🥇', meta: { perfectSeries: false } }

const p1: Profile = {
  id: 1,
  name: 'Apprenti régulier',
  description: '1 série rythme/jour pendant 7 jours. Teste streak max + trophée portee.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d,
    actions: [SERIE_SIMPLE],
    predicted: {
      xp: 50 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, rythme: { seriesPlayed: d, exercisesPlayed: 0, xpTotal: 50 * d } },
      dailyRythmeIndiv: noIndiv,
      trophies: trSorted(
        d >= 7 ? ['first_note', 'first_series', 'portee']
              : ['first_note', 'first_series']
      ),
    },
  })),
}

// 2 — Marathon indiv (≥10/jour) : 12 exos rythme indiv par jour (+20 XP chacun)
const EXO_INDIV: AddSessionParams = { module: 'rythme', xpEarned: 20, medal: '🥈', meta: { individual: true } }

const p2: Profile = {
  id: 2,
  name: 'Marathon indiv (≥10/jour)',
  description: '12 exos indiv rythme par jour. Teste seuil streak 10 exos.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d,
    actions: Array(12).fill(EXO_INDIV),
    predicted: {
      xp: 12 * 20 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 12 * d, xpTotal: 12 * 20 * d } },
      dailyRythmeIndiv: { date: DAYS[d-1], count: 12 },
      trophies: trSorted(d >= 7 ? ['first_note', 'portee'] : ['first_note']),
    },
  })),
}

// 3 — Tortue indiv (<10/jour) : 5 exos indiv rythme par jour (+10 XP), streak ne progresse JAMAIS
const EXO_INDIV_TORTUE: AddSessionParams = { module: 'rythme', xpEarned: 10, medal: '🥉', meta: { individual: true } }

const p3: Profile = {
  id: 3,
  name: 'Tortue indiv (<10/jour)',
  description: '5 exos indiv rythme/jour : reste sous le seuil 10, streak reste à 0.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d,
    actions: Array(5).fill(EXO_INDIV_TORTUE),
    predicted: {
      xp: 5 * 10 * d,
      streak: { current: 0, longest: 0, lastDate: null },
      modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 5 * d, xpTotal: 50 * d } },
      dailyRythmeIndiv: { date: DAYS[d-1], count: 5 },
      trophies: ['first_note'],
    },
  })),
}

// 4 — Skipper : J1-J3 série, J4 rien, J5-J7 série. Streak reset à 1 le J5.
const p4: Profile = {
  id: 4,
  name: 'Skipper (saute J4)',
  description: 'Joue J1-J3 puis skip J4 puis reprend J5-J7. Streak reset à 1 le J5.',
  days: [
    { day: 1, actions: [SERIE_SIMPLE], predicted: {
        xp: 50, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 2, actions: [SERIE_SIMPLE], predicted: {
        xp: 100, streak: { current: 2, longest: 2, lastDate: DAYS[1] },
        modules: { ...def, rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 3, actions: [SERIE_SIMPLE], predicted: {
        xp: 150, streak: { current: 3, longest: 3, lastDate: DAYS[2] },
        modules: { ...def, rythme: { seriesPlayed: 3, exercisesPlayed: 0, xpTotal: 150 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 4, actions: [], predicted: {
        // Aucune action → état inchangé
        xp: 150, streak: { current: 3, longest: 3, lastDate: DAYS[2] },
        modules: { ...def, rythme: { seriesPlayed: 3, exercisesPlayed: 0, xpTotal: 150 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 5, actions: [SERIE_SIMPLE], predicted: {
        // lastDate=D3, yesterday(D5)=D4 → reset à 1
        xp: 200, streak: { current: 1, longest: 3, lastDate: DAYS[4] },
        modules: { ...def, rythme: { seriesPlayed: 4, exercisesPlayed: 0, xpTotal: 200 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 6, actions: [SERIE_SIMPLE], predicted: {
        xp: 250, streak: { current: 2, longest: 3, lastDate: DAYS[5] },
        modules: { ...def, rythme: { seriesPlayed: 5, exercisesPlayed: 0, xpTotal: 250 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 7, actions: [SERIE_SIMPLE], predicted: {
        xp: 300, streak: { current: 3, longest: 3, lastDate: DAYS[6] },
        modules: { ...def, rythme: { seriesPlayed: 6, exercisesPlayed: 0, xpTotal: 300 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
  ],
}

// 5 — Multi-modules : alterne rythme/théorie/accordeur. Teste trophée duo.
const SESSION_THEORIE_ENT: AddSessionParams = { module: 'theorie', xpEarned: 500, medal: '🥇' }
const SESSION_ACC_TOP:     AddSessionParams = { module: 'accordeur', xpEarned: 500, medal: '🥇' }

const p5: Profile = {
  id: 5,
  name: 'Multi-modules',
  description: 'Alterne rythme/théorie/accordeur. Teste streak cross-module + trophée duo.',
  days: [
    { day: 1, actions: [SERIE_SIMPLE], predicted: {
        xp: 50, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 } },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series']),
    }},
    { day: 2, actions: [SESSION_THEORIE_ENT], predicted: {
        // duo trophy : rythme.seriesPlayed≥1 (de D1) + theorie.sessionsPlayed≥1 (de D2)
        xp: 550, streak: { current: 2, longest: 2, lastDate: DAYS[1] },
        modules: { ...def,
          rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 },
          theorie: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series', 'duo']),
    }},
    { day: 3, actions: [SESSION_ACC_TOP], predicted: {
        xp: 1050, streak: { current: 3, longest: 3, lastDate: DAYS[2] },
        modules: {
          rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 },
          theorie: { sessionsPlayed: 1, xpTotal: 500 },
          accordeur: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series', 'duo']),
    }},
    { day: 4, actions: [SERIE_SIMPLE], predicted: {
        xp: 1100, streak: { current: 4, longest: 4, lastDate: DAYS[3] },
        modules: {
          rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 },
          theorie: { sessionsPlayed: 1, xpTotal: 500 },
          accordeur: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series', 'duo']),
    }},
    { day: 5, actions: [SESSION_THEORIE_ENT], predicted: {
        xp: 1600, streak: { current: 5, longest: 5, lastDate: DAYS[4] },
        modules: {
          rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 },
          theorie: { sessionsPlayed: 2, xpTotal: 1000 },
          accordeur: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series', 'duo']),
    }},
    { day: 6, actions: [SESSION_ACC_TOP], predicted: {
        xp: 2100, streak: { current: 6, longest: 6, lastDate: DAYS[5] },
        modules: {
          rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 },
          theorie: { sessionsPlayed: 2, xpTotal: 1000 },
          accordeur: { sessionsPlayed: 2, xpTotal: 1000 },
        },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series', 'duo']),
    }},
    { day: 7, actions: [SERIE_SIMPLE], predicted: {
        xp: 2150, streak: { current: 7, longest: 7, lastDate: DAYS[6] },
        modules: {
          rythme: { seriesPlayed: 3, exercisesPlayed: 0, xpTotal: 150 },
          theorie: { sessionsPlayed: 2, xpTotal: 1000 },
          accordeur: { sessionsPlayed: 2, xpTotal: 1000 },
        },
        dailyRythmeIndiv: noIndiv,
        trophies: trSorted(['first_note', 'first_series', 'duo', 'portee']),
    }},
  ],
}

// 6 — XP marathonien : 1 série parfaite (+200) + 1 examen théorie reçu (+4500) par jour
const SERIE_PARFAITE: AddSessionParams = { module: 'rythme', xpEarned: 200, medal: '🥇', meta: { perfectSeries: true } }
const EXAMEN_REUSSI:  AddSessionParams = { module: 'theorie', xpEarned: 4500, medal: '🥇' }

// XP par jour : 4700. Cumul : 4700, 9400, 14100, 18800, 23500, 28200, 32900.
// Seuils rang : Musicien=2500 (D1), Instrumentiste=6000 (D2), Soliste=12500 (D3 → do_majeur).
const p6_trophies = (d: number): string[] => {
  const base = ['first_note', 'first_series', 'perfect_series', 'duo']
  // duo : seriesPlayed≥1 + theorie.sessionsPlayed≥1 → vrai dès D1.
  const list = [...base]
  if (d >= 3) list.push('do_majeur')   // Soliste atteint à D3 (14100 ≥ 12500)
  if (d >= 7) list.push('portee')
  return trSorted(list)
}

const p6: Profile = {
  id: 6,
  name: 'XP marathonien',
  description: '1 série parfaite + 1 examen théorie reçu par jour. Teste rangs Musicien→Soliste + trophée do_majeur.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d,
    actions: [SERIE_PARFAITE, EXAMEN_REUSSI],
    predicted: {
      xp: 4700 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: {
        rythme: { seriesPlayed: d, exercisesPlayed: 0, xpTotal: 200 * d },
        theorie: { sessionsPlayed: d, xpTotal: 4500 * d },
        accordeur: { sessionsPlayed: 0, xpTotal: 0 },
      },
      dailyRythmeIndiv: noIndiv,
      trophies: p6_trophies(d),
    },
  })),
}

// 7 — Examiné stressé : 1 examen théorie reçu (40/40) par jour → 4500 XP
const p7_trophies = (d: number): string[] => {
  const list = ['first_note']
  if (d >= 3) list.push('do_majeur')   // 13500 ≥ 12500 → Soliste à D3
  if (d >= 7) list.push('portee')
  return trSorted(list)
}

const p7: Profile = {
  id: 7,
  name: 'Examiné stressé',
  description: 'Que des examens théorie reçus (40/40). Teste bonus +500 XP examen.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d,
    actions: [EXAMEN_REUSSI],
    predicted: {
      xp: 4500 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, theorie: { sessionsPlayed: d, xpTotal: 4500 * d } },
      dailyRythmeIndiv: noIndiv,
      trophies: p7_trophies(d),
    },
  })),
}

// 8 — Accordeur pro : ratios variés sur 7 jours pour vérifier le barème 500/300/150/50
const ACC_OR:     AddSessionParams = { module: 'accordeur', xpEarned: 500, medal: '🥇' } // ≥90%
const ACC_ARG:    AddSessionParams = { module: 'accordeur', xpEarned: 300, medal: '🥈' } // ≥70%
const ACC_BRZ:    AddSessionParams = { module: 'accordeur', xpEarned: 150, medal: '🥉' } // ≥50%
const ACC_RATE:   AddSessionParams = { module: 'accordeur', xpEarned: 50,  medal: '🎯' } // <50%

const p8: Profile = {
  id: 8,
  name: 'Accordeur pro',
  description: 'Ratios variés (100/80/60/40/100/80/60). Teste barème XP accordeur.',
  days: [
    { day: 1, actions: [ACC_OR],   predicted: { xp: 500,  streak: { current: 1, longest: 1, lastDate: DAYS[0] }, modules: { ...def, accordeur: { sessionsPlayed: 1, xpTotal: 500 } },  dailyRythmeIndiv: noIndiv, trophies: ['first_note'] }},
    { day: 2, actions: [ACC_ARG],  predicted: { xp: 800,  streak: { current: 2, longest: 2, lastDate: DAYS[1] }, modules: { ...def, accordeur: { sessionsPlayed: 2, xpTotal: 800 } },  dailyRythmeIndiv: noIndiv, trophies: ['first_note'] }},
    { day: 3, actions: [ACC_BRZ],  predicted: { xp: 950,  streak: { current: 3, longest: 3, lastDate: DAYS[2] }, modules: { ...def, accordeur: { sessionsPlayed: 3, xpTotal: 950 } },  dailyRythmeIndiv: noIndiv, trophies: ['first_note'] }},
    { day: 4, actions: [ACC_RATE], predicted: { xp: 1000, streak: { current: 4, longest: 4, lastDate: DAYS[3] }, modules: { ...def, accordeur: { sessionsPlayed: 4, xpTotal: 1000 } }, dailyRythmeIndiv: noIndiv, trophies: ['first_note'] }},
    { day: 5, actions: [ACC_OR],   predicted: { xp: 1500, streak: { current: 5, longest: 5, lastDate: DAYS[4] }, modules: { ...def, accordeur: { sessionsPlayed: 5, xpTotal: 1500 } }, dailyRythmeIndiv: noIndiv, trophies: ['first_note'] }},
    { day: 6, actions: [ACC_ARG],  predicted: { xp: 1800, streak: { current: 6, longest: 6, lastDate: DAYS[5] }, modules: { ...def, accordeur: { sessionsPlayed: 6, xpTotal: 1800 } }, dailyRythmeIndiv: noIndiv, trophies: ['first_note'] }},
    { day: 7, actions: [ACC_BRZ],  predicted: { xp: 1950, streak: { current: 7, longest: 7, lastDate: DAYS[6] }, modules: { ...def, accordeur: { sessionsPlayed: 7, xpTotal: 1950 } }, dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'portee']) }},
  ],
}

// 9 — Couvre-feu indiv : D1 = 9 exos (sous seuil), D2..D7 = 10 exos (seuil franchi)
const p9: Profile = {
  id: 9,
  name: 'Couvre-feu indiv',
  description: 'J1 = 9 exos (streak NON), J2-J7 = 10 exos (streak compte). Teste seuil exact.',
  days: [
    { day: 1, actions: Array(9).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 90, streak: { current: 0, longest: 0, lastDate: null },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 9, xpTotal: 90 } },
        dailyRythmeIndiv: { date: DAYS[0], count: 9 },
        trophies: ['first_note'],
    }},
    { day: 2, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        // 10e exo D2 : seuil franchi → streak reset à 1 (lastDate=null, yesterday(D2)=D1 ≠ null)
        xp: 190, streak: { current: 1, longest: 1, lastDate: DAYS[1] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 19, xpTotal: 190 } },
        dailyRythmeIndiv: { date: DAYS[1], count: 10 },
        trophies: ['first_note'],
    }},
    { day: 3, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 290, streak: { current: 2, longest: 2, lastDate: DAYS[2] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 29, xpTotal: 290 } },
        dailyRythmeIndiv: { date: DAYS[2], count: 10 },
        trophies: ['first_note'],
    }},
    { day: 4, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 390, streak: { current: 3, longest: 3, lastDate: DAYS[3] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 39, xpTotal: 390 } },
        dailyRythmeIndiv: { date: DAYS[3], count: 10 },
        trophies: ['first_note'],
    }},
    { day: 5, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 490, streak: { current: 4, longest: 4, lastDate: DAYS[4] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 49, xpTotal: 490 } },
        dailyRythmeIndiv: { date: DAYS[4], count: 10 },
        trophies: ['first_note'],
    }},
    { day: 6, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 590, streak: { current: 5, longest: 5, lastDate: DAYS[5] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 59, xpTotal: 590 } },
        dailyRythmeIndiv: { date: DAYS[5], count: 10 },
        trophies: ['first_note'],
    }},
    { day: 7, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 690, streak: { current: 6, longest: 6, lastDate: DAYS[6] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 69, xpTotal: 690 } },
        dailyRythmeIndiv: { date: DAYS[6], count: 10 },
        trophies: ['first_note'],
    }},
  ],
}

// 10 — Perfectionniste : 1 série parfaite/jour. Teste trophée perfect_series.
const p10: Profile = {
  id: 10,
  name: 'Perfectionniste',
  description: '1 série parfaite/jour (perfectSeries=true). Teste trophée perfect_series.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d,
    actions: [SERIE_PARFAITE],
    predicted: {
      xp: 200 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, rythme: { seriesPlayed: d, exercisesPlayed: 0, xpTotal: 200 * d } },
      dailyRythmeIndiv: noIndiv,
      trophies: trSorted(
        d >= 7 ? ['first_note', 'first_series', 'perfect_series', 'portee']
              : ['first_note', 'first_series', 'perfect_series']
      ),
    },
  })),
}

export const PROFILES: Profile[] = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10]
