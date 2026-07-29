# Module Notes — CLAUDE-notes.md

Lecture de notes : automatiser *position sur la portée → nom de note* (enfants 7-11 ans, non
lecteurs autonomes). Réponse **toujours** via roue radiale — jamais de micro, **jamais de son avant
la réponse** (§2 de la spec). Route `/notes` (publique).

## Architecture

Tout sous `src/modules/notes/`. **Fonctions pures** (`.ts`) séparées de l'UI (`.tsx`), testées par
`node --test` sans monter React. Imports relatifs **avec extension `.ts`** (requis par le runner).

| Fichier | Rôle |
|---|---|
| `types.ts` | Modèle : `Clef`, `NoteName`, `DiatonicIndex`, `NoteItem`, `Attempt`, `Phase`, `Mastery`, `NotesSessionConfig`, `NotesSummary`, `DEFAULT_CONFIG`. |
| `diatonic.ts` | `diatonicIndex = octave FR × 7 + degré` (do=0…si=6), **do3 = 21 = do central**. `noteNameOf`/`degreeOf`/`octaveOf`/`degreeOfName`/`toVexKey` (→ `c/4`)/`vexClef`. Nom **dérivé**, jamais stocké. |
| `profiles.ts` | 4 `ReadingProfile` (`treble-high`, `treble-mid`, `alto`, `bass`). ⚠️ `landmarks`/`ambitusSequence` = **PLACEHOLDERS `// TODO Matthieu`** à affiner. |
| `instruments.ts` | Table 20 instruments → profil + clefs secondaires + `transposition` (**jamais lue**) + `beginnerFriendly`. `beginnerInstruments()`. |
| `pool.ts` | `buildPool(profile, phase, step)` — P0=repères, P1/P2=plage d'ambitus. |
| `selection.ts` | `selectNextItem` (pondéré `(1+err)×(rtMéd/rtCible)×récence`, plancher rétention, jamais 2× de suite) ; `generateLine` (tonale : 65% conjoint / 25% saut d'accord / 10% autre, début+fin stables). |
| `mastery.ts` | `classifyAttempt` (guess/slow/firstOfLine) ; `updateMastery` (guess exclu) ; `shouldUnlock`/`shouldRegress`/`nextPhase`. |
| `wheelGeometry.ts` | `angleToNoteName`/`noteNameFromVector`/`sectorCenterAngle` — 7 secteurs 51,4°, do à 12 h horaire, zone morte → null. |
| `summary.ts` | `computeSessionSummary` → `{itemCount, accuracy, medianRtMs, debitNotesMin, cvIntervalles}`. `cvIntervalles` **toujours calculé/persisté** (§13.8). |
| `encode.ts` | `encodeAttempt` → tuple `[itemIndex, diatonicAttendu, degréRépondu, rtMs, flagsBitmask]` = `EncodedItem` générique. |
| `rng.ts` / `stats.ts` | RNG mulberry32 injecté + `weightedPick` ; median/mean/stddev/CV. |
| `RadialWheel.tsx` | Menu radial **relatif** : pointerdown n'importe où fixe l'origine, sélection par angle, pointerup valide, zone morte annule. Secteur actif surdimensionné/contrasté, étayage (noms) selon phase, haptique Android capability-gated. |
| `NotesStaff.tsx` | VexFlow pré-rendu **une passe** (têtes noires à hampes) ; curseur + couleur des têtes sur manip SVG directe, **sans re-render** entre items. |
| `NotesPage.tsx` | Orchestrateur : machine d'états, **RT depuis la peinture** (rAF), boucle 3 phases, son APRÈS réponse, persistance. |

## Phases (§7)

P0 Repères (item isolé, sans chrono, noms visibles) → P1 Extension (ambitus élargi, chrono affiché,
noms estompés) → P2 Fluidité (lignes de 8 au curseur, débit, noms masqués). Étayage roue :
`visible`/`estompe`/`masque`. Déverrouillage sur **critère mesuré** (`mastery.ts`), régression possible.
Chrono **jamais en P0**.

## Persistance (schéma extensible)

`useModuleProgress('notes')` → **2 écritures max/session** (`sessions/{id}` + `progress/notes`), items
bufferisés en mémoire + checkpoint IndexedDB. XP globale via `addSession({module:'notes'})` (compteur
`modules.notes` additif dans `progressLogic.ts`, gamification hybride inchangée).

## Points d'extension

- **Ajouter un instrument** = 1 ligne dans `INSTRUMENTS` (`instruments.ts`), zéro code (§5.1).
- **Sélecteur v1** = `beginnerFriendly` only (`beginnerInstruments()`).
- **Ne jamais lire `transposition`** dans le module (test `notesData.test.ts` §5.4 le vérifie).
- Cor → profil `treble-mid` (décision v1, 4 profils).

## Hors v1 (architecture prévue, pas de code)

Altérations + gestes radiaux (dièse extérieur / bémol intérieur), mode empan masqué, rythme. Le
masquage reste un **flag de rendu SVG** ; `diatonicIndex` accueille une altération **sans changer de
type**.

## Tests

`npm run test` (depuis `apps/web/`). 5 fichiers `notes*.test.ts` couvrant §12 + critères d'acceptation
§5 (dont §5.4 par scan statique). Graine RNG fixe.
