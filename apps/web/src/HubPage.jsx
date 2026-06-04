import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useProgressFirebase from './hooks/useProgressFirebase'
import { usePwaInstall } from './hooks/usePwaInstall'
import { useAuth } from './auth/AuthProvider'
import { useTheme } from './ThemeContext'
import PwaInstallTutorial from './components/PwaInstallTutorial'
import PwaInAppBrowserOverlay from './components/PwaInAppBrowserOverlay'
import banniereDark from './assets/banniere_dark.svg'
import banniereLight from './assets/banniere_light.svg'
import { SHOW_TEST_BADGE } from './featureFlags'

const MODULES = [
  { id: 'rythme',    label: 'Rythme',    desc: 'Lecture et reproduction rythmique', to: '/rythme',    active: true, color: '#4A6CF7' },
  { id: 'theorie',   label: 'Théorie',   desc: 'Intervalles, accords, armures',     to: '/theorie',   active: true, color: '#8B5CF6' },
  { id: 'accordeur', label: 'Accordeur', desc: 'Accordeur par phrase et générateur d\'accords', to: '/accordeur', active: true, color: '#FF8B3D' },
]

function ModuleCard({ label, desc, active, color }) {
  return (
    <div
      className="bg-surface rounded-2xl p-6 border border-app transition-all duration-200 hover:shadow-lg group h-full"
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
  const { xp, rank, streak, trophies } = useProgressFirebase()
  const { user, profile } = useAuth()
  const { dark } = useTheme()
  const pwa = usePwaInstall()
  const [showPwaTuto, setShowPwaTuto] = useState(false)
  const [showInApp, setShowInApp] = useState(false)

  useEffect(() => {
    if (pwa.shouldShowInAppWarning()) setShowInApp(true)
    else if (pwa.shouldShowHub()) setShowPwaTuto(true)
  }, [pwa])

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-5 py-12">

      {showInApp && <PwaInAppBrowserOverlay pwa={pwa} onClose={() => setShowInApp(false)} />}
      {showPwaTuto && !showInApp && <PwaInstallTutorial pwa={pwa} context="hub" onClose={() => setShowPwaTuto(false)} />}

      <div className="w-full max-w-2xl">
        <div className="mb-12">
          <img
            src={dark ? banniereDark : banniereLight}
            alt="Tessitura"
            style={{ width: '100%', height: 'auto' }}
          />
        </div>

        {SHOW_TEST_BADGE && (
          <div
            className="mb-5 rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: 'rgba(255,139,61,0.10)',
              border: '1px solid rgba(255,139,61,0.35)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF8B3D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            <div style={{ lineHeight: 1.35 }}>
              <div className="text-sm font-bold" style={{ color: '#FF8B3D' }}>Accordeur en phase de test</div>
              <div className="text-xs text-app-muted">Module en cours de validation, retours bienvenus via la page Retours.</div>
            </div>
          </div>
        )}

        <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
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
                  {rank.id}
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
        {__BUILD_DATE__ && (
          <span style={{ marginLeft: 8 }}>
            · {new Date(__BUILD_DATE__).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </span>
        )}
      </footer>
    </div>
  )
}
