# Module Accordeur — référence technique

## Fichiers
- `AccordeurPage.jsx` — accordeur chromatique V2 (~1230 lignes)
- `AccordeurStaff.jsx` — portée VexFlow
- `accordeurUtils.js` — utilitaires pitch, cents, structures toniques, FFT
- `SpectrePaneau.jsx` — panneau latéral spectre FFT coulissant
- `sampleEngine.js` — moteur de samples R2 (chargement, onset, loop, playback accord/phrase)
- `GenerateurAccordPage.jsx` — page dédiée `/accordeur/generateur`, knobs par note, deux mémoires tempérament
- `GenerateurAccord.jsx` — ancien composant embarqué (non utilisé en production, conservé)
- `JeuGamme.jsx` — jeu de gamme (masqué, commenté dans AccordeurPage)
- Dépendance : `pitchy` (McLeod — remplace pitchfinder/YIN)

## Pipeline détection
`PitchDetector.forFloat32Array(2048)` → gate RMS (seuil 0.015) → seuil clarté (0.80 live generateur / 0.82 accordeur) → pré-accentuation `y[n]=x[n]−0.97x[n−1]` → filtre isolation frames → filtre notes < 100 ms

## Modes AccordeurPage
- **Live** (défaut) : RAF **100 ms** · note + octave + cents + VuMètre arc SVG ±50¢ · `liveParamsRef` pour réactivité sans redémarrer mic · autostart au montage · **libère le micro au démontage** (cleanup `arreterLive` dans le useEffect)
- **Enregistrement** : post-recording → segmentation → μ/σ cents · portée VexFlow (notePx=52 desktop / 26 mobile) · toggle portée/tableau · graphes canvas · scores X/N + qualité % · recalcul ↻ manuel

## VuMètre arc SVG (AccordeurPage)
Composant `VuMetre({ cents, seuil })` — arc ∩ SVG :
- Arc track : `M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}` (180°→0° clockwise = ∩)
- Aiguille : ligne verticale pivotée via `transform="rotate(cents/50*90, CX, CY)"` ±90°
- Ticks : SVG 270° = 0¢ (top), SVG 180° = −50¢, SVG 0° = +50¢
- Couleur : `couleurJustesse(cents, seuil)` de accordeurUtils (vert/orange/rouge)
- Transition CSS `0.08s ease-out` sur `<g transform>`

## Générateur d'accord (`GenerateurAccordPage.jsx`)
Route `/accordeur/generateur`, accessible via bouton "doigtés guitare" dans le header AccordeurPage.

### Deux mémoires de tempérament indépendantes
- `tempereOffsets` : décalages pour mode tempéré (initialisé à 0,0,0)
- `harmoniqueOffsets` : décalages pour mode harmonique (initialisé aux ratios JI 5-limite)
- **Toggle Tempéré/Harmonique** : switch entre les deux mémoires — affichage ET audio instantanés, sans écraser les réglages manuels
- **Réinitialiser** : remet uniquement la mémoire courante à sa valeur par défaut (0 si tempéré, JI si harmonique)
- Changement d'accord (root/chordType/inversion/octave) → recompute les DEUX mémoires

### Calcul des offsets harmoniques
```js
function computeHarmonicOffsets(chordType, chordMidis, rootName) {
  const rootPC = noteNameToPC(rootName)
  return chordMidis.map(midi => {
    const interval = ((midi - rootPC) % 12 + 12) % 12
    // Dom7 : septième 7:4 (968.825¢) plutôt que 16:9 (996.1¢)
    const justCents = (chordType === 'dom7' && interval === 10) ? 968.825 : JUST_RATIOS_CENTS[interval]
    return parseFloat((justCents - interval * 100).toFixed(2))
  })
}
```
`JUST_RATIOS_CENTS` : tableau 12 entrées dans `accordeurUtils.js` (5-limite, cents depuis tonique)

### Knobs
- SVG arc 270° (SVG 135°→45° clockwise, large-arc=1)
- Drag vertical : `setPointerCapture` + `dragValue` ref (évite stale closure)
- `onClick` sur SVG stop propagation → le bloc extérieur reste cliquable pour activer/désactiver la note
- Playback : `playChord` / `playChordOscillator` depuis `sampleEngine.js`
- Smooth update pitch/rate : knob drag pendant lecture → `osc.frequency.setTargetAtTime` (oscillateur) ou `src.playbackRate.setTargetAtTime` (sample), selon instrument actif

### Détection live (note désactivée)
Cliquer un bloc knob → retire la note de l'accord + ouvre micro pour mesurer l'intonation de l'utilisateur.
- Match MIDI par **modulo 12** → accepte n'importe quel octave
- Déviation = `centsTempere(hz, diapason) − offsetCourant` → relatif à la cible (ET ou JI selon knob)
- Code couleur fond du bloc : vert ≤±3¢ / orange ≤±10¢ / rouge sinon
- Volume de l'accord : **stable, non couplé au micro** — détection pitch seulement
- RAF 100 ms, gate RMS 0.015, clarté 0.80
- Affiche "micro ?" si `getUserMedia` échoue
- **Hint détection** : après 30 frames (~3s) sans signal valide → "Plus fort / ou plus près" (amber). `noDetectCountRef` incrémenté à chaque frame infructueuse, reset à la première détection réussie.

## Moteur de samples (`sampleEngine.js`)

### Instruments
| Clé | Label | Tessiture MIDI | Source R2 |
|-----|-------|----------------|-----------|
| `oscillator` | Sinusoïde | 0–127 (virtuel) | — |
| `flute` | Flûte | 59–97 (B3–Db7) | `flute/Flute.nonvib.ff.[N][O].stereo.aif` |
| `oboe` | Hautbois | 58–92 (Bb3–Ab6) | `oboe/Oboe.ff.[N][O].stereo.aif` |
| `clarinet` | Clarinette | 50–95 (D3–B6) | `clarinet/BbClarinet.ff.[N][O].stereo.aif` |
| `saxophone` | Saxophone alto | 49–80 (Db3–Ab5) | `saxophone/AltoSax.NoVib.ff.[N][O].stereo.aif` |
| `bassoon` | Basson | 34–74 (Bb1–D5) | `bassoon/Bassoon.ff.[N][O].stereo.aif` |

Noms R2 : bémols uniquement (`Db`, `Eb`, `Gb`, `Ab`, `Bb`). Mapping PC → `R2_PC = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']`.

### Préférence instrument
Clé localStorage : `accordeur_instrument_preference`. Partagée entre AccordeurPage et GenerateurAccordPage. Défaut : `'flute'`.

### Chargement (`loadInstrumentSamples`)
- Oscillateur → retourne `new Map()` immédiatement (toujours prêt)
- Samples → `Promise.all` sur toutes les notes de la tessiture
- Cache mémoire session : `_memCache` + `_inFlight` (évite double-fetch en StrictMode)
- SW intercept toutes les URL `r2.dev/samples/` → cache `audio-samples-v1` (offline après 1er chargement)
- Progression : `onProgress(ratio 0-1)` → barre orange dans l'UI

### Onset et loop
- Onset : premier frame `|amplitude| > 0.01` (−40 dB)
- Loop points : passage par zéro positif ~200ms dans le sustain, boucle 400ms
  - `findPosiZeroCross(data, target, range)` cherche montée 0 dans les 2000 frames suivantes
  - Stocké dans cache : `{ buffer, onsetMs, loopStart, loopEnd }`

### Fonctions exportées
| Fonction | Usage |
|----------|-------|
| `isOscillatorInstrument(k)` | true si instrument virtuel |
| `loadInstrumentSamples(instrument, onProgress)` | charge et cache |
| `playChord(ctx, midis, offsets, sampleMap, diapason)` | accord en boucle infinie, retourne `[{src, midi}]` |
| `playChordOscillator(ctx, midis, offsets, diapason)` | accord oscillateurs, retourne `[{osc, gain, midi}]` |
| `playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason)` | phrase legato, durée mini 200ms |
| `playPhraseOscillator(ctx, notes, referentiel, tonikMidi, diapason)` | idem via oscillateurs |
| `phraseDurationMs(notes)` | durée totale phrase (min 200ms/note, max 2000ms/note) |

### playbackRate et diapason
Samples enregistrés à A4=440 Hz. Correction appliquée via playbackRate :
- `diapasonCents = 1200 * log2(diapason / 440)`
- Pour accord : `centsOffset = diapasonCents + knobOffset`
- Pour phrase tempérée : `centsOffset = diapasonCents`
- Pour phrase 5-limite : `centsOffset = diapasonCents + correctionCinqLimite(interval)`

## Boutons lecture (AccordeurPage, mode enregistrement)
Bloc visible en mode enregistrement (phase pret/enregistrement/analyse/resultats) :

| Bouton | Actif si | Action |
|--------|----------|--------|
| ▶ Réécouter | `hasRecordingBlob === true` | rejoue le Blob WebM brut via `new Audio(URL.createObjectURL(...))` |
| ♩ Version juste | `notes.length > 0 && !sampleLoading` | joue la phrase corrigée via samples ou oscillateur |

- `recordingBlobRef` stocke le Blob, `hasRecordingBlob` (state) pilote le disabled (ref seul ne déclenche pas re-render)
- Blob éphémère : nul si session rouverte depuis tableau suivi
- Changement de référentiel → `stopVersionJusteRef.current?.()` arrête la lecture en cours
- Cleanup au démontage : `useEffect(() => () => stopVersionJusteRef.current?.(), [])`

## Correction 5-limite dans accordeurUtils + sampleEngine

### `centsCinqLimite(hz, tonikMidi, diapason)` (accordeurUtils)
Utilisée pour la mesure (live et enregistrement) :
```js
const justCents =
  semitoneFromC === 10 ? 968.825 :   // min7 : 7:4 direct depuis tonique
  semitoneFromC === 6  ? 568.825 :   // triton : 7:4 depuis dominante (−31.175¢)
  JUST_RATIOS_CENTS[semitoneFromC]
const correction = justCents - temperedCents
return centsTempere(hz, diapason) - correction
```

### `_correctionCinqLimite(semitoneFromTonic)` (sampleEngine, interne)
Miroir exact pour le playback version juste — même logique triton/min7.

### Panneau info 5-limite (AccordeurPage, résultats)
Bloc bleu visible quand `referentiel === '5-limite'` + résultats : explique limitation modèle fixe (La/Ré, comma syntonique 81:80, 21.5¢).

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
- **Accord** (collapsible) : diapason · transposition C/Bb/Eb/F/A · seuil justesse ¢
- **Segmentation** (collapsible) : silence ms · saut note ¢ · gate RMS · seuil clarté (slider)
- `GenerateurAccordPage` lit `acc_diapason` en lecture seule (pas de réglages propres)
- `accordeur_instrument_preference` : préférence instrument partagée (hors préfixe `acc_`)

## Organisation page AccordeurPage
1. Header : "← Tessitura" | "Accordeur" + bouton doigtés guitare (→ /accordeur/generateur) | "Suivi ▾"
2. Tableau sessions (collapsible)
3. Bloc accordeur (toggle Live/Enregistrer + affichage live/enregistrement)
4. **Bloc playback** (mode enregistrement) : sélecteur instrument + barre chargement + boutons Réécouter / Version juste
5. Résultats (portée ou tableau + graphes) — inséré après bloc accordeur
6. Bloc structure de tonique + référentiel Tempéré/Harmonique
7. Réglages accord (collapsible `<details>`)
8. Réglages segmentation (collapsible `<details>`)
9. ~~Outils pédagogiques~~ — Générateur d'accord déplacé en page dédiée, Jeu de gamme commenté

## Service Worker (`public/sw.js`)
- Cache `audio-samples-v1` : intercept `r2.dev/samples/` → cache-first
- Ajouté à la liste d'exclusion du nettoyage des vieux caches (activate handler)
- Enregistrement dans `main.jsx` : `navigator.serviceWorker.register('/sw.js')`

## Enharmoniques — règle diatonique
Nommage selon degré diatonique depuis la tonique T :

| Offset | Degré | Exemple Do | Exemple Ré |
|--------|-------|------------|------------|
| +1 | T+1♭ | Réb | Mib |
| +2 | T+1 | Ré | Mi |
| +3 | T+2♭ | Mib | Fa |
| +6 | T+3# | Fa# | Sol# |
| +8 | T+4# | Sol# | La# |
| +10 | T+6♭ | Sib | Do |

Implémenté dans `buildEnharmonicScale(tonicName)` et `buildEnharmonicVexScale(tonicName)`.

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
- Props : `notes`, `seuil`, `transpoKey`, `tonicName`, `containerWidth`, `height`, `notePx`
- `buildEnharmonicVexScale(tonicName)` → `midiToVexKey(midi, vexScale)`
- Altérations VexFlow : `#`, `b`, bécarre (`n`) si retour au naturel (via `accTracker`)
- Portée grise via SVG post-processing (`querySelectorAll('path')` + `querySelectorAll('text')`)
- Barres σ en SVG natif (rect, opacité 0.45)

## Audio — refs live
| Ref | Contenu |
|-----|---------|
| `liveAnalyserRef` | AnalyserNode fftSize=2048 (pitch detection) |
| `spectreAnalyserRef` | AnalyserNode fftSize=4096 (spectre FFT) |
| `liveHzRef` | Hz courant (marqueurs harmoniques spectre) |
| `liveParamsRef` | `{ diapason, referentiel, clarityThreshold, gateLevel, transpoOffset, enharmonicScale, tonikMidi }` |

## FFT (`accordeurUtils.js`)
- `_spectrumFromSamples(data, fftSize)` — FFT Cooley-Tukey radix-2, N=8 fenêtres Hann moyennées, retourne Float32Array dB
- `computeAverageSpectrum(audioBuffer, fftSize=4096)` — spectre global
- `computeSpectreParNote(audioBuffer, notes, fftSize=4096)` — tableau Float32Array[], un par note

## Données
Structures toniques : localStorage + partage URL `?s=` · Historique sessions
`notes` (depuis `calculerEcarts`) : `nom`, `octave`, `midiCible`, `muCents`, `sigmaCents`, `debutMs`, `finMs`, `frames[]`
