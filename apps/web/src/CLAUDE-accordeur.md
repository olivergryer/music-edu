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
- **Live** (défaut) : RAF 250 ms · note + octave + cents + needle ±50¢ · `liveParamsRef` pour réactivité sans redémarrer mic · autostart au montage
- **Enregistrement** : post-recording → segmentation → μ/σ cents · portée VexFlow (notePx=52 desktop / 26 mobile) · toggle portée/tableau · graphes canvas · scores X/N + qualité % · recalcul ↻ manuel

## Spectre FFT (`SpectrePaneau.jsx`)
- Bouton **◈ Spectre** visible en mode live ET phase `resultats`
- Panneau fixe droite : `Math.min(380, 80vw)` — 20% page principale toujours visible
- Canvas **log-scale** 50 Hz→4 kHz (itération par colonne pixel), gradient bleu (faible)→orange (fort)
- Marqueurs harmoniques f1..f10 avec lignes pointillées
- Légende : nom note + octave + Hz + déviation ¢ colorée (vert/orange/rouge)
- **Mode live** : second `AnalyserNode` (fftSize=4096) en parallèle sur même source — `spectreAnalyserRef` — RAF interne indépendant
- **Mode enregistrement** : `computeSpectreParNote(audioBuffer, notes)` → un spectre FFT moyen (8 fenêtres Hann) par segment de note → liste cliquable pour naviguer entre notes

## Réglages
Tous persistés dans `localStorage` (clés `acc_*`) :
- **Accord** (collapsible 🎵) : diapason · transposition C/Bb/Eb/F/A · seuil justesse ¢ — champs numériques inline
- **Segmentation** (collapsible ⚙) : silence ms · saut note ¢ · gate RMS (inline) puis seuil clarté (slider)

## Organisation page
1. Bloc accordeur (toggle Live/Enregistrer + affichage)
2. Bloc résultats (portée ou tableau) — inséré juste après le bloc accordeur
3. Bloc structure de tonique (sélecteur + référentiel Tempéré/Harmonique)
4. Réglages accord
5. Réglages segmentation

## Enharmoniques — règle diatonique
Nommage selon degré diatonique depuis la tonique T (lettre de T, pas classe chromatique) :

| Offset | Degré | Exemple Do | Exemple Ré |
|--------|-------|------------|------------|
| +1 | T+1♭ | Réb | Mib |
| +2 | T+1 | Ré | Mi |
| +3 | T+2♭ | Mib | Fa |
| +6 | T+3# | Fa# | Sol# |
| +8 | T+4# | Sol# | La# |
| +10 | T+6♭ | Sib | Do |

Implémenté dans `buildEnharmonicScale(tonicName)` et `buildEnharmonicVexScale(tonicName)` dans `accordeurUtils.js`.

- Toniques naturelles (Do, Ré, Mi, Fa, Sol, La, Si) → enharmoniques parfaites, jamais de double altération
- Toniques altérées (Do#, Réb, Sol#, etc.) → correctes pour la majorité, fallback `NOTE_NAMES_FR[pc]` pour les rares cas de double altération (ex. Fa## tritonique de Do#)
- `noteNameToPC(name)` — mapping complet (inclut Do#, Solb, Lab, La#, Si#, Fab…) → pitch class 0–11

## DEFAULT_STRUCTURES
17 structures (12 toniques standard + 5 enharmoniques) :
- Standard : Do, Réb, Ré, Mib, Mi, Fa, Fa#, Sol, Sol#, La, Sib, Si
- Enharmoniques : **Do#, Ré#, Solb, Lab, La#**
- IDs stables : `default-0`…`default-11`, `default-enh-1`, `default-enh-3`, `default-enh-6`, `default-enh-8`, `default-enh-10`

## Transposition affichage
Tout l'affichage est transposé selon `transpoKey` (C/Bb/Eb/F/A) :
- Notes jouées → `midiCible + offset` → enharmoniques de la tonique transposée
- Toniques des structures → `transpoNom(nom)` via `noteNameToPC`
- Mode live : note calculée directement transposée dans la RAF loop via `liveParamsRef.transpoOffset`
- `liveParamsRef` contient `transpoOffset` + `enharmonicScale` précalculé, mis à jour quand transpoKey ou structure changent

## AccordeurStaff
- Props : `notes`, `seuil`, `transpoKey`, `tonicName` (tonique affichage transposée), `containerWidth`, `height`, `notePx`
- `buildEnharmonicVexScale(tonicName)` calculé dans le `useEffect` → `midiToVexKey(midi, vexScale)`
- Altérations VexFlow : `#`, `b`, bécarre (`n`) si retour au naturel après altération (via `accTracker`)
- Portée grise `#9ca3af` via SVG post-processing (`querySelectorAll('path')` + `querySelectorAll('text')`)
- Barres σ en SVG natif (rect, opacité 0.45)

## Audio — refs live
| Ref | Contenu |
|-----|---------|
| `liveAnalyserRef` | AnalyserNode fftSize=2048 (pitch detection) |
| `spectreAnalyserRef` | AnalyserNode fftSize=4096 (spectre FFT) |
| `liveHzRef` | Hz courant (marqueurs harmoniques spectre) |
| `liveParamsRef` | `{ diapason, referentiel, clarityThreshold, gateLevel, transpoOffset, enharmonicScale, tonikMidi }` |

## FFT (`accordeurUtils.js`)
- `_spectrumFromSamples(data, fftSize)` — interne : FFT Cooley-Tukey radix-2, N=8 fenêtres Hann moyennées, retourne Float32Array dB
- `computeAverageSpectrum(audioBuffer, fftSize=4096)` — spectre global
- `computeSpectreParNote(audioBuffer, notes, fftSize=4096)` — tableau Float32Array[], un par note (utilise `note.debutMs`/`note.finMs`)

## Données
Structures toniques : localStorage + partage URL `?s=` · Historique sessions
`notes` (depuis `calculerEcarts`) contiennent : `nom`, `octave`, `midiCible`, `muCents`, `sigmaCents`, `debutMs`, `finMs`, `frames[]`
Nommage `nom`/`octave` dans les segments = C-base (depuis `midiToNoteName`) ; l'affichage final utilise `enharmonicScale[pc]` + transposition.
