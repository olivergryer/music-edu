# Module Accordeur — référence technique

## Fichiers
- `AccordeurPage.jsx` (~1270 lignes) — accordeur chromatique
- `AccordeurStaff.jsx` — portée VexFlow
- `accordeurUtils.js` — pitch, cents, FFT, structures toniques
- `SpectrePaneau.jsx` — panneau spectre FFT coulissant
- `sampleEngine.js` — samples R2 (load, onset, loop, playback)
- `GenerateurAccordPage.jsx` — route `/accordeur/generateur`
- `GenerateurAccord.jsx` — ancien composant embarqué (non utilisé, conservé)
- `JeuGamme.jsx` — jeu gamme (importé mais commenté dans AccordeurPage)
- Dépendance : `pitchy` (McLeod pitch detection)

## Pipeline détection
`PitchDetector.forFloat32Array(2048)` → gate RMS (seuil 0.015) → clarté (0.80 live générateur / 0.82 accordeur) → pré-accentuation `y[n]=x[n]−0.97x[n−1]` → filtre isolation frames → filtre notes < 100 ms

## Modes AccordeurPage
- **Live** : RAF 100 ms · note + octave + cents + VuMètre arc SVG ±50¢ · `liveParamsRef` pour réactivité sans redémarrer mic · autostart au montage · libère le micro au démontage
- **Enregistrement** : post-recording → segmentation → µ/σ cents · portée VexFlow (notePx=52 desktop / 26 mobile) · toggle portée/tableau · graphes canvas · scores X/N + qualité %

## VuMètre arc SVG
Arc ∩ 180°, aiguille pivotée `rotate(cents/50*90, CX, CY)` ±90°. Couleur : `couleurJustesse(cents, seuil)`. Transition CSS `0.08s ease-out`.

## Générateur d'accord (`GenerateurAccordPage.jsx`)
Route `/accordeur/generateur`, accessible via bouton dans le header AccordeurPage.

### Deux mémoires de tempérament indépendantes
- `tempereOffsets` : décalages ET (défaut 0)
- `harmoniqueOffsets` : décalages JI 5-limite
- Toggle Tempéré/Harmonique → switch entre les deux mémoires sans écraser les réglages manuels
- Réinitialiser → remet uniquement la mémoire courante à sa valeur par défaut
- Changement d'accord → recompute les DEUX mémoires

### Knobs
- SVG arc 270°, drag vertical : `setPointerCapture` + `dragValue` ref (évite stale closure)
- `onClick` stop propagation → le bloc extérieur reste cliquable pour activer/désactiver la note
- Smooth update pendant lecture : `osc.frequency.setTargetAtTime` (oscillateur) ou `src.playbackRate.setTargetAtTime` (sample)

### Détection live (note désactivée)
- Match MIDI par modulo 12 · déviation = `centsTempere(hz, diapason) − offsetCourant`
- Volume accord stable, non couplé au micro
- Hint après 30 frames (~3s) sans signal : "Plus fort / ou plus près" (`noDetectCountRef`)

## Moteur de samples (`sampleEngine.js`)

### Instruments
| Clé | Label | Tessiture MIDI |
|-----|-------|----------------|
| `oscillator` | Sinusoïde | 0–127 (virtuel) |
| `flute` | Flûte | 59–97 |
| `oboe` | Hautbois | 58–92 |
| `clarinet` | Clarinette | 50–95 |
| `saxophone` | Saxophone alto | 49–80 |
| `bassoon` | Basson | 34–74 |

Noms R2 : bémols uniquement (`Db`, `Eb`, `Gb`, `Ab`, `Bb`).  
Clé localStorage préférence : `accordeur_instrument_preference` (partagée AccordeurPage ↔ GenerateurAccordPage, défaut `'flute'`).

### Chargement
Cache mémoire session : `_memCache` + `_inFlight` (évite double-fetch StrictMode). SW cache `r2.dev/samples/` → `audio-samples-v1`.

### playbackRate et diapason
Samples enregistrés à A4=440 Hz. `diapasonCents = 1200 * log2(diapason / 440)` appliqué via playbackRate.

### Fonctions exportées
| Fonction | Usage |
|----------|-------|
| `loadInstrumentSamples(instrument, onProgress)` | charge et cache |
| `playChord(ctx, midis, offsets, sampleMap, diapason)` | accord boucle infinie |
| `playChordOscillator(ctx, midis, offsets, diapason)` | idem oscillateurs |
| `playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason)` | phrase legato |
| `playPhraseOscillator(...)` | idem oscillateurs |

## Correction 5-limite
`centsCinqLimite` (accordeurUtils) et `_correctionCinqLimite` (sampleEngine) — même logique :
- min7 (semitone 10) : ratio 7:4 → 968.825¢
- triton (semitone 6) : 7:4 depuis dominante → 568.825¢
- Autres : `JUST_RATIOS_CENTS[semitone]` (tableau 12 entrées 5-limite dans accordeurUtils)

## Enharmoniques — règle diatonique
Nommage selon degré diatonique depuis tonique. Implémenté dans `buildEnharmonicScale(tonicName)` et `buildEnharmonicVexScale(tonicName)`.

## DEFAULT_STRUCTURES
17 structures : 12 toniques standard + 5 enharmoniques (Do#, Ré#, Solb, Lab, La#).  
IDs stables : `default-0`…`default-11`, `default-enh-1/3/6/8/10`.

## Transposition
`transpoKey` (C/Bb/Eb/F/A) → `liveParamsRef` contient `transpoOffset` + `enharmonicScale` précalculé, mis à jour quand transpoKey ou structure changent.

## AccordeurStaff
Props : `notes`, `seuil`, `transpoKey`, `tonicName`, `containerWidth`, `height`, `notePx`.  
Altérations VexFlow via `accTracker` (gère les bécarres). Portée grise : SVG post-processing (`querySelectorAll`). Barres σ en SVG natif.

## Spectre FFT (`SpectrePaneau.jsx`)
Canvas log-scale 50 Hz→4 kHz, marqueurs harmoniques f1..f10.  
Mode live : second `AnalyserNode` (fftSize=4096) — `spectreAnalyserRef` — RAF indépendant.  
Mode enregistrement : `computeSpectreParNote(audioBuffer, notes)` → un spectre par note (8 fenêtres Hann).

## Réglages
Persistés localStorage (`acc_*`) : diapason · transposition · seuil ¢ · silence ms · saut note ¢ · gate RMS · seuil clarté.
