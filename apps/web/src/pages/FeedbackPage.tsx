import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'

const MODULES_FEATURES: Record<string, string[]> = {
  rythme: ['Activité 1 — Reproduire vu', 'Activité 2 — Reproduire entendu', 'Activité 3 — Reconnaître écrit', 'Activité 4 — Reconnaître joué', 'Série de 10', 'Réglage BPM / Tempo', 'Son Rythme', 'Bouton TAP', 'Micro (MIC)'],
  theorie: ['Interface', 'Exercices', 'Niveaux'],
  accordeur: ['Accordeur chromatique', 'Micro', 'Interface'],
  auth: ['Connexion', 'Inscription', 'Dashboard élève', 'Dashboard prof', 'Code professeur'],
  hub: ['Navigation entre modules', 'Widget XP / Streak', 'Design', 'Chargement'],
  general: ['Performance', 'Design global', 'Autre'],
}

const MODULE_LABELS: Record<string, string> = {
  rythme: 'Rythme', theorie: 'Théorie', accordeur: 'Accordeur',
  auth: 'Auth / Compte', hub: 'Hub', general: 'Général',
}

const TYPE_ICONS: Record<string, JSX.Element> = {
  bug:       <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 8V4m0 16v-4M8 12H4m16 0h-4M6.3 6.3l-2-2m13.4 13.4-2-2M6.3 17.7l-2 2m13.4-13.4-2 2"/></svg>,
  idee:      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 4.9 11.9L15 17H9l-1.9-3.1A7 7 0 0 1 12 2z"/><path d="M9 21h6m-6-3h6"/></svg>,
  confusion: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>,
  top:       <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3 3 0 0 1 3 3.88z"/></svg>,
}

const TYPES = [
  { id: 'bug', label: 'Bug' }, { id: 'idee', label: 'Idée' },
  { id: 'confusion', label: 'Confusion' }, { id: 'top', label: 'Top !' },
]

const inputCls = "w-full rounded-lg px-3.5 py-2.5 text-sm text-app border border-app bg-(--input-bg) outline-none focus:border-rhythm transition-colors"
const cardCls = "bg-surface border border-app rounded-2xl p-5"
const labelCls = "text-xs font-bold text-app-muted uppercase tracking-widest mb-2 block"

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
        role, appareil, module, fonctionnalite, type,
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
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-10">
      <div className="w-full max-w-xl">

        <div className="flex items-center mb-6">
          <Link to="/" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app hover:bg-surface-2 transition-colors">
            ← Tessitura
          </Link>
        </div>

        <h1 className="text-xl font-black text-app mb-1.5">Donner mon avis</h1>
        <p className="text-sm text-app-muted mb-6">Remonte un problème ou une idée d'amélioration.</p>

        {sent ? (
          <div className={cardCls + ' text-center'}>
            <div className="text-4xl mb-3">🎵</div>
            <div className="text-lg font-extrabold mb-2" style={{ color: '#22C55E' }}>Merci pour ton retour !</div>
            <div className="text-sm text-app-muted mb-6">Ton message a bien été envoyé.</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setSent(false); setDescription(''); setType(''); setNote(0) }}
                className="rounded-lg px-5 py-2.5 font-bold text-sm text-white border-none"
                style={{ background: '#4A6CF7' }}
              >
                Nouveau retour
              </button>
              <Link to="/" className="bg-surface border border-app rounded-lg px-5 py-2.5 font-bold text-sm text-app no-underline">
                Retour au Hub
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">

            <div className={cardCls}>
              <label className={labelCls}>Ton prénom (optionnel)</label>
              <input className={inputCls} value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom ou pseudo" />
            </div>

            <div className={cardCls + ' flex gap-3'}>
              <div className="flex-1">
                <label className={labelCls}>Rôle</label>
                <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
                  <option value="">—</option>
                  <option value="eleve">Élève</option>
                  <option value="prof">Professeur</option>
                  <option value="collegue">Collègue</option>
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls}>Appareil</label>
                <select className={inputCls} value={appareil} onChange={e => setAppareil(e.target.value)}>
                  <option value="">—</option>
                  <option value="tablette">Tablette</option>
                  <option value="telephone">Téléphone</option>
                  <option value="ordi">Ordinateur</option>
                </select>
              </div>
            </div>

            <div className={cardCls + ' flex flex-col gap-3'}>
              <div>
                <label className={labelCls}>Module</label>
                <select className={inputCls} value={module} onChange={e => { setModule(e.target.value); setFonctionnalite('') }}>
                  <option value="">— Choisir</option>
                  {Object.entries(MODULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {features.length > 0 && (
                <div>
                  <label className={labelCls}>Fonctionnalité</label>
                  <select className={inputCls} value={fonctionnalite} onChange={e => setFonctionnalite(e.target.value)}>
                    <option value="">— Choisir</option>
                    {features.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className={cardCls}>
              <label className={labelCls}>Type de retour</label>
              <div className="flex gap-2">
                {TYPES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className="flex-1 rounded-xl border-2 font-bold text-xs min-h-16 flex flex-col items-center justify-center gap-1.5 transition-all"
                    style={{
                      borderColor: type === t.id ? '#4A6CF7' : 'var(--border-c)',
                      background:  type === t.id ? '#4A6CF720' : 'var(--surface-2)',
                      color:       type === t.id ? '#4A6CF7' : 'var(--text-muted)',
                    }}
                  >
                    {TYPE_ICONS[t.id]}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={cardCls}>
              <label className={labelCls}>
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                className={inputCls + ' min-h-24 resize-y leading-relaxed'}
                placeholder="Décris le problème ou l'idée..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className={cardCls}>
              <label className={labelCls}>Note globale (optionnel)</label>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNote(note === n ? 0 : n)}
                    className="text-2xl p-1 bg-transparent border-none min-w-11 min-h-11 transition-opacity"
                    style={{ opacity: n <= note ? 1 : 0.25 }}
                  >
                    ⭐
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-500 text-sm m-0">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3.5 text-base font-bold text-white border-none disabled:opacity-50"
              style={{ background: '#4A6CF7' }}
            >
              {loading ? 'Envoi…' : 'Envoyer mon retour'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
