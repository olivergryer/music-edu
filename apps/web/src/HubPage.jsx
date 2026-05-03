import { Link } from 'react-router-dom'
import useProgressFirebase from './hooks/useProgressFirebase'
import { useAuth } from './auth/AuthProvider'

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
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => { if (active) { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 0 16px #7c3aed44' } }}
      onMouseLeave={e => { if (active) { e.currentTarget.style.borderColor = '#1f2937'; e.currentTarget.style.boxShadow = 'none' } }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: '#c084fc', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>{desc}</div>
      {!active && <div style={{ marginTop: 10, fontSize: 10, color: '#374151', fontWeight: 700 }}>Bientôt</div>}
    </div>
  )
}

export default function HubPage() {
  const { xp, level, streak, trophies } = useProgressFirebase()
  const { user, profile } = useAuth()

  return (
    <div style={{
      minHeight: '100dvh', background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 20px', fontFamily: "'Poppins','Inter','Segoe UI',sans-serif",
    }}>
      <h1 style={{ fontSize: 36, fontWeight: 900, color: '#c084fc', margin: '0 0 8px', fontFamily: "'Righteous','Inter',sans-serif" }}>
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

      <div style={{
        marginTop: 32, display: 'flex', gap: 12, alignItems: 'center',
        justifyContent: 'center', flexWrap: 'wrap',
        fontSize: 12, color: '#6b7280',
      }}>
        {user ? (
          <>
            {streak.current > 0 && <span>🔥 {streak.current} jour{streak.current > 1 ? 's' : ''}</span>}
            {xp > 0 && <span>⭐ {xp} XP</span>}
            {xp > 0 && <span style={{ color: '#c084fc', fontWeight: 700 }}>{level.id}</span>}
            {trophies.length > 0 && <span>{trophies.length} 🏅</span>}
            <Link to={profile?.role === 'prof' ? '/dashboard/prof' : '/dashboard/eleve'} style={{ color: '#fbbf24', fontWeight: 700, textDecoration: 'none', fontSize: 11 }}>
              {profile?.displayName ?? 'Mon compte'} →
            </Link>
            <Link to="/profil" style={{ color: '#7c3aed', fontWeight: 700, textDecoration: 'none', fontSize: 11 }}>Profil</Link>
          </>
        ) : (
          <Link to="/login" style={{ color: '#c084fc', fontWeight: 700, textDecoration: 'none', fontSize: 12 }}>Se connecter →</Link>
        )}
        <Link to="/feedback" style={{ color: '#4b5563', fontWeight: 600, textDecoration: 'none', fontSize: 11 }}>💬 Retours</Link>
      </div>

      <footer style={{ marginTop: 'auto', paddingTop: 48, color: '#1f2937', fontSize: 10 }}>
        Tessitura
      </footer>
    </div>
  )
}
