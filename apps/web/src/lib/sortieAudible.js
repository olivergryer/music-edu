// ─── Sortie audible partagée ──────────────────────────────────────────────────
//
// `AudioContext.destination` est coupé par le switch silence d'iOS. Router le son
// via `MediaStreamDestination` → `HTMLAudioElement` le fait passer pour de la
// lecture média ordinaire : audible même en silencieux, comme une balise <audio>.
//
// Ce code vivait dans `windEngine.js` ; extrait ici, `windEngine` le réexporte.
// SEUL l'Accordeur l'utilise — et c'est délibéré, voir ci-dessous.
//
// ─── NE PAS RÉUTILISER POUR LES SONS COURTS ──────────────────────────────────
//
// Essayé le 2026-08-18 sur Rythme, Notes et Harmonie pour gagner du volume :
// ÉCHEC NET, rollback immédiat. Sons répétés, hachés, désynchronisés. Le chemin
// MediaStream → HTMLAudioElement impose son propre tampon de sortie : il convient
// à un son tenu qu'on déclenche une fois (accordeur, générateur d'accords), pas à
// une rafale de clics de 40 à 150 ms rejoués au tempo.
//
// Et ça ne réglait de toute façon pas le problème visé : sur Android, Web Audio
// sort DÉJÀ sur le flux média, le volume maximal est le même par les deux chemins.
// Ce routage corrige le switch silence d'iOS, rien d'autre. Contre un
// haut-parleur faible, les vrais leviers sont l'amplitude (crêtes à 0,25–0,30
// aujourd'hui) et le timbre (un triangle à 330 Hz est hors de portée d'un petit
// transducteur, qui ne donne vraiment que vers 1 kHz).
//
// Map (pas WeakMap) pour pouvoir disposer explicitement : sinon l'HTMLAudioElement
// reste vivant et continue de diffuser le buffer décodé après la fermeture du
// contexte.

// Interrupteur de secours : `false` rebranche l'Accordeur en direct sur
// `ctx.destination` — au prix du silencieux iOS.
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
