# Module Accordeur — référence technique

## Fichiers
- `AccordeurPage.jsx` (~1800 lignes) — accordeur chromatique
- `AccordeurStaff.jsx` — portée VexFlow
- `accordeurUtils.js` — pitch, cents, FFT, structures toniques
- `SpectrePaneau.jsx` — panneau spectre FFT coulissant
- `GenerateurAccordPage.jsx` — route `/accordeur/generateur`
- `GenerateurAccord.jsx` — ancien composant embarqué (non utilisé, conservé)
- `JeuGamme.jsx` — jeu gamme (importé mais commenté dans AccordeurPage)
- `TourGuide.jsx` — composant partagé tour guidé (utilisé aussi par Rythme et Théorie)
- Dépendance : `pitchy` (McLeod pitch detection)

## Pipeline détection
`PitchDetector.forFloat32Array(2048)` → gate RMS (seuil 0.015) → clarté (0.80 live générateur / 0.82 accordeur) → pré-accentuation `y[n]=x[n]−0.97x[n−1]` → filtre isolation frames → filtre notes < 100 ms

**getUserMedia** — toujours avec `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }` (sinon AGC module le volume de lecture).

## Modes AccordeurPage
- **Live** : RAF 100 ms · note + octave + cents + VuMètre arc SVG ±50¢ · `liveParamsRef` pour réactivité sans redémarrer mic · autostart au montage · libère le micro au démontage
- **Enregistrement** : post-recording → segmentation → µ/σ cents · portée VexFlow (notePx=52 desktop / 26 mobile) · toggle portée/tableau · graphes canvas · scores X/N + qualité %

## Tutorial & aide (`AccordeurPage`)

### Tutorial carousel (`AccordeurTutorial`)
- 5 slides, affiché une seule fois — persisté `acc_tuto_v1` (localStorage)
- Slide 2 interactif : sélection **Live / Enregistrement** → appliqué via `basculerMode()`
- `onDone({ modeLive })` → force `instrument = 'oscillator'` + `accordeur_instrument_preference`
- Bouton "Ignorer" disponible sur chaque slide

### Bouton ? (header)
- Ouvre `HelpModal` (inline dans `AccordeurPage`) : 2 boutons
  - **Relancer le tutoriel** → `setShowTutorial(true)`
  - **Bulles explicatives** → `setShowTour(true)` → lance `TourGuide`
- States : `showTutorial`, `showHelp`, `showTour`

### TourGuide steps (AccordeurPage)
`data-tour` sur : `toggle-mode` · `struct-ref` · `lien-generateur` · `btn-reglages`

### `TourGuide.jsx` (composant partagé `src/`)
- Props : `steps [{tourId, title, desc}]`, `onDone`
- Overlay 4-rects sombres + highlight ring violet autour de `[data-tour="id"]`
- Tooltip positionné auto (au-dessus ou en-dessous), dots de progression, prev/next

## Interface AccordeurPage

### Header
- Gauche : ← Tessitura
- Centre : "Accordeur" + lien vers `/accordeur/generateur` (icône tablature)
- Droite : bouton **?** (aide) + bouton **⚙** → ouvre le **Drawer Réglages**

### Drawer Réglages (overlay slide-in droite, `width: min(420px, 94vw)`, `zIndex: 50`)
Contient 4 sections :
1. **Suivi des sessions** (collapsible `<details open>`) — tableau sessions + suppression
2. **Réglages accord** (collapsible) — diapason, transposition, seuil ¢
3. **Réglages segmentation** (collapsible) — silence ms, saut note ¢, gate RMS, seuil clarté slider
4. **Tempérament** — voir section dédiée ci-dessous

Les anciens `<details>` Réglages accord/segmentation en bas de page ont été supprimés — tout est dans le drawer.

## Référentiels de justesse
Trois modes, sélecteur dans la section "Structures de toniques" de la page principale :
- **Tempéré** (`'tempere'`) — `centsTempere(hz, diapason)`
- **Harmonique** (`'5-limite'`) — `centsCinqLimite(hz, tonikMidi, diapason)`
- **Utilisateur** (`'utilisateur'`) — `centsUtilisateur(hz, tonikMidi, diapason, userTemperament)`

`liveParamsRef` contient `{ diapason, referentiel, clarityThreshold, gateLevel, transpoOffset, enharmonicScale, tonikMidi, userTemperament }`.

Fonctions `calculerEcarts` et `courbebrute` acceptent un 5e paramètre `userOffsets = null`.

## Tempérament utilisateur

### State AccordeurPage
- `userTemperament` : Float[12], offsets ¢ pour demi-tons 1-12 (index 0 = m2, index 11 = octave). Persisté `acc_temperament_user`.
- `userPresets` : `[{id, nom, offsets}]`. Persisté `acc_temperament_presets`.

### Préréglages built-in (accordeurUtils)
- `TEMPERAMENT_TEMPERE` (AccordeurPage const) : `Array(12).fill(0)`
- `HARMONIQUE_OFFSETS` (accordeurUtils export) : 12 valeurs JI 5-limite, même logique que `centsCinqLimite` (min7=−31.175¢, triton=−31.175¢, octave=0)

### Partage URL
Export : `btoa(JSON.stringify(userTemperament))` → `?t=<base64>` dans URL.
Import : `searchParams.get('t')` au montage → `JSON.parse(atob(t))`.
Le champ "Coller un lien ou code base64" gère aussi les URL complètes (split sur `?t=`).

### Calcul `centsUtilisateur` (accordeurUtils)
```js
const semitoneFromC = ((midiRounded - tonikMidi) % 12 + 12) % 12
if (semitoneFromC === 0) return centsTempere(hz, diapason)  // unisson
const correction = userOffsets[semitoneFromC - 1] ?? 0
return centsTempere(hz, diapason) - correction
```
L'octave (index 11, semitone 12 % 12 = 0) est traité comme unisson en mesure.

## Générateur d'accord (`GenerateurAccordPage.jsx`)
Route `/accordeur/generateur`, accessible via bouton header AccordeurPage.

### Trois mémoires de tempérament indépendantes
- `tempereOffsets` : décalages ET (défaut 0)
- `harmoniqueOffsets` : décalages JI 5-limite
- `utilisateurOffsets` : calculés depuis `globalUserTemperament` (lu en localStorage `acc_temperament_user`)
- Toggle Tempéré/Harmonique/Utilisateur → switch entre les trois mémoires sans écraser les réglages manuels
- Cliquer "Utilisateur" → recompute `utilisateurOffsets` depuis `globalUserTemperament` au moment du switch
- Changement d'accord → recompute les TROIS mémoires
- Réinitialiser → remet la mémoire courante à sa valeur par défaut

### `computeUserOffsets(chordMidis, rootName, userTemperament)`
```js
return chordMidis.map(midi => {
  const interval = ((midi - rootPC) % 12 + 12) % 12
  if (interval === 0) return 0
  return parseFloat((userTemperament[interval - 1] ?? 0).toFixed(2))
})
```

### Knobs
- SVG arc 270°, drag vertical : `setPointerCapture` + `dragValue` ref (évite stale closure)
- `onClick` stop propagation → le bloc extérieur reste cliquable pour activer/désactiver la note
- Smooth update pendant lecture : `osc.frequency.setTargetAtTime` (oscillateur) ou `src.playbackRate.setTargetAtTime` (sample)

### Détection live (note désactivée)
- Match MIDI par modulo 12 · déviation = `centsTempere(hz, diapason) − offsetCourant`
- Volume accord stable, non couplé au micro (getUserMedia avec AGC désactivé)
- Hint après 30 frames (~3s) sans signal : "Plus fort / ou plus près" (`noDetectCountRef`)

## Moteur audio (`windEngine.js`)

Remplace `sampleEngine.js` (supprimé). Dépendance : **Tone.js** (`npm install tone`).

### Instruments
| Clé | Label | Tessiture MIDI | État |
|-----|-------|----------------|------|
| `oscillator` | Sinusoïde | 0–127 (virtuel) | actif |
| `flute` | Flûte | 59–97 | désactivé (bientôt) |
| `oboe` | Hautbois | 58–92 | désactivé (bientôt) |
| `clarinet` | Clarinette | 50–95 | désactivé (bientôt) |
| `saxophone` | Saxophone alto | 49–80 | désactivé (bientôt) |
| `bassoon` | Basson | 34–74 | désactivé (bientôt) |

Sons bois grisés dans le `<select>` via `disabled` + label "(bientôt)" — AccordeurPage ET GenerateurAccordPage.
Clé localStorage préférence : `accordeur_instrument_preference` (partagée AccordeurPage ↔ GenerateurAccordPage, défaut `'oscillator'`).

### Chargement — `Tone.ToneAudioBuffers`
Source : CDN MusyngKite (`gleitz.github.io/midi-js-soundfonts/MusyngKite/<instrument>-mp3/`).
~10–14 samples clés par instrument (tous les 3–4 demi-tons). Pitch-shift vers toute note via `playbackRate`.
Cache session : `_bufferCache` (Map instrument → Map `__tone__`) + `_inFlight` (évite double-chargement).

### Lecture sustain infini — `Tone.Player`
`_playToneNote` crée un `Tone.Player` avec `loop: true`, `loopStart: 300ms`, `loopEnd: 80 % durée buffer`.
`playbackRate = semitonesRate × callerRate` où `semitonesRate = 2^(Δsemitones/12)` (shift depuis sample le plus proche).
Interface retournée : `{ src: { stop(), playbackRate: { setTargetAtTime(rate) } }, midi, pitchCorrCents: 0 }`.

`playChord` ignore le paramètre `ctx` pour les instruments Tone.js (Tone gère son propre AudioContext).

### Fonctions exportées
| Fonction | Usage |
|----------|-------|
| `loadInstrumentSamples(instrument, onProgress)` | charge et cache |
| `playChord(ctx, midis, offsets, sampleMap, diapason)` | accord sustain infini |
| `playChordOscillator(ctx, midis, offsets, diapason)` | idem oscillateurs Web Audio |
| `playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason)` | phrase legato |
| `playPhraseOscillator(...)` | idem oscillateurs |

## Correction 5-limite
`centsCinqLimite` (accordeurUtils) et `_correctionCinqLimite` (sampleEngine) — même logique :
- min7 (semitone 10) : ratio 7:4 → 968.825¢
- triton (semitone 6) : 7:4 depuis dominante → 568.825¢
- Autres : `JUST_RATIOS_CENTS[semitone]` (tableau 12 entrées 5-limite dans accordeurUtils)

`midiToHzReferentiel` accepte `userOffsets = null` en 5e param pour le référentiel utilisateur.

## Référentiel sans structure (AccordeurPage)
Boutons Harmonique et Utilisateur grisés (`opacity: 0.4`, `cursor: not-allowed`) si `structureId === null`.
Clic sur bouton désactivé → message warning jaune 3 s (`warnRef` state + `warnRefTimer` ref + `setTimeout 3000`).
Message permanent si `structureId === null && referentiel !== 'tempere'` (cas localStorage chargé sans structure).

## Lien Générateur d'accords (AccordeurPage)
Lien avec icône tablature SVG en bas à gauche du bloc "Zone enregistrement / Live" (`bg-surface border rounded-2xl`).
Toujours visible (hors conditionnels live/rec).

## Boutons lecture (mode enregistrement)
| Bouton | Actif si | Action |
|--------|----------|--------|
| ▶ Réécouter | `hasRecordingBlob === true` | rejoue Blob via `new Audio(createObjectURL(...))` |
| ♩ Version juste | `notes.length > 0 && !sampleLoading` | phrase corrigée via samples ou oscillateur |

Blob MIME : `recorder.mimeType` (pas hardcodé `audio/webm` — Safari enregistre en `audio/mp4`).

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

### Dimensionnement portée
```js
const PX_PER_NOTE       = 28   // espacement minimum par note
const MAX_NOTES_DISPLAY = 30   // troncature si phrase trop longue

const displayedNotes = notes.slice(0, MAX_NOTES_DISPLAY)
const staveWidth = Math.max(containerWidth - 4, displayedNotes.length * PX_PER_NOTE + STAVE_MARGIN)
```
- Largeur relative au nombre de notes (pas aux beats absolus) — évite scroll excessif sur longues phrases
- `Formatter.format([voice], noteWidth)` distribue proportionnellement selon les valeurs rythmiques VexFlow dans l'espace alloué
- Notes > 30 tronquées silencieusement

## Spectre FFT (`SpectrePaneau.jsx`)
Canvas log-scale 50 Hz→4 kHz, marqueurs harmoniques f1..f10.
Mode live : second `AnalyserNode` (fftSize=4096) — `spectreAnalyserRef` — RAF indépendant.
Mode enregistrement : `computeSpectreParNote(audioBuffer, notes)` → un spectre par note (8 fenêtres Hann).

## Réglages (localStorage `acc_*`)
`acc_diapason` · `acc_transpo` · `acc_ref` · `acc_seuil` · `acc_silence` · `acc_noteJump` · `acc_clarity` · `acc_gate` · `acc_temperament_user` · `acc_temperament_presets`
`accordeur_instrument_preference` (hors préfixe `acc_`, partagée avec Générateur)
