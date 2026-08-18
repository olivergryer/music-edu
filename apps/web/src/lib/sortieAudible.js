// ─── Sortie audible partagée ──────────────────────────────────────────────────
//
// `AudioContext.destination` est coupé par le switch silence d'iOS. Router le son
// via `MediaStreamDestination` → `HTMLAudioElement` le fait passer pour de la
// lecture média ordinaire : audible même en silencieux, comme une balise <audio>.
//
// Ce code vivait dans `windEngine.js` (Accordeur). Il est extrait ici pour servir
// à tous les modules — `windEngine` le réexporte pour ne rien casser.
//
// ATTENTION, DEUX LIMITES CONNUES :
//
// 1. LATENCE. Le passage par un MediaStream ajoute un tampon de sortie. C'est sans
//    conséquence pour un accordeur, mais le module Rythme mesure des frappes au
//    millième : si le métronome décroche du flash, c'est ce chemin qu'il faut
//    couper en premier (`SORTIE_AUDIBLE_ACTIVE = false`, un seul point à toucher).
// 2. VOLUME ANDROID. Sur Android, Web Audio sort DÉJÀ sur le flux média : ce
//    routage n'y change pas le volume maximal. Il corrige le silencieux iOS, pas
//    un haut-parleur physiquement faible.
//
// Map (pas WeakMap) pour pouvoir disposer explicitement : sinon l'HTMLAudioElement
// reste vivant et continue de diffuser le buffer décodé après la fermeture du
// contexte.

// Interrupteur unique : repasse à `false` pour rebrancher tout le monde en direct
// sur `ctx.destination`, sans toucher aux appelants.
export const SORTIE_AUDIBLE_ACTIVE = true

const _sinks = new Map()

function sink(rawCtx) {
  let s = _sinks.get(rawCtx)
  if (s) return s
  try {
    const dest = rawCtx.createMediaStreamDestination()
    const audio = new Audio()
    audio.srcObject = dest.stream
    audio.playsInline = true
    audio.muted = false
    audio.play().catch(() => {})
    s = { node: dest, audio }
    _sinks.set(rawCtx, s)
    return s
  } catch {
    return null
  }
}

/**
 * Nœud sur lequel brancher le son. Retombe toujours sur `ctx.destination` si le
 * routage échoue — jamais `null`, pour que `connect()` reste inconditionnel.
 */
export function sortieAudible(ctx) {
  if (!SORTIE_AUDIBLE_ACTIVE) return ctx.destination
  return sink(ctx)?.node ?? ctx.destination
}

/**
 * Tue le sink puis ferme le contexte. À appeler à la place de `ctx.close()`.
 * Sans ça, l'HTMLAudioElement orphelin peut continuer à diffuser des résidus de
 * buffer sur certains navigateurs (Chrome desktop notamment) — d'où des sons qui
 * persistent après stop, changement d'octave ou sortie de page.
 */
export function fermerContexteAudible(ctx) {
  if (!ctx) return
  const s = _sinks.get(ctx)
  if (s) {
    try { s.audio.pause() } catch { /* ignore */ }
    try { s.audio.srcObject = null } catch { /* ignore */ }
    try { s.node.disconnect() } catch { /* ignore */ }
    _sinks.delete(ctx)
  }
  try { ctx.close() } catch { /* ignore */ }
}
