// ─── Le sélecteur de portée — trois positions ────────────────────────────────
//
// Masquée · Tonalité · En Ut. Même contrôle, même place, dans les quatre
// activités : la portée est un langage commun au module, pas une option d'écran.
//
// La valeur vit dans `payload.porteeVue` de la progression Harmonie, donc elle
// suit l'élève d'une activité à l'autre et d'une session à la suivante.

import { type VuePortee } from './PorteeSATB.tsx'

const ACCENT = '#c084fc'

const POSITIONS: { valeur: VuePortee; label: string; aide: string }[] = [
  { valeur: 'masquee', label: 'Masquée', aide: 'Pas de portée' },
  { valeur: 'tonalite', label: 'Tonalité', aide: 'Dans la tonalité entendue' },
  { valeur: 'ut', label: 'En Ut', aide: 'Remis en Do majeur / la mineur' },
]

export function estVuePortee(v: unknown): v is VuePortee {
  return v === 'masquee' || v === 'tonalite' || v === 'ut'
}

export default function TogglePortee({
  vue,
  onChange,
}: {
  vue: VuePortee
  onChange: (v: VuePortee) => void
}) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <span className="text-app-muted" style={{ fontSize: 12, flexShrink: 0 }}>
        Portée
      </span>
      <div className="flex" style={{ gap: 4, flex: 1 }}>
        {POSITIONS.map((p) => {
          const actif = p.valeur === vue
          return (
            <button
              key={p.valeur}
              onClick={() => onChange(p.valeur)}
              aria-pressed={actif}
              title={p.aide}
              className={actif ? '' : 'bg-surface-2 text-app border-app'}
              style={{
                flex: 1,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: actif ? ACCENT : 'var(--border-c)',
                borderRadius: 10,
                padding: '10px 6px',
                minHeight: 44,
                fontSize: 13,
                ...(actif ? { background: ACCENT, color: '#0d1026', fontWeight: 600 } : {}),
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
