import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

interface UserProfile {
  role: 'eleve' | 'prof'
  displayName: string
  teacherCode: string | null
  profIds: string[]
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubProfile: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u)
      // Annule l'écoute profil précédente
      if (unsubProfile) { unsubProfile(); unsubProfile = null }

      if (u) {
        // Écoute temps réel — profIds mis à jour instantanément
        unsubProfile = onSnapshot(doc(db, 'users', u.uid), (snap) => {
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
          setLoading(false)
        })
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      unsubAuth()
      if (unsubProfile) unsubProfile()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
