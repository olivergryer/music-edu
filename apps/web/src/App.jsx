import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ThemeProvider, useTheme } from './ThemeContext'
import HubPage from './HubPage'
import EcranChargement from './components/EcranChargement'
import CelebrationLayer from './components/CelebrationLayer'
import IndicateurSync from './components/IndicateurSync'
import AvertissementSon from './components/AvertissementSon'
import { CelebrationProvider } from './hooks/CelebrationContext'
import { IS_DEV } from './isDev'

// Le Hub reste dans le bundle d'entrée : c'est la première page vue, et elle
// n'utilise aucune dépendance lourde. Tout le reste est chargé à la demande —
// vexflow, tone, soundfont-player et pitchy pèsent l'essentiel des 2,5 Mo et ne
// servent qu'aux modules d'exercice.
const RythmApp             = lazy(() => import('./RythmApp'))
const TheoriePage          = lazy(() => import('./TheoriePage'))
const AccordeurPage        = lazy(() => import('./AccordeurPage'))
const GenerateurAccordPage = lazy(() => import('./GenerateurAccordPage'))
const NotesPage            = lazy(() => import('./modules/notes/NotesPage'))
const HarmoniePage         = lazy(() => import('./modules/harmonie/HarmoniePage'))
const DetectionPage        = lazy(() => import('./modules/harmonie/DetectionPage'))
const DicteeBassePage      = lazy(() => import('./modules/harmonie/DicteeBassePage'))
const IntervallesPage      = lazy(() => import('./modules/harmonie/IntervallesPage'))
const ChoixBinairePage     = lazy(() => import('./modules/harmonie/ChoixBinairePage'))
const ChiffrageFluxPage    = lazy(() => import('./modules/harmonie/ChiffrageFluxPage'))
const CadencesPage         = lazy(() => import('./modules/harmonie/CadencesPage'))
const BancPage             = lazy(() => import('./modules/harmonie/BancPage'))
const ProfilPage           = lazy(() => import('./ProfilPage'))
const LoginPage            = lazy(() => import('./auth/LoginPage'))
const RegisterPage         = lazy(() => import('./auth/RegisterPage'))
const ResetPasswordPage    = lazy(() => import('./auth/ResetPasswordPage'))
const DashboardEleve       = lazy(() => import('./pages/DashboardEleve'))
const DashboardProf        = lazy(() => import('./pages/DashboardProf'))
const DashboardProfEleve   = lazy(() => import('./pages/DashboardProfEleve'))
const FeedbackPage         = lazy(() => import('./pages/FeedbackPage'))
const QuestionsAdminPage   = lazy(() => import('./QuestionsAdminPage'))
const CalibrationPage      = lazy(() => import('./pages/CalibrationPage'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  // Rendait `null` : écran blanc, indistinguable d'un plantage — surtout hors
  // ligne, où `loading` pouvait ne jamais se résoudre.
  if (loading) return <EcranChargement />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function ThemeToggleFloating() {
  const { dark, toggle } = useTheme()
  const { pathname } = useLocation()
  if (pathname !== '/') return null
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      style={{
        position: 'fixed', bottom: 24, right: 16, zIndex: 9999,
        width: 36, height: 36, minHeight: 36, padding: 0,
        border: 'none', borderRadius: '50%', background: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <circle cx="17" cy="17" r="16" stroke="var(--border-c)" strokeWidth="1.5" />
        <path d="M17 1 A16 16 0 0 0 17 33 Z" fill="#0D1026" />
        <path d="M17 1 A16 16 0 0 1 17 33 Z" fill="#F4F5F7" />
        <circle cx="17" cy="17" r="16" stroke="var(--border-c)" strokeWidth="1.5" fill="none" />
        <circle cx={dark ? 11 : 23} cy="17" r="3" fill={dark ? '#F4F5F7' : '#0D1026'} />
      </svg>
    </button>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<EcranChargement />}>
    <Routes>
      <Route path="/" element={<HubPage />} />
      <Route path="/rythme" element={<RythmApp />} />
      <Route path="/theorie" element={<TheoriePage />} />
      {IS_DEV && <Route path="/theorie/questions" element={<QuestionsAdminPage />} />}
      <Route path="/accordeur" element={<AccordeurPage />} />
      <Route path="/accordeur/generateur" element={<GenerateurAccordPage />} />
      <Route path="/notes" element={<NotesPage />} />
      {/* Routes publiques, mais la carte du Hub reste « Bientôt » tant que
          MODULES.harmonie.active vaut false (lib/modules.ts). `/harmonie` est le
          choix d'activité ; chaque activité a sa propre route et son en-tête. */}
      <Route path="/harmonie" element={<HarmoniePage />} />
      <Route path="/harmonie/detection" element={<DetectionPage />} />
      <Route path="/harmonie/basse" element={<DicteeBassePage />} />
      <Route path="/harmonie/intervalles" element={<IntervallesPage />} />
      <Route path="/harmonie/binaire" element={<ChoixBinairePage />} />
      <Route path="/harmonie/flux" element={<ChiffrageFluxPage />} />
      <Route path="/harmonie/cadences" element={<CadencesPage />} />
      {/* Banc d'écoute Harmonie — harnais de dev, aucun lien depuis le Hub */}
      {IS_DEV && <Route path="/harmonie/banc" element={<BancPage />} />}
      {IS_DEV && <Route path="/accordeur/calibration" element={<ProtectedRoute><CalibrationPage /></ProtectedRoute>} />}
      <Route path="/profil" element={<ProtectedRoute><ProfilPage /></ProtectedRoute>} />
      <Route path="/dashboard/eleve" element={<ProtectedRoute><DashboardEleve /></ProtectedRoute>} />
      <Route path="/dashboard/prof" element={<ProtectedRoute><DashboardProf /></ProtectedRoute>} />
      <Route path="/dashboard/prof/eleve/:uid" element={<ProtectedRoute><DashboardProfEleve /></ProtectedRoute>} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Atterrissage des liens d'action Firebase (réinitialisation de mot de
          passe). Doit correspondre à l'URL d'action configurée dans la console. */}
      <Route path="/reinitialiser" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* La file de célébrations enveloppe les routes : les modules y
              poussent via useProgressFirebase, CelebrationLayer les consomme. */}
          <CelebrationProvider>
            <ThemeToggleFloating />
            <CelebrationLayer />
            <IndicateurSync />
            <AvertissementSon />
            <AppRoutes />
          </CelebrationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
