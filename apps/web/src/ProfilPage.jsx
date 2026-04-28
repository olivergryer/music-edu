import { Link } from 'react-router-dom'
import useProgress, { TROPHIES, XP_LEVELS, getNextLevel } from './useProgress'

export default function ProfilPage() {
  const { xp, level, nextLevel, streak, trophies, modules, history } = useProgress()

  const nextLv    = getNextLevel(xp)
  const xpInLevel = xp - level.xp
  const xpNeeded  = nextLv ? nextLv.xp - level.xp : 1
  const pct       = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100))

  const styleBackHub = {
    background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
    color: '#c084fc', fontWeight: 700, fontSize: 12, padding: '4px 10px',
    cursor: 'pointer', textDecoration: 'none',
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 14px 32px', fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Link to="/" style={styleBackHub}>← Tessitura</Link>
        </div>

        {/* Niveau + XP */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '20px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Niveau</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#c084fc' }}>{level.id}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>XP total</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#f9fafb' }}>⭐ {xp}</div>
            </div>
          </div>
          {/* Barre XP */}
          <div style={{ height: 8, background: '#1f2937', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#c084fc)', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4b5563' }}>
            <span>{xpInLevel} / {xpNeeded} XP</span>
            <span>{nextLv ? `Prochain : ${nextLv.id}` : '🏆 Niveau maximum'}</span>
          </div>
        </div>

        {/* Streak */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14, display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: streak.current > 0 ? '#f97316' : '#374151' }}>
              🔥 {streak.current}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>jours consécutifs</div>
          </div>
          <div style={{ width: 1, background: '#1f2937' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#6b7280' }}>{streak.longest}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>record</div>
          </div>
        </div>

        {/* Stats modules */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Activité</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: '#111827', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 700, marginBottom: 4 }}>🥁 Rythme</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{modules.rythme.seriesPlayed}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>séries · {modules.rythme.xpTotal} XP</div>
            </div>
            <div style={{ flex: 1, background: '#111827', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 700, marginBottom: 4 }}>🎼 Théorie</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{modules.theorie.sessionsPlayed}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>sessions · {modules.theorie.xpTotal} XP</div>
            </div>
          </div>
        </div>

        {/* Trophées */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Trophées</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{trophies.length} / {TROPHIES.length}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {TROPHIES.map(t => {
              const unlocked = trophies.includes(t.id)
              return (
                <div key={t.id} style={{
                  background: unlocked ? '#1a0d3a' : '#0f172a',
                  border: `1px solid ${unlocked ? '#7c3aed' : '#1f2937'}`,
                  borderRadius: 12, padding: '10px 4px', textAlign: 'center',
                  opacity: unlocked ? 1 : 0.35,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 9, color: unlocked ? '#c084fc' : '#4b5563', fontWeight: 700, lineHeight: 1.3 }}>{t.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Historique récent */}
        {history.length > 0 && (
          <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Historique récent
            </div>
            {history.slice(0, 10).map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 9 && i < history.length - 1 ? '1px solid #0f172a' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>{h.medal}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{h.module === 'rythme' ? 'Rythme' : 'Théorie'}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 700 }}>+{h.xp} XP</span>
                  <span style={{ fontSize: 10, color: '#374151' }}>{h.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
