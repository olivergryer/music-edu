import { useState, FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useNavigate, Link } from 'react-router-dom'
import { auth } from '../lib/firebase'

const s = {
  page: { minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', 'Segoe UI', sans-serif" },
  card: { background: '#0a0f1a', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column' as const, gap: 20 },
  title: { color: '#f9fafb', fontSize: 24, fontWeight: 700, margin: 0 },
  label: { color: '#9ca3af', fontSize: 13, marginBottom: 6, display: 'block' },
  input: { width: '100%', background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px', color: '#f9fafb', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const },
  btn: { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 16, fontWeight: 600, cursor: 'pointer', width: '100%' },
  error: { color: '#f87171', fontSize: 14, textAlign: 'center' as const },
  link: { color: '#c084fc', textAlign: 'center' as const, fontSize: 14 },
}

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
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Connexion</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label style={s.label}>Mot de passe</label>
            <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p style={s.link}>
          Pas encore de compte ?{' '}
          <Link to="/register" style={{ color: '#c084fc' }}>Créer un compte</Link>
        </p>
      </div>
    </div>
  )
}
