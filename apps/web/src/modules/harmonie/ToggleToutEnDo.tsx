// ─── « Tout sur do » — le repère fixe ────────────────────────────────────────
//
// Le module transpose chaque item pour empêcher l'appui sur une mémoire de
// hauteurs absolues. Ce toggle fait l'inverse à la demande : tout sonne sur do,
// et l'oreille peut se caler sur un repère fixe le temps d'un apprentissage.
//
// ⚠ IL VIT DANS L'ACTIVITÉ, pas dans l'écran de réglages (décidé avec Matthieu) :
// on doit pouvoir basculer sans quitter l'exercice, en cours d'item.
//
// ⚠ En MINEUR le son et l'écrit divergent volontairement : do mineur à l'oreille,
// LA MINEUR sur la portée. C'est la raison d'être de la vue « En Ut »
// (`notation.ts`) — armure vide, sensible en altération accidentelle — et elle
// est préférée à un do mineur à trois bémols.

const ACCENT = '#c084fc'

export default function ToggleToutEnDo({
  actif,
  onChange,
}: {
  actif: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!actif)}
      aria-pressed={actif}
      title="Tout entendre sur la fondamentale do"
      className={actif ? '' : 'bg-surface-2 text-app border-app'}
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: actif ? ACCENT : 'var(--border-c)',
        borderRadius: 10,
        padding: '8px 14px',
        minHeight: 44,
        fontSize: 13,
        flexShrink: 0,
        ...(actif ? { background: ACCENT, color: '#0d1026', fontWeight: 600 } : {}),
      }}
    >
      Tout en do
    </button>
  )
}
