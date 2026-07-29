import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ThemeProvider, useTheme } from './ThemeContext'
import HubPage from './HubPage'
import RythmApp from './RythmApp'
import TheoriePage from './TheoriePage'
import AccordeurPage from './AccordeurPage'
import GenerateurAccordPage from './GenerateurAccordPage'
import NotesPage from './modules/notes/NotesPage'
import ProfilPage from './ProfilPage'
import LoginPage from './auth/LoginPage'
import RegisterPage from './auth/RegisterPage'
import DashboardEleve from './pages/DashboardEleve'
import DashboardProf from './pages/DashboardProf'
import DashboardProfEleve from './pages/DashboardProfEleve'
import FeedbackPage from './pages/FeedbackPage'
import QuestionsAdminPage from './QuestionsAdminPage'
import CalibrationPage from './pages/CalibrationPage'
import { IS_DEV } from './isDev'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
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
    <Routes>
      <Route path="/" element={<HubPage />} />
      <Route path="/rythme" element={<RythmApp />} />
      <Route path="/theorie" element={<TheoriePage />} />
      {IS_DEV && <Route path="/theorie/questions" element={<QuestionsAdminPage />} />}
      <Route path="/accordeur" element={<AccordeurPage />} />
      <Route path="/accordeur/generateur" element={<GenerateurAccordPage />} />
      <Route path="/notes" element={<NotesPage />} />
      {IS_DEV && <Route path="/accordeur/calibration" element={<ProtectedRoute><CalibrationPage /></ProtectedRoute>} />}
      <Route path="/profil" element={<ProtectedRoute><ProfilPage /></ProtectedRoute>} />
      <Route path="/dashboard/eleve" element={<ProtectedRoute><DashboardEleve /></ProtectedRoute>} />
      <Route path="/dashboard/prof" element={<ProtectedRoute><DashboardProf /></ProtectedRoute>} />
      <Route path="/dashboard/prof/eleve/:uid" element={<ProtectedRoute><DashboardProfEleve /></ProtectedRoute>} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ThemeToggleFloating />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
