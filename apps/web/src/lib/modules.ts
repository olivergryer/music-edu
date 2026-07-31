// ─── Registre unique des modules — source de vérité ───────────────────────────
//
// TOUTE la navigation, les couleurs et l'itération per-module dérivent d'ici.
// Ajouter un module = ajouter UNE ligne dans MODULES (label, colorToken, color,
// route). Aucune chaîne 'rythme'/'theorie'/'accordeur'/'notes' ne doit être
// écrite en dur ailleurs pour la nav, les couleurs ou les requêtes.
//
// Convention (spec §8) : l'identifiant du module « lecture de notes » est `notes`,
// mais le mot « notes » est omniprésent dans le domaine métier (tableaux de notes,
// objets VexFlow). Accéder au module TOUJOURS de façon qualifiée : MODULES.notes,
// MODULE_IDS, ModuleId. Ne jamais nommer une variable locale nue `notes`.

export interface ModuleDef {
  /** Libellé affiché. */
  label: string
  /** Token sémantique de couleur (design system). */
  colorToken: string
  /** Couleur hex d'accent du module. */
  color: string
  /** Route de l'app. */
  route: string
  /** Description courte (cartes du Hub). */
  desc: string
  /** Module jouable (false = « Bientôt »). */
  active: boolean
  /**
   * Module en cours de développement : carte cliquable en local et sur la preview
   * Vercel (`IS_DEV`), « Bientôt » en production. Permet de tester depuis le Hub
   * sans ouvrir le module aux élèves. Sans effet si `active` vaut déjà true.
   */
  devOnly?: boolean
}

export const MODULES = {
  rythme: {
    label: 'Rythme', colorToken: 'rhythm', color: '#4A6CF7', route: '/rythme',
    desc: 'Lecture et reproduction rythmique', active: true,
  },
  theorie: {
    label: 'Théorie', colorToken: 'theory', color: '#8B5CF6', route: '/theorie',
    desc: 'Intervalles, accords, armures', active: true,
  },
  accordeur: {
    label: 'Accordeur', colorToken: 'pitch', color: '#FF8B3D', route: '/accordeur',
    desc: "Accordeur par phrase et générateur d'accords", active: true,
  },
  notes: {
    label: 'Notes', colorToken: 'notes', color: '#34d399', route: '/notes',
    desc: 'Lecture de notes sur la portée', active: true,
  },
  // `active: false` volontaire : les poids des matrices de transition ne sont pas
  // encore validés, le module n'est donc pas ouvert aux élèves en production.
  // `devOnly` le rend cliquable en local et sur la preview Vercel pour le tester.
  // Passer `active: true` (et retirer `devOnly`) quand il est prêt.
  harmonie: {
    label: 'Harmonie', colorToken: 'harmony', color: '#c084fc', route: '/harmonie',
    desc: "Chiffrage et détection d'erreur à l'oreille", active: false, devOnly: true,
  },
} as const satisfies Record<string, ModuleDef>

export type ModuleId = keyof typeof MODULES
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[]

/** Vrai si `id` est un identifiant de module connu (garde de type pour lectures Firestore). */
export function isModuleId(id: string): id is ModuleId {
  return id in MODULES
}

/** Libellé d'un module ; renvoie l'id brut si inconnu (données legacy). */
export function moduleLabel(id: string): string {
  return isModuleId(id) ? MODULES[id].label : id
}

/** Couleur d'accent d'un module ; couleur par défaut si inconnu. */
export function moduleColor(id: string): string {
  return isModuleId(id) ? MODULES[id].color : '#4A6CF7'
}
