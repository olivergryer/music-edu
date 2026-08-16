import { useState, FormEvent } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { useNavigate, Link } from 'react-router-dom'
import { auth } from '../lib/firebase'

const inputCls =
  "w-full rounded-lg px-3.5 py-2.5 text-sm text-app border border-app bg-(--input-bg) outline-none focus:border-rhythm transition-colors"

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Mode « mot de passe oublié » : même carte, formulaire réduit à l'email.
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
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

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      // Adresse inconnue : on affiche quand même la confirmation. Répondre
      // « compte introuvable » transformerait ce formulaire en outil de
      // vérification d'adresses inscrites.
      if (msg.includes('user-not-found') || msg.includes('invalid-email')) {
        setResetSent(true)
      } else if (msg.includes('too-many-requests')) {
        setError('Trop de tentatives. Réessaie dans quelques minutes.')
      } else {
        setError("Impossible d'envoyer l'email pour l'instant. Réessaie plus tard.")
      }
    } finally {
      setLoading(false)
    }
  }

  function quitterReset() {
    setResetMode(false)
    setResetSent(false)
    setError('')
  }

  // ── Mode réinitialisation ──────────────────────────────────────────────────
  if (resetMode) {
    return (
      <div className="bg-app min-h-screen flex items-center justify-center px-5">
        <div className="bg-surface rounded-2xl p-10 w-full max-w-sm flex flex-col gap-5 shadow-sm border border-app">
          <h1 className="text-2xl font-bold text-app m-0">Mot de passe oublié</h1>

          {resetSent ? (
            <>
              <p className="text-app-muted text-sm leading-relaxed m-0">
                Si un compte existe pour cette adresse, un lien de réinitialisation vient d’y être
                envoyé. Il est valable une heure et ne peut servir qu’une fois.
              </p>
              <p className="text-app-muted text-sm leading-relaxed m-0">
                Pense à regarder dans les courriers indésirables.
              </p>
              <button
                type="button"
                onClick={quitterReset}
                className="w-full rounded-lg py-3 text-base font-semibold text-white border-none transition-opacity"
                style={{ background: '#4A6CF7' }}
              >
                Retour à la connexion
              </button>
            </>
          ) : (
            <>
              <p className="text-app-muted text-sm leading-relaxed m-0">
                Indique ton adresse email : on t’envoie un lien pour choisir un nouveau mot de passe.
              </p>
              <form onSubmit={handleReset} className="flex flex-col gap-4">
                <div>
                  <label className="text-app-muted text-sm mb-1.5 block font-medium">Email</label>
                  <input
                    className={inputCls}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                {error && <p className="text-red-500 text-sm text-center m-0">{error}</p>}
                <button
                  className="w-full rounded-lg py-3 text-base font-semibold text-white border-none transition-opacity disabled:opacity-50"
                  style={{ background: '#4A6CF7' }}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Envoi…' : 'Envoyer le lien'}
                </button>
              </form>
              <button
                type="button"
                onClick={quitterReset}
                className="text-center text-sm font-semibold bg-transparent border-none cursor-pointer"
                style={{ color: '#4A6CF7' }}
              >
                ← Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Mode connexion ─────────────────────────────────────────────────────────
  return (
    <div className="bg-app min-h-screen flex items-center justify-center px-5">
      <div className="bg-surface rounded-2xl p-10 w-full max-w-sm flex flex-col gap-5 shadow-sm border border-app">
        <h1 className="text-2xl font-bold text-app m-0">Connexion</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-app-muted text-sm mb-1.5 block font-medium">Email</label>
            <input
              className={inputCls}
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
              className={inputCls}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setResetMode(true); setError('') }}
              className="text-sm font-medium bg-transparent border-none cursor-pointer p-0"
              style={{ color: '#4A6CF7' }}
            >
              Mot de passe oublié ?
            </button>
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
