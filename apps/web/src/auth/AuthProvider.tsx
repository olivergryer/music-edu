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

    // Filet de sécurité ultime : si NI onAuthStateChanged NI onSnapshot ne se
    // manifestent (IndexedDB bloqué, SDK en attente), on débloque l'affichage.
    // Mieux vaut une appli utilisable sans profil qu'un écran blanc.
    const filet = setTimeout(() => setLoading(false), 5000)

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      clearTimeout(filet)
      setUser(u)
      // Annule l'écoute profil précédente
      if (unsubProfile) { unsubProfile(); unsubProfile = null }

      if (u) {
        // Écoute temps réel — profIds mis à jour instantanément.
        // `loading` DOIT se résoudre même si le profil n'arrive jamais : il ne
        // dépendait que du callback de succès, si bien qu'une erreur Firestore
        // laissait `loading` à true et `ProtectedRoute` rendait `null` — écran
        // blanc définitif. Le callback d'erreur et le garde-fou ci-dessous
        // garantissent qu'on affiche l'appli, quitte à ce que `profile` soit null.
        unsubProfile = onSnapshot(
          doc(db, 'users', u.uid),
          (snap) => {
            setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
            setLoading(false)
          },
          (err) => {
            console.warn('Profil : écoute interrompue, poursuite sans profil.', err)
            setLoading(false)
          },
        )
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(filet)
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
