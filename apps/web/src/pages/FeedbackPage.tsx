import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'

const MODULES_FEATURES: Record<string, string[]> = {
  rythme: [
    'Activité 1 — Reproduire vu',
    'Activité 2 — Reproduire entendu',
    'Activité 3 — Reconnaître écrit',
    'Activité 4 — Reconnaître joué',
    'Série de 10',
    'Réglage BPM / Tempo',
    'Son Rythme 🔊',
    'Bouton TAP 🥁',
    'Micro (MIC)',
  ],
  theorie: ['Interface', 'Exercices', 'Niveaux'],
  accordeur: ['Accordeur chromatique', 'Micro', 'Interface'],
  auth: ['Connexion', 'Inscription', 'Dashboard élève', 'Dashboard prof', 'Code professeur'],
  hub: ['Navigation entre modules', 'Widget XP / Streak', 'Design', 'Chargement'],
  general: ['Performance', 'Design global', 'Autre'],
}

const MODULE_LABELS: Record<string, string> = {
  rythme: '🥁 Rythme',
  theorie: '🎼 Théorie',
  accordeur: '🎵 Accordeur',
  auth: '🔑 Auth / Compte',
  hub: '🏠 Hub',
  general: '⚙️ Général',
}

const TYPE_ICONS: Record<string, JSX.Element> = {
  bug: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 8V4m0 16v-4M8 12H4m16 0h-4M6.3 6.3l-2-2m13.4 13.4-2-2M6.3 17.7l-2 2m13.4-13.4-2 2"/></svg>,
  idee: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 4.9 11.9L15 17H9l-1.9-3.1A7 7 0 0 1 12 2z"/><path d="M9 21h6m-6-3h6"/></svg>,
  confusion: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>,
  top: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3 3 0 0 1 3 3.88z"/></svg>,
}

const TYPES = [
  { id: 'bug',       label: 'Bug' },
  { id: 'idee',      label: 'Idée' },
  { id: 'confusion', label: 'Confusion' },
  { id: 'top',       label: 'Top !' },
]

const inp: React.CSSProperties = {
  width: '100%', background: '#111827', border: '1px solid #1f2937',
  borderRadius: 8, padding: '10px 14px', color: '#f9fafb',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
}

const btnBack: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
  color: '#c084fc', fontWeight: 700, fontSize: 12, padding: '4px 10px',
  cursor: 'pointer', textDecoration: 'none',
}

export default function FeedbackPage() {
  const { user, profile } = useAuth()

  const [prenom, setPrenom] = useState(profile?.displayName ?? '')
  const [role, setRole] = useState('')
  const [appareil, setAppareil] = useState('')
  const [module, setModule] = useState('')
  const [fonctionnalite, setFonctionnalite] = useState('')
  const [type, setType] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const features = module ? (MODULES_FEATURES[module] ?? []) : []

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setError('La description est obligatoire.'); return }
    setLoading(true)
    setError('')
    try {
      await addDoc(collection(db, 'feedback'), {
        uid: user?.uid ?? null,
        prenom: prenom.trim() || 'Anonyme',
        role,
        appareil,
        module,
        fonctionnalite,
        type,
        description: description.trim(),
        note: note > 0 ? note : null,
        createdAt: serverTimestamp(),
      })
      setSent(true)
    } catch {
      setError('Erreur réseau. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 14px 40px', fontFamily: "'Poppins','Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Link to="/" style={btnBack}>← Tessitura</Link>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>Donner mon avis</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
          Remonte un problème ou une idée d'amélioration.
        </p>

        {sent ? (
          <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#34d399', marginBottom: 8 }}>Merci pour ton retour !</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Ton message a bien été envoyé.</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => { setSent(false); setDescription(''); setType(''); setNote(0) }}
                style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Nouveau retour
              </button>
              <Link to="/" style={{ ...btnBack, padding: '10px 20px', fontSize: 14 }}>Retour au Hub</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
                Ton prénom (optionnel)
              </label>
              <input style={inp} value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom ou pseudo" />
            </div>

            <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Rôle</label>
                <select style={inp} value={role} onChange={e => setRole(e.target.value)}>
                  <option value="">—</option>
                  <option value="eleve">Élève</option>
                  <option value="prof">Professeur</option>
                  <option value="collegue">Collègue</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Appareil</label>
                <select style={inp} value={appareil} onChange={e => setAppareil(e.target.value)}>
                  <option value="">—</option>
                  <option value="tablette">Tablette</option>
                  <option value="telephone">Téléphone</option>
                  <option value="ordi">Ordinateur</option>
                </select>
              </div>
            </div>

            <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Module</label>
                <select style={inp} value={module} onChange={e => { setModule(e.target.value); setFonctionnalite('') }}>
                  <option value="">— Choisir</option>
                  {Object.entries(MODULE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {features.length > 0 && (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Fonctionnalité</label>
                  <select style={inp} value={fonctionnalite} onChange={e => setFonctionnalite(e.target.value)}>
                    <option value="">— Choisir</option>
                    {features.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>Type de retour</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {TYPES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer', border: 'none',
                      background: type === t.id ? '#1e1033' : '#111827',
                      outline: type === t.id ? '2px solid #7c3aed' : '1px solid #1f2937',
                      color: type === t.id ? '#c084fc' : '#6b7280',
                      fontSize: 11, fontWeight: 700, textAlign: 'center',
                      minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {TYPE_ICONS[t.id]}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
                Description <span style={{ color: '#f87171' }}>*</span>
              </label>
              <textarea
                style={{ ...inp, minHeight: 100, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Décris le problème ou l'idée..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>
                Note globale (optionnel)
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNote(note === n ? 0 : n)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, padding: 4, opacity: n <= note ? 1 : 0.3, transition: 'opacity 0.1s', minHeight: 44, minWidth: 44 }}
                  >
                    ⭐
                  </button>
                ))}
              </div>
            </div>

            {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' }}
            >
              {loading ? 'Envoi…' : 'Envoyer mon retour'}
            </button>

          </form>
        )}
      </div>
    </div>
  )
}
