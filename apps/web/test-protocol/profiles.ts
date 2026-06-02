// 14 profils de test, chacun avec un planning sur jusqu'à 22 jours et l'état attendu en fin de journée.
// Les prédictions sont calculées MANUELLEMENT pour servir d'oracle : si le code diverge → bug.
//
// Les dates simulées vont du 2026-06-01 (lundi) au 2026-06-22 (lundi semaine 4).

import type { AddSessionParams, ProgressState } from '../src/hooks/progressLogic.ts'

export const DAYS: string[] = [
  '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07',
  '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14',
  '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22',
]

export interface ProfileDay {
  day: number               // 1..22
  actions: AddSessionParams[]
  predicted: {
    xp: number
    streak: ProgressState['streak']
    modules: ProgressState['modules']
    dailyRythmeIndiv: ProgressState['dailyRythmeIndiv']
    trophies: string[]      // ordre alphabétique pour comparaison
    highestRankIdx: number
  }
}

export interface Profile {
  id: number
  name: string
  description: string
  days: ProfileDay[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const def = {
  rythme:    { seriesPlayed: 0, exercisesPlayed: 0, xpTotal: 0 },
  theorie:   { sessionsPlayed: 0, xpTotal: 0 },
  accordeur: { sessionsPlayed: 0, xpTotal: 0 },
}

const noIndiv = { date: null, count: 0 }

const trSorted = (arr: string[]) => [...arr].sort()

// ─── Actions réutilisables ────────────────────────────────────────────────────

const SERIE_SIMPLE:   AddSessionParams = { module: 'rythme', xpEarned: 50, medal: '🥇', meta: { perfectSeries: false } }
const SERIE_PARFAITE: AddSessionParams = { module: 'rythme', xpEarned: 200, medal: '🥇', meta: { perfectSeries: true } }
const EXO_INDIV:      AddSessionParams = { module: 'rythme', xpEarned: 20, medal: '🥈', meta: { individual: true } }
const EXO_INDIV_TORTUE: AddSessionParams = { module: 'rythme', xpEarned: 10, medal: '🥉', meta: { individual: true } }
const SESSION_THEORIE_ENT: AddSessionParams = { module: 'theorie', xpEarned: 500, medal: '🥇' }
const EXAMEN_REUSSI:  AddSessionParams = { module: 'theorie', xpEarned: 4500, medal: '🥇' }
const SESSION_ACC_TOP: AddSessionParams = { module: 'accordeur', xpEarned: 500, medal: '🥇' }
const ACC_OR:   AddSessionParams = { module: 'accordeur', xpEarned: 500, medal: '🥇' }
const ACC_ARG:  AddSessionParams = { module: 'accordeur', xpEarned: 300, medal: '🥈' }
const ACC_BRZ:  AddSessionParams = { module: 'accordeur', xpEarned: 150, medal: '🥉' }
const ACC_RATE: AddSessionParams = { module: 'accordeur', xpEarned: 50,  medal: '🎯' }

// Sessions test (decay)
const SESSION_BIG_THEORIE: AddSessionParams = { module: 'theorie', xpEarned: 10000, medal: '🥇' }
const SESSION_SMALL_THEORIE: AddSessionParams = { module: 'theorie', xpEarned: 100, medal: '🥈' }
const SESSION_SOLISTE: AddSessionParams = { module: 'theorie', xpEarned: 12500, medal: '🥇' }
const SESSION_RECOVERY: AddSessionParams = { module: 'theorie', xpEarned: 1000, medal: '🥇' }

// ─── Profils ──────────────────────────────────────────────────────────────────

// 1 — Apprenti régulier
const p1: Profile = {
  id: 1, name: 'Apprenti régulier',
  description: '1 série rythme/jour pendant 7 jours. Teste streak max + trophée portee.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d, actions: [SERIE_SIMPLE],
    predicted: {
      xp: 50 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, rythme: { seriesPlayed: d, exercisesPlayed: 0, xpTotal: 50 * d } },
      dailyRythmeIndiv: noIndiv,
      trophies: trSorted(d >= 7 ? ['first_note', 'first_series', 'portee'] : ['first_note', 'first_series']),
      highestRankIdx: 0,
    },
  })),
}

// 2 — Marathon indiv (≥10/jour)
const p2: Profile = {
  id: 2, name: 'Marathon indiv (≥10/jour)',
  description: '12 exos indiv rythme par jour. Teste seuil streak 10 exos.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d, actions: Array(12).fill(EXO_INDIV),
    predicted: {
      xp: 12 * 20 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 12 * d, xpTotal: 12 * 20 * d } },
      dailyRythmeIndiv: { date: DAYS[d-1], count: 12 },
      trophies: trSorted(d >= 7 ? ['first_note', 'portee'] : ['first_note']),
      highestRankIdx: 0,
    },
  })),
}

// 3 — Tortue indiv (<10/jour)
const p3: Profile = {
  id: 3, name: 'Tortue indiv (<10/jour)',
  description: '5 exos indiv rythme/jour : reste sous le seuil 10, streak reste à 0.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d, actions: Array(5).fill(EXO_INDIV_TORTUE),
    predicted: {
      xp: 5 * 10 * d,
      streak: { current: 0, longest: 0, lastDate: null },
      modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 5 * d, xpTotal: 50 * d } },
      dailyRythmeIndiv: { date: DAYS[d-1], count: 5 },
      trophies: ['first_note'],
      highestRankIdx: 0,
    },
  })),
}

// 4 — Skipper : J1-J3, J4 idle, J5-J7. Décroissance pendant J4 → applique au J5.
// D5 : daysIdle=1, decay 0.98 → 150×0.98=147. +50 = 197. streak reset à 1.
const p4: Profile = {
  id: 4, name: 'Skipper (saute J4)',
  description: 'Joue J1-J3 puis skip J4 puis reprend J5-J7. Décroissance -2% pendant J4.',
  days: [
    { day: 1, actions: [SERIE_SIMPLE], predicted: {
        xp: 50, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 2, actions: [SERIE_SIMPLE], predicted: {
        xp: 100, streak: { current: 2, longest: 2, lastDate: DAYS[1] },
        modules: { ...def, rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 3, actions: [SERIE_SIMPLE], predicted: {
        xp: 150, streak: { current: 3, longest: 3, lastDate: DAYS[2] },
        modules: { ...def, rythme: { seriesPlayed: 3, exercisesPlayed: 0, xpTotal: 150 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 4, actions: [], predicted: {
        xp: 150, streak: { current: 3, longest: 3, lastDate: DAYS[2] },
        modules: { ...def, rythme: { seriesPlayed: 3, exercisesPlayed: 0, xpTotal: 150 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 5, actions: [SERIE_SIMPLE], predicted: {
        // decay 150×0.98=147 → +50 = 197. streak reset.
        xp: 197, streak: { current: 1, longest: 3, lastDate: DAYS[4] },
        modules: { ...def, rythme: { seriesPlayed: 4, exercisesPlayed: 0, xpTotal: 200 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 6, actions: [SERIE_SIMPLE], predicted: {
        xp: 247, streak: { current: 2, longest: 3, lastDate: DAYS[5] },
        modules: { ...def, rythme: { seriesPlayed: 5, exercisesPlayed: 0, xpTotal: 250 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 7, actions: [SERIE_SIMPLE], predicted: {
        xp: 297, streak: { current: 3, longest: 3, lastDate: DAYS[6] },
        modules: { ...def, rythme: { seriesPlayed: 6, exercisesPlayed: 0, xpTotal: 300 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
  ],
}

// 5 — Multi-modules
const p5: Profile = {
  id: 5, name: 'Multi-modules',
  description: 'Alterne rythme/théorie/accordeur. Teste streak cross-module + trophée duo.',
  days: [
    { day: 1, actions: [SERIE_SIMPLE], predicted: {
        xp: 50, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series']),
        highestRankIdx: 0,
    }},
    { day: 2, actions: [SESSION_THEORIE_ENT], predicted: {
        xp: 550, streak: { current: 2, longest: 2, lastDate: DAYS[1] },
        modules: { ...def, rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 }, theorie: { sessionsPlayed: 1, xpTotal: 500 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series', 'duo']),
        highestRankIdx: 0,
    }},
    { day: 3, actions: [SESSION_ACC_TOP], predicted: {
        xp: 1050, streak: { current: 3, longest: 3, lastDate: DAYS[2] },
        modules: {
          rythme: { seriesPlayed: 1, exercisesPlayed: 0, xpTotal: 50 },
          theorie: { sessionsPlayed: 1, xpTotal: 500 },
          accordeur: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series', 'duo']),
        highestRankIdx: 0,
    }},
    { day: 4, actions: [SERIE_SIMPLE], predicted: {
        xp: 1100, streak: { current: 4, longest: 4, lastDate: DAYS[3] },
        modules: {
          rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 },
          theorie: { sessionsPlayed: 1, xpTotal: 500 },
          accordeur: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series', 'duo']),
        highestRankIdx: 0,
    }},
    { day: 5, actions: [SESSION_THEORIE_ENT], predicted: {
        xp: 1600, streak: { current: 5, longest: 5, lastDate: DAYS[4] },
        modules: {
          rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 },
          theorie: { sessionsPlayed: 2, xpTotal: 1000 },
          accordeur: { sessionsPlayed: 1, xpTotal: 500 },
        },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series', 'duo']),
        highestRankIdx: 0,
    }},
    { day: 6, actions: [SESSION_ACC_TOP], predicted: {
        xp: 2100, streak: { current: 6, longest: 6, lastDate: DAYS[5] },
        modules: {
          rythme: { seriesPlayed: 2, exercisesPlayed: 0, xpTotal: 100 },
          theorie: { sessionsPlayed: 2, xpTotal: 1000 },
          accordeur: { sessionsPlayed: 2, xpTotal: 1000 },
        },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series', 'duo']),
        highestRankIdx: 0,
    }},
    { day: 7, actions: [SERIE_SIMPLE], predicted: {
        xp: 2150, streak: { current: 7, longest: 7, lastDate: DAYS[6] },
        modules: {
          rythme: { seriesPlayed: 3, exercisesPlayed: 0, xpTotal: 150 },
          theorie: { sessionsPlayed: 2, xpTotal: 1000 },
          accordeur: { sessionsPlayed: 2, xpTotal: 1000 },
        },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'first_series', 'duo', 'portee']),
        highestRankIdx: 0,
    }},
  ],
}

// 6 — XP marathonien : 1 série parfaite + 1 examen théorie reçu par jour
const p6_trophies = (d: number): string[] => {
  const base = ['first_note', 'first_series', 'perfect_series', 'duo']
  const list = [...base]
  if (d >= 3) list.push('do_majeur')
  if (d >= 7) list.push('portee')
  return trSorted(list)
}

const p6_highest = (d: number): number => {
  if (d >= 3) return 3 // Soliste
  if (d >= 2) return 2 // Instrumentiste
  if (d >= 1) return 1 // Musicien
  return 0
}

const p6: Profile = {
  id: 6, name: 'XP marathonien',
  description: '1 série parfaite + 1 examen théorie reçu par jour. Teste rangs Musicien→Soliste + trophée do_majeur.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d, actions: [SERIE_PARFAITE, EXAMEN_REUSSI],
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
      highestRankIdx: p6_highest(d),
    },
  })),
}

// 7 — Examiné stressé : 1 examen théorie reçu (40/40) par jour
const p7_trophies = (d: number): string[] => {
  const list = ['first_note']
  if (d >= 3) list.push('do_majeur')
  if (d >= 7) list.push('portee')
  return trSorted(list)
}

const p7_highest = (d: number): number => {
  if (d >= 3) return 3
  if (d >= 2) return 2
  if (d >= 1) return 1
  return 0
}

const p7: Profile = {
  id: 7, name: 'Examiné stressé',
  description: 'Que des examens théorie reçus (40/40). Teste bonus +500 XP examen.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d, actions: [EXAMEN_REUSSI],
    predicted: {
      xp: 4500 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, theorie: { sessionsPlayed: d, xpTotal: 4500 * d } },
      dailyRythmeIndiv: noIndiv,
      trophies: p7_trophies(d),
      highestRankIdx: p7_highest(d),
    },
  })),
}

// 8 — Accordeur pro
const p8: Profile = {
  id: 8, name: 'Accordeur pro',
  description: 'Ratios variés (100/80/60/40/100/80/60). Teste barème XP accordeur.',
  days: [
    { day: 1, actions: [ACC_OR],   predicted: { xp: 500,  streak: { current: 1, longest: 1, lastDate: DAYS[0] }, modules: { ...def, accordeur: { sessionsPlayed: 1, xpTotal: 500 } },  dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 0 }},
    { day: 2, actions: [ACC_ARG],  predicted: { xp: 800,  streak: { current: 2, longest: 2, lastDate: DAYS[1] }, modules: { ...def, accordeur: { sessionsPlayed: 2, xpTotal: 800 } },  dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 0 }},
    { day: 3, actions: [ACC_BRZ],  predicted: { xp: 950,  streak: { current: 3, longest: 3, lastDate: DAYS[2] }, modules: { ...def, accordeur: { sessionsPlayed: 3, xpTotal: 950 } },  dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 0 }},
    { day: 4, actions: [ACC_RATE], predicted: { xp: 1000, streak: { current: 4, longest: 4, lastDate: DAYS[3] }, modules: { ...def, accordeur: { sessionsPlayed: 4, xpTotal: 1000 } }, dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 0 }},
    { day: 5, actions: [ACC_OR],   predicted: { xp: 1500, streak: { current: 5, longest: 5, lastDate: DAYS[4] }, modules: { ...def, accordeur: { sessionsPlayed: 5, xpTotal: 1500 } }, dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 0 }},
    { day: 6, actions: [ACC_ARG],  predicted: { xp: 1800, streak: { current: 6, longest: 6, lastDate: DAYS[5] }, modules: { ...def, accordeur: { sessionsPlayed: 6, xpTotal: 1800 } }, dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 0 }},
    { day: 7, actions: [ACC_BRZ],  predicted: { xp: 1950, streak: { current: 7, longest: 7, lastDate: DAYS[6] }, modules: { ...def, accordeur: { sessionsPlayed: 7, xpTotal: 1950 } }, dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'portee']), highestRankIdx: 0 }},
  ],
}

// 9 — Couvre-feu indiv
const p9: Profile = {
  id: 9, name: 'Couvre-feu indiv',
  description: 'J1 = 9 exos (streak NON), J2-J7 = 10 exos (streak compte). Teste seuil exact.',
  days: [
    { day: 1, actions: Array(9).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 90, streak: { current: 0, longest: 0, lastDate: null },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 9, xpTotal: 90 } },
        dailyRythmeIndiv: { date: DAYS[0], count: 9 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
    { day: 2, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 190, streak: { current: 1, longest: 1, lastDate: DAYS[1] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 19, xpTotal: 190 } },
        dailyRythmeIndiv: { date: DAYS[1], count: 10 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
    { day: 3, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 290, streak: { current: 2, longest: 2, lastDate: DAYS[2] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 29, xpTotal: 290 } },
        dailyRythmeIndiv: { date: DAYS[2], count: 10 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
    { day: 4, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 390, streak: { current: 3, longest: 3, lastDate: DAYS[3] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 39, xpTotal: 390 } },
        dailyRythmeIndiv: { date: DAYS[3], count: 10 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
    { day: 5, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 490, streak: { current: 4, longest: 4, lastDate: DAYS[4] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 49, xpTotal: 490 } },
        dailyRythmeIndiv: { date: DAYS[4], count: 10 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
    { day: 6, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 590, streak: { current: 5, longest: 5, lastDate: DAYS[5] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 59, xpTotal: 590 } },
        dailyRythmeIndiv: { date: DAYS[5], count: 10 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
    { day: 7, actions: Array(10).fill(EXO_INDIV_TORTUE), predicted: {
        xp: 690, streak: { current: 6, longest: 6, lastDate: DAYS[6] },
        modules: { ...def, rythme: { seriesPlayed: 0, exercisesPlayed: 69, xpTotal: 690 } },
        dailyRythmeIndiv: { date: DAYS[6], count: 10 }, trophies: ['first_note'], highestRankIdx: 0,
    }},
  ],
}

// 10 — Perfectionniste
const p10: Profile = {
  id: 10, name: 'Perfectionniste',
  description: '1 série parfaite/jour (perfectSeries=true). Teste trophée perfect_series.',
  days: [1,2,3,4,5,6,7].map(d => ({
    day: d, actions: [SERIE_PARFAITE],
    predicted: {
      xp: 200 * d,
      streak: { current: d, longest: d, lastDate: DAYS[d-1] },
      modules: { ...def, rythme: { seriesPlayed: d, exercisesPlayed: 0, xpTotal: 200 * d } },
      dailyRythmeIndiv: noIndiv,
      trophies: trSorted(d >= 7 ? ['first_note', 'first_series', 'perfect_series', 'portee'] : ['first_note', 'first_series', 'perfect_series']),
      highestRankIdx: 0,
    },
  })),
}

// 11 — Décroissance phase 1 (D1 grosse session, D2-D7 idle, D8 reprise)
// D1 : +10000 XP → rang Instrumentiste (idx 2). highestRankIdx = 2.
// D8 : daysIdle = 6 (phase 1 seulement). decay = 10000 × 0.98^6 = round(8858.42) = 8858. +100 = 8958.
const p11: Profile = {
  id: 11, name: 'Décroissance phase 1',
  description: 'D1 +10 000 XP, D2-D7 idle, D8 reprise. Teste -2%/j × 6 jours.',
  days: [
    { day: 1, actions: [SESSION_BIG_THEORIE], predicted: {
        xp: 10000, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, theorie: { sessionsPlayed: 1, xpTotal: 10000 } },
        dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 2,
    }},
    { day: 8, actions: [SESSION_SMALL_THEORIE], predicted: {
        xp: 8958, streak: { current: 1, longest: 1, lastDate: DAYS[7] },
        modules: { ...def, theorie: { sessionsPlayed: 2, xpTotal: 10100 } },
        dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 2,
    }},
  ],
}

// 12 — Décroissance phase 2 + chute de rang forcée (D1 grosse session, D15 reprise)
// D1 : +10000 XP → Instrumentiste. D15 : daysIdle = 13.
//   factor phase 1 (7j × 0.98) = 0.86813. Phase 2 (6j × 0.95) = 0.73509. Total = 0.63816.
//   decay XP : round(10000 × 0.63816) = 6382. rang = Instrumentiste (≥6000). initial=2.
//   newRank ≥ initial → chute forcée. XP = RANKS[2].xp - 1 = 5999.
//   +100 XP (pas de boost car peak=2 → target=1 (Musicien, 2500), 5999 >= 2500).
//   final XP = 6099. Rang = Instrumentiste (≥6000) à nouveau.
const p12: Profile = {
  id: 12, name: 'Décroissance phase 2 + chute forcée',
  description: 'D1 +10 000 XP, D2-D14 idle, D15 reprise. Teste -2%×7 puis -5%×6 + chute de rang forcée.',
  days: [
    { day: 1, actions: [SESSION_BIG_THEORIE], predicted: {
        xp: 10000, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, theorie: { sessionsPlayed: 1, xpTotal: 10000 } },
        dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 2,
    }},
    { day: 15, actions: [SESSION_SMALL_THEORIE], predicted: {
        xp: 6099, streak: { current: 1, longest: 1, lastDate: DAYS[14] },
        modules: { ...def, theorie: { sessionsPlayed: 2, xpTotal: 10100 } },
        dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 2,
    }},
  ],
}

// 13 — Décroissance phase 3 (D1 grosse session, D22 reprise)
// daysIdle = 20. factor : 0.98^7 × 0.95^7 × 0.9^6 ≈ 0.322179.
//   decay XP : round(10000 × 0.322179) = 3222. rang = Musicien (≥2500, <6000). initial=2 (Instrumentiste).
//   newRank (1) < initial (2) → chute naturelle, pas de chute forcée.
//   boost? peak=2, target=1 (2500). current 3222 >= 2500 → pas de boost.
//   +100. final = 3322.
const p13: Profile = {
  id: 13, name: 'Décroissance phase 3',
  description: 'D1 +10 000 XP, D2-D21 idle, D22 reprise. Teste -2%×7, -5%×7, -10%×6.',
  days: [
    { day: 1, actions: [SESSION_BIG_THEORIE], predicted: {
        xp: 10000, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, theorie: { sessionsPlayed: 1, xpTotal: 10000 } },
        dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 2,
    }},
    { day: 22, actions: [SESSION_SMALL_THEORIE], predicted: {
        xp: 3322, streak: { current: 1, longest: 1, lastDate: DAYS[21] },
        modules: { ...def, theorie: { sessionsPlayed: 2, xpTotal: 10100 } },
        dailyRythmeIndiv: noIndiv, trophies: ['first_note'], highestRankIdx: 2,
    }},
  ],
}

// 14 — Boost récupération (D1 12500 XP = Soliste, D22 reprise dans la boost zone)
// D1 : +12500 XP → Soliste (idx 3, exactement). highestRankIdx = 3. Trophée do_majeur.
// D22 : daysIdle = 20.
//   factor : 0.32213 (même que P13). decay = round(12500 × 0.32213) = 4027.
//   newRank=getRankIdx(4027)=1 (Musicien). initial=3. newRank<initial → pas de chute forcée.
//   boost? peak=3, target=2 (Instrumentiste, 6000). current 4027 < 6000 → boost 2×.
//   +1000 × 2 = +2000. final = 6027. Rang = Instrumentiste.
//   xpTotal théorie += 2000 (boost crédité).
const p14: Profile = {
  id: 14, name: 'Boost récupération',
  description: 'D1 atteint Soliste (12500 XP), D2-D21 idle, D22 reprise. Teste boost 2× jusqu\'à Instrumentiste.',
  days: [
    { day: 1, actions: [SESSION_SOLISTE], predicted: {
        xp: 12500, streak: { current: 1, longest: 1, lastDate: DAYS[0] },
        modules: { ...def, theorie: { sessionsPlayed: 1, xpTotal: 12500 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'do_majeur']),
        highestRankIdx: 3,
    }},
    { day: 22, actions: [SESSION_RECOVERY], predicted: {
        xp: 6027, streak: { current: 1, longest: 1, lastDate: DAYS[21] },
        modules: { ...def, theorie: { sessionsPlayed: 2, xpTotal: 14500 } },
        dailyRythmeIndiv: noIndiv, trophies: trSorted(['first_note', 'do_majeur']),
        highestRankIdx: 3,
    }},
  ],
}

export const PROFILES: Profile[] = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14]
