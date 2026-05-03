import { useState, FormEvent } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, collection, addDoc } from 'firebase/firestore'
import { useNavigate, Link } from 'react-router-dom'
import { auth, db } from '../lib/firebase'

function generateTeacherCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const l = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
  const n = String(Math.floor(Math.random() * 90) + 10)
  return `${l}-${n}`
}

const s = {
  page: { minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', 'Inter', 'Segoe UI', sans-serif" },
  card: { background: '#0a0f1a', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column' as const, gap: 20 },
  title: { color: '#f9fafb', fontSize: 24, fontWeight: 700, margin: 0 },
  label: { color: '#9ca3af', fontSize: 13, marginBottom: 6, display: 'block' },
  input: { width: '100%', background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px', color: '#f9fafb', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const },
  btn: { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 16, fontWeight: 600, cursor: 'pointer', width: '100%' },
  roleRow: { display: 'flex', gap: 12 },
  roleBtn: (active: boolean) => ({
    flex: 1, padding: '10px 0', borderRadius: 8, border: `2px solid ${active ? '#c084fc' : '#1f2937'}`,
    background: active ? '#1e1033' : '#111827', color: active ? '#c084fc' : '#6b7280',
    fontWeight: 600, fontSize: 15, cursor: 'pointer',
  }),
  error: { color: '#f87171', fontSize: 14, textAlign: 'center' as const },
  link: { color: '#c084fc', textAlign: 'center' as const, fontSize: 14 },
}

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'eleve' | 'prof'>('eleve')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password)
      const teacherCode = role === 'prof' ? generateTeacherCode() : null
      await setDoc(doc(db, 'users', user.uid), {
        role,
        displayName,
        teacherCode,
        profIds: [],
      })
      if (teacherCode) {
        await setDoc(doc(db, 'teacherCodes', teacherCode), { uid: user.uid, displayName })
      }
      navigate('/')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('email-already-in-use')) setError('Cet email est déjà utilisé.')
      else if (msg.includes('weak-password')) setError('Mot de passe trop court (6 caractères min).')
      else setError('Erreur lors de la création du compte.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Créer un compte</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={s.label}>Prénom ou pseudo</label>
            <input style={s.input} type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label style={s.label}>Mot de passe</label>
            <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div>
            <label style={s.label}>Je suis…</label>
            <div style={s.roleRow}>
              <button type="button" style={s.roleBtn(role === 'eleve')} onClick={() => setRole('eleve')}>Élève</button>
              <button type="button" style={s.roleBtn(role === 'prof')} onClick={() => setRole('prof')}>Professeur</button>
            </div>
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
        <p style={s.link}>
          Déjà un compte ?{' '}
          <Link to="/login" style={{ color: '#c084fc' }}>Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
