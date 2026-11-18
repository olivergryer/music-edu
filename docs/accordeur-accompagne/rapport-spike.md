# Spike « Accordeur accompagné » — rapport et décision

Version du 2026-11-18. Les enregistrements bruts sont dans `docs/accordeur-accompagne/enregistrements/` (ignorés par git) ; chaque dossier contient son `rapport.md`.

## Décision (§ 9 du brief du spike)

**Simultané possible, sans enceinte externe obligatoire, avec réserves.**

- La mesure de l'intonation d'un élève pendant que l'appareil joue l'accompagnement fonctionne sur MacBook (Chrome) et sur iPhone SE2 (Chrome iOS), élève à ~1 m, haut-parleur intégré, instrument à son entretenu (essai à la clarinette : « reconnaît bien », constat qualitatif de Matthieu).
- Pas de régime « Enceinte requise » : l'écran d'installation recommande l'appareil à ~1 m, un volume moyen et pas de Bluetooth, sans imposer d'enceinte.
- Règle « ≈ juste » conservée (paires de battements non résolues).

## Réglages retenus

| Plateforme | Annulation d'écho | Raison |
|---|---|---|
| iOS (Chrome / Safari) | **activée** | Désactivée, le volume de sortie de l'iPhone est trop faible pour jouer avec. Activée, le playback est supprimé d'environ 40 dB au micro et l'élève, venant d'un autre émetteur, est conservé. |
| Autres | **désactivée** | Chrome desktop en mode `all` supprime aussi l'élève (macbook-2 : rien détecté). |

Le réglage reste modifiable dans ⚙.

## Résultats mesurés

| Prise | Conditions | Identifiées | Fausses notes | Erreur médiane | Remarque |
|---|---|---|---|---|---|
| macbook-1 | AEC off, iPad élève | 100 % | 0 | — | p95 calcul 51 ms |
| macbook-4 | AEC off, iPad élève | 100 % | 2 trames sur 4 | — | p95 calcul 48 ms |
| macbook-3 | AEC off, élève quasi inaudible | 56 % | 0 | — | 11 notes manquées (volume élève trop faible) |
| macbook-2 | AEC `all` | 0 % | — | — | AEC supprime aussi l'élève : à rejeter |
| iphonese2-1 | AEC on | — | — | — | Séquence iPad décalée d'environ un demi-ton, cause non élucidée côté iPad ; hauteurs mesurées cohérentes entre elles |
| iphonese2-2 | AEC on, iPad élève | 80 % | 5 / 104 trames | 0,54 ¢ (p90 3,37 ¢) | multiples exactement justes 5/5, premier affichage 66 ms, ±σ 58 % |

## Limites connues (acceptées pour la v1 derrière `IS_DEV`)

- **Calcul** : p95 de 48 à 74 ms pour une cible de 50 ms.
- **Erreurs de multiple** (octave / douzième) sur quelques notes (4 sur 25 en iphonese2-2).
- **σ** calibré sur une seule prise MacBook ; couverture ±σ de 58 à 81 %.
- **Appareils** : seuils calibrés sur MacBook, validés sur un iPhone SE2 ; iPad et Android à mesurer.
- **Élève réel** : un seul essai à la clarinette, non chiffré.
- **Latence de boucle** : de 91 à 306 ms selon le matériel ; à mesurer au premier ▶ (chirp), l'annulation d'écho iOS efface le chirp de l'appareil, d'où l'usage de la valeur de `meta.json` quand le chirp est absent.

## Outillage

- Analyse hors ligne : `apps/web/scripts/analyse-accompagne.ts` (`--dossier`, `--mode`, `--latence-ms`, `--eleve-s`).
- Page de test (IS_DEV) : `/accordeur/test-accompagne` et `/accordeur/test-accompagne/eleve-synthetique`.
- Piège : les fichiers d'une même prise ont des horodatages d'export différents ; les regrouper à la main.
