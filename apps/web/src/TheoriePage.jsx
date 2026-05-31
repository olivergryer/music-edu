import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggleInline } from './ThemeContext'
import useSwipe from './hooks/useSwipe'
import IntervalleStaff from './IntervalleStaff.jsx'
import TourGuide from './TourGuide'
import ConsigneOverlay, { consigneSeen } from './ConsigneOverlay'

const CATEGORIES = [
  { id: 'vocabulaire_musical',    label: 'Vocabulaire musical',    includes: ['vocabulaire_italien', 'vocabulaire_technique', 'notation_partition'] },
  { id: 'tonalites_alterations',  label: 'Tonalités & altérations', includes: ['tonalites_alterations'] },
  { id: 'intervalles',            label: 'Intervalles',            includes: ['intervalles'] },
  { id: 'rythme_mesure',          label: 'Rythme & mesure',        includes: ['rythme_mesure'] },
  { id: 'harmonie',               label: 'Harmonie',               includes: ['harmonie_accords', 'cadences'] },
  { id: 'culture_musicale',       label: 'Culture musicale',       includes: ['formes_musicales', 'histoire_styles', 'compositeurs'] },
]

const LEVELS = ['C1/1','C1/2','C1/3','C1/4','C2/1','C2/2','C2/3','C2/4','C3']

function normalizeText(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function checkAnswer(userInput, q) {
  const norm = normalizeText(userInput)
  if (norm === normalizeText(q.reponse_correcte)) return true
  if (q.reponses_acceptees) return q.reponses_acceptees.split('|').some(v => normalizeText(v) === norm)
  return false
}

function calculatePoints(correct, timedOut) {
  if (!correct) return 0
  return timedOut ? 0.5 : 1
}

function levelToInt(str) {
  const m = str.match(/^C(\d)(?:\/(\d))?$/)
  if (!m) return 99
  return parseInt(m[1]) * 10 + parseInt(m[2] ?? '0')
}

function catHasQuestions(questions, level, cat) {
  return questions.some(q => levelToInt(q.niveau) <= levelToInt(level) && cat.includes.includes(q.categorie))
}

function buildPool(questions, mode, level, selectedCatIds) {
  const activeFineCategories = selectedCatIds.length === 0
    ? null
    : CATEGORIES.filter(c => selectedCatIds.includes(c.id)).flatMap(c => c.includes)
  let pool = questions.filter(q => {
    const levelOk = levelToInt(q.niveau) <= levelToInt(level)
    const catOk = mode === 'examen' || activeFineCategories === null || activeFineCategories.includes(q.categorie)
    return levelOk && catOk
  })
  return shuffleArray(pool).slice(0, mode === 'examen' ? 40 : 10)
}

function getTimeLimit(q) {
  if (q.temps_limite) { const base = parseInt(q.temps_limite); return q.type === 'texte' ? base * 2 : base }
  return q.type === 'texte' ? 30 : 20
}

function getChoices(q) {
  if (q.type === 'vrai_faux') return ['Vrai', 'Faux']
  if (q.type === 'qcm' || q.type === 'qcm_image_question' || q.type === 'vexflow_intervalle') {
    return shuffleArray([q.reponse_correcte, q.reponse_fausse_1, q.reponse_fausse_2, q.reponse_fausse_3].filter(Boolean))
  }
  if (q.type === 'image_qcm') return [q.image_choix_1, q.image_choix_2, q.image_choix_3, q.image_choix_4].filter(Boolean)
  return []
}

function parseCSVRow(line) {
  const result = []; let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue }
    if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  result.push(cur.trim())
  return result
}

function parseTheorieCSV(csvText) {
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (lines.length < 2) throw new Error('CSV vide ou invalide')
  const headers = parseCSVRow(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCSVRow(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h.trim()] = vals[i] ?? '' })
    if (obj.temps_limite) obj.temps_limite = parseInt(obj.temps_limite) || 10
    return obj
  }).filter(q => q.id && q.question && q.reponse_correcte)
}

// ── Export template CSV (questions livrées + readme) ───────────────────────────
const CSV_COLUMNS = ['id', 'niveau', 'categorie', 'type', 'question', 'reponse_correcte', 'reponse_fausse_1', 'reponse_fausse_2', 'reponse_fausse_3', 'reponses_acceptees', 'temps_limite', 'explication']

function escapeCsv(val) {
  const s = val == null ? '' : String(val)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildTemplateCSV(questions) {
  const readme = [
    '# TEMPLATE QUESTIONS THÉORIE — Tessitura',
    '# Édite ce fichier dans Google Sheets ou Excel, puis ré-importe-le (.csv UTF-8).',
    '# Les lignes commençant par # sont ignorées à l\'import — supprime-les ou garde-les.',
    '#',
    '# COLONNES (ne pas renommer la ligne d\'en-tête ci-dessous) :',
    '#   id                 identifiant unique (ex: Q001). Même id qu\'une question livrée = remplace celle-ci.',
    '#   niveau             C1/1 C1/2 C1/3 C1/4 C2/1 C2/2 C2/3 C2/4 C3',
    '#   categorie          vocabulaire_italien vocabulaire_technique notation_partition tonalites_alterations',
    '#                      intervalles rythme_mesure harmonie_accords cadences formes_musicales histoire_styles compositeurs',
    '#   type               qcm | vrai_faux | texte',
    '#   question           énoncé affiché',
    '#   reponse_correcte   bonne réponse (vrai_faux : Vrai ou Faux)',
    '#   reponse_fausse_1/2/3  distracteurs — qcm uniquement, laisser vide sinon',
    '#   reponses_acceptees variantes acceptées (type texte), séparées par | — ex: do|ut',
    '#   temps_limite       secondes, vide = défaut (20s, texte 30s)',
    '#   explication        affichée après la réponse (optionnel)',
    '#',
    '# Un qcm a besoin de 4 choix : 1 correcte + 3 fausses.',
  ]
  const header = CSV_COLUMNS.join(',')
  const rows = questions
    .filter(q => ['qcm', 'vrai_faux', 'texte'].includes(q.type))
    .map(q => CSV_COLUMNS.map(c => escapeCsv(q[c])).join(','))
  return [...readme, header, ...rows].join('\n')
}

function downloadTemplateCSV(questions) {
  const csv = '﻿' + buildTemplateCSV(questions)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'questions-theorie-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Timer bar (animation via ref) ──────────────────────────────────────────────
function TimerBar({ limit, timedOut, revealed }) {
  const barRef = useRef()
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.transition = 'none'
    bar.style.width = '100%'
    void bar.getBoundingClientRect()
    bar.style.transition = `width ${limit}s linear`
    bar.style.width = '0%'
  }, [limit])
  useEffect(() => {
    if (timedOut && barRef.current) { barRef.current.style.transition = 'none'; barRef.current.style.width = '0%' }
  }, [timedOut])
  useEffect(() => {
    if (revealed && barRef.current) {
      const current = barRef.current.getBoundingClientRect().width
      const parent = barRef.current.parentElement.getBoundingClientRect().width
      const pct = parent > 0 ? (current / parent) * 100 : 0
      barRef.current.style.transition = 'none'
      barRef.current.style.width = `${pct}%`
    }
  }, [revealed])
  return (
    <div className="h-1.5 rounded-full mb-4 bg-surface-2 overflow-hidden">
      <div ref={barRef} className="h-full rounded-full" style={{ background: timedOut ? '#f87171' : '#8B5CF6' }} />
    </div>
  )
}

function QuestionImage({ src }) {
  if (!src) return null
  return <img src={src} alt="Question" className="max-w-full rounded-lg mb-4 block" />
}

function ChoiceQuestion({ q, choices, selected, onSelect, revealed }) {
  return (
    <div>
      {choices.map((c, i) => {
        const isSelected = selected === c
        const isCorrect = revealed && c === q.reponse_correcte
        const isWrong = revealed && isSelected && c !== q.reponse_correcte
        if (q.type === 'image_qcm') {
          return (
            <span
              key={i}
              onClick={() => !revealed && onSelect(c)}
              className="inline-block rounded-xl p-1 cursor-pointer border-2"
              style={{ borderColor: isCorrect ? '#22C55E' : isWrong ? '#f87171' : isSelected ? '#8B5CF6' : 'var(--border-c)', background: 'var(--surface-2)' }}
            >
              <img src={c} alt={`Choix ${i + 1}`} className="w-full rounded-md block" />
            </span>
          )
        }
        return (
          <button
            key={i}
            onClick={() => !revealed && onSelect(c)}
            className="w-full text-left rounded-xl px-4 py-3 mb-2.5 text-sm font-semibold border-2 transition-colors"
            style={{
              background: isCorrect ? '#064e3b' : isWrong ? '#450a0a' : isSelected ? '#1e1b4b' : 'var(--surface-2)',
              borderColor: isCorrect ? '#22C55E' : isWrong ? '#f87171' : isSelected ? '#8B5CF6' : 'var(--border-c)',
              color: isCorrect ? '#22C55E' : isWrong ? '#f87171' : 'var(--text)',
              cursor: revealed ? 'default' : 'pointer',
            }}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}

function TexteQuestion({ value, onChange, onSubmit, revealed, correct }) {
  return (
    <div>
      <input
        className="w-full rounded-xl px-4 py-3 text-sm text-app border-2 bg-surface-2 outline-none mb-2.5"
        style={{ borderColor: revealed ? (correct ? '#22C55E' : '#f87171') : 'var(--border-c)' }}
        value={value}
        onChange={e => { if (!revealed) onChange(e.target.value) }}
        onKeyDown={e => e.key === 'Enter' && !revealed && onSubmit()}
        placeholder="Ta réponse…"
        disabled={revealed}
        autoFocus
      />
      {!revealed && (
        <button className="rounded-xl px-5 py-2.5 text-sm font-bold text-white border-none" style={{ background: '#8B5CF6' }} onClick={onSubmit}>
          Valider
        </button>
      )}
    </div>
  )
}

// ── Accueil ────────────────────────────────────────────────────────────────────
// ── Tutorial ───────────────────────────────────────────────────────────────────
const THEORIE_TUTO_KEY = 'theorie_tuto_v1'
const THEORIE_LEVEL_KEY = 'theorie_level_v1'

function loadStoredLevel() {
  try { const v = localStorage.getItem(THEORIE_LEVEL_KEY); return LEVELS.includes(v) ? v : 'C1/2' } catch { return 'C1/2' }
}
const TUTO_TOTAL = 4
const T_ACC = '#8B5CF6'
const CAT_COLORS = ['#8B5CF6','#7C3AED','#A78BFA','#6D28D9','#C4B5FD','#DDD6FE']

function TheorieTutorial({ onDone }) {
  const [slide, setSlide]       = useState(0)
  const [level, setLevel]       = useState(loadStoredLevel)
  const [cats, setCats]         = useState([])
  useEffect(() => { try { localStorage.setItem(THEORIE_LEVEL_KEY, level) } catch {} }, [level])
  const [selMode, setSelMode]   = useState('entrainement')
  const swipe = useSwipe({
    onSwipeLeft:  () => setSlide(s => Math.min(s + 1, TUTO_TOTAL - 1)),
    onSwipeRight: () => setSlide(s => Math.max(s - 1, 0)),
  })

  function toggleCat(id) {
    setCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function renderVisual() {
    if (slide === 0) {
      return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:280 }}>
          {CATEGORIES.map((cat, i) => (
            <div key={cat.id} style={{ background:'rgba(139,92,246,0.1)', border:'2px solid rgba(139,92,246,0.3)', borderRadius:14, padding:'14px 10px', textAlign:'center' }}>
              <div style={{ width:10, height:10, borderRadius:5, background:CAT_COLORS[i], margin:'0 auto 8px' }} />
              <div style={{ fontSize:10, fontWeight:700, color:T_ACC, lineHeight:1.3 }}>{cat.label}</div>
            </div>
          ))}
        </div>
      )
    }
    if (slide === 1) {
      return (
        <div style={{ width:280 }}>
          <div style={{ fontSize:11, color:T_ACC, fontWeight:700, marginBottom:12, textAlign:'center' }}>Sélectionne ton niveau</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
            {LEVELS.map(l => {
              const sel = level === l
              return (
                <button key={l} onClick={() => setLevel(l)} style={{
                  padding:'8px 14px', borderRadius:20, border:'none', cursor:'pointer',
                  background: sel ? T_ACC : 'rgba(139,92,246,0.12)',
                  color: sel ? '#fff' : T_ACC,
                  fontSize:12, fontWeight:700, transition:'all 0.15s',
                  boxShadow: sel ? '0 4px 12px rgba(139,92,246,0.4)' : 'none',
                }}>{l}</button>
              )
            })}
          </div>
          <div style={{ fontSize:10, color:'#6b7280', marginTop:12, textAlign:'center' }}>Inclut toutes les questions jusqu'au niveau sélectionné.</div>
        </div>
      )
    }
    if (slide === 2) {
      return (
        <div style={{ width:280 }}>
          <div style={{ fontSize:11, color:T_ACC, fontWeight:700, marginBottom:12, textAlign:'center' }}>Catégories <span style={{ fontWeight:400, color:'var(--text-muted)' }}>(vide = toutes)</span></div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
            {CATEGORIES.map((c, i) => {
              const active = cats.includes(c.id)
              return (
                <button key={c.id} onClick={() => toggleCat(c.id)} style={{
                  padding:'8px 14px', borderRadius:20,
                  border:`2px solid ${active ? CAT_COLORS[i] : 'rgba(139,92,246,0.25)'}`,
                  background: active ? `${CAT_COLORS[i]}22` : 'var(--surface-2)',
                  color: active ? CAT_COLORS[i] : 'var(--text-muted)',
                  fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
                }}>{c.label}</button>
              )
            })}
          </div>
        </div>
      )
    }
    if (slide === 3) {
      const modes = [
        { id:'entrainement', label:'Entraînement', desc:'10 questions · catégories au choix · feedback immédiat' },
        { id:'examen',       label:'Code de la route musicale', desc:'40 questions · toutes catégories · seuil 35/40' },
      ]
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:10, width:280 }}>
          {modes.map(m => {
            const sel = selMode === m.id
            return (
              <div key={m.id} role="button" onClick={() => setSelMode(m.id)} style={{
                borderRadius:16, padding:'16px 18px', cursor:'pointer',
                background: sel ? 'rgba(139,92,246,0.18)' : 'var(--surface-2)',
                border:`2px solid ${sel ? T_ACC : 'var(--border-c)'}`,
                transition:'all 0.15s',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:800, color: sel ? T_ACC : 'var(--text-muted)' }}>{m.label}</span>
                  {sel && <div style={{ width:10, height:10, borderRadius:5, background:T_ACC }}/>}
                </div>
                <div style={{ fontSize:11, color: sel ? T_ACC : 'var(--text-muted)', lineHeight:1.4 }}>{m.desc}</div>
              </div>
            )
          })}
        </div>
      )
    }
  }

  const SLIDES = [
    { title:'Bienvenue dans Théorie !', body:'Quiz de théorie musicale — intervalles, tonalités, rythme, harmonie et plus. Progresse à ton rythme, du débutant au niveau avancé.' },
    { title:'Choisis ton niveau',       body:'Sélectionne le niveau jusqu\'auquel les questions seront incluses. Tu pourras changer à tout moment.' },
    { title:'Choisis tes catégories',   body:'Concentre-toi sur les thèmes qui t\'intéressent. Laisse vide pour tout inclure.' },
    { title:'Choisis ton mode',         body:'Entraînement pour un feedback immédiat. Code de la route musicale pour simuler une vraie évaluation.' },
  ]

  const { title, body } = SLIDES[slide]

  return (
    <div {...swipe} style={{
      position:'fixed', inset:0, zIndex:100,
      background:'var(--bg)', color:'var(--text)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between',
      padding:'24px 20px 80px', overflowY:'auto',
    }}>
      {/* Dots + Ignorer */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ display:'flex', gap:6 }}>
          {Array.from({ length: TUTO_TOTAL }).map((_, i) => (
            <div key={i} style={{
              width: i===slide ? 20 : 7, height:7, borderRadius:4,
              background: i <= slide ? T_ACC : 'var(--border-c)',
              transition:'width 0.25s, background 0.25s',
            }}/>
          ))}
        </div>
        <button onClick={() => onDone(null)} style={{ background:'none', border:'none', color:'#6b7280', fontSize:13, fontWeight:700, cursor:'pointer', padding:'4px 8px' }}>
          Ignorer
        </button>
      </div>

      {/* Visual */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 0' }}>
        {renderVisual()}
      </div>

      {/* Text */}
      <div style={{ width:'100%', maxWidth:400, textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'var(--text)', marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:14, fontWeight:500, color:'var(--text-muted)', lineHeight:1.6 }}>{body}</div>
      </div>

      {/* Navigation */}
      <div style={{ width:'100%', maxWidth:400, display:'flex', gap:10 }}>
        {slide > 0 && (
          <button onClick={() => setSlide(s => s - 1)} style={{ flex:1, padding:'14px 0', borderRadius:16, border:`2px solid rgba(139,92,246,0.3)`, background:'none', color:T_ACC, fontSize:14, fontWeight:700, cursor:'pointer' }}>
            ← Précédent
          </button>
        )}
        <button
          onClick={() => slide < TUTO_TOTAL - 1 ? setSlide(s => s + 1) : onDone({ level, cats, mode: selMode })}
          style={{ flex:2, padding:'14px 0', borderRadius:16, border:'none', background:'linear-gradient(135deg,#7C3AED,#8B5CF6)', color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer', boxShadow:'0 8px 24px rgba(139,92,246,0.35)' }}
        >
          {slide < TUTO_TOTAL - 1 ? 'Suivant →' : '▶ Commencer !'}
        </button>
      </div>
    </div>
  )
}

function HelpModalTheorie({ onTuto, onTour, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200 }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        zIndex:201, width:'min(320px, 90vw)',
        background:'var(--surface)', border:'1.5px solid rgba(139,92,246,0.3)',
        borderRadius:20, padding:'28px 24px', textAlign:'center',
      }}>
        <div style={{ fontSize:18, fontWeight:900, color:'var(--text)', marginBottom:6 }}>Aide</div>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:24 }}>Comment puis-je t'aider ?</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={onTuto} style={{ padding:'14px 0', borderRadius:14, border:'none', background:'linear-gradient(135deg,#7C3AED,#8B5CF6)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }}>
            ▶ Relancer le tutoriel
          </button>
          <button onClick={onTour} style={{ padding:'14px 0', borderRadius:14, border:'2px solid rgba(139,92,246,0.35)', background:'none', color:T_ACC, fontSize:14, fontWeight:800, cursor:'pointer' }}>
            Bulles explicatives
          </button>
        </div>
        <button onClick={onClose} style={{ marginTop:16, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>Fermer</button>
      </div>
    </>
  )
}

// ── Page de préparation (page unique) ───────────────────────────────────────────
function SetupScreen({ questions, onStart, onLoadCSV, csvCount, templateQuestions }) {
  const [level, setLevel] = useState(loadStoredLevel)
  const [cats, setCats] = useState([])
  useEffect(() => { try { localStorage.setItem(THEORIE_LEVEL_KEY, level) } catch {} }, [level])
  const fileRef = useRef()
  const availableCats = useMemo(
    () => new Set(CATEGORIES.filter(cat => catHasQuestions(questions, level, cat)).map(c => c.id)),
    [questions, level]
  )
  useEffect(() => { setCats(prev => prev.filter(id => availableCats.has(id))) }, [availableCats])
  function toggleCat(id) {
    if (!availableCats.has(id)) return
    setCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }
  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try { onLoadCSV(parseTheorieCSV(ev.target.result)) } catch (err) { alert('Erreur CSV : ' + err.message) }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }
  return (
    <div>
      <h2 className="text-xl font-black mb-1" style={{ color: '#8B5CF6' }}>Théorie</h2>
      <p className="text-sm text-app-muted mb-5">Quiz de théorie musicale</p>

      {/* Niveau */}
      <div className="bg-surface border border-app rounded-2xl p-5 mb-4" data-tour="niveau-select">
        <div className="text-xs font-bold mb-3" style={{ color: '#8B5CF6' }}>Niveau</div>
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className="rounded-full px-3.5 py-1.5 text-xs font-bold border-none transition-colors"
              style={{
                background: level === l ? '#8B5CF6' : 'var(--surface-2)',
                color: level === l ? '#fff' : 'var(--text-muted)',
              }}
            >{l}</button>
          ))}
        </div>
        <div className="text-[11px] text-app-muted mt-2">Inclut toutes les questions jusqu'au niveau sélectionné.</div>
      </div>

      {/* Catégories */}
      <div className="bg-surface border border-app rounded-2xl p-5 mb-4" data-tour="cats-select">
        <div className="text-xs font-bold mb-3" style={{ color: '#8B5CF6' }}>
          Catégories <span className="font-normal text-app-muted">(vide = toutes)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => {
            const disabled = !availableCats.has(c.id)
            const active = cats.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold border-2 transition-colors"
                style={{
                  background: active ? '#3b0764' : 'var(--surface-2)',
                  borderColor: active ? '#8B5CF6' : 'var(--border-c)',
                  color: active ? '#8B5CF6' : disabled ? 'var(--border-c)' : 'var(--text-muted)',
                  opacity: disabled ? 0.35 : 1,
                  cursor: disabled ? 'default' : 'pointer',
                }}
              >{c.label}</button>
            )
          })}
        </div>
        <div className="text-[11px] text-app-muted mt-2">Grisées = pas encore de questions à ce niveau. Catégories appliquées en Entraînement ; le Code de la route musicale couvre tout.</div>
      </div>

      {/* Choix du mode = lancement */}
      <div className="grid grid-cols-2 gap-3" data-tour="mode-cards">
        <button
          onClick={() => onStart('entrainement', level, cats)}
          className="rounded-2xl p-4 text-left border-2 transition-colors"
          style={{ background: 'var(--surface)', borderColor: '#8B5CF6' }}
        >
          <div className="text-sm font-extrabold mb-1" style={{ color: '#8B5CF6' }}>Entraînement →</div>
          <div className="text-[11px] text-app-muted leading-snug">10 questions · feedback immédiat</div>
        </button>
        <button
          onClick={() => onStart('examen', level, cats)}
          className="rounded-2xl p-4 text-left border-2 transition-colors"
          style={{ background: '#8B5CF6', borderColor: '#8B5CF6' }}
        >
          <div className="text-sm font-extrabold mb-1 text-white leading-tight">Code de la route musicale →</div>
          <div className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.85)' }}>40 questions · seuil 35/40</div>
        </button>
      </div>

      {/* Import (discret, bas de page) */}
      <div className="mt-10 pt-4 border-t border-app">
        <div className="text-[11px] text-app-muted leading-relaxed mb-2">
          Enseignant ? Tu peux créer tes propres questions : télécharge le modèle, édite-le dans un tableur, puis ré-importe-le (.csv UTF-8).
          {csvCount > 0 && <span className="ml-1 text-success">✓ {csvCount} importée{csvCount > 1 ? 's' : ''}</span>}
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <div className="flex flex-wrap gap-3 text-[11px] font-bold">
          <button
            className="underline disabled:opacity-40 disabled:no-underline"
            style={{ color: '#8B5CF6', background: 'none', border: 'none', padding: 0 }}
            disabled={!templateQuestions?.length}
            onClick={() => downloadTemplateCSV(templateQuestions)}
          >
            ↓ Télécharger le modèle
          </button>
          <button
            className="underline text-app-muted"
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={() => fileRef.current.click()}
          >
            Importer un fichier
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Quiz ───────────────────────────────────────────────────────────────────────
function QuizScreen({ session, mode, onAnswer, onNext }) {
  const { pool, currentIdx, answers } = session
  const q = pool[currentIdx]
  const limit = getTimeLimit(q)
  const [choices] = useState(() => getChoices(q))
  const [timeLeft, setTimeLeft] = useState(limit)
  const [selected, setSelected] = useState(null)
  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef('')
  const [revealed, setRevealed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const timerRef = useRef(null)
  const revealedRef = useRef(false)

  const submitAnswer = useCallback((answer) => {
    if (revealedRef.current) return
    clearInterval(timerRef.current)
    revealedRef.current = true
    const correct = answer != null ? checkAnswer(answer, q) : false
    const pts = calculatePoints(correct, timedOut)
    onAnswer({ question: q, userAnswer: answer ?? '', correct, points: pts })
    setRevealed(true)
  }, [q, timedOut, onAnswer])

  useEffect(() => {
    revealedRef.current = false
    setTimeLeft(limit); setSelected(null); setTextInput(''); textInputRef.current = ''; setRevealed(false); setTimedOut(false)
  }, [currentIdx, limit])

  useEffect(() => {
    if (revealed) return
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (revealedRef.current) { clearInterval(timerRef.current); return }
      setTimeLeft(prev => { if (prev <= 1) { clearInterval(timerRef.current); setTimedOut(true); return 0 } return prev - 1 })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [currentIdx, revealed])

  const isCorrect = revealed && answers[answers.length - 1]?.correct
  const showFeedback = revealed && mode === 'entrainement'
  const isLast = currentIdx === pool.length - 1
  const catLabel = CATEGORIES.find(c => c.includes.includes(q.categorie))?.label ?? q.categorie

  const pointerDownY = useRef(null)
  function handlePointerDown(e) {
    if (!revealed) return
    pointerDownY.current = e.clientY
  }
  function handlePointerUp(e) {
    if (!revealed || pointerDownY.current === null) return
    if (Math.abs(e.clientY - pointerDownY.current) < 8) onNext()
    pointerDownY.current = null
  }

  return (
    <div onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-app-muted">Question {currentIdx + 1} / {pool.length}</span>
        <span className="text-xs font-bold" style={{ color: timedOut ? '#f87171' : timeLeft <= 3 ? '#fbbf24' : 'var(--text-muted)' }}>
          {timedOut ? 'Hors délai' : `${timeLeft}s`}
        </span>
      </div>
      <TimerBar limit={limit} timedOut={timedOut} revealed={revealed} />

      {timedOut && !revealed && (
        <div className="text-xs text-red-400 text-center mb-2.5">Temps écoulé — réponds quand même pour 0,5 pt</div>
      )}

      <div className="bg-surface border border-app rounded-2xl p-6 mb-3" data-tour="quiz-question">
        <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#8B5CF6' }}>{catLabel}</div>
        {q.type === 'qcm_image_question' && <QuestionImage src={q.image_question} />}
        <div className="text-base font-bold text-app mb-5 leading-relaxed">{q.question}</div>

        {(q.type === 'qcm' || q.type === 'vrai_faux' || q.type === 'image_qcm' || q.type === 'qcm_image_question' || q.type === 'vexflow_intervalle') && (
          <ChoiceQuestion q={q} choices={choices} selected={selected} onSelect={c => { setSelected(c); submitAnswer(c) }} revealed={revealed} />
        )}
        {q.type === 'vexflow_intervalle' && q.vexflow_notes && <IntervalleStaff notes={q.vexflow_notes} />}
        {q.type === 'texte' && (
          <TexteQuestion
            value={textInput}
            onChange={val => { setTextInput(val); textInputRef.current = val }}
            onSubmit={() => submitAnswer(textInput.trim() || null)}
            revealed={revealed}
            correct={isCorrect}
          />
        )}

        {timedOut && !revealed && (
          <button
            className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-app border border-app bg-surface-2 mt-3"
            onClick={() => submitAnswer(null)}
          >
            Passer sans répondre →
          </button>
        )}

        {showFeedback && (
          <div
            className="rounded-xl p-4 mt-3 text-sm border-2"
            style={{
              background: isCorrect ? '#064e3b' : '#450a0a',
              borderColor: isCorrect ? '#22C55E' : '#f87171',
              color: isCorrect ? '#22C55E' : '#f87171',
            }}
          >
            <div className="font-extrabold mb-1">
              {isCorrect ? (timedOut ? '✓ Correct — hors délai (0,5 pt)' : '✓ Correct !') : '✗ Incorrect'}
            </div>
            {!isCorrect && answers[answers.length - 1]?.userAnswer === '' && <div className="text-sm mb-1">Pas de réponse</div>}
            {!isCorrect && answers[answers.length - 1]?.userAnswer !== '' && (
              <div className="text-sm mb-1">Bonne réponse : <strong>{q.reponse_correcte}</strong></div>
            )}
            {q.explication && (
              <div className="text-xs leading-relaxed mt-1" style={{ color: isCorrect ? '#6ee7b7' : '#fca5a5' }}>
                {q.explication}
              </div>
            )}
          </div>
        )}

        {revealed && (
          <button
            className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white border-none mt-4"
            style={{ background: '#8B5CF6' }}
            onClick={onNext}
            onPointerDown={e => e.stopPropagation()}
          >
            {isLast ? 'Voir les résultats →' : 'Suivant →'}
          </button>
        )}
      </div>

      {mode === 'entrainement' && answers.length > 0 && (
        <div className="text-right text-xs text-app-muted">
          Score : {answers.reduce((s, a) => s + a.points, 0).toFixed(1)} / {answers.length}
        </div>
      )}
    </div>
  )
}

// ── Résultats ──────────────────────────────────────────────────────────────────
function ResultScreen({ session, mode, onReplay }) {
  const { answers, pool } = session
  const totalPts = answers.reduce((s, a) => s + a.points, 0)
  const maxPts = pool.length
  const pct = maxPts > 0 ? totalPts / maxPts : 0
  const passed = mode === 'examen' ? totalPts >= 35 : null
  const errors = answers.filter(a => !a.correct)
  const barColor = pct >= 0.9 ? '#22C55E' : pct >= 0.7 ? '#fbbf24' : '#f87171'

  return (
    <div>
      <h2 className="text-xl font-black mb-4" style={{ color: '#8B5CF6' }}>Résultats</h2>
      <div className="bg-surface border border-app rounded-2xl p-6 mb-4">
        {mode === 'examen' && (
          <div className="text-2xl font-black mb-2" style={{ color: passed ? '#22C55E' : '#f87171' }}>
            {passed ? '✓ Reçu' : '✗ Échoué'}
          </div>
        )}
        <div className="text-4xl font-black mb-1" style={{ color: '#8B5CF6' }}>
          {totalPts % 1 === 0 ? totalPts : totalPts.toFixed(1)}
          <span className="text-lg text-app-muted"> / {maxPts}</span>
        </div>
        <div className="bg-surface-2 rounded-full h-2 mb-4 overflow-hidden">
          <div className="h-full rounded-full" style={{ background: barColor, width: `${pct * 100}%` }} />
        </div>
        {mode === 'entrainement' && (
          <div className="text-sm text-app-muted">
            {pct >= 0.9 ? 'Excellent !' : pct >= 0.7 ? 'Bien, continue !' : 'Entraîne-toi encore !'}
          </div>
        )}
        {mode === 'examen' && !passed && (
          <div className="text-sm mt-1" style={{ color: '#fca5a5' }}>
            Seuil de passage : 35/40. Il te manque {(35 - totalPts).toFixed(1)} point{35 - totalPts > 1 ? 's' : ''}.
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-bold text-red-400 mb-3">{errors.length} erreur{errors.length > 1 ? 's' : ''}</div>
          {errors.map((a, i) => {
            const catLabel = CATEGORIES.find(c => c.includes.includes(a.question.categorie))?.label ?? a.question.categorie
            return (
              <div key={i} className="bg-surface rounded-xl p-4 mb-2.5 border-2 border-red-900">
                <div className="text-xs font-bold mb-1.5" style={{ color: '#8B5CF6' }}>{catLabel}</div>
                <div className="text-sm text-app mb-1.5 leading-relaxed">{a.question.question}</div>
                {a.userAnswer && <div className="text-xs text-red-400">Ta réponse : {a.userAnswer}</div>}
                <div className="text-xs font-bold text-success">Bonne réponse : {a.question.reponse_correcte}</div>
              </div>
            )
          })}
        </div>
      )}

      <button className="w-full rounded-xl py-3.5 text-base font-bold text-white border-none" style={{ background: '#8B5CF6' }} onClick={onReplay}>
        Rejouer
      </button>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function TheoriePage() {
  const [screen, setScreen] = useState('setup')
  const [mode, setMode] = useState(null)
  const [allQuestions, setAllQuestions] = useState([])
  const [csvQuestions, setCsvQuestions] = useState([])
  const [session, setSession] = useState(null)
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return !localStorage.getItem(THEORIE_TUTO_KEY) } catch { return false }
  })
  const [showHelp, setShowHelp] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showConsigne, setShowConsigne] = useState(false) // overlay consigne avant quiz

  useEffect(() => {
    fetch('/data/questions.json').then(r => r.json()).then(setAllQuestions).catch(() => setAllQuestions([]))
  }, [])

  const mergedQuestions = useMemo(() => {
    const csvIds = new Set(csvQuestions.map(q => q.id))
    return [...allQuestions.filter(q => !csvIds.has(q.id)), ...csvQuestions]
  }, [allQuestions, csvQuestions])

  function handleStart(m, level, categories) {
    const pool = buildPool(mergedQuestions, m, level, categories)
    if (pool.length === 0) { alert('Aucune question ne correspond à cette sélection. Élargis le niveau ou les catégories.'); return }
    setMode(m)
    setSession({ pool, currentIdx: 0, answers: [] })
    // Consigne d'arrivée (1ʳᵉ fois / non masquée) avant de lancer le quiz
    if (consigneSeen('theorie')) setScreen('quiz')
    else setShowConsigne(true)
  }

  function handleTutorialDone(selections) {
    try { localStorage.setItem(THEORIE_TUTO_KEY, '1') } catch {}
    setShowTutorial(false)
    if (!selections) return
    const { level, cats, mode: m } = selections
    const pool = buildPool(mergedQuestions, m, level, cats)
    if (pool.length === 0) { setMode(m); setScreen('setup'); return }
    setMode(m)
    setSession({ pool, currentIdx: 0, answers: [] })
    setScreen('quiz')
  }

  const THEORIE_TOUR_STEPS = [
    { tourId:'niveau-select', title:'Niveau',          desc:'Choisis le niveau maximum des questions incluses, du débutant (C1/1) au niveau avancé (C3).' },
    { tourId:'cats-select',   title:'Catégories',      desc:'Concentre-toi sur un thème précis ou laisse vide pour inclure toutes les catégories.' },
    { tourId:'mode-cards',    title:'Lancer',          desc:'Entraînement pour un feedback immédiat après chaque réponse. Code de la route musicale pour simuler une vraie évaluation avec seuil 35/40.' },
    { tourId:'quiz-question', title:'Question',        desc:'20 secondes par question. Répondre dans les temps donne 1 pt, hors délai 0,5 pt.' },
  ]

  function handleAnswer(result) { setSession(prev => ({ ...prev, answers: [...prev.answers, result] })) }
  function handleNext() {
    const isLast = session.currentIdx + 1 >= session.pool.length
    if (isLast) setScreen('result')
    else setSession(prev => ({ ...prev, currentIdx: prev.currentIdx + 1 }))
  }

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-5 py-5">
      <div className="w-full max-w-xl">
        <div className="flex justify-between items-center mb-4">
          <Link to="/" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app hover:bg-surface-2 transition-colors">
            ← Tessitura
          </Link>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <ThemeToggleInline />
            <button
              onClick={() => setShowHelp(true)}
              title="Aide"
              className="bg-surface border border-app rounded-lg cursor-pointer flex items-center justify-center"
              style={{ width:32, height:32, fontWeight:700, fontSize:15, color:'var(--text-muted)' }}
            >?</button>
            {screen !== 'setup' && (
              <button
                onClick={() => { setScreen('setup'); setMode(null); setSession(null) }}
                className="bg-transparent border-none cursor-pointer text-app-muted p-1.5 flex items-center"
                title="Retour aux réglages"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {showTutorial && <TheorieTutorial onDone={handleTutorialDone} />}
        {screen === 'setup' && !showTutorial && <SetupScreen questions={mergedQuestions} onStart={handleStart} onLoadCSV={setCsvQuestions} csvCount={csvQuestions.length} templateQuestions={allQuestions} />}
        {screen === 'quiz' && session && <QuizScreen key={session.currentIdx} session={session} mode={mode} onAnswer={handleAnswer} onNext={handleNext} />}
        {screen === 'result' && session && <ResultScreen session={session} mode={mode} onReplay={() => { setSession(null); setMode(null); setScreen('setup') }} />}
        {showHelp && (
          <HelpModalTheorie
            onTuto={() => { setShowHelp(false); setScreen('setup'); setMode(null); setSession(null); setShowTutorial(true) }}
            onTour={() => { setShowHelp(false); setShowTour(true) }}
            onClose={() => setShowHelp(false)}
          />
        )}
        {showTour && <TourGuide steps={THEORIE_TOUR_STEPS} onDone={() => setShowTour(false)} />}
        {showConsigne && (
          <ConsigneOverlay
            storageKey="theorie"
            icon="🎯"
            title={mode === 'examen' ? "Code de la route musicale" : "Mode Entraînement"}
            lines={[
              "Réponds aux questions de théorie musicale.",
              mode === 'examen'
                ? "40 questions, seuil de réussite 35/40."
                : "Feedback immédiat après chaque réponse.",
              "20 secondes par question : à temps = 1 pt, hors délai = 0,5 pt.",
            ]}
            startLabel="Commencer le quiz"
            onStart={() => { setShowConsigne(false); setScreen('quiz') }}
            onClose={() => setShowConsigne(false)}
          />
        )}
      </div>
    </div>
  )
}
