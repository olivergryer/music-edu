# PLAN — Protocole de test des comptes utilisateurs

Période simulée : **2026-06-01 → 2026-06-07** (7 jours)

Profils testés : **10**

## Aperçu

| # | Profil | Edge case testé |
|---|--------|-----------------|
| 1 | Apprenti régulier | 1 série rythme/jour pendant 7 jours. Teste streak max + trophée portee. |
| 2 | Marathon indiv (≥10/jour) | 12 exos indiv rythme par jour. Teste seuil streak 10 exos. |
| 3 | Tortue indiv (<10/jour) | 5 exos indiv rythme/jour : reste sous le seuil 10, streak reste à 0. |
| 4 | Skipper (saute J4) | Joue J1-J3 puis skip J4 puis reprend J5-J7. Streak reset à 1 le J5. |
| 5 | Multi-modules | Alterne rythme/théorie/accordeur. Teste streak cross-module + trophée duo. |
| 6 | XP marathonien | 1 série parfaite + 1 examen théorie reçu par jour. Teste rangs Musicien→Soliste + trophée do_majeur. |
| 7 | Examiné stressé | Que des examens théorie reçus (40/40). Teste bonus +500 XP examen. |
| 8 | Accordeur pro | Ratios variés (100/80/60/40/100/80/60). Teste barème XP accordeur. |
| 9 | Couvre-feu indiv | J1 = 9 exos (streak NON), J2-J7 = 10 exos (streak compte). Teste seuil exact. |
| 10 | Perfectionniste | 1 série parfaite/jour (perfectSeries=true). Teste trophée perfect_series. |

## Planning détaillé par profil

### Profil 1 — Apprenti régulier

*1 série rythme/jour pendant 7 jours. Teste streak max + trophée portee.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× rythme | 50 | 1 | first_note, first_series |
| 2 | 2026-06-02 | 1× rythme | 100 | 2 | first_note, first_series |
| 3 | 2026-06-03 | 1× rythme | 150 | 3 | first_note, first_series |
| 4 | 2026-06-04 | 1× rythme | 200 | 4 | first_note, first_series |
| 5 | 2026-06-05 | 1× rythme | 250 | 5 | first_note, first_series |
| 6 | 2026-06-06 | 1× rythme | 300 | 6 | first_note, first_series |
| 7 | 2026-06-07 | 1× rythme | 350 | 7 | first_note, first_series, portee |

### Profil 2 — Marathon indiv (≥10/jour)

*12 exos indiv rythme par jour. Teste seuil streak 10 exos.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 12× rythme indiv | 240 | 1 | first_note |
| 2 | 2026-06-02 | 12× rythme indiv | 480 | 2 | first_note |
| 3 | 2026-06-03 | 12× rythme indiv | 720 | 3 | first_note |
| 4 | 2026-06-04 | 12× rythme indiv | 960 | 4 | first_note |
| 5 | 2026-06-05 | 12× rythme indiv | 1200 | 5 | first_note |
| 6 | 2026-06-06 | 12× rythme indiv | 1440 | 6 | first_note |
| 7 | 2026-06-07 | 12× rythme indiv | 1680 | 7 | first_note, portee |

### Profil 3 — Tortue indiv (<10/jour)

*5 exos indiv rythme/jour : reste sous le seuil 10, streak reste à 0.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 5× rythme indiv | 50 | 0 | first_note |
| 2 | 2026-06-02 | 5× rythme indiv | 100 | 0 | first_note |
| 3 | 2026-06-03 | 5× rythme indiv | 150 | 0 | first_note |
| 4 | 2026-06-04 | 5× rythme indiv | 200 | 0 | first_note |
| 5 | 2026-06-05 | 5× rythme indiv | 250 | 0 | first_note |
| 6 | 2026-06-06 | 5× rythme indiv | 300 | 0 | first_note |
| 7 | 2026-06-07 | 5× rythme indiv | 350 | 0 | first_note |

### Profil 4 — Skipper (saute J4)

*Joue J1-J3 puis skip J4 puis reprend J5-J7. Streak reset à 1 le J5.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× rythme | 50 | 1 | first_note, first_series |
| 2 | 2026-06-02 | 1× rythme | 100 | 2 | first_note, first_series |
| 3 | 2026-06-03 | 1× rythme | 150 | 3 | first_note, first_series |
| 4 | 2026-06-04 | _(aucune)_ | 150 | 3 | first_note, first_series |
| 5 | 2026-06-05 | 1× rythme | 200 | 1 | first_note, first_series |
| 6 | 2026-06-06 | 1× rythme | 250 | 2 | first_note, first_series |
| 7 | 2026-06-07 | 1× rythme | 300 | 3 | first_note, first_series |

### Profil 5 — Multi-modules

*Alterne rythme/théorie/accordeur. Teste streak cross-module + trophée duo.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× rythme | 50 | 1 | first_note, first_series |
| 2 | 2026-06-02 | 1× theorie | 550 | 2 | duo, first_note, first_series |
| 3 | 2026-06-03 | 1× accordeur | 1050 | 3 | duo, first_note, first_series |
| 4 | 2026-06-04 | 1× rythme | 1100 | 4 | duo, first_note, first_series |
| 5 | 2026-06-05 | 1× theorie | 1600 | 5 | duo, first_note, first_series |
| 6 | 2026-06-06 | 1× accordeur | 2100 | 6 | duo, first_note, first_series |
| 7 | 2026-06-07 | 1× rythme | 2150 | 7 | duo, first_note, first_series, portee |

### Profil 6 — XP marathonien

*1 série parfaite + 1 examen théorie reçu par jour. Teste rangs Musicien→Soliste + trophée do_majeur.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× rythme parfaite, 1× theorie | 4700 | 1 | duo, first_note, first_series, perfect_series |
| 2 | 2026-06-02 | 1× rythme parfaite, 1× theorie | 9400 | 2 | duo, first_note, first_series, perfect_series |
| 3 | 2026-06-03 | 1× rythme parfaite, 1× theorie | 14100 | 3 | do_majeur, duo, first_note, first_series, perfect_series |
| 4 | 2026-06-04 | 1× rythme parfaite, 1× theorie | 18800 | 4 | do_majeur, duo, first_note, first_series, perfect_series |
| 5 | 2026-06-05 | 1× rythme parfaite, 1× theorie | 23500 | 5 | do_majeur, duo, first_note, first_series, perfect_series |
| 6 | 2026-06-06 | 1× rythme parfaite, 1× theorie | 28200 | 6 | do_majeur, duo, first_note, first_series, perfect_series |
| 7 | 2026-06-07 | 1× rythme parfaite, 1× theorie | 32900 | 7 | do_majeur, duo, first_note, first_series, perfect_series, portee |

### Profil 7 — Examiné stressé

*Que des examens théorie reçus (40/40). Teste bonus +500 XP examen.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× theorie | 4500 | 1 | first_note |
| 2 | 2026-06-02 | 1× theorie | 9000 | 2 | first_note |
| 3 | 2026-06-03 | 1× theorie | 13500 | 3 | do_majeur, first_note |
| 4 | 2026-06-04 | 1× theorie | 18000 | 4 | do_majeur, first_note |
| 5 | 2026-06-05 | 1× theorie | 22500 | 5 | do_majeur, first_note |
| 6 | 2026-06-06 | 1× theorie | 27000 | 6 | do_majeur, first_note |
| 7 | 2026-06-07 | 1× theorie | 31500 | 7 | do_majeur, first_note, portee |

### Profil 8 — Accordeur pro

*Ratios variés (100/80/60/40/100/80/60). Teste barème XP accordeur.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× accordeur | 500 | 1 | first_note |
| 2 | 2026-06-02 | 1× accordeur | 800 | 2 | first_note |
| 3 | 2026-06-03 | 1× accordeur | 950 | 3 | first_note |
| 4 | 2026-06-04 | 1× accordeur | 1000 | 4 | first_note |
| 5 | 2026-06-05 | 1× accordeur | 1500 | 5 | first_note |
| 6 | 2026-06-06 | 1× accordeur | 1800 | 6 | first_note |
| 7 | 2026-06-07 | 1× accordeur | 1950 | 7 | first_note, portee |

### Profil 9 — Couvre-feu indiv

*J1 = 9 exos (streak NON), J2-J7 = 10 exos (streak compte). Teste seuil exact.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 9× rythme indiv | 90 | 0 | first_note |
| 2 | 2026-06-02 | 10× rythme indiv | 190 | 1 | first_note |
| 3 | 2026-06-03 | 10× rythme indiv | 290 | 2 | first_note |
| 4 | 2026-06-04 | 10× rythme indiv | 390 | 3 | first_note |
| 5 | 2026-06-05 | 10× rythme indiv | 490 | 4 | first_note |
| 6 | 2026-06-06 | 10× rythme indiv | 590 | 5 | first_note |
| 7 | 2026-06-07 | 10× rythme indiv | 690 | 6 | first_note |

### Profil 10 — Perfectionniste

*1 série parfaite/jour (perfectSeries=true). Teste trophée perfect_series.*

| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |
|------|------|---------|----------|--------------|-----------------|
| 1 | 2026-06-01 | 1× rythme parfaite | 200 | 1 | first_note, first_series, perfect_series |
| 2 | 2026-06-02 | 1× rythme parfaite | 400 | 2 | first_note, first_series, perfect_series |
| 3 | 2026-06-03 | 1× rythme parfaite | 600 | 3 | first_note, first_series, perfect_series |
| 4 | 2026-06-04 | 1× rythme parfaite | 800 | 4 | first_note, first_series, perfect_series |
| 5 | 2026-06-05 | 1× rythme parfaite | 1000 | 5 | first_note, first_series, perfect_series |
| 6 | 2026-06-06 | 1× rythme parfaite | 1200 | 6 | first_note, first_series, perfect_series |
| 7 | 2026-06-07 | 1× rythme parfaite | 1400 | 7 | first_note, first_series, perfect_series, portee |