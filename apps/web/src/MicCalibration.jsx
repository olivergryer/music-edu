// ─── Calibration du seuil micro (Rythme) ──────────────────────────────────────
// Flow guidé 3 étapes : bruit ambiant → 4 frappes piano → 4 frappes forte.
// Calcule un seuil adapté au matériel/contexte de l'utilisateur :
//   seuil = clamp(piano_min × 0.6, ambient × 2, 0.05)
// → déclenche même la frappe piano la plus faible (×0.6 = marge), reste au-dessus
// du bruit (×2 = floor anti-faux-positifs), plafonné au max du slider.

import { useEffect, useRef, useState } from "react";

const MIN_DETECT      = 0.005;  // ignore noise below this when detecting a tap
const PEAK_WINDOW_MS  = 100;    // fenêtre de capture du pic après franchissement
const TAP_COOLDOWN_MS = 250;    // ms entre deux frappes captées
const AMBIENT_MS      = 1500;   // durée de mesure du bruit ambiant
const TAP_TARGET      = 4;      // nb de frappes par stage
const MAX_THRESHOLD   = 0.05;   // plafond (= max du slider)
const TRANSITION_MS   = 1200;   // pause entre piano et forte (laisse retomber la résonance)

export default function MicCalibration({ analyserRef, ensureMic, stopMic, inputMode, onApply, onClose }) {
  const [stage, setStage]         = useState("intro"); // intro | ambient | piano | forte | done | error
  const [ambientRms, setAmbientRms] = useState(0);
  const [pianoPeaks, setPianoPeaks] = useState([]);
  const [fortePeaks, setFortePeaks] = useState([]);
  const [level, setLevel]         = useState(0);
  const [error, setError]         = useState("");

  const rafRef        = useRef(0);
  const stageRef      = useRef(stage);
  const transitionRef = useRef(null);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  // Assure un micro vivant pendant la calibration (résume ctx + (re-)acquiert si mort).
  // À la fermeture, on ne stoppe le micro que si l'utilisateur n'est PAS en mode Micro
  // (sinon on doit le laisser actif pour le jeu).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await ensureMic(); } catch (e) {
        if (!cancelled) { setError(String(e?.message ?? e)); setStage("error"); }
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(transitionRef.current);
      if (inputMode !== "mic") stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boucle de lecture RMS + détection de pics selon le stage en cours
  useEffect(() => {
    let dead = false;
    let inPeak = false, peakStart = 0, peakMax = 0, lastEnd = 0;
    let ambientStart = 0, ambientSum = 0, ambientCount = 0;
    let lastStage = "";

    function tick() {
      if (dead) return;
      const analyser = analyserRef.current;
      if (!analyser) { rafRef.current = requestAnimationFrame(tick); return; }
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      setLevel(rms);
      const now = performance.now();
      const st  = stageRef.current;

      // Réinitialisation à chaque changement de stage (notamment après « Refaire »)
      if (st !== lastStage) {
        inPeak = false; peakStart = 0; peakMax = 0; lastEnd = 0;
        ambientStart = 0; ambientSum = 0; ambientCount = 0;
        lastStage = st;
      }

      if (st === "ambient") {
        if (ambientStart === 0) ambientStart = now;
        ambientSum += rms; ambientCount++;
        if (now - ambientStart >= AMBIENT_MS) {
          const mean = ambientCount > 0 ? ambientSum / ambientCount : 0;
          setAmbientRms(mean);
          ambientStart = 0; ambientSum = 0; ambientCount = 0;
          setStage("piano");
        }
      } else if (st === "piano" || st === "forte") {
        if (!inPeak && rms > MIN_DETECT && (now - lastEnd) > TAP_COOLDOWN_MS) {
          inPeak = true; peakStart = now; peakMax = rms;
        } else if (inPeak) {
          if (rms > peakMax) peakMax = rms;
          if (now - peakStart > PEAK_WINDOW_MS) {
            const captured = peakMax;
            inPeak = false; lastEnd = now;
            if (st === "piano") {
              setPianoPeaks(prev => {
                const next = [...prev, captured];
                if (next.length >= TAP_TARGET) {
                  setStage("wait");
                  clearTimeout(transitionRef.current);
                  transitionRef.current = setTimeout(() => setStage("forte"), TRANSITION_MS);
                }
                return next;
              });
            } else {
              setFortePeaks(prev => {
                const next = [...prev, captured];
                if (next.length >= TAP_TARGET) setStage("done");
                return next;
              });
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { dead = true; cancelAnimationFrame(rafRef.current); };
  }, [analyserRef]);

  // ── Calcul du seuil proposé ──
  const pianoMin = pianoPeaks.length ? Math.min(...pianoPeaks) : 0;
  const forteMin = fortePeaks.length ? Math.min(...fortePeaks) : 0;
  const threshold = (() => {
    if (pianoPeaks.length === 0) return 0;
    let t = pianoMin * 0.6;
    t = Math.max(t, ambientRms * 2);
    t = Math.min(t, MAX_THRESHOLD);
    return t;
  })();

  const restart = () => {
    clearTimeout(transitionRef.current);
    setPianoPeaks([]); setFortePeaks([]); setAmbientRms(0);
    setStage("ambient");
  };

  // ── UI helpers ──
  const LevelMeter = () => (
    <div style={{ width:'100%', height:8, background:'var(--surface-2)', borderRadius:4, overflow:'hidden', marginTop:8, marginBottom:6 }}>
      <div style={{ width: `${Math.min(level * 2000, 100)}%`, height:'100%', background:'#4A6CF7', transition:'width 0.05s' }}/>
    </div>
  );
  const Counter = ({ n }) => (
    <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:10 }}>
      {Array.from({ length: TAP_TARGET }).map((_, i) => (
        <div key={i} style={{
          width:14, height:14, borderRadius:7,
          background: i < n ? '#4A6CF7' : 'var(--surface-2)',
          border:`1px solid ${i < n ? '#4A6CF7' : 'var(--border-c)'}`,
        }}/>
      ))}
    </div>
  );

  const btnPrimary = { padding:'13px 0', borderRadius:14, border:'none', background:'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' };
  const btnSecondary = { padding:'13px 0', borderRadius:14, border:'2px solid rgba(74,108,247,0.35)', background:'none', color:'#4A6CF7', fontSize:14, fontWeight:800, cursor:'pointer' };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:400 }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:401,
        width:'min(340px, 92vw)', maxHeight:'88vh', overflowY:'auto',
        background:'var(--surface)', border:'1.5px solid rgba(74,108,247,0.3)', borderRadius:20,
        padding:'24px 22px 18px',
      }}>
        <div style={{ fontSize:17, fontWeight:900, color:'var(--text)', marginBottom:4, textAlign:'center' }}>Calibrer le micro</div>

        {stage === "intro" && (
          <>
            <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5, textAlign:'center', marginBottom:16 }}>
              3 étapes : silence (bruit ambiant) puis 4 frappes douces (<i>piano</i>) puis 4 frappes fortes (<i>forte</i>).
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={() => setStage("ambient")} style={btnPrimary}>Démarrer</button>
              <button onClick={onClose} style={btnSecondary}>Annuler</button>
            </div>
          </>
        )}

        {stage === "ambient" && (
          <>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, textAlign:'center', marginTop:8 }}>
              <b>1/3 — Bruit ambiant</b>
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:4 }}>
              Reste silencieux 1,5 s…
            </div>
            <LevelMeter/>
          </>
        )}

        {stage === "piano" && (
          <>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, textAlign:'center', marginTop:8 }}>
              <b>2/3 — Frappes piano</b>
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:4 }}>
              Tape 4 fois <b>doucement</b>.
            </div>
            <Counter n={pianoPeaks.length}/>
            <LevelMeter/>
          </>
        )}

        {stage === "wait" && (
          <>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, textAlign:'center', marginTop:8 }}>
              <b>Prépare les frappes fortes…</b>
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:4 }}>
              On laisse retomber le son.
            </div>
            <LevelMeter/>
          </>
        )}

        {stage === "forte" && (
          <>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, textAlign:'center', marginTop:8 }}>
              <b>3/3 — Frappes forte</b>
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:4 }}>
              Tape 4 fois <b>fort</b>.
            </div>
            <Counter n={fortePeaks.length}/>
            <LevelMeter/>
          </>
        )}

        {stage === "done" && (
          <>
            <div style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:6, marginBottom:14 }}>
              Seuil proposé
            </div>
            <div style={{ fontSize:38, fontWeight:900, color:'#4A6CF7', textAlign:'center', lineHeight:1 }}>
              {(threshold * 200).toFixed(1)}
            </div>
            <div style={{ fontSize:10, color:'var(--text-muted)', textAlign:'center', marginTop:10, marginBottom:18, lineHeight:1.5 }}>
              bruit ambiant ≈ {(ambientRms * 200).toFixed(2)} · piano min ≈ {(pianoMin * 200).toFixed(2)} · forte min ≈ {(forteMin * 200).toFixed(2)}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={() => { onApply(threshold); onClose(); }} style={btnPrimary}>Valider</button>
              <button onClick={restart} style={btnSecondary}>Refaire</button>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer', marginTop:2 }}>Annuler</button>
            </div>
          </>
        )}

        {stage === "error" && (
          <>
            <div style={{ fontSize:12, color:'#f87171', textAlign:'center', marginTop:8, marginBottom:16 }}>
              Micro indisponible : {error}
            </div>
            <button onClick={onClose} style={btnPrimary}>Fermer</button>
          </>
        )}
      </div>
    </>
  );
}
