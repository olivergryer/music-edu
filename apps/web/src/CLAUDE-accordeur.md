# Module Accordeur — référence technique

## Fichiers
- `AccordeurPage.jsx` — accordeur chromatique V2 (~1200 lignes)
- `AccordeurStaff.jsx` — portée VexFlow
- `accordeurUtils.js` — utilitaires pitch, cents, structures toniques, FFT
- `SpectrePaneau.jsx` — panneau latéral spectre FFT coulissant
- Dépendance : `pitchy` (McLeod — remplace pitchfinder/YIN)

## Pipeline détection
`PitchDetector.forFloat32Array(2048)` → gate RMS → seuil clarté → pré-accentuation `y[n]=x[n]−0.97x[n−1]` → filtre isolation frames → filtre notes < 100 ms

## Modes
- **Enregistrement** : post-recording → segmentation → μ/σ cents · portée VexFlow (notePx=52 desktop / 26 mobile) · toggle portée/tableau · graphes canvas · scores X/N + qualité % · recalcul ↻ manuel
- **Live** : RAF 250 ms · note + octave + cents + needle ±50¢ · `liveParamsRef` pour réactivité sans redémarrer mic

## Spectre FFT (`SpectrePaneau.jsx`)
- Bouton **◈ Spectre** visible en mode live ET phase `resultats`
- Panneau fixe droite : `Math.min(380, 80vw)` — 20% page principale toujours visible
- Canvas log-scale 50 Hz→4 kHz, gradient bleu (faible)→orange (fort)
- Marqueurs harmoniques f1..f10 avec lignes pointillées
- Légende : nom note + octave + Hz + déviation ¢ colorée (vert/orange/rouge)
- **Mode live** : second `AnalyserNode` (fftSize=4096) en parallèle sur même source — `spectreAnalyserRef` — RAF interne indépendant
- **Mode enregistrement** : `computeSpectreParNote(audioBuffer, notes)` → un spectre FFT moyen (8 fenêtres Hann) par segment de note → liste cliquable pour naviguer entre notes

## Réglages
Seuil clarté (0.5–1.0) · gate RMS (0–0.15) + vumètre · silence ms · saut note ¢ · diapason · transposition C/Bb/Eb/F/A
Tous les réglages persistés dans `localStorage`.

## Audio — refs live
| Ref | Contenu |
|-----|---------|
| `liveAnalyserRef` | AnalyserNode fftSize=2048 (pitch detection) |
| `spectreAnalyserRef` | AnalyserNode fftSize=4096 (spectre FFT) |
| `liveHzRef` | Hz courant (marqueurs harmoniques spectre) |
| `liveParamsRef` | Snapshot params pour RAF sans re-bind |

## FFT (`accordeurUtils.js`)
- `_spectrumFromSamples(data, fftSize)` — interne : FFT Cooley-Tukey radix-2, N=8 fenêtres Hann moyennées, retourne Float32Array dB
- `computeAverageSpectrum(audioBuffer, fftSize=4096)` — spectre global
- `computeSpectreParNote(audioBuffer, notes, fftSize=4096)` — tableau Float32Array[], un par note (utilise `note.debutMs`/`note.finMs`)

## AccordeurStaff
- `notePx` prop : 52px desktop, 26px mobile (passé depuis AccordeurPage via `window.innerWidth <= 540`)
- Altérations : `#` (dièse), `b` (bémol) via `NOTE_NAMES_VEX = ['c','db','d','eb',...]`, bécarre naturel si retour à naturel après altération
- Portée grise `#9ca3af`, notes colorées par justesse, barres σ en SVG natif

## Données
Structures toniques : localStorage + partage URL `?s=` · Historique sessions
`notes` (depuis `calculerEcarts`) contiennent : `nom`, `octave`, `midiCible`, `muCents`, `sigmaCents`, `debutMs`, `finMs`, `frames[]`
