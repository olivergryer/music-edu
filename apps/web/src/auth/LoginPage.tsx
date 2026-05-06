import { useState, FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useNavigate, Link } from 'react-router-dom'
import { auth } from '../lib/firebase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/')
    } catch {
      setError('Email ou mot de passe incorrect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-app min-h-screen flex items-center justify-center px-5">
      <div className="bg-surface rounded-2xl p-10 w-full max-w-sm flex flex-col gap-5 shadow-sm border border-app">
        <h1 className="text-2xl font-bold text-app m-0">Connexion</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-app-muted text-sm mb-1.5 block font-medium">Email</label>
            <input
              className="w-full rounded-lg px-3.5 py-2.5 text-sm text-app border border-app bg-(--input-bg) outline-none focus:border-rhythm transition-colors"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-app-muted text-sm mb-1.5 block font-medium">Mot de passe</label>
            <input
              className="w-full rounded-lg px-3.5 py-2.5 text-sm text-app border border-app bg-(--input-bg) outline-none focus:border-rhythm transition-colors"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center m-0">{error}</p>}
          <button
            className="w-full rounded-lg py-3 text-base font-semibold text-white border-none transition-opacity disabled:opacity-50"
            style={{ background: '#4A6CF7' }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-sm text-app-muted m-0">
          Pas encore de compte ?{' '}
          <Link to="/register" className="font-semibold no-underline" style={{ color: '#4A6CF7' }}>
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  )
}
