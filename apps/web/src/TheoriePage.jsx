import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import IntervalleStaff from './IntervalleStaff.jsx'

const CATEGORIES = [
  {
    id: 'vocabulaire_musical',
    label: 'Vocabulaire musical',
    includes: ['vocabulaire_italien', 'vocabulaire_technique', 'notation_partition'],
  },
  {
    id: 'tonalites_alterations',
    label: 'Tonalités & altérations',
    includes: ['tonalites_alterations'],
  },
  {
    id: 'intervalles',
    label: 'Intervalles',
    includes: ['intervalles'],
  },
  {
    id: 'rythme_mesure',
    label: 'Rythme & mesure',
    includes: ['rythme_mesure'],
  },
  {
    id: 'harmonie',
    label: 'Harmonie',
    includes: ['harmonie_accords', 'cadences'],
  },
  {
    id: 'culture_musicale',
    label: 'Culture musicale',
    includes: ['formes_musicales', 'histoire_styles', 'compositeurs'],
  },
]

const LEVELS = ['C1/1','C1/2','C1/3','C1/4','C2/1','C2/2','C2/3','C2/4','C3']

// ---------- Utilitaires ----------

function normalizeText(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  if (q.reponses_acceptees) {
    return q.reponses_acceptees.split('|').some(v => normalizeText(v) === norm)
  }
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
  return questions.some(q =>
    levelToInt(q.niveau) <= levelToInt(level) &&
    cat.includes.includes(q.categorie)
  )
}

function buildPool(questions, mode, level, selectedCatIds) {
  const activeFineCategories = selectedCatIds.length === 0
    ? null
    : CATEGORIES
        .filter(c => selectedCatIds.includes(c.id))
        .flatMap(c => c.includes)

  let pool = questions.filter(q => {
    const levelOk = levelToInt(q.niveau) <= levelToInt(level)
    const catOk = mode === 'examen' || activeFineCategories === null || activeFineCategories.includes(q.categorie)
    return levelOk && catOk
  })
  return shuffleArray(pool).slice(0, mode === 'examen' ? 40 : 10)
}

function getTimeLimit(q) {
  if (q.temps_limite) {
    const base = parseInt(q.temps_limite)
    return q.type === 'texte' ? base * 2 : base
  }
  return q.type === 'texte' ? 30 : 20
}

function getChoices(q) {
  if (q.type === 'vrai_faux') return ['Vrai', 'Faux']
  if (q.type === 'qcm' || q.type === 'qcm_image_question' || q.type === 'vexflow_intervalle') {
    const opts = [q.reponse_correcte, q.reponse_fausse_1, q.reponse_fausse_2, q.reponse_fausse_3].filter(Boolean)
    return shuffleArray(opts)
  }
  if (q.type === 'image_qcm') {
    return [q.image_choix_1, q.image_choix_2, q.image_choix_3, q.image_choix_4].filter(Boolean)
  }
  return []
}

// ---------- Parser CSV ----------

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
  const lines = csvText.trim().split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
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

// ---------- Styles ----------

const S = {
  page: {
    minHeight: '100dvh', background: '#030712', color: '#f9fafb',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '20px', fontFamily: "'Inter','Segoe UI',sans-serif",
  },
  inner: { width: '100%', maxWidth: 600 },
  back: {
    background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
    color: '#c084fc', fontWeight: 700, fontSize: 12, padding: '4px 10px',
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  },
  h2: { color: '#c084fc', marginTop: 24, marginBottom: 4 },
  card: {
    background: '#0a0f1a', border: '2px solid #1f2937',
    borderRadius: 16, padding: '24px 20px', marginBottom: 16,
  },
  btn: (variant = 'primary') => ({
    background: variant === 'primary' ? '#7c3aed' : variant === 'success' ? '#065f46' : '#1f2937',
    color: '#f9fafb', border: 'none', borderRadius: 10, padding: '10px 20px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  }),
  btnOutline: {
    background: 'transparent', color: '#c084fc',
    border: '2px solid #c084fc', borderRadius: 10, padding: '10px 20px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  choiceBtn: (selected, correct, wrong, revealed) => {
    let bg = '#0f172a', border = '#1f2937', color = '#f9fafb'
    if (revealed) {
      if (correct) { bg = '#064e3b'; border = '#34d399'; color = '#34d399' }
      if (wrong)   { bg = '#450a0a'; border = '#f87171'; color = '#f87171' }
    } else if (selected) { bg = '#1e1b4b'; border = '#7c3aed' }
    return {
      background: bg, border: `2px solid ${border}`, borderRadius: 10,
      padding: '12px 16px', marginBottom: 10, width: '100%',
      color, fontSize: 14, fontWeight: 600, cursor: revealed ? 'default' : 'pointer',
      textAlign: 'left',
    }
  },
  imgChoiceBtn: (selected, correct, wrong, revealed) => {
    let border = '#1f2937'
    if (revealed) { border = correct ? '#34d399' : wrong ? '#f87171' : '#1f2937' }
    else if (selected) { border = '#7c3aed' }
    return {
      border: `3px solid ${border}`, borderRadius: 10, padding: 4,
      cursor: revealed ? 'default' : 'pointer', background: '#0f172a',
    }
  },
  tagBtn: (active, disabled) => ({
    background: active ? '#3b0764' : '#0f172a',
    border: `2px solid ${active ? '#c084fc' : '#1f2937'}`,
    borderRadius: 20, padding: '6px 14px', fontSize: 12,
    fontWeight: 600, color: active ? '#c084fc' : disabled ? '#2d3748' : '#6b7280',
    cursor: disabled ? 'default' : 'pointer', margin: '4px',
    opacity: disabled ? 0.35 : 1,
  }),
  input: {
    background: '#0f172a', border: '2px solid #1f2937', borderRadius: 10,
    padding: '12px 16px', color: '#f9fafb', fontSize: 14,
    width: '100%', boxSizing: 'border-box', outline: 'none',
  },
  feedback: (correct) => ({
    background: correct ? '#064e3b' : '#450a0a',
    border: `2px solid ${correct ? '#34d399' : '#f87171'}`,
    borderRadius: 10, padding: '14px 16px', marginTop: 12,
    color: correct ? '#34d399' : '#f87171', fontSize: 14,
  }),
}

// ---------- Sous-composants ----------

function TimerBar({ limit, timedOut }) {
  const barRef = useRef()

  // Animation CSS native — React ne touche jamais width, donc pas de décalage
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.transition = 'none'
    bar.style.width = '100%'
    void bar.getBoundingClientRect() // force reflow avant animation
    bar.style.transition = `width ${limit}s linear`
    bar.style.width = '0%'
  }, [limit])

  // Snap immédiat à 0 quand timedOut
  useEffect(() => {
    if (timedOut && barRef.current) {
      barRef.current.style.transition = 'none'
      barRef.current.style.width = '0%'
    }
  }, [timedOut])

  return (
    <div style={{ height: 5, borderRadius: 3, marginBottom: 16, background: '#0f172a', overflow: 'hidden' }}>
      <div
        ref={barRef}
        style={{
          height: '100%', borderRadius: 3,
          background: timedOut ? '#f87171' : '#c084fc',
          // width géré exclusivement via ref — jamais dans le style React
        }}
      />
    </div>
  )
}

function QuestionImage({ src }) {
  if (!src) return null
  return <img src={src} alt="Question" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 16, display: 'block' }} />
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
            <span key={i} style={S.imgChoiceBtn(isSelected, isCorrect, isWrong, revealed)} onClick={() => !revealed && onSelect(c)}>
              <img src={c} alt={`Choix ${i + 1}`} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
            </span>
          )
        }
        return (
          <button key={i} style={S.choiceBtn(isSelected, isCorrect, isWrong, revealed)} onClick={() => !revealed && onSelect(c)}>
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
        style={{ ...S.input, borderColor: revealed ? (correct ? '#34d399' : '#f87171') : '#1f2937' }}
        value={value}
        onChange={e => { if (!revealed) onChange(e.target.value) }}
        onKeyDown={e => e.key === 'Enter' && !revealed && onSubmit()}
        placeholder="Ta réponse…"
        disabled={revealed}
        autoFocus
      />
      {!revealed && (
        <button style={{ ...S.btn(), marginTop: 10 }} onClick={onSubmit}>
          Valider
        </button>
      )}
    </div>
  )
}

// ---------- Écran : Accueil ----------

function HomeScreen({ onMode, onLoadCSV, csvCount }) {
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseTheorieCSV(ev.target.result)
        onLoadCSV(parsed)
      } catch (err) {
        alert('Erreur CSV : ' + err.message)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  return (
    <div>
      <h2 style={S.h2}>Théorie</h2>
      <p style={{ color: '#4b5563', fontSize: 13, marginBottom: 24 }}>Quiz de théorie musicale</p>

      <div style={S.card}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#c084fc', marginBottom: 8 }}>Entraînement</div>
        <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 16, lineHeight: 1.6 }}>
          10 questions · catégories au choix · feedback immédiat après chaque réponse
        </div>
        <button style={S.btn()} onClick={() => onMode('entrainement')}>Commencer →</button>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#c084fc', marginBottom: 8 }}>Examen</div>
        <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 16, lineHeight: 1.6 }}>
          40 questions · toutes catégories · seuil de passage 38/40 · pas de feedback pendant le test
        </div>
        <button style={S.btn()} onClick={() => onMode('examen')}>Commencer →</button>
      </div>

      <div style={{ ...S.card, borderColor: '#0f172a' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>Importer des questions CSV</div>
        <div style={{ fontSize: 11, color: '#374151', marginBottom: 12, lineHeight: 1.6 }}>
          Exporte ton Google Sheets en .csv (UTF-8) et importe-le ici.
          {csvCount > 0 && (
            <span style={{ color: '#34d399', marginLeft: 8 }}>
              ✓ {csvCount} question{csvCount > 1 ? 's' : ''} importée{csvCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
        <button style={{ ...S.btn('neutral'), fontSize: 12 }} onClick={() => fileRef.current.click()}>
          Choisir un fichier CSV
        </button>
      </div>
    </div>
  )
}

// ---------- Écran : Configuration ----------

function SetupScreen({ mode, questions, onStart, onBack }) {
  const [level, setLevel] = useState('C1/2')
  const [cats, setCats] = useState([])

  const availableCats = useMemo(
    () => new Set(CATEGORIES.filter(cat => catHasQuestions(questions, level, cat)).map(c => c.id)),
    [questions, level]
  )

  // Désélectionner les catégories qui n'ont plus de questions au nouveau niveau
  useEffect(() => {
    setCats(prev => prev.filter(id => availableCats.has(id)))
  }, [availableCats])

  function toggleCat(id) {
    if (!availableCats.has(id)) return
    setCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  return (
    <div>
      <h2 style={S.h2}>Configuration</h2>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', marginBottom: 12 }}>Niveau</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LEVELS.map(l => (
            <button key={l} style={S.tagBtn(level === l, false)} onClick={() => setLevel(l)}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#374151', marginTop: 8 }}>
          Inclut toutes les questions jusqu'au niveau sélectionné.
        </div>
      </div>

      {mode === 'entrainement' && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', marginBottom: 12 }}>
            Catégories{' '}
            <span style={{ fontSize: 11, fontWeight: 400, color: '#4b5563' }}>(vide = toutes)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => {
              const disabled = !availableCats.has(c.id)
              return (
                <button key={c.id} style={S.tagBtn(cats.includes(c.id), disabled)} onClick={() => toggleCat(c.id)}>
                  {c.label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: '#374151', marginTop: 8 }}>
            Les catégories grisées n'ont pas encore de questions à ce niveau.
          </div>
        </div>
      )}

      <button style={{ ...S.btn(), fontSize: 15, padding: '14px 28px' }} onClick={() => onStart(level, cats)}>
        Lancer le quiz →
      </button>
    </div>
  )
}

// ---------- Écran : Quiz ----------

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

  // submitAnswer utilise timedOut depuis sa closure — recreré quand timedOut change
  const submitAnswer = useCallback((answer) => {
    if (revealedRef.current) return
    clearInterval(timerRef.current)
    revealedRef.current = true
    const correct = answer != null ? checkAnswer(answer, q) : false
    const pts = calculatePoints(correct, timedOut)
    onAnswer({ question: q, userAnswer: answer ?? '', correct, points: pts })
    setRevealed(true)
  }, [q, timedOut, onAnswer])

  // Reset par question (remount via key= dans le parent, mais reset défensif)
  useEffect(() => {
    revealedRef.current = false
    setTimeLeft(limit)
    setSelected(null)
    setTextInput('')
    textInputRef.current = ''
    setRevealed(false)
    setTimedOut(false)
  }, [currentIdx, limit])

  // Timer : décrémente, flag timedOut à 0, ne soumet jamais automatiquement
  useEffect(() => {
    if (revealed) return
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (revealedRef.current) { clearInterval(timerRef.current); return }
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); setTimedOut(true); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [currentIdx, revealed])

  function handleSelect(choice) {
    if (revealed) return
    setSelected(choice)
    submitAnswer(choice)
  }

  function handleTextSubmit() {
    if (revealed) return
    submitAnswer(textInput.trim() || null)
  }

  function handlePass() {
    submitAnswer(null)
  }

  const isCorrect = revealed && answers[answers.length - 1]?.correct
  const showFeedback = revealed && mode === 'entrainement'
  const isLast = currentIdx === pool.length - 1
  const catLabel = CATEGORIES.find(c => c.includes.includes(q.categorie))?.label ?? q.categorie

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#4b5563' }}>
          Question {currentIdx + 1} / {pool.length}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: timedOut ? '#f87171' : timeLeft <= 3 ? '#fbbf24' : '#4b5563',
        }}>
          {timedOut ? 'Hors délai' : `${timeLeft}s`}
        </span>
      </div>
      <TimerBar limit={limit} timedOut={timedOut} />

      {timedOut && !revealed && (
        <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', marginBottom: 10 }}>
          Temps écoulé — réponds quand même pour 0,5 pt
        </div>
      )}

      <div style={S.card}>
        <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          {catLabel}
        </div>

        {q.type === 'qcm_image_question' && <QuestionImage src={q.image_question} />}

        <div style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', marginBottom: 20, lineHeight: 1.5 }}>
          {q.question}
        </div>

        {(q.type === 'qcm' || q.type === 'vrai_faux' || q.type === 'image_qcm' || q.type === 'qcm_image_question' || q.type === 'vexflow_intervalle') && (
          <ChoiceQuestion q={q} choices={choices} selected={selected} onSelect={handleSelect} revealed={revealed} />
        )}

        {q.type === 'vexflow_intervalle' && q.vexflow_notes && (
          <IntervalleStaff notes={q.vexflow_notes} />
        )}

        {q.type === 'texte' && (
          <TexteQuestion
            value={textInput}
            onChange={val => { setTextInput(val); textInputRef.current = val }}
            onSubmit={handleTextSubmit}
            revealed={revealed}
            correct={isCorrect}
          />
        )}

        {/* Bouton passer (après timeout, avant réponse) */}
        {timedOut && !revealed && (
          <button style={{ ...S.btn('neutral'), marginTop: 12, fontSize: 12, width: '100%' }} onClick={handlePass}>
            Passer sans répondre →
          </button>
        )}

        {/* Feedback Entraînement */}
        {showFeedback && (
          <div style={S.feedback(isCorrect)}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>
              {isCorrect
                ? timedOut ? '✓ Correct — hors délai (0,5 pt)' : '✓ Correct !'
                : '✗ Incorrect'}
            </div>
            {!isCorrect && answers[answers.length - 1]?.userAnswer === '' && (
              <div style={{ fontSize: 13, marginBottom: 4 }}>Pas de réponse</div>
            )}
            {!isCorrect && answers[answers.length - 1]?.userAnswer !== '' && (
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                Bonne réponse : <strong>{q.reponse_correcte}</strong>
              </div>
            )}
            {q.explication && (
              <div style={{ fontSize: 12, color: isCorrect ? '#6ee7b7' : '#fca5a5', lineHeight: 1.5, marginTop: 4 }}>
                {q.explication}
              </div>
            )}
          </div>
        )}

        {revealed && (
          <button style={{ ...S.btn(), marginTop: 16, width: '100%' }} onClick={onNext}>
            {isLast ? 'Voir les résultats →' : 'Suivant →'}
          </button>
        )}
      </div>

      {mode === 'entrainement' && answers.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: 12, color: '#4b5563' }}>
          Score : {answers.reduce((s, a) => s + a.points, 0).toFixed(1)} / {answers.length}
        </div>
      )}
    </div>
  )
}

// ---------- Écran : Résultats ----------

function ResultScreen({ session, mode, onReplay }) {
  const { answers, pool } = session
  const totalPts = answers.reduce((s, a) => s + a.points, 0)
  const maxPts = pool.length
  const pct = maxPts > 0 ? totalPts / maxPts : 0
  const passed = mode === 'examen' ? totalPts >= 38 : null
  const errors = answers.filter(a => !a.correct)
  const barColor = pct >= 0.9 ? '#34d399' : pct >= 0.7 ? '#fbbf24' : '#f87171'

  return (
    <div>
      <h2 style={S.h2}>Résultats</h2>

      <div style={S.card}>
        {mode === 'examen' && (
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 8, color: passed ? '#34d399' : '#f87171' }}>
            {passed ? '✓ Reçu' : '✗ Échoué'}
          </div>
        )}
        <div style={{ fontSize: 36, fontWeight: 900, color: '#c084fc', marginBottom: 4 }}>
          {totalPts % 1 === 0 ? totalPts : totalPts.toFixed(1)}
          <span style={{ fontSize: 18, color: '#4b5563' }}> / {maxPts}</span>
        </div>
        <div style={{ background: '#0f172a', borderRadius: 6, height: 8, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 6, background: barColor, width: `${pct * 100}%` }} />
        </div>
        {mode === 'entrainement' && (
          <div style={{ fontSize: 14, color: '#4b5563' }}>
            {pct >= 0.9 ? 'Excellent !' : pct >= 0.7 ? 'Bien, continue !' : 'Entraîne-toi encore !'}
          </div>
        )}
        {mode === 'examen' && !passed && (
          <div style={{ fontSize: 13, color: '#fca5a5', marginTop: 4 }}>
            Seuil de passage : 38/40. Il te manque {(38 - totalPts).toFixed(1)} point{38 - totalPts > 1 ? 's' : ''}.
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', marginBottom: 12 }}>
            {errors.length} erreur{errors.length > 1 ? 's' : ''}
          </div>
          {errors.map((a, i) => {
            const catLabel = CATEGORIES.find(c => c.includes.includes(a.question.categorie))?.label ?? a.question.categorie
            return (
              <div key={i} style={{ ...S.card, borderColor: '#450a0a', marginBottom: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: '#c084fc', marginBottom: 6, fontWeight: 700 }}>{catLabel}</div>
                <div style={{ fontSize: 13, color: '#f9fafb', marginBottom: 6, lineHeight: 1.5 }}>{a.question.question}</div>
                {a.userAnswer && (
                  <div style={{ fontSize: 12, color: '#f87171' }}>Ta réponse : {a.userAnswer}</div>
                )}
                <div style={{ fontSize: 12, color: '#34d399', fontWeight: 700 }}>
                  Bonne réponse : {a.question.reponse_correcte}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button style={{ ...S.btn(), width: '100%', padding: '14px', fontSize: 15 }} onClick={onReplay}>
        Rejouer
      </button>
    </div>
  )
}

// ---------- Composant principal ----------

export default function TheoriePage() {
  const [screen, setScreen] = useState('home')
  const [mode, setMode] = useState(null)
  const [allQuestions, setAllQuestions] = useState([])
  const [csvQuestions, setCsvQuestions] = useState([])
  const [session, setSession] = useState(null)

  useEffect(() => {
    fetch('/data/questions.json')
      .then(r => r.json())
      .then(setAllQuestions)
      .catch(() => setAllQuestions([]))
  }, [])

  const mergedQuestions = useMemo(() => {
    const csvIds = new Set(csvQuestions.map(q => q.id))
    return [...allQuestions.filter(q => !csvIds.has(q.id)), ...csvQuestions]
  }, [allQuestions, csvQuestions])

  function handleMode(m) {
    setMode(m)
    setScreen('setup')
  }

  function handleStart(level, categories) {
    const pool = buildPool(mergedQuestions, mode, level, categories)
    if (pool.length === 0) {
      alert('Aucune question ne correspond à cette sélection. Élargis le niveau ou les catégories.')
      return
    }
    setSession({ pool, currentIdx: 0, answers: [] })
    setScreen('quiz')
  }

  function handleAnswer(result) {
    setSession(prev => ({ ...prev, answers: [...prev.answers, result] }))
  }

  function handleNext() {
    const isLast = session.currentIdx + 1 >= session.pool.length
    if (isLast) {
      setScreen('result')
    } else {
      setSession(prev => ({ ...prev, currentIdx: prev.currentIdx + 1 }))
    }
  }

  function handleReplay() {
    setSession(null)
    setMode(null)
    setScreen('home')
  }

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Link to="/" style={S.back}>← Tessitura</Link>
          {screen !== 'home' && (
            <button
              onClick={() => { setScreen('home'); setMode(null); setSession(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 6, display: 'flex', alignItems: 'center' }}
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

        {screen === 'home' && (
          <HomeScreen
            onMode={handleMode}
            onLoadCSV={setCsvQuestions}
            csvCount={csvQuestions.length}
          />
        )}

        {screen === 'setup' && (
          <SetupScreen
            mode={mode}
            questions={mergedQuestions}
            onStart={handleStart}
            onBack={() => setScreen('home')}
          />
        )}

        {screen === 'quiz' && session && (
          <QuizScreen
            key={session.currentIdx}
            session={session}
            mode={mode}
            onAnswer={handleAnswer}
            onNext={handleNext}
          />
        )}

        {screen === 'result' && session && (
          <ResultScreen session={session} mode={mode} onReplay={handleReplay} />
        )}
      </div>
    </div>
  )
}
