// ─── « Tout en Ut » — le repère fixe ─────────────────────────────────────────
//
// Le module transpose chaque item pour empêcher l'appui sur une mémoire de
// hauteurs absolues. Ce toggle fait l'inverse à la demande : tout sonne sur la
// même tonique, et l'oreille se cale sur un repère fixe le temps d'un
// apprentissage.
//
// ⚠ IL VIT DANS L'ACTIVITÉ, pas dans l'écran de réglages (décidé avec Matthieu) :
// on doit pouvoir basculer sans quitter l'exercice, en cours d'item.
//
// ⚠ « EN UT » N'EST PAS « SUR DO » : c'est **Do majeur ou LA MINEUR**, soit
// `TONIQUE_UT` (`notation.ts`), les deux tonalités à armure vide. Décidé avec
// Matthieu (2026-08-19) : tout doit coïncider — ce qui sonne, la tonalité écrite,
// les réponses attendues et la portée. Un son en do mineur face à une portée en la
// mineur ferait écrire « sol » sur un mi♭ juste.

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
      title="Tout entendre en Do majeur / la mineur"
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
      Tout en Ut
    </button>
  )
}
