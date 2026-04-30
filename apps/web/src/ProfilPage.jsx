import { Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'

export default function ProfilPage() {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'prof') return <Navigate to="/dashboard/prof" replace />
  return <Navigate to="/dashboard/eleve" replace />
}
