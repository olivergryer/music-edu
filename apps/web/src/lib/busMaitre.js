// ─── Bus maître : gain de compensation + limiteur ────────────────────────────
//
// Les sons de synthèse sortaient à des crêtes de 0,20 à 0,30 alors que l'échelle
// va jusqu'à 1 : environ 10 dB de marge inutilisés, très audibles sur un petit
// haut-parleur de téléphone. Ce bus récupère cette marge.
//
// Chaîne : sources → GAIN → LIMITEUR → destination.
// Le gain vient AVANT le limiteur (sinon il ferait ressortir ce que le limiteur
// vient de contenir, et le plafond ne tiendrait plus).
//
// ─── Transparence ────────────────────────────────────────────────────────────
//
// Rien ne change pour l'utilisateur : pas de réglage, pas d'écran, pas un timbre
// touché. Les valeurs sont posées pour que le limiteur reste AU REPOS en jeu
// normal — une crête de 0,30 × 2,4 = 0,72, sous le seuil de 0,79. Il n'agit que
// lorsque plusieurs sons tombent ensemble (frappe sur un temps : tap + métronome
// + note), là où la somme dépasserait 1 et saturerait franchement. Autrement dit
// il ne se manifeste que dans les cas qui, aujourd'hui, craquent déjà.
//
// Ne PAS appliquer aux sources déjà chaudes : Harmonie joue ses accords à 0,8 par
// note, soit 3,2 pour un accord de quatre sons — les amplifier n'aurait aucun
// sens. Ce bus est fait pour les oscillateurs de Rythme et de Notes.

// +7,6 dB. Plafonné par la crête la plus forte du module (0,30) : au-delà, le
// limiteur travaillerait sur chaque note isolée et se mettrait à s'entendre.
const GAIN_MAITRE = 2.4

// Réglages de LIMITEUR, pas de compresseur musical : coude nul et rapport élevé
// pour tenir un plafond net, sans la couleur d'une compression progressive.
const SEUIL_DB = -2      // 0,79 linéaire — juste au-dessus de la crête d'un son seul
const RAPPORT = 20
const ATTAQUE_S = 0.001  // assez rapide pour des clics de 40 ms
const RELACHE_S = 0.06

// WeakMap : l'entrée disparaît avec le contexte, aucune libération à gérer.
// (RythmApp remet sa ref à null quand le contexte est fermé → nouveau contexte,
// nouveau bus, automatiquement.)
const _bus = new WeakMap()

/**
 * Nœud d'entrée du bus maître de `ctx`, créé au premier appel puis réutilisé.
 * Y brancher les sources à la place de `ctx.destination`.
 */
export function busMaitre(ctx) {
  const existant = _bus.get(ctx)
  if (existant) return existant

  const gain = ctx.createGain()
  gain.gain.value = GAIN_MAITRE

  const limiteur = ctx.createDynamicsCompressor()
  limiteur.threshold.value = SEUIL_DB
  limiteur.knee.value = 0
  limiteur.ratio.value = RAPPORT
  limiteur.attack.value = ATTAQUE_S
  limiteur.release.value = RELACHE_S

  gain.connect(limiteur)
  limiteur.connect(ctx.destination)

  _bus.set(ctx, gain)
  return gain
}
