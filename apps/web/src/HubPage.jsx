import { Link } from 'react-router-dom'
import useProgressFirebase from './hooks/useProgressFirebase'
import { useAuth } from './auth/AuthProvider'
import { useTheme } from './ThemeContext'
import banniereDark from './assets/banniere_dark.svg'
import banniereLight from './assets/banniere_light.svg'

const MODULES = [
  { id: 'rythme',    label: 'Rythme',    desc: 'Lecture et reproduction rythmique', to: '/rythme',    active: true, color: '#4A6CF7' },
  { id: 'theorie',   label: 'Théorie',   desc: 'Intervalles, accords, armures',     to: '/theorie',   active: true, color: '#8B5CF6' },
  { id: 'accordeur', label: 'Accordeur', desc: 'Accordeur chromatique',             to: '/accordeur', active: true, color: '#FF8B3D' },
]

function ModuleCard({ label, desc, active, color }) {
  return (
    <div
      className="bg-surface rounded-2xl p-6 border border-app transition-all duration-200 hover:shadow-lg group"
      style={{ opacity: active ? 1 : 0.4, cursor: active ? 'pointer' : 'default' }}
    >
      <div
        className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
        style={{ background: color + '20' }}
      >
        <div className="w-4 h-4 rounded-full" style={{ background: color }} />
      </div>
      <div className="text-base font-bold text-app mb-1 group-hover:opacity-80 transition-opacity" style={{ color }}>
        {label}
      </div>
      <div className="text-sm text-app-muted leading-relaxed">{desc}</div>
      {!active && (
        <div className="mt-2 text-xs font-bold text-app-muted">Bientôt</div>
      )}
    </div>
  )
}

export default function HubPage() {
  const { xp, level, streak, trophies } = useProgressFirebase()
  const { user, profile } = useAuth()
  const { dark } = useTheme()

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-5 py-12">

      <div className="w-full max-w-2xl">
        <div className="mb-12 text-center">
          <img
            src={dark ? banniereDark : banniereLight}
            alt="Tessitura"
            style={{ maxWidth: '320px', width: '100%', height: 'auto' }}
          />
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {MODULES.map(m => m.active
            ? <Link key={m.id} to={m.to} className="no-underline">
                <ModuleCard {...m} />
              </Link>
            : <ModuleCard key={m.id} {...m} />
          )}
        </div>

        {/* Barre progression utilisateur */}
        <div className="mt-8 flex gap-3 items-center justify-center flex-wrap text-sm text-app-muted">
          {user ? (
            <>
              {streak.current > 0 && (
                <span className="flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF8B3D"><path d="M12 2C8 8 4 11 4 15a8 8 0 0016 0c0-4-4-7-8-13z"/></svg>
                  {streak.current} jour{streak.current > 1 ? 's' : ''}
                </span>
              )}
              {xp > 0 && <span className="font-semibold text-app">{xp} XP</span>}
              {xp > 0 && (
                <span className="font-bold text-sm px-2 py-0.5 rounded-full" style={{ background: '#8B5CF620', color: '#8B5CF6' }}>
                  {level.id}
                </span>
              )}
              {trophies.length > 0 && <span className="text-app-muted">{trophies.length} trophées</span>}
              <Link
                to={profile?.role === 'prof' ? '/dashboard/prof' : '/dashboard/eleve'}
                className="font-bold no-underline text-sm px-3 py-1 rounded-full border border-app transition-colors hover:bg-surface"
                style={{ color: '#4A6CF7' }}
              >
                {profile?.displayName ?? 'Mon compte'} →
              </Link>
              <Link to="/profil" className="text-app-muted no-underline text-xs hover:text-app transition-colors">
                Profil
              </Link>
            </>
          ) : (
            <Link to="/login" className="font-bold no-underline text-sm" style={{ color: '#4A6CF7' }}>
              Se connecter →
            </Link>
          )}
          <Link to="/feedback" className="text-app-muted no-underline text-xs hover:text-app transition-colors">
            Retours
          </Link>
        </div>
      </div>

      <footer className="mt-auto pt-12 text-xs text-app-muted opacity-40">
        Tessitura
      </footer>
    </div>
  )
}
