// ─── « ▶ ½ » — la même écoute, au demi-tempo ─────────────────────────────────
//
// Bouton PONCTUEL (décidé avec Matthieu) : il ne bascule aucun réglage, il rejoue
// une fois au demi-tempo, intro tonale comprise.
//
// ⚠ PENDANT L'EXERCICE SEULEMENT. Il n'apparaît pas dans les blocs de correction :
// là, l'écoute sert à comparer deux versions, et un troisième bouton par version
// chargerait la barre sans rien apporter.

const ACCENT = '#c084fc'

/** Facteur appliqué au BPM. Une seule définition pour les cinq activités. */
export const DEMI_VITESSE = 0.5

export default function BoutonDemiVitesse({
  onClick,
  disabled = false,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Réécouter deux fois plus lentement"
      aria-label="Réécouter deux fois plus lentement"
      className="bg-surface-2 text-app border-app"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--border-c)',
        borderRadius: 12,
        padding: '0 16px',
        minHeight: 52,
        minWidth: 64,
        fontSize: 15,
        fontWeight: 600,
        color: ACCENT,
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      ▶ ½
    </button>
  )
}
