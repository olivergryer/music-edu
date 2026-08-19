import { useState, FormEvent } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { useNavigate, Link } from 'react-router-dom'
import { auth, db } from '../lib/firebase'
import { readGuestProgress, clearGuestProgress, mergeGuestInto, DEFAULT_STATE } from '../hooks/progressLogic'

function generateTeacherCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const l = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
  const n = String(Math.floor(Math.random() * 90) + 10)
  return `${l}-${n}`
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
      // Reverse la progression invité (localStorage) dans le compte neuf, puis l'efface.
      // Compte neuf → progress vide : on fusionne dans DEFAULT_STATE.
      const guest = readGuestProgress()
      if (guest) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'progress', 'data'), mergeGuestInto(DEFAULT_STATE, guest))
          clearGuestProgress()
        } catch { /* échec fusion : on n'empêche pas la création du compte */ }
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

  const inputCls = "w-full rounded-lg px-3.5 py-2.5 text-sm text-app border border-app bg-(--input-bg) outline-none focus:border-rhythm transition-colors"

  return (
    <div className="bg-app min-h-screen flex items-center justify-center px-5">
      <div className="bg-surface rounded-2xl p-10 w-full max-w-sm flex flex-col gap-5 shadow-sm border border-app">
        <h1 className="text-2xl font-bold text-app m-0">Créer un compte</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-app-muted text-sm mb-1.5 block font-medium">Prénom ou pseudo</label>
            <input className={inputCls} type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <label className="text-app-muted text-sm mb-1.5 block font-medium">Email</label>
            <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label className="text-app-muted text-sm mb-1.5 block font-medium">Mot de passe</label>
            <input className={inputCls} type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div>
            <label className="text-app-muted text-sm mb-2 block font-medium">Je suis…</label>
            <div className="flex gap-3">
              {(['eleve', 'prof'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="flex-1 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all"
                  style={{
                    borderColor: role === r ? '#4A6CF7' : 'var(--border-c)',
                    background:  role === r ? '#4A6CF720' : 'var(--input-bg)',
                    color:       role === r ? '#4A6CF7' : 'var(--text-muted)',
                  }}
                >
                  {r === 'eleve' ? 'Élève' : 'Professeur'}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm text-center m-0">{error}</p>}
          <button
            className="w-full rounded-lg py-3 text-base font-semibold text-white border-none transition-opacity disabled:opacity-50"
            style={{ background: '#4A6CF7' }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-sm text-app-muted m-0">
          Déjà un compte ?{' '}
          <Link to="/login" className="font-semibold no-underline" style={{ color: '#4A6CF7' }}>
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
