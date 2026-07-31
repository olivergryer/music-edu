// ─── Contraintes dures (spec §3, corrigées par l'annexe §5) ──────────────────
//
// « Appliquées après tirage, indépendamment des poids. » Elles priment donc sur
// la matrice ET sur les gabarits. Partagées par le générateur et le moteur de
// perturbation : une perturbation qui violerait une contrainte serait détectable
// PAR GRAMMAIRE et non par oreille — c'est le piège principal du module (§4).

import { niveauSpec, sixQuatreRestreintAuCadentiel, type NiveauSpec } from './niveaux.ts'
import { estAccordValide, qualite, type Accord, type Mode } from './types.ts'

export type Violation =
  | 'accord_invalide'
  | 'vide'
  | 'vocabulaire'
  | 'debut'
  | 'finale'
  | 'dim_fondamental'
  | 'six_quatre_non_cadentiel'
  | 'repetitions'
  | 'septieme_interdite'

// Contrainte n°1, moitié « début ». L'annexe ne respécifie que la finale ; on
// impose le I initial aux régimes écrits (`gabarit`, `matrice`) et on laisse le
// début libre au régime `atome` — sinon une dictée de basse de longueur 2 au
// niveau 1 serait forcément I–I, c'est-à-dire vide de sens.
export function debutImpose(spec: NiveauSpec): boolean {
  return spec.regime !== 'atome'
}

export function violations(
  accords: readonly Accord[],
  mode: Mode,
  niveau: number,
): Violation[] {
  const spec = niveauSpec(niveau)
  const trouvees: Violation[] = []
  if (accords.length === 0) return ['vide']

  if (accords.some((a) => !estAccordValide(a))) trouvees.push('accord_invalide')
  if (accords.some((a) => !spec.vocabulaire.includes(a.degre))) trouvees.push('vocabulaire')

  // n°1 — début et finale
  if (debutImpose(spec) && accords[0].degre !== 1) trouvees.push('debut')
  const finale = accords[accords.length - 1].degre
  if (spec.finales.length > 0 && !spec.finales.includes(finale)) trouvees.push('finale')

  // n°2 — « VII et II° n'apparaissent jamais à l'état fondamental ». Lire : aucun
  // accord DIMINUÉ à l'état fondamental. En majeur cela ne vise que le VII (le II
  // y est mineur, et le gabarit « I-VI-II-V » du niveau 3 l'emploie au
  // fondamental) ; en mineur cela vise ii° et vii°.
  if (accords.some((a) => a.renversement === 0 && qualite(mode, a.degre) === 'dim')) {
    trouvees.push('dim_fondamental')
  }

  // n°3 — 6/4 cadentiel uniquement (avant V, sur temps fort) jusqu'au niveau 6
  // inclus. Au niveau 7 la restriction saute : cadentiel contre passage EST la
  // discrimination du niveau (annexe §5, correction 3).
  if (sixQuatreRestreintAuCadentiel(niveau)) {
    const nonCadentiel = accords.some(
      (a, i) =>
        a.renversement === 2 &&
        !(a.positionMetrique === 'fort' && accords[i + 1]?.degre === 5),
    )
    if (nonCadentiel) trouvees.push('six_quatre_non_cadentiel')
  }

  // n°4 — pas plus de deux répétitions consécutives du même degré
  for (let i = 2; i < accords.length; i++) {
    if (accords[i].degre === accords[i - 1].degre && accords[i].degre === accords[i - 2].degre) {
      trouvees.push('repetitions')
      break
    }
  }

  // n°5 — la septième n'apparaît qu'à partir du niveau 5, et seulement sur les
  // degrés déclarés (`septiemeSur` est vide en dessous du niveau 5).
  if (accords.some((a) => a.septieme && !spec.septiemeSur.includes(a.degre))) {
    trouvees.push('septieme_interdite')
  }

  return [...new Set(trouvees)]
}

export function respecteContraintes(
  accords: readonly Accord[],
  mode: Mode,
  niveau: number,
): boolean {
  return violations(accords, mode, niveau).length === 0
}

// Vrai si remplacer `accords[index]` par `candidat` laisse la progression valide.
// Le moteur de perturbation s'en sert pour ne proposer que des substituts
// indétectables par la grammaire.
export function substitutionValide(
  accords: readonly Accord[],
  index: number,
  candidat: Accord,
  mode: Mode,
  niveau: number,
): boolean {
  const copie = accords.slice()
  copie[index] = candidat
  return respecteContraintes(copie, mode, niveau)
}
