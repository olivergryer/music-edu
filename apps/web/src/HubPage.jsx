import { Link } from 'react-router-dom'

const MODULES = [
  { id: 'rythme',    label: 'Rythme',    desc: 'Lecture et reproduction rythmique', to: '/rythme',  active: true  },
  { id: 'theorie',   label: 'Théorie',   desc: 'Intervalles, accords, armures',     to: '/theorie', active: true  },
  { id: 'accordeur', label: 'Accordeur', desc: 'Accordeur chromatique',             to: '/accordeur', active: true  },
]

function ModuleCard({ label, desc, active }) {
  return (
    <div
      style={{
        background: active ? '#0a0f1a' : '#060b14',
        border: `2px solid ${active ? '#1f2937' : '#0f172a'}`,
        borderRadius: 16,
        padding: '24px 20px',
        opacity: active ? 1 : 0.4,
        cursor: active ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (active) e.currentTarget.style.borderColor = '#7c3aed' }}
      onMouseLeave={e => { if (active) e.currentTarget.style.borderColor = '#1f2937' }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: '#c084fc', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>{desc}</div>
      {!active && <div style={{ marginTop: 10, fontSize: 10, color: '#374151', fontWeight: 700 }}>Bientôt</div>}
    </div>
  )
}

export default function HubPage() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 20px', fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <h1 style={{ fontSize: 36, fontWeight: 900, color: '#c084fc', margin: '0 0 8px' }}>
        Tessitura
      </h1>
      <p style={{ color: '#4b5563', fontSize: 13, marginBottom: 48, margin: '0 0 48px' }}>
        Outils pédagogiques pour la musique
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        width: '100%',
        maxWidth: 680,
      }}>
        {MODULES.map(m => m.active
          ? <Link key={m.id} to={m.to} style={{ textDecoration: 'none' }}>
              <ModuleCard {...m} />
            </Link>
          : <ModuleCard key={m.id} {...m} />
        )}
      </div>

      <footer style={{ marginTop: 'auto', paddingTop: 48, color: '#1f2937', fontSize: 10 }}>
        Tessitura
      </footer>
    </div>
  )
}
