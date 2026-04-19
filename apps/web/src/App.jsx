
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Données : bibliothèque de rythmes ───────────────────────────────────────
const RHYTHM_LIBRARY = {
  debutant: [
    { id: 1, beats: [1, 1, 1, 1],         name: "4 noires" },
    { id: 2, beats: [2, 1, 1],             name: "Blanche + 2 noires" },
    { id: 3, beats: [1, 1, 2],             name: "2 noires + blanche" },
    { id: 4, beats: [2, 2],                name: "2 blanches" },
  ],
  intermediaire: [
    { id: 5, beats: [0.5, 0.5, 1, 1, 1],  name: "2 croches + 3 noires" },
    { id: 6, beats: [1, 0.5, 0.5, 1, 1],  name: "Noire + 2 croches + 2 noires" },
    { id: 7, beats: [0.5, 0.5, 0.5, 0.5, 1, 1], name: "4 croches + 2 noires" },
    { id: 8, beats: [1, 1, 0.5, 0.5, 1],  name: "2 noires + 2 croches + noire" },
  ],
  avance: [
    { id: 9,  beats: [1.5, 0.5, 1, 1],    name: "Noire pointée + croche + 2 noires" },
    { id: 10, beats: [0.5, 1.5, 0.5, 1.5], name: "Croche + noire pointée (×2)" },
    { id: 11, beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], name: "6 croches + noire" },
    { id: 12, beats: [1.5, 0.5, 0.5, 0.5, 1], name: "Noire pointée + 3 croches + noire" },
  ],
};

const BPM = 80;
const BEAT_MS = 60000 / BPM;
const TOLERANCE = { perfect: 80, good: 150, ok: 260 };

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function patternToTimestamps(beats) {
  const ts = []; let t = 0;
  for (const b of beats) { ts.push(t); t += b * BEAT_MS; }
  return ts;
}

function scoreTap(actual, expected) {
  const d = Math.abs(actual - expected);
  if (d <= TOLERANCE.perfect) return { label: "Parfait ✦", pts: 100, grade: "perfect" };
  if (d <= TOLERANCE.good)    return { label: "Bien ✓",    pts: 70,  grade: "good" };
  if (d <= TOLERANCE.ok)      return { label: "Moyen",     pts: 40,  grade: "ok" };
  return                             { label: "Raté ✕",    pts: 0,   grade: "miss" };
}

const GRADE_COLORS = {
  perfect: "#a78bfa",
  good:    "#34d399",
  ok:      "#fbbf24",
  miss:    "#f87171",
  idle:    "#4b5563",
  active:  "#c084fc",
};

// ─── Composant : une note de musique (SVG) ────────────────────────────────────
function NoteHead({ duration, active, grade }) {
  const color = grade
    ? GRADE_COLORS[grade]
    : active ? GRADE_COLORS.active : GRADE_COLORS.idle;

  const isOpen   = duration >= 2;
  const hasDot   = duration === 1.5;
  const hasFlag  = duration === 0.5;
  const stemH    = 40;
  const W = 28 + (hasDot ? 10 : 0);
  const H = 68;
  const cx = 14, headY = H - 8, rx = 7, ry = 5;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: active ? "scale(1.18)" : "scale(1)",
        transition: "transform 0.08s, filter 0.08s",
        filter: active ? `drop-shadow(0 0 8px ${color})` : "none",
        margin: "0 4px",
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
        {/* Tige */}
        <line x1={cx} y1={headY - ry} x2={cx} y2={headY - ry - stemH}
              stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
        {/* Tête */}
        <ellipse cx={cx} cy={headY} rx={rx} ry={ry}
                 fill={isOpen ? "none" : color}
                 stroke={color} strokeWidth="2"/>
        {/* Crochet (croche) */}
        {hasFlag && (
          <path d={`M ${cx} ${headY - ry - stemH} C ${cx+14} ${headY-ry-stemH+10} ${cx+10} ${headY-ry-stemH+26} ${cx+4} ${headY-ry-stemH+30}`}
                fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
        )}
        {/* Point (noire pointée) */}
        {hasDot && (
          <circle cx={cx + rx + 5} cy={headY} r="3" fill={color}/>
        )}
      </svg>
    </div>
  );
}

// ─── Composant : barre de progression du temps ───────────────────────────────
function ProgressBar({ progress }) {
  return (
    <div style={{
      width: "100%", height: 4, background: "#1f2937", borderRadius: 99, overflow: "hidden"
    }}>
      <div style={{
        width: `${progress * 100}%`, height: "100%",
        background: "linear-gradient(90deg, #7c3aed, #c084fc)",
        transition: "width 0.1s linear", borderRadius: 99,
      }}/>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RythmApp() {
  const [level,        setLevel]        = useState("debutant");
  const [phase,        setPhase]        = useState("idle"); // idle|countdown|playing|results
  const [pattern,      setPattern]      = useState(null);
  const [countdown,    setCountdown]    = useState(3);
  const [activeIdx,    setActiveIdx]    = useState(-1);
  const [tapTimes,     setTapTimes]     = useState([]);
  const [scores,       setScores]       = useState([]);
  const [totalPts,     setTotalPts]     = useState(0);
  const [earnedPts,    setEarnedPts]    = useState(0);
  const [progress,     setProgress]     = useState(0);
  const [tapFlash,     setTapFlash]     = useState(false);
  const [streak,       setStreak]       = useState(0);
  const [bestStreak,   setBestStreak]   = useState(0);

  const startRef    = useRef(null);
  const tidsRef     = useRef([]);
  const rafRef      = useRef(null);
  const audioCtxRef = useRef(null);
  const tapTimesRef = useRef([]);

  // keep ref in sync with state (to read in closures without stale data)
  tapTimesRef.current = tapTimes;

  // ── Audio ──────────────────────────────────────────────────────────────────
  const ctx = useCallback(() => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  }, []);

  const click = useCallback((strong = false) => {
    try {
      const ac = ctx();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = strong ? 1000 : 700;
      g.gain.setValueAtTime(0.25, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
      o.start(ac.currentTime); o.stop(ac.currentTime + 0.08);
    } catch (_) {}
  }, [ctx]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearTids = () => { tidsRef.current.forEach(clearTimeout); tidsRef.current = []; };

  const randomPattern = useCallback(() => {
    const pool = RHYTHM_LIBRARY[level];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [level]);

  // ── Game flow ──────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearTids();
    cancelAnimationFrame(rafRef.current);
    const pat = randomPattern();
    setPattern(pat); setTapTimes([]); tapTimesRef.current = [];
    setScores([]); setActiveIdx(-1); setProgress(0);
    setPhase("countdown"); setCountdown(3);
    click(true);

    const t = (n, fn) => { const id = setTimeout(fn, n); tidsRef.current.push(id); };

    t(BEAT_MS * 1, () => { setCountdown(2); click(); });
    t(BEAT_MS * 2, () => { setCountdown(1); click(); });
    t(BEAT_MS * 3, () => {
      click(true);
      setPhase("playing");
      startRef.current = performance.now();

      const stamps = patternToTimestamps(pat.beats);
      const total  = pat.beats.reduce((a, b) => a + b, 0) * BEAT_MS;

      stamps.forEach((ts, i) => {
        t(ts, () => { setActiveIdx(i); if (i > 0) click(); });
      });

      // Progress bar via rAF
      const tick = () => {
        const elapsed = performance.now() - startRef.current;
        setProgress(Math.min(elapsed / total, 1));
        if (elapsed < total) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      t(total + BEAT_MS * 0.5, () => {
        cancelAnimationFrame(rafRef.current);
        setProgress(1);
        setActiveIdx(-1);
        setPhase("results");
      });
    });
  }, [randomPattern, click]);

  // ── Tap ────────────────────────────────────────────────────────────────────
  const handleTap = useCallback((e) => {
    e.preventDefault();
    if (phase !== "playing") return;
    const t = performance.now() - startRef.current;
    setTapTimes(prev => [...prev, t]);
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);
  }, [phase]);

  // ── Calcul des scores en fin de partie ────────────────────────────────────
  useEffect(() => {
    if (phase !== "results" || !pattern) return;
    const expected = patternToTimestamps(pattern.beats);
    const s = expected.map((exp, i) => {
      const tap = tapTimesRef.current[i];
      if (tap === undefined) return { label: "Manqué ✕", pts: 0, grade: "miss" };
      return scoreTap(tap, exp);
    });
    setScores(s);
    const earned = s.reduce((sum, x) => sum + x.pts, 0);
    setEarnedPts(earned);
    setTotalPts(prev => prev + earned);

    const newStreak = s.filter(x => x.grade === "perfect" || x.grade === "good").length;
    const cur = streak + (newStreak === s.length ? 1 : 0);
    setStreak(cur);
    setBestStreak(prev => Math.max(prev, cur));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { clearTids(); cancelAnimationFrame(rafRef.current); }, []);

  // ── Calculs affichage ──────────────────────────────────────────────────────
  const maxPts    = pattern ? pattern.beats.length * 100 : 1;
  const pct       = Math.round((earnedPts / maxPts) * 100);
  const medal     = pct >= 90 ? "🥇" : pct >= 70 ? "🥈" : pct >= 50 ? "🥉" : "🎯";
  const gradeMsg  = pct >= 90 ? "Maîtrisé !" : pct >= 70 ? "Très bien !" : pct >= 50 ? "Bon début !" : "Continue !";

  const LEVEL_LABELS = { debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé" };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100dvh", background: "#030712", color: "#f9fafb",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "16px 16px 24px", fontFamily: "'Inter', 'Segoe UI', sans-serif",
      userSelect: "none",
    }}>

      {/* ── HEADER ── */}
      <div style={{
        width: "100%", maxWidth: 480, display: "flex",
        justifyContent: "space-between", alignItems: "center", marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#c084fc", letterSpacing: "-0.5px" }}>
            🎵 RythmApp
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Entraînement rythmique · {BPM} BPM</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {streak > 1 && (
            <div style={{
              background: "#451a03", border: "1px solid #92400e",
              borderRadius: 999, padding: "4px 10px",
              fontSize: 12, color: "#fbbf24", fontWeight: 600,
            }}>🔥 ×{streak}</div>
          )}
          <div style={{
            background: "#1c1917", border: "1px solid #292524",
            borderRadius: 999, padding: "4px 12px",
            fontSize: 13, color: "#e7e5e4", fontWeight: 700,
          }}>⭐ {totalPts}</div>
        </div>
      </div>

      {/* ── LEVEL TABS ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {Object.keys(RHYTHM_LIBRARY).map(l => (
          <button
            key={l}
            onClick={() => { if (phase === "idle" || phase === "results") setLevel(l); }}
            style={{
              padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              cursor: "pointer", border: "none", transition: "all 0.2s",
              background: level === l ? "#7c3aed" : "#111827",
              color:      level === l ? "#fff"    : "#9ca3af",
              boxShadow:  level === l ? "0 0 12px rgba(124,58,237,0.4)" : "none",
            }}
          >{LEVEL_LABELS[l]}</button>
        ))}
      </div>

      {/* ── MAIN ZONE ── */}
      <div style={{
        flex: 1, width: "100%", maxWidth: 480,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 24,
      }}>

        {/* IDLE */}
        {phase === "idle" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🥁</div>
            <p style={{ color: "#6b7280", fontSize: 14, maxWidth: 260, lineHeight: 1.6 }}>
              Un rythme aléatoire s'affiche. Reproduis-le en tapant sur le bouton en rythme !
            </p>
            {bestStreak > 0 && (
              <p style={{ color: "#92400e", fontSize: 12, marginTop: 8 }}>
                Meilleure série parfaite : 🔥 ×{bestStreak}
              </p>
            )}
          </div>
        )}

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 80, fontWeight: 900, lineHeight: 1,
              color: "#c084fc",
              animation: "pulse 0.3s ease-out",
            }}>
              {countdown}
            </div>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 8 }}>Prépare-toi…</p>
          </div>
        )}

        {/* NOTES DISPLAY */}
        {(phase === "playing" || phase === "results") && pattern && (
          <div style={{ width: "100%" }}>
            {/* Pattern name */}
            <div style={{
              textAlign: "center", fontSize: 12, color: "#6b7280", marginBottom: 12,
            }}>
              {pattern.name} &nbsp;·&nbsp; {pattern.beats.length} temps
            </div>

            {/* Staff */}
            <div style={{
              background: "#0f172a", border: "1px solid #1e293b",
              borderRadius: 16, padding: "24px 12px 16px",
              display: "flex", alignItems: "flex-end", justifyContent: "center",
              minHeight: 110, position: "relative", overflow: "hidden",
            }}>
              {/* Lines portée (décoratif) */}
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{
                  position: "absolute", left: 16, right: 16,
                  bottom: 14 + i * 10, height: 1,
                  background: "#1e293b",
                }} />
              ))}

              {/* Notes */}
              {pattern.beats.map((dur, i) => (
                <NoteHead
                  key={i}
                  duration={dur}
                  active={phase === "playing" && activeIdx === i}
                  grade={phase === "results" && scores[i] ? scores[i].grade : null}
                />
              ))}
            </div>

            {/* Progress bar */}
            {phase === "playing" && (
              <div style={{ marginTop: 10 }}>
                <ProgressBar progress={progress} />
                <div style={{ textAlign: "right", fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                  {tapTimes.length}/{pattern.beats.length} taps
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESULTS */}
        {phase === "results" && pattern && scores.length > 0 && (
          <div style={{
            width: "100%", background: "#0f172a",
            border: "1px solid #1e293b", borderRadius: 16, padding: 20,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 40 }}>{medal}</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#f9fafb", marginTop: 4 }}>
              {pct}%
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              {gradeMsg} — {earnedPts} / {maxPts} pts
            </div>

            {/* Detail par note */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {scores.map((s, i) => (
                <div key={i} style={{
                  background: "#1e293b", borderRadius: 999,
                  padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  color: GRADE_COLORS[s.grade],
                  border: `1px solid ${GRADE_COLORS[s.grade]}33`,
                }}>
                  Note {i + 1} · {s.label} · {s.pts}pts
                </div>
              ))}
            </div>

            {streak > 1 && (
              <div style={{ marginTop: 12, color: "#fbbf24", fontSize: 13, fontWeight: 600 }}>
                🔥 Série parfaite ×{streak} !
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TAP BUTTON ── */}
      <div style={{ width: "100%", maxWidth: 480, marginTop: 24 }}>
        {phase === "playing" && (
          <button
            onPointerDown={handleTap}
            style={{
              width: "100%", height: 96,
              background: tapFlash
                ? "linear-gradient(135deg, #9333ea, #ec4899)"
                : "linear-gradient(135deg, #7c3aed, #6d28d9)",
              border: "none", borderRadius: 20, cursor: "pointer",
              color: "#fff", fontSize: 24, fontWeight: 900, letterSpacing: 2,
              boxShadow: "0 8px 32px rgba(109,40,217,0.5)",
              transform: tapFlash ? "scale(0.96)" : "scale(1)",
              transition: "transform 0.06s, background 0.06s",
              touchAction: "none",
            }}
          >
            TAP
          </button>
        )}

        {(phase === "idle" || phase === "results") && (
          <button
            onClick={startGame}
            style={{
              width: "100%", padding: "18px 0",
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              border: "none", borderRadius: 20, cursor: "pointer",
              color: "#fff", fontSize: 17, fontWeight: 700,
              boxShadow: "0 8px 32px rgba(109,40,217,0.4)",
              transition: "opacity 0.2s",
            }}
            onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
            onMouseOut={e  => e.currentTarget.style.opacity = "1"}
          >
            {phase === "idle" ? "▶ Commencer" : "🔄 Nouveau rythme"}
          </button>
        )}

        {phase === "countdown" && (
          <div style={{
            width: "100%", padding: "18px 0", background: "#111827",
            borderRadius: 20, textAlign: "center", fontSize: 15,
            color: "#4b5563", fontWeight: 600,
          }}>
            Préparation…
          </div>
        )}
      </div>
    </div>
  );
}
