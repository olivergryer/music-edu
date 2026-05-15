import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import IntervalleStaff from './IntervalleStaff.jsx'

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
const TUTO_TOTAL = 4

const CAT_COLORS = ['#8B5CF6','#7C3AED','#A78BFA','#6D28D9','#C4B5FD','#DDD6FE']

function TheorieTutorial({ onDone }) {
  const [slide, setSlide] = useState(0)
  const [selectedMode, setSelectedMode] = useState('entrainement')

  const SLIDES = [
    { title: 'Bienvenue dans Théorie !', body: 'Quiz de théorie musicale — intervalles, tonalités, rythme, harmonie et plus. Progresse à ton rythme, du débutant au niveau avancé.' },
    { title: '4 types de questions',     body: 'QCM classique, vrai ou faux, réponse libre, ou identification d\'un intervalle sur portée.' },
    { title: 'Réponds vite !',           body: '20 secondes par question. Répondre hors délai donne 0,5 point au lieu de 1 — mais tu peux toujours répondre !' },
    { title: 'Quel mode ?',              body: 'Choisis ton mode de départ. Tu pourras en changer à tout moment depuis l\'accueil.' },
  ]

  function renderVisual() {
    if (slide === 0) {
      return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:280 }}>
          {CATEGORIES.map((cat, i) => (
            <div key={cat.id} style={{ background:'rgba(139,92,246,0.1)', border:'2px solid rgba(139,92,246,0.3)', borderRadius:14, padding:'14px 10px', textAlign:'center' }}>
              <div style={{ width:10, height:10, borderRadius:5, background:CAT_COLORS[i], margin:'0 auto 8px' }} />
              <div style={{ fontSize:10, fontWeight:700, color:'#c4b5fd', lineHeight:1.3 }}>{cat.label}</div>
            </div>
          ))}
        </div>
      )
    }

    if (slide === 1) {
      const types = [
        {
          label: 'QCM', sub: '4 propositions',
          icon: (
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              {[8,16,24,32].map((y,i) => (
                <g key={y}>
                  <circle cx="8" cy={y} r="4" stroke="#8B5CF6" strokeWidth="1.5" fill={i===1?'#8B5CF6':'none'}/>
                  <line x1="16" y1={y} x2="32" y2={y} stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                </g>
              ))}
            </svg>
          ),
        },
        {
          label: 'Vrai / Faux', sub: '2 choix',
          icon: (
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="2" y="4" width="14" height="28" rx="4" fill="rgba(52,211,153,0.15)" stroke="#34d399" strokeWidth="1.5"/>
              <text x="9" y="22" textAnchor="middle" fontSize="13" fontWeight="900" fill="#34d399">V</text>
              <rect x="20" y="4" width="14" height="28" rx="4" fill="rgba(248,113,113,0.15)" stroke="#f87171" strokeWidth="1.5"/>
              <text x="27" y="22" textAnchor="middle" fontSize="13" fontWeight="900" fill="#f87171">F</text>
            </svg>
          ),
        },
        {
          label: 'Texte libre', sub: 'Tape ta réponse',
          icon: (
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="2" y="8" width="32" height="20" rx="4" stroke="#8B5CF6" strokeWidth="1.5" fill="none"/>
              <line x1="8" y1="18" x2="22" y2="18" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="22" y1="14" x2="22" y2="22" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ),
        },
        {
          label: 'Portée', sub: 'Identifie l\'intervalle',
          icon: (
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              {[10,15,20,25,30].map(y => <line key={y} x1="2" y1={y} x2="34" y2={y} stroke="#9ca3af" strokeWidth="0.8"/>)}
              <ellipse cx="16" cy="25" rx="4" ry="2.8" fill="#8B5CF6" transform="rotate(-15 16 25)"/>
              <line x1="19.5" y1="24" x2="19.5" y2="12" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
              <ellipse cx="26" cy="20" rx="4" ry="2.8" fill="#8B5CF6" transform="rotate(-15 26 20)"/>
              <line x1="29.5" y1="19" x2="29.5" y2="7" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ),
        },
      ]
      return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:280 }}>
          {types.map(t => (
            <div key={t.label} style={{ background:'rgba(139,92,246,0.08)', border:'2px solid rgba(139,92,246,0.25)', borderRadius:14, padding:'16px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              {t.icon}
              <div style={{ fontSize:11, fontWeight:800, color:'#c4b5fd', textAlign:'center' }}>{t.label}</div>
              <div style={{ fontSize:10, color:'#9ca3af', textAlign:'center', lineHeight:1.3 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )
    }

    if (slide === 2) {
      return (
        <div style={{ width:280, display:'flex', flexDirection:'column', gap:16, alignItems:'center' }}>
          <div style={{ width:'100%', background:'rgba(139,92,246,0.12)', borderRadius:12, padding:'20px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#c4b5fd' }}>Temps restant</span>
              <span style={{ fontSize:13, fontWeight:700, color:'#c4b5fd' }}>20s</span>
            </div>
            <div style={{ height:6, borderRadius:3, background:'rgba(139,92,246,0.2)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:'65%', borderRadius:3, background:'#8B5CF6' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, width:'100%' }}>
            <div style={{ flex:1, background:'rgba(52,211,153,0.1)', border:'2px solid rgba(52,211,153,0.3)', borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:900, color:'#34d399' }}>1 pt</div>
              <div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>Dans les temps</div>
            </div>
            <div style={{ flex:1, background:'rgba(251,191,36,0.1)', border:'2px solid rgba(251,191,36,0.3)', borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:900, color:'#fbbf24' }}>½ pt</div>
              <div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>Hors délai</div>
            </div>
          </div>
        </div>
      )
    }

    if (slide === 3) {
      const modes = [
        { id:'entrainement', label:'Entraînement', desc:'10 questions · catégories au choix · feedback immédiat' },
        { id:'examen',       label:'Examen',        desc:'40 questions · toutes catégories · seuil 35/40' },
      ]
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:10, width:280 }}>
          {modes.map(m => {
            const sel = selectedMode === m.id
            return (
              <div key={m.id} role="button" onClick={() => setSelectedMode(m.id)} style={{
                borderRadius:16, padding:'16px 18px', cursor:'pointer',
                background: sel ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                border:`2px solid ${sel ? '#8B5CF6' : 'rgba(255,255,255,0.08)'}`,
                transition:'all 0.15s',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:800, color: sel ? '#c4b5fd' : '#6b7280' }}>{m.label}</span>
                  {sel && <div style={{ width:10, height:10, borderRadius:5, background:'#8B5CF6' }}/>}
                </div>
                <div style={{ fontSize:11, color: sel ? '#a78bfa' : '#6b7280', lineHeight:1.4 }}>{m.desc}</div>
              </div>
            )
          })}
        </div>
      )
    }
  }

  const { title, body } = SLIDES[slide]
  const ACC = '#8B5CF6'

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      background:'#030712', color:'#f9fafb',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between',
      padding:'24px 20px 80px', overflowY:'auto',
    }}>
      {/* Dots + Ignorer */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ display:'flex', gap:6 }}>
          {Array.from({ length: TUTO_TOTAL }).map((_, i) => (
            <div key={i} style={{
              width: i===slide ? 20 : 7, height:7, borderRadius:4,
              background: i <= slide ? ACC : 'rgba(255,255,255,0.1)',
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
        <div style={{ fontSize:22, fontWeight:900, color:'#f9fafb', marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:14, fontWeight:500, color:'#d1d5db', lineHeight:1.6 }}>{body}</div>
      </div>

      {/* Navigation */}
      <div style={{ width:'100%', maxWidth:400, display:'flex', gap:10 }}>
        {slide > 0 && (
          <button onClick={() => setSlide(s => s - 1)} style={{ flex:1, padding:'14px 0', borderRadius:16, border:`2px solid rgba(139,92,246,0.3)`, background:'none', color:ACC, fontSize:14, fontWeight:700, cursor:'pointer' }}>
            ← Précédent
          </button>
        )}
        <button
          onClick={() => slide < TUTO_TOTAL - 1 ? setSlide(s => s + 1) : onDone(selectedMode)}
          style={{ flex:2, padding:'14px 0', borderRadius:16, border:'none', background:'linear-gradient(135deg,#7C3AED,#8B5CF6)', color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer', boxShadow:'0 8px 24px rgba(139,92,246,0.35)' }}
        >
          {slide < TUTO_TOTAL - 1 ? 'Suivant →' : '▶ Commencer !'}
        </button>
      </div>
    </div>
  )
}

function HomeScreen({ onMode, onLoadCSV, csvCount }) {
  const fileRef = useRef()
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
  const cardCls = "bg-surface border border-app rounded-2xl p-6 mb-4"
  return (
    <div>
      <h2 className="text-xl font-black mb-1" style={{ color: '#8B5CF6' }}>Théorie</h2>
      <p className="text-sm text-app-muted mb-6">Quiz de théorie musicale</p>
      {[
        { mode: 'entrainement', label: 'Entraînement', desc: '10 questions · catégories au choix · feedback immédiat après chaque réponse' },
        { mode: 'examen', label: 'Examen', desc: '40 questions · toutes catégories · seuil de passage 35/40 · pas de feedback pendant le test' },
      ].map(({ mode, label, desc }) => (
        <div key={mode} className={cardCls}>
          <div className="text-base font-extrabold mb-2" style={{ color: '#8B5CF6' }}>{label}</div>
          <div className="text-xs text-app-muted mb-4 leading-relaxed">{desc}</div>
          <button className="rounded-xl px-5 py-2.5 text-sm font-bold text-white border-none" style={{ background: '#8B5CF6' }} onClick={() => onMode(mode)}>
            Commencer →
          </button>
        </div>
      ))}
      <div className="bg-surface border border-app rounded-2xl p-5">
        <div className="text-xs font-bold text-app-muted mb-2">Importer des questions CSV</div>
        <div className="text-xs text-app-muted mb-3 leading-relaxed">
          Exporte ton Google Sheets en .csv (UTF-8) et importe-le ici.
          {csvCount > 0 && <span className="ml-2 text-success">✓ {csvCount} question{csvCount > 1 ? 's' : ''} importée{csvCount > 1 ? 's' : ''}</span>}
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <button className="rounded-xl px-4 py-2 text-xs font-bold text-app border border-app bg-surface-2" onClick={() => fileRef.current.click()}>
          Choisir un fichier CSV
        </button>
      </div>
    </div>
  )
}

// ── Configuration ──────────────────────────────────────────────────────────────
function SetupScreen({ mode, questions, onStart }) {
  const [level, setLevel] = useState('C1/2')
  const [cats, setCats] = useState([])
  const availableCats = useMemo(
    () => new Set(CATEGORIES.filter(cat => catHasQuestions(questions, level, cat)).map(c => c.id)),
    [questions, level]
  )
  useEffect(() => { setCats(prev => prev.filter(id => availableCats.has(id))) }, [availableCats])
  function toggleCat(id) {
    if (!availableCats.has(id)) return
    setCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }
  return (
    <div>
      <h2 className="text-xl font-black mb-4" style={{ color: '#8B5CF6' }}>Configuration</h2>
      <div className="bg-surface border border-app rounded-2xl p-5 mb-4">
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
      {mode === 'entrainement' && (
        <div className="bg-surface border border-app rounded-2xl p-5 mb-4">
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
          <div className="text-[11px] text-app-muted mt-2">Les catégories grisées n'ont pas encore de questions à ce niveau.</div>
        </div>
      )}
      <button
        className="rounded-xl px-7 py-3.5 text-base font-bold text-white border-none"
        style={{ background: '#8B5CF6' }}
        onClick={() => onStart(level, cats)}
      >
        Lancer le quiz →
      </button>
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

  return (
    <div>
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

      <div className="bg-surface border border-app rounded-2xl p-6 mb-3">
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
  const [screen, setScreen] = useState('home')
  const [mode, setMode] = useState(null)
  const [allQuestions, setAllQuestions] = useState([])
  const [csvQuestions, setCsvQuestions] = useState([])
  const [session, setSession] = useState(null)
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return !localStorage.getItem(THEORIE_TUTO_KEY) } catch { return false }
  })

  useEffect(() => {
    fetch('/data/questions.json').then(r => r.json()).then(setAllQuestions).catch(() => setAllQuestions([]))
  }, [])

  const mergedQuestions = useMemo(() => {
    const csvIds = new Set(csvQuestions.map(q => q.id))
    return [...allQuestions.filter(q => !csvIds.has(q.id)), ...csvQuestions]
  }, [allQuestions, csvQuestions])

  function handleStart(level, categories) {
    const pool = buildPool(mergedQuestions, mode, level, categories)
    if (pool.length === 0) { alert('Aucune question ne correspond à cette sélection. Élargis le niveau ou les catégories.'); return }
    setSession({ pool, currentIdx: 0, answers: [] })
    setScreen('quiz')
  }

  function handleTutorialDone(selectedMode) {
    try { localStorage.setItem(THEORIE_TUTO_KEY, '1') } catch {}
    setShowTutorial(false)
    if (selectedMode) { setMode(selectedMode); setScreen('setup') }
  }

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
          {screen !== 'home' && (
            <button
              onClick={() => { setScreen('home'); setMode(null); setSession(null) }}
              className="bg-transparent border-none cursor-pointer text-app-muted p-1.5 flex items-center"
              title="Retour à l'accueil"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
              </svg>
            </button>
          )}
        </div>

        {showTutorial && <TheorieTutorial onDone={handleTutorialDone} />}
        {screen === 'home' && !showTutorial && <HomeScreen onMode={m => { setMode(m); setScreen('setup') }} onLoadCSV={setCsvQuestions} csvCount={csvQuestions.length} />}
        {screen === 'setup' && <SetupScreen mode={mode} questions={mergedQuestions} onStart={handleStart} />}
        {screen === 'quiz' && session && <QuizScreen key={session.currentIdx} session={session} mode={mode} onAnswer={handleAnswer} onNext={handleNext} />}
        {screen === 'result' && session && <ResultScreen session={session} mode={mode} onReplay={() => { setSession(null); setMode(null); setScreen('home') }} />}
      </div>
    </div>
  )
}
