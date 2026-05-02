import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import HubPage from './HubPage'
import RythmApp from './RythmApp'
import TheoriePage from './TheoriePage'
import AccordeurPage from './AccordeurPage'
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HubPage />} />
      <Route path="/rythme" element={<RythmApp />} />
      <Route path="/theorie" element={<TheoriePage />} />
      <Route path="/accordeur" element={<AccordeurPage />} />
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
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
