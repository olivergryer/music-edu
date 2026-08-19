// ─── Le sélecteur d'intro tonale — deux positions ────────────────────────────
//
// Aucune · Intro. Comme `TogglePortee`, le même contrôle dans toutes les
// activités : poser la tonalité est un geste commun au module.
//
// ⚠ Sa place n'est PAS celle de `TogglePortee`. La portée est un corrigé, elle
// vit dans le bloc de feedback ; l'intro est un réglage d'ÉCOUTE, elle doit être
// posée avant la première lecture — donc dans l'écran de réglages.
//
// La valeur vit dans `payload.introTonale` de la progression Harmonie : elle suit
// l'élève d'une activité à l'autre et d'une session à la suivante.

import { type Intro } from './intro.ts'

const ACCENT = '#c084fc'

const POSITIONS: { valeur: Intro; label: string; aide: string }[] = [
  { valeur: 'aucune', label: 'Aucune', aide: 'La suite démarre directement' },
  { valeur: 'arpegee', label: 'Intro', aide: 'Tonique arpégée puis plaquée, un temps de silence' },
]

export default function ToggleIntro({
  intro,
  onChange,
  actif = true,
}: {
  intro: Intro
  onChange: (v: Intro) => void
  /** Faux quand le niveau n'a pas de contexte tonal : le réglage reste sans effet. */
  actif?: boolean
}) {
  return (
    <div>
      <div className="flex" style={{ gap: 6 }}>
        {POSITIONS.map((p) => {
          const selectionne = p.valeur === intro
          return (
            <button
              key={p.valeur}
              onClick={() => onChange(p.valeur)}
              aria-pressed={selectionne}
              title={p.aide}
              className={selectionne ? '' : 'bg-surface-2 text-app border-app'}
              style={{
                flex: 1,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: selectionne ? ACCENT : 'var(--border-c)',
                borderRadius: 10,
                padding: '10px 6px',
                minHeight: 44,
                fontSize: 14,
                opacity: actif ? 1 : 0.5,
                ...(selectionne ? { background: ACCENT, color: '#0d1026', fontWeight: 600 } : {}),
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <p className="text-app-muted" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
        {!actif
          ? 'Ce niveau ne fait pas sonner la tonique : à toi de l’établir à l’oreille.'
          : intro === 'arpegee'
            ? 'La tonique s’arpège puis se plaque, un temps de silence, et la suite démarre.'
            : 'Aucun repère : la suite démarre sans que la tonalité soit posée.'}
      </p>
    </div>
  )
}
