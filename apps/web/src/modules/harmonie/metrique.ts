// ─── Métrique d'erreur — quatre canaux (spec §5) ─────────────────────────────
//
// Les quatre canaux sont INDÉPENDANTS et correspondent aux quatre canaux visuels
// du glyphe (position angulaire, renflement, hauteur de colonne, teinte).
//
// LE LOG PERSISTE LE `VecteurErreur` COMPLET, pas seulement le `Diagnostic` : la
// classification peut évoluer, les données brutes ne se rejouent pas.
//
// Ne dépend que de la géométrie (§2) — utilisable pour afficher une correction
// sur des progressions écrites à la main, avant même que le générateur existe.

import { distanceAngulaireSignee, estCouture, franchitArc } from './geometrie.ts'
import {
  DEGRES,
  assertAccord,
  type Accord,
  type Diagnostic,
  type ErreurBasse,
  type MatriceTransition,
  type Mode,
  type ReponseBasse,
  type VecteurErreur,
} from './types.ts'
import { normaliserLigne, type Ligne } from './matrice.ts'

// Le vecteur d'erreur décrit un CHIFFRAGE répondu face au chiffrage attendu. Un
// accord porteur de `modeInverse` n'est pas un chiffrage : il n'existe que comme
// substitut du moteur de perturbation, et l'élève ne peut pas en saisir un. On le
// rejette plutôt que de produire un vecteur nul trompeur.
function refuserModeInverse(accord: Accord, mode: Mode, role: string): void {
  assertAccord(accord)
  if (accord.modeInverse) {
    throw new Error(
      `vecteurErreur : accord ${role} à mode inversé (degré ${accord.degre}, ${mode}) — ` +
        `non chiffrable, hors périmètre de la métrique`,
    )
  }
}

export function vecteurErreur(attendu: Accord, repondu: Accord, mode: Mode): VecteurErreur {
  refuserModeInverse(attendu, mode, 'attendu')
  refuserModeInverse(repondu, mode, 'répondu')

  const cardinalite = (repondu.septieme ? 1 : 0) - (attendu.septieme ? 1 : 0)
  return {
    angulaire: distanceAngulaireSignee(attendu.degre, repondu.degre),
    radial: repondu.renversement - attendu.renversement,
    cardinalite: cardinalite as -1 | 0 | 1,
    arcFranchi: franchitArc(attendu.degre, repondu.degre),
  }
}

// Classification diagnostique (§5). Ordre de priorité exhaustif :
//
//   1. tout à zéro                    → 'exact'
//   2. angulaire 0 · radial ≠ 0       → 'basse_non_entendue'
//   3. angulaire 0 · radial 0 · card. → 'cardinalite'
//   4. |angulaire| 3                  → 'erreur_franche'        (toujours arc franchi)
//   5. |angulaire| 1 · arc franchi    → 'couture'               (l'unique paire VII/II)
//   6. |angulaire| 2 · arc franchi    → 'sonorite_sur_fonction'
//   7. |angulaire| ∈ {1,2} · partagé  → 'degre_voisin'
//
// `couture` et `sonorite_sur_fonction` sont les deux catégories à forte valeur :
// l'élève entend la sonorité mais rate la fonction. `degre_voisin` est bénin.
// NE JAMAIS les agréger dans un score unique — les remédiations sont opposées.
export function diagnostiquer(
  v: VecteurErreur,
  attendu: Accord,
  repondu: Accord,
  mode: Mode,
): Diagnostic {
  refuserModeInverse(attendu, mode, 'attendu')
  refuserModeInverse(repondu, mode, 'répondu')

  const ang = Math.abs(v.angulaire)

  if (ang === 0) {
    if (v.radial !== 0) return 'basse_non_entendue'
    if (v.cardinalite !== 0) return 'cardinalite'
    return 'exact'
  }
  if (ang === 3) return 'erreur_franche'
  if (v.arcFranchi) {
    // À distance 1, `arcFranchi` ne peut désigner que VII–II (vérifié par test).
    return ang === 1 && estCouture(attendu.degre, repondu.degre)
      ? 'couture'
      : 'sonorite_sur_fonction'
  }
  return 'degre_voisin'
}

// ─── Indice de déduction (§5) ────────────────────────────────────────────────
//
// Le diagnostic « l'élève déduit par le style sans écouter » ne se lit PAS sur une
// réponse isolée : le quadrant « même fonction, aucune note commune » est vide en
// majeur (cf. `geometrie.ts` — une exception en mineur, III–VII). Il se récupère à
// l'échelle de la session, en comparant les réponses aux prédictions de la matrice
// plutôt qu'à la vérité audio.
//
// TODO Matthieu — formule à valider. Retenu ici : sur les seules réponses FAUSSES
// disposant d'un prédécesseur, la plausibilité syntaxique de la réponse sachant
// l'accord qui a réellement sonné avant, normalisée par la continuation la plus
// probable. 1 = l'élève a systématiquement répondu la suite la plus attendue par
// la grammaire ; 0 = ses fautes ne doivent rien à la syntaxe.
//
// Conditionner sur `attendu[i-1]` (ce qui a sonné) et non sur `repondu[i-1]` :
// le contexte est stable même quand l'élève enchaîne les fautes.
//
// Convention : 0 en l'absence de faute exploitable — aucune preuve de déduction.
export function indiceDeDeduction(
  reponses: { attendu: Accord; repondu: Accord }[],
  matrice: MatriceTransition,
): number {
  const scores: number[] = []

  for (let i = 1; i < reponses.length; i++) {
    const { attendu, repondu } = reponses[i]
    if (repondu.degre === attendu.degre) continue

    const ligne = normaliserLigne(matrice[reponses[i - 1].attendu.degre] as Ligne)
    const maximum = Math.max(...DEGRES.map((d) => ligne[d]))
    if (maximum <= 0) continue
    scores.push(ligne[repondu.degre] / maximum)
  }

  if (scores.length === 0) return 0
  return scores.reduce((s, x) => s + x, 0) / scores.length
}

// ─── Dictée de basse — niveau 1 (annexe §3) ──────────────────────────────────
//
// Type de réponse distinct : l'élève saisit des hauteurs, pas des accords. Le
// `VecteurErreur` à quatre canaux ne s'y applique pas (annexe §5, correction 6).
// Prérequis de tout le module : le chiffrage français chiffre les intervalles
// AU-DESSUS DE LA BASSE — qui n'entend pas la basse ne peut rien chiffrer.
//
// `0` sert de sentinelle « pas de note » (les degrés de gamme vont de 1 à 7) :
// une réponse trop courte produit `repondu: 0`, une réponse trop longue
// `attendu: 0`. `ecart` reste `repondu - attendu` dans les deux cas.
export function evaluerBasse(attendu: readonly number[], repondu: ReponseBasse): ErreurBasse[] {
  const erreurs: ErreurBasse[] = []
  const longueur = Math.max(attendu.length, repondu.hauteurs.length)

  for (let i = 0; i < longueur; i++) {
    const a = attendu[i] ?? 0
    const r = repondu.hauteurs[i] ?? 0
    if (a !== r) erreurs.push({ index: i, attendu: a, repondu: r, ecart: r - a })
  }
  return erreurs
}
