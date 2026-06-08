import { useState, useEffect, useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { IS_DEV } from './isDev'

const COMMENTS_KEY = 'theorie_questions_comments_v1'
const LEVELS = ['C1/1','C1/2','C1/3','C1/4','C2/1','C2/2','C2/3','C2/4','C3']

function levelRank(l) { const i = LEVELS.indexOf(l); return i < 0 ? 99 : i }

function loadComments() {
  try { return JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {} } catch { return {} }
}
function saveComments(c) {
  try { localStorage.setItem(COMMENTS_KEY, JSON.stringify(c)) } catch {}
}

function exportComments(comments, questions) {
  const byId = new Map(questions.map(q => [q.id, q]))
  const rows = Object.entries(comments)
    .filter(([, v]) => v && v.trim())
    .map(([id, comment]) => {
      const q = byId.get(id) || {}
      return {
        id,
        niveau: q.niveau,
        categorie: q.categorie,
        type: q.type,
        question: q.question,
        reponse_correcte: q.reponse_correcte,
        reponse_fausse_1: q.reponse_fausse_1,
        reponse_fausse_2: q.reponse_fausse_2,
        reponse_fausse_3: q.reponse_fausse_3,
        explication: q.explication,
        comment: comment.trim(),
      }
    })
  const payload = { exportedAt: new Date().toISOString(), count: rows.length, comments: rows }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `theorie-comments-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const COLS = [
  { id: 'niveau',    label: 'Niveau',  sortFn: (a, b) => levelRank(a.niveau) - levelRank(b.niveau) },
  { id: 'categorie', label: 'Catégorie', sortFn: (a, b) => (a.categorie || '').localeCompare(b.categorie || '') },
  { id: 'id',        label: 'ID',      sortFn: (a, b) => (a.id || '').localeCompare(b.id || '') },
  { id: 'type',      label: 'Type',    sortFn: (a, b) => (a.type || '').localeCompare(b.type || '') },
]

export default function QuestionsAdminPage() {
  if (!IS_DEV) return <Navigate to="/" replace />

  const [questions, setQuestions] = useState([])
  const [comments, setComments] = useState(loadComments)
  const [sortBy, setSortBy] = useState('niveau')
  const [sortDir, setSortDir] = useState('asc')
  const [filterNiveau, setFilterNiveau] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const [onlyWithComment, setOnlyWithComment] = useState(false)

  useEffect(() => {
    fetch('/data/questions.json').then(r => r.json()).then(setQuestions).catch(() => setQuestions([]))
  }, [])

  useEffect(() => { saveComments(comments) }, [comments])

  const niveaux = useMemo(() => [...new Set(questions.map(q => q.niveau))].sort((a, b) => levelRank(a) - levelRank(b)), [questions])
  const categories = useMemo(() => [...new Set(questions.map(q => q.categorie))].sort(), [questions])
  const types = useMemo(() => [...new Set(questions.map(q => q.type))].sort(), [questions])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return questions.filter(q => {
      if (filterNiveau && q.niveau !== filterNiveau) return false
      if (filterCat && q.categorie !== filterCat) return false
      if (filterType && q.type !== filterType) return false
      if (onlyWithComment && !(comments[q.id] && comments[q.id].trim())) return false
      if (s && !`${q.id} ${q.question} ${q.reponse_correcte}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [questions, filterNiveau, filterCat, filterType, onlyWithComment, search, comments])

  const sorted = useMemo(() => {
    const col = COLS.find(c => c.id === sortBy)
    if (!col) return filtered
    const arr = [...filtered].sort((a, b) => {
      // secondaire stable : niveau → categorie → id
      const primary = col.sortFn(a, b)
      if (primary !== 0) return primary
      if (sortBy !== 'niveau' && levelRank(a.niveau) !== levelRank(b.niveau)) return levelRank(a.niveau) - levelRank(b.niveau)
      if (sortBy !== 'categorie' && a.categorie !== b.categorie) return (a.categorie || '').localeCompare(b.categorie || '')
      return (a.id || '').localeCompare(b.id || '')
    })
    return sortDir === 'desc' ? arr.reverse() : arr
  }, [filtered, sortBy, sortDir])

  function toggleSort(colId) {
    if (sortBy === colId) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(colId); setSortDir('asc') }
  }

  function setComment(id, val) {
    setComments(prev => {
      const next = { ...prev }
      if (val && val.trim()) next[id] = val
      else delete next[id]
      return next
    })
  }

  const commentCount = Object.values(comments).filter(v => v && v.trim()).length

  return (
    <div className="bg-app min-h-dvh px-4 py-4" style={{ color: 'var(--text)' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Link to="/theorie" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app">← Théorie</Link>
        <h1 className="text-lg font-black" style={{ color: '#8B5CF6' }}>Admin questions <span className="text-xs font-normal text-app-muted">(DEV — {sorted.length}/{questions.length})</span></h1>
        <button
          className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          style={{ background: '#8B5CF6', border: 'none' }}
          disabled={commentCount === 0}
          onClick={() => exportComments(comments, questions)}
        >
          ↓ Exporter {commentCount} commentaire{commentCount > 1 ? 's' : ''}
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-surface border border-app rounded-xl p-3 mb-3 flex flex-wrap gap-2 items-center text-xs">
        <input
          type="search"
          placeholder="Rechercher (id, énoncé, réponse)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-md px-2 py-1.5 border border-app bg-surface-2 text-app outline-none"
          style={{ minWidth: 220 }}
        />
        <select value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)} className="rounded-md px-2 py-1.5 border border-app bg-surface-2 text-app">
          <option value="">Tous niveaux</option>
          {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="rounded-md px-2 py-1.5 border border-app bg-surface-2 text-app">
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-md px-2 py-1.5 border border-app bg-surface-2 text-app">
          <option value="">Tous types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-1 font-bold text-app-muted cursor-pointer">
          <input type="checkbox" checked={onlyWithComment} onChange={e => setOnlyWithComment(e.target.checked)} style={{ accentColor: '#8B5CF6' }} />
          Avec commentaire ({commentCount})
        </label>
      </div>

      {/* Tableau */}
      <div className="bg-surface border border-app rounded-xl overflow-auto" style={{ maxHeight: 'calc(100dvh - 180px)' }}>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead className="sticky top-0" style={{ background: 'var(--surface-2)', zIndex: 1 }}>
            <tr>
              {COLS.map(c => (
                <th
                  key={c.id}
                  onClick={() => toggleSort(c.id)}
                  className="text-left px-2 py-2 font-bold cursor-pointer select-none border-b border-app"
                  style={{ color: '#8B5CF6', whiteSpace: 'nowrap' }}
                >
                  {c.label}{sortBy === c.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th className="text-left px-2 py-2 font-bold border-b border-app" style={{ color: '#8B5CF6' }}>Question</th>
              <th className="text-left px-2 py-2 font-bold border-b border-app" style={{ color: '#8B5CF6' }}>Bonne réponse</th>
              <th className="text-left px-2 py-2 font-bold border-b border-app" style={{ color: '#8B5CF6' }}>Distracteurs</th>
              <th className="text-left px-2 py-2 font-bold border-b border-app" style={{ color: '#8B5CF6' }}>Explication</th>
              <th className="text-left px-2 py-2 font-bold border-b border-app" style={{ color: '#8B5CF6', minWidth: 220 }}>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(q => {
              const hasComment = !!(comments[q.id] && comments[q.id].trim())
              const fausses = [q.reponse_fausse_1, q.reponse_fausse_2, q.reponse_fausse_3].filter(Boolean).join(' · ')
              return (
                <tr key={q.id} style={{ background: hasComment ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                  <td className="px-2 py-1.5 border-b border-app font-mono">{q.niveau}</td>
                  <td className="px-2 py-1.5 border-b border-app">{q.categorie}</td>
                  <td className="px-2 py-1.5 border-b border-app font-mono text-app-muted">{q.id}</td>
                  <td className="px-2 py-1.5 border-b border-app font-mono text-app-muted">{q.type}</td>
                  <td className="px-2 py-1.5 border-b border-app" style={{ minWidth: 240, maxWidth: 380 }}>{q.question}</td>
                  <td className="px-2 py-1.5 border-b border-app" style={{ color: '#22C55E' }}>{q.reponse_correcte}</td>
                  <td className="px-2 py-1.5 border-b border-app text-app-muted" style={{ maxWidth: 280 }}>{fausses}</td>
                  <td className="px-2 py-1.5 border-b border-app text-app-muted" style={{ maxWidth: 280 }}>{q.explication}</td>
                  <td className="px-2 py-1.5 border-b border-app" style={{ minWidth: 220 }}>
                    <textarea
                      value={comments[q.id] || ''}
                      onChange={e => setComment(q.id, e.target.value)}
                      placeholder="…"
                      rows={2}
                      className="w-full rounded-md px-2 py-1 text-xs border border-app outline-none"
                      style={{ background: 'var(--surface-2)', color: 'var(--text)', resize: 'vertical' }}
                    />
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={9} className="text-center text-app-muted py-6">Aucune question.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
