import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ThemeProvider, useTheme } from './ThemeContext'
import HubPage from './HubPage'
import RythmApp from './RythmApp'
import TheoriePage from './TheoriePage'
import AccordeurPage from './AccordeurPage'
import GenerateurAccordPage from './GenerateurAccordPage'
import ProfilPage from './ProfilPage'
import LoginPage from './auth/LoginPage'
import RegisterPage from './auth/RegisterPage'
import DashboardEleve from './pages/DashboardEleve'
import DashboardProf from './pages/DashboardProf'
import FeedbackPage from './pages/FeedbackPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

function ThemeToggle() {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 9999,
        width: 36,
        height: 36,
        minHeight: 36,
        padding: 0,
        border: 'none',
        borderRadius: '50%',
        background: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <circle cx="17" cy="17" r="16" stroke="var(--border-c)" strokeWidth="1.5" />
        {/* Left half: dark */}
        <path d="M17 1 A16 16 0 0 0 17 33 Z" fill="#0D1026" />
        {/* Right half: light */}
        <path d="M17 1 A16 16 0 0 1 17 33 Z" fill="#F4F5F7" />
        <circle cx="17" cy="17" r="16" stroke="var(--border-c)" strokeWidth="1.5" fill="none" />
        {/* Indicator dot on active side */}
        <circle
          cx={dark ? 11 : 23}
          cy="17"
          r="3"
          fill={dark ? '#F4F5F7' : '#0D1026'}
        />
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
      <Route path="/accordeur" element={<AccordeurPage />} />
      <Route path="/accordeur/generateur" element={<GenerateurAccordPage />} />
      <Route path="/profil" element={<ProtectedRoute><ProfilPage /></ProtectedRoute>} />
      <Route path="/dashboard/eleve" element={<ProtectedRoute><DashboardEleve /></ProtectedRoute>} />
      <Route path="/dashboard/prof" element={<ProtectedRoute><DashboardProf /></ProtectedRoute>} />
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
          <ThemeToggle />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
