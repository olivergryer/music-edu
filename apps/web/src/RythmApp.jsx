import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import RythmStaff from "./RythmStaff";
import SettingsPage from "./SettingsPage";
import useSheetData from "./useSheetData";
import useProgressFirebase, { TROPHIES as TROPHIES_IMPORT } from "./hooks/useProgressFirebase";

// ─── Figures de base ──────────────────────────────────────────────────────────
const q  = { dur:"q"  };
const h  = { dur:"h"  };
const qd = { dur:"qd" };
const hd = { dur:"hd" };
const e  = { dur:"8"  };
const s  = { dur:"16" };
const qr = { dur:"qr", rest:true };
const hr = { dur:"hr", rest:true };
const er = { dur:"8r", rest:true };
const sr = { dur:"16r",rest:true };
const et = { dur:"8",  triplet:true };
const qt = { dur:"q",  triplet:true };

// ─── Catalogue de formules rythmiques ────────────────────────────────────────
// Chaque formule remplit exactement 1 ou 2 temps.
// "beats" = nombre de temps occupés (1 noire en binaire, 1 noire pointée en ternaire)
export const FORMULA_CATALOG = [
  // ── Binaire – 1 temps ────────────────────────────────────────────────────
  { id:"bin_q",    name:"Noire",               group:"binary",  beats:1, figs:[q]           },
  { id:"bin_qr",   name:"Soupir",              group:"binary",  beats:1, figs:[qr]          },
  { id:"bin_ee",   name:"2 croches",           group:"binary",  beats:1, figs:[e,e]         },
  { id:"bin_ere",  name:"½s + croche",         group:"binary",  beats:1, figs:[er,e]        },
  { id:"bin_eer",  name:"Croche + ½s",         group:"binary",  beats:1, figs:[e,er]        },
  { id:"bin_ttt",  name:"Triolet",             group:"binary",  beats:1, figs:[et,et,et]    },
  { id:"bin_ssss", name:"4 doubles",           group:"binary",  beats:1, figs:[s,s,s,s]     },
  { id:"bin_ess",  name:"Croche + 2 doubles",  group:"binary",  beats:1, figs:[e,s,s]       },
  { id:"bin_sse",  name:"2 doubles + croche",  group:"binary",  beats:1, figs:[s,s,e]       },
  { id:"bin_sser", name:"2 doubles + ½s",      group:"binary",  beats:1, figs:[s,s,er]      },
  // ── Binaire – 2 temps ────────────────────────────────────────────────────
  { id:"bin_h",    name:"Blanche",             group:"binary",  beats:2, figs:[h]           },
  { id:"bin_hr",   name:"½-soupir (2 t.)",     group:"binary",  beats:2, figs:[hr]          },
  { id:"bin_qde",  name:"♩. + croche",         group:"binary",  beats:2, figs:[qd,e]        },
  { id:"bin_eqd",  name:"Croche + ♩.",         group:"binary",  beats:2, figs:[e,qd]        },
  { id:"bin_eqe",  name:"Syncope c-n-c",       group:"binary",  beats:2, figs:[e,q,e]       },
  // ── Ternaire – 1 temps ───────────────────────────────────────────────────
  { id:"ter_qd",   name:"Noire pointée",       group:"ternary", beats:1, figs:[qd]          },
  { id:"ter_eee",  name:"3 croches",           group:"ternary", beats:1, figs:[e,e,e]       },
  { id:"ter_qe",   name:"Noire + croche",      group:"ternary", beats:1, figs:[q,e]         },
  { id:"ter_eq",   name:"Croche + noire",      group:"ternary", beats:1, figs:[e,q]         },
  { id:"ter_ree",  name:"½s + 2 croches",      group:"ternary", beats:1, figs:[er,e,e]      },
  { id:"ter_eer",  name:"2 croches + ½s",      group:"ternary", beats:1, figs:[e,e,er]      },
  { id:"ter_ere",  name:"Croche-½s-croche",    group:"ternary", beats:1, figs:[e,er,e]      },
  // ── Ternaire – 2 temps ───────────────────────────────────────────────────
  { id:"ter_hd",   name:"Blanche pointée",     group:"ternary", beats:2, figs:[hd]          },
  { id:"ter_qde_qde", name:"♩. + ♩.",         group:"ternary", beats:2, figs:[qd,qd]       },
];

// ─── Formules introduites à chaque niveau ─────────────────────────────────────
export const LEVEL_ORDER = [
  "Apprenti", "Musicien", "Instrumentiste", "Soliste",
  "Concertiste", "Virtuose", "Maestro",
];

export const LEVEL_FORMULA_IDS = {
  "Apprenti":      ["bin_q","bin_qr","bin_h","bin_hr","bin_ee",
                    "ter_qd","ter_eee","ter_qe","ter_eq"],
  "Musicien":      ["bin_qde","bin_eqd","ter_ree","ter_eer","ter_qde_qde"],
  "Instrumentiste":["bin_ttt"],
  "Soliste":       ["bin_ssss","bin_ess","bin_sse","bin_sser"],
  "Concertiste":   ["ter_hd"],
  "Virtuose":      ["bin_ere","bin_eer","bin_eqe","ter_ere"],
  "Maestro":       [],
};

// Formules actives par défaut : Apprenti
const DEFAULT_SELECTED = new Set(LEVEL_FORMULA_IDS["Apprenti"]);

// ─── Générateur aléatoire temps par temps ────────────────────────────────────
function generateMeasure(timeSig, formulaPool) {
  const isCompound = timeSig === "12/8";
  const group      = isCompound ? "ternary" : "binary";
  const numBeats   = 4;
  const figs       = [];
  const formulaSlots = [];
  let beat = 0;

  while (beat < numBeats) {
    const remaining = numBeats - beat;
    const pool1 = formulaPool.filter(f => f.group === group && f.beats === 1);
    const pool2 = remaining >= 2
      ? formulaPool.filter(f => f.group === group && f.beats === 2)
      : [];
    const candidates = [...pool1, ...pool2];

    if (candidates.length === 0) {
      const fallback = isCompound ? { ...qd } : { ...q };
      figs.push(fallback);
      formulaSlots.push({ formula: null, startBeat: beat, beats: 1 });
      beat++;
      continue;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    chosen.figs.forEach(f => figs.push({ ...f }));
    formulaSlots.push({ formula: chosen, startBeat: beat, beats: chosen.beats });
    beat += chosen.beats;
  }

  return { timeSig, name: "Aléatoire", figs, formulaSlots };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Génère un variant du pattern cible en changeant exactement un temps (formule 1 temps)
function generateDistractorVariant(target, pool) {
  const isCompound = target.timeSig === "12/8";
  const group = isCompound ? "ternary" : "binary";
  const beatPool1 = pool.filter(f => f.group === group && f.beats === 1);

  if (!target.formulaSlots) return generateMeasure(target.timeSig, pool);

  const changeableSlots = target.formulaSlots
    .map((slot, i) => ({ ...slot, idx: i }))
    .filter(slot => slot.formula && slot.beats === 1);

  if (changeableSlots.length === 0 || beatPool1.length <= 1) {
    return generateMeasure(target.timeSig, pool);
  }

  const slot = changeableSlots[Math.floor(Math.random() * changeableSlots.length)];
  const alternatives = beatPool1.filter(f => f.id !== slot.formula.id);
  if (alternatives.length === 0) return generateMeasure(target.timeSig, pool);

  const newFormula = alternatives[Math.floor(Math.random() * alternatives.length)];
  const newSlots = target.formulaSlots.map((s, i) =>
    i === slot.idx ? { ...s, formula: newFormula } : s
  );
  const newFigs = newSlots.flatMap(s => s.formula ? s.formula.figs.map(f => ({ ...f })) : []);

  return { timeSig: target.timeSig, name: "Aléatoire", figs: newFigs, formulaSlots: newSlots };
}

// Empreinte des onsets non-silences (en unités de noires × 1000 pour éviter float)
function attackFingerprint(figs) {
  let pos = 0;
  return figs
    .map(fig => { const onset = pos; pos += figDur(fig); return { onset, rest: fig.rest }; })
    .filter(({ rest }) => !rest)
    .map(({ onset }) => Math.round(onset * 1000))
    .join(",");
}

function generateDistractors(target, pool, n = 3) {
  const key    = p => p.figs.map(f => f.dur + (f.triplet ? "t" : "")).join(",");
  const targetKey     = key(target);
  const targetAttacks = attackFingerprint(target.figs);
  const result = [];
  let attempts = 0;
  while (result.length < n && attempts < 80) {
    attempts++;
    const c  = generateDistractorVariant(target, pool);
    const ck = key(c);
    if (
      ck !== targetKey &&
      attackFingerprint(c.figs) !== targetAttacks &&
      result.every(d => key(d) !== ck)
    ) result.push(c);
  }
  // Fallback : mesures aléatoires, aussi filtrées homorythmes
  let fallbackAttempts = 0;
  while (result.length < n && fallbackAttempts < 80) {
    fallbackAttempts++;
    const c  = generateMeasure(target.timeSig, pool);
    const ck = key(c);
    if (
      ck !== targetKey &&
      attackFingerprint(c.figs) !== targetAttacks &&
      result.every(d => key(d) !== ck)
    ) result.push(c);
  }
  return result;
}

// ─── Tempi musicaux standards ─────────────────────────────────────────────────
const TEMPI = [50,54,56,58,60,63,66,69,72,76,80,84,88,92,96,
               100,104,108,112,116,120,126,132,138,144,150];
const closestTempoIdx = bpm => {
  let best = 0;
  TEMPI.forEach((t,i) => { if (Math.abs(t-bpm) < Math.abs(TEMPI[best]-bpm)) best=i; });
  return best;
};

// ─── Durée en noires ──────────────────────────────────────────────────────────
const DUR_Q = {
  w:4, h:2, hd:3, q:1, qd:1.5,
  "8":0.5, "8d":0.75, "16":0.25,
  wr:4, hr:2, qr:1, "8r":0.5, "16r":0.25,
};
function figDur(fig) {
  const raw  = fig.dur.replace(/r$/, "");
  const base = raw.endsWith("d") ? raw.slice(0,-1) : raw;
  const dur  = DUR_Q[raw] ?? DUR_Q[base] ?? 1;
  return fig.triplet ? dur * (2/3) : dur;
}

function toTimestamps(figs, bpm, timeSig) {
  const isCompound = ["12/8", "6/8", "9/8"].includes(timeSig);
  const quarterMs = isCompound ? (60000 / bpm) / 1.5 : 60000 / bpm;
  const ts = []; let t = 0;
  figs.forEach(fig => { ts.push(t); t += figDur(fig) * quarterMs; });
  return { timestamps: ts, totalMs: t };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
// TOL.ok conservé uniquement pour la fenêtre d'anticipation dans handleTap
const TOL = { ok:280 };
// Tolérances en % du beat — plus strict à tempo élevé
function scoreTap(actual, expected, beatMs) {
  const dev = actual - expected; // + = tard, - = tôt
  const d   = Math.abs(dev);
  const pf  = beatMs * 0.10;
  const gd  = beatMs * 0.18;
  const ok  = beatMs * 0.30;
  if (d <= pf) return { label:"Parfait ✦", pts:100, grade:"perfect", dev };
  if (d <= gd) return { label:"Bien ✓",    pts:70,  grade:"good",    dev };
  if (d <= ok) return { label:"Moyen",     pts:40,  grade:"ok",      dev };
  return             { label:"Raté ✕",    pts:0,   grade:"miss",    dev };
}
const GRADE_COLOR = { perfect:"#a78bfa", good:"#34d399", ok:"#fbbf24", miss:"#f87171" };

// ─── Constantes ───────────────────────────────────────────────────────────────
// Probabilité de tirer une mesure binaire quand les deux groupes sont disponibles.
// 0.7 = 70% binaire / 30% ternaire. Modifier pour ajuster l'équilibre.
const BINARY_PROBABILITY = 0.7;

const REVEAL_BONUS = { 1:0, 2:10, 3:20, 4:50 };
const ACTIVITIES   = [
  { id:1, label:"Reproduire vu" },
  { id:2, label:"Reproduire entendu" },
  { id:3, label:"Reconnaître écrit" },
  { id:4, label:"Reconnaître joué" },
];

// ─── Métronome visuel ────────────────────────────────────────────────────────
function MetronomeViz({ flash }) {
  /*
  // ── Ancien pendule SVG (commenté) ────────────────────────────────────────
  // Pivot à la base, barre s'élève vers le haut — ±22°, longueur 185px
  // <svg width="60" height="215" viewBox="0 0 60 215"
  //   style={{overflow:"visible", flexShrink:0}}>
  //   <line x1="30" y1="202" x2="-38" y2="32" stroke="#1e293b" strokeWidth="1" strokeDasharray="3,5" opacity="0.6"/>
  //   <line x1="30" y1="202" x2="98" y2="32" stroke="#1e293b" strokeWidth="1" strokeDasharray="3,5" opacity="0.6"/>
  //   <line x1="30" y1="202" x2="30" y2="16" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,4" opacity="0.4"/>
  //   <rect x="6" y="203" width="48" height="10" rx="3" fill="#111827" stroke="#1e293b" strokeWidth="1.5"/>
  //   <circle cx="30" cy="202" r="4.5" fill="#374151" stroke="#4b5563" strokeWidth="1.5"/>
  //   <g style={{
  //     transformOrigin:"30px 202px",
  //     transform:`rotate(${angle}deg)`,
  //     transition:`transform ${beatDurationMs * 0.88}ms linear`,
  //   }}>
  //     <line x1="30" y1="202" x2="30" y2="24" stroke="#6b7280" strokeWidth="3.5" strokeLinecap="round"/>
  //     <circle cx="30" cy="16" r="10" fill="#374151" stroke="#6b7280" strokeWidth="2"/>
  //   </g>
  // </svg>
  */
  return null; // dot déplacé dans l'en-tête central
}

// ─── Écran fin de série ───────────────────────────────────────────────────────
function SeriesEndScreen({ xpLog, medals, totalXp, dominantMedal, perfectSeries, addSession, onReplay, onBack }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const r = addSession({ module: "rythme", xpEarned: totalXp, medal: dominantMedal, meta: { perfectSeries } });
    setResult(r);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight:"100dvh", background:"#030712", color:"#f9fafb",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"20px 14px 32px", fontFamily:"'Inter','Segoe UI',sans-serif",
    }}>
      <div style={{width:"100%",maxWidth:540}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:52,marginBottom:8}}>{dominantMedal}</div>
          <div style={{fontSize:26,fontWeight:900,color:"#c084fc"}}>Série terminée !</div>
          <div style={{fontSize:14,color:"#6b7280",marginTop:4}}>
            {perfectSeries ? "Série parfaite — incroyable !" : `Score total : +${totalXp} XP`}
          </div>
        </div>

        {/* Grille des 10 exercices */}
        <div style={{background:"#0a0f1a",borderRadius:14,padding:"14px",marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
            textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
            Détail de la série
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
            {medals.map((m, i) => (
              <div key={i} style={{
                background:"#111827",borderRadius:10,padding:"8px 4px",
                textAlign:"center",
              }}>
                <div style={{fontSize:18}}>{m}</div>
                <div style={{fontSize:9,color:"#6b7280",marginTop:2}}>+{xpLog[i] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>

        {/* XP total */}
        <div style={{background:"#0a0f1a",borderRadius:14,padding:"14px",marginBottom:16,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#9ca3af"}}>XP gagné</span>
          <span style={{fontSize:20,fontWeight:900,color:"#c084fc"}}>+{totalXp} ⭐</span>
        </div>

        {/* Trophées débloqués */}
        {result?.newTrophies?.length > 0 && (
          <div style={{background:"#1a0d3a",border:"1px solid #7c3aed",
            borderRadius:14,padding:"14px",marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#c084fc",marginBottom:8}}>
              🏅 Trophée{result.newTrophies.length > 1 ? "s" : ""} débloqué{result.newTrophies.length > 1 ? "s" : ""} !
            </div>
            {result.newTrophies.map(id => {
              const t = TROPHIES_IMPORT.find(x => x.id === id);
              return t ? (
                <div key={id} style={{fontSize:13,color:"#e9d5ff",marginBottom:4}}>
                  {t.icon} {t.label}
                </div>
              ) : null;
            })}
          </div>
        )}

        {/* Level-up */}
        {result?.leveledUp && (
          <div style={{background:"#1a0d3a",border:"1px solid #c084fc",
            borderRadius:14,padding:"14px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:4}}>🎉</div>
            <div style={{fontSize:14,fontWeight:700,color:"#c084fc"}}>Niveau supérieur !</div>
          </div>
        )}

        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onBack} style={{
            flex:1,padding:"14px",borderRadius:16,cursor:"pointer",
            background:"#111827",border:"1px solid #1f2937",
            color:"#9ca3af",fontSize:13,fontWeight:700,
          }}>← Activités</button>
          <button onClick={onReplay} style={{
            flex:2,padding:"14px",borderRadius:16,cursor:"pointer",
            background:"linear-gradient(135deg,#7c3aed,#6d28d9)",border:"none",
            color:"#fff",fontSize:13,fontWeight:700,
            boxShadow:"0 8px 32px rgba(109,40,217,0.4)",
          }}>🔄 Rejouer la série</button>
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RythmApp() {
  const {
    formulaCatalog, levelOrder, levelFormulaIds,
    sheetId, sheetStatus, sheetError, setSheetId, resetToDefault,
  } = useSheetData(
    { formulaCatalog: FORMULA_CATALOG, levelOrder: LEVEL_ORDER, levelFormulaIds: LEVEL_FORMULA_IDS },
    "/formules-rythme-template.csv"
  );

  const [currentPage,     setCurrentPage]     = useState("home");
  const [selectedFormulas,setSelectedFormulas] = useState(DEFAULT_SELECTED);
  const [activity,        setActivity]        = useState(1);

  // Tempo
  const [tempoMode,    setTempoMode]    = useState("fixed");
  const [bpmFixed,     setBpmFixed]     = useState(80);
  const [bpmMin,       setBpmMin]       = useState(60);
  const [bpmMax,       setBpmMax]       = useState(100);
  const [sessionBpm,   setSessionBpm]   = useState(80);

  // Bonus révélation
  const [revealBeat,   setRevealBeat]   = useState(1);

  // Phase de jeu
  const [phase,        setPhase]        = useState("idle");
  const [pattern,      setPattern]      = useState(null);
  const [countdownN,   setCountdownN]   = useState(1);
  const [revealed,     setRevealed]     = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(-1);
  const [tapTimes,     setTapTimes]     = useState([]);
  const [scores,       setScores]       = useState([]);
  const [totalPts,     setTotalPts]     = useState(0);
  const [earnedPts,    setEarnedPts]    = useState(0);
  const [progress,     setProgress]     = useState(0);
  const [tapFlash,     setTapFlash]     = useState(false);
  const [beatFlash,    setBeatFlash]    = useState(false);
  const [beatStrong,   setBeatStrong]   = useState(false);
  const [metroDotFlash,setMetroDotFlash]= useState(false);
  const [flashOffsetMs,   setFlashOffsetMs]   = useState(-50);
  const [detectedOffset,  setDetectedOffset]  = useState(null);
  const [rhythmSoundOn, setRhythmSoundOn] = useState(true);
  const [tapSoundOn,    setTapSoundOn]    = useState(true);
  const rhythmSoundRef = useRef(true);
  const tapSoundRef    = useRef(true);
  rhythmSoundRef.current = rhythmSoundOn;
  tapSoundRef.current    = tapSoundOn;

  // Act 3 & 4
  const [choices,     setChoices]     = useState([]);
  const [correctIdx,  setCorrectIdx]  = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [pendingIdx,  setPendingIdx]  = useState(null);
  const [act4CountN,  setAct4CountN]  = useState(null);

  // Série de 10
  const [seriesMode,   setSeriesMode]   = useState(false);
  const [seriesIdx,    setSeriesIdx]    = useState(0);
  const [seriesXpLog,  setSeriesXpLog]  = useState([]);
  const [seriesMedals, setSeriesMedals] = useState([]);
  const seriesBaseBpmRef               = useRef(null);
  const seriesIdxRef                   = useRef(0);
  // Résultat addSession (trophées + level-up) — affiché dans series-end
  const [seriesResult, setSeriesResult] = useState(null);

  // Microphone
  const [inputMode,    setInputMode]    = useState("tap"); // "tap" | "mic"
  const [micActive,    setMicActive]    = useState(false);
  const [micLevel,     setMicLevel]     = useState(0);
  const [micThreshold, setMicThreshold] = useState(0.05);
  const [micError,     setMicError]     = useState("");

  const startRef       = useRef(null);
  const playStartRef   = useRef(null); // heure absolue estimée du début du jeu
  const tidsRef        = useRef([]);
  const audioTidsRef   = useRef([]);
  const rafRef         = useRef(null);
  const audioCtxRef    = useRef(null);
  const tapTimesRef    = useRef([]);
  tapTimesRef.current  = tapTimes;

  const micStreamRef   = useRef(null);
  const micAnalyserRef = useRef(null);
  const micRafRef      = useRef(null);
  const lastOnsetRef   = useRef(0);

  const { addSession } = useProgressFirebase();

  // ── Gestion formules / niveaux ─────────────────────────────────────────────
  const toggleFormula = useCallback(id => {
    setSelectedFormulas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Quand le catalog change (sheet chargé), reset au premier niveau
  useEffect(() => {
    if (levelOrder.length > 0) {
      setSelectedFormulas(new Set(levelFormulaIds[levelOrder[0]] ?? []));
    }
  }, [formulaCatalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sélectionne toutes les formules de C1/1 jusqu'au niveau cliqué (cumulatif)
  const selectLevel = useCallback(level => {
    const ids = new Set();
    for (const lv of levelOrder) {
      (levelFormulaIds[lv] ?? []).forEach(id => ids.add(id));
      if (lv === level) break;
    }
    setSelectedFormulas(ids);
  }, [levelOrder, levelFormulaIds]);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const getCtx = useCallback(() => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  }, []);

  // Métronome — clic sec, sine aigu
  const beep = useCallback((strong = false) => {
    try {
      const ac = getCtx();
      const o  = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = strong ? 1000 : 700;
      g.gain.setValueAtTime(0.25, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
      o.start(ac.currentTime); o.stop(ac.currentTime + 0.08);
    } catch(_) {}
  }, [getCtx]);

  // Note du rythme — triangle chaud, plus long
  const rhythmBeep = useCallback((strong = false) => {
    if (!rhythmSoundRef.current) return;
    try {
      const ac = getCtx();
      const o  = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle';
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = strong ? 440 : 330;
      g.gain.setValueAtTime(0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
      o.start(ac.currentTime); o.stop(ac.currentTime + 0.15);
    } catch(_) {}
  }, [getCtx]);

  // Confirmation tap — bruit court et sec
  const tapBeep = useCallback(() => {
    if (!tapSoundRef.current) return;
    try {
      const ac = getCtx();
      const frames = Math.floor(ac.sampleRate * 0.04);
      const buf = ac.createBuffer(1, frames, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.3, ac.currentTime);
      src.connect(g); g.connect(ac.destination);
      src.start(ac.currentTime);
    } catch(_) {}
  }, [getCtx]);

  const pulse = useCallback((strong = false) => {
    beep(strong);
    setBeatStrong(strong);
    setBeatFlash(true);
    setTimeout(() => setBeatFlash(false), strong ? 160 : 110);
  }, [beep]);

  const rhythmPulse = useCallback((strong = false) => {
    rhythmBeep(strong);
    setBeatStrong(strong);
    setBeatFlash(true);
    setTimeout(() => setBeatFlash(false), strong ? 160 : 110);
  }, [rhythmBeep]);

  // ── Microphone ─────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const ac = getCtx();
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
      setMicActive(true);
      setMicError("");
    } catch (e) {
      setMicError(e.message ?? "Microphone refusé");
      setInputMode("tap");
    }
  }, [getCtx]);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(micRafRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    setMicActive(false);
    setMicLevel(0);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearTids = () => { tidsRef.current.forEach(clearTimeout); tidsRef.current = []; };
  const tid       = (fn, ms) => { const id = setTimeout(fn, ms); tidsRef.current.push(id); return id; };

  const playPatternAudio = useCallback((pat, bpmVal, delayMs = 0) => {
    audioTidsRef.current.forEach(clearTimeout);
    audioTidsRef.current = [];
    const { timestamps } = toTimestamps(pat.figs, bpmVal, pat.timeSig);
    pat.figs.forEach((fig, i) => {
      if (!fig.rest) {
        const id = setTimeout(() => rhythmBeep(false), delayMs + timestamps[i]);
        audioTidsRef.current.push(id);
      }
    });
  }, [rhythmBeep]);

  const randomPattern = useCallback(() => {
    const pool = formulaCatalog.filter(f => selectedFormulas.has(f.id));
    if (pool.length === 0) return { timeSig:"4/4", name:"Noire × 4", figs:[q,q,q,q] };
    const hasBinary  = pool.some(f => f.group === "binary");
    const hasTernary = pool.some(f => f.group === "ternary");
    let timeSig = "4/4";
    if (hasBinary && hasTernary) timeSig = Math.random() < BINARY_PROBABILITY ? "4/4" : "12/8";
    else if (hasTernary)         timeSig = "12/8";
    return generateMeasure(timeSig, pool);
  }, [selectedFormulas, formulaCatalog]);

  const actualBpm = useCallback(() => {
    if (tempoMode === "fixed") return bpmFixed;
    const lo   = Math.min(bpmMin, bpmMax);
    const hi   = Math.max(bpmMin, bpmMax);
    const rand = lo + Math.random() * (hi - lo);
    return TEMPI.reduce((prev, cur) =>
      Math.abs(cur - rand) < Math.abs(prev - rand) ? cur : prev, TEMPI[0]);
  }, [tempoMode, bpmFixed, bpmMin, bpmMax]);

  // ── Démarrage ─────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearTids();
    audioTidsRef.current.forEach(clearTimeout); audioTidsRef.current = [];
    cancelAnimationFrame(rafRef.current);
    const pat  = randomPattern();
    // En mode série : BPM de base + ramp +5 tous les 3 exercices
    const bpm  = seriesBaseBpmRef.current !== null
      ? seriesBaseBpmRef.current + Math.floor(seriesIdxRef.current / 3) * 5
      : actualBpm();
    const beatMs = 60000 / bpm;
    const { timestamps, totalMs } = toTimestamps(pat.figs, bpm, pat.timeSig);

    // ── Activités 3 & 4 : choix parmi 4 ──────────────────────────────────
    if (activity === 3 || activity === 4) {
      const pool = formulaCatalog.filter(f => selectedFormulas.has(f.id));
      const distract = generateDistractors(pat, pool, 3);
      const shuffled = shuffle([pat, ...distract]);
      const corrIdx  = shuffled.indexOf(pat);
      setPattern(pat); setSessionBpm(bpm);
      setChoices(shuffled); setCorrectIdx(corrIdx);
      setSelectedIdx(null); setPendingIdx(null); setAct4CountN(null);
      setScores([]); setEarnedPts(0); setProgress(0); setActiveIdx(-1);
      setRevealed(activity === 4);
      if (activity === 3) {
        // Décompte 3,4 puis lecture audio
        setPhase("countdown"); setCountdownN(3);
        pulse(false);
        tid(() => { setCountdownN(4); pulse(false); }, beatMs);
        tid(() => {
          setPhase("playing");
          playPatternAudio(pat, bpm);
          // Flash bordures des 4 réponses sur chaque beat
          for (let k = 0; k < 4; k++) {
            tid(() => {
              setBeatFlash(true);
              setTimeout(() => setBeatFlash(false), 110);
            }, k * beatMs);
          }
        }, 2 * beatMs);
      } else {
        // Act 4 : pas de décompte, directement playing
        setPhase("playing");
      }
      return;
    }

    // ── Activité 2 : écoute puis reproduit ────────────────────────────────
    if (activity === 2) {
      setPattern(pat); setSessionBpm(bpm);
      setTapTimes([]); tapTimesRef.current = [];
      setScores([]); setActiveIdx(-1); setProgress(0);
      setRevealed(false);
      // Décompte réduit : beats 3 et 4 uniquement
      setPhase("countdown"); setCountdownN(3);
      pulse(false);
      playStartRef.current = performance.now() + 2 * beatMs + totalMs + 3 * beatMs;

      tid(() => { setCountdownN(4); pulse(false); }, beatMs);

      // Modèle — flash visuel seulement, notes en rhythmBeep
      tid(() => {
        setPhase("listening"); setCountdownN(1);
        setBeatStrong(true); setBeatFlash(true); setTimeout(() => setBeatFlash(false), 160);
        timestamps.forEach((ts, i) => {
          if (!pat.figs[i].rest) tid(() => rhythmBeep(false), ts);
        });
        [1,2,3].forEach(k => {
          tid(() => {
            setCountdownN(k + 1);
            setBeatStrong(false); setBeatFlash(true); setTimeout(() => setBeatFlash(false), 110);
          }, k * beatMs);
        });
      }, 2 * beatMs);

      // Après modèle : 1 beat muet, puis 3 & 4 sonores
      tid(() => { setPhase("countdown"); setCountdownN(null); setBeatFlash(false); }, 2 * beatMs + totalMs);
      tid(() => { setCountdownN(3); pulse(false); }, 2 * beatMs + totalMs + beatMs);
      tid(() => { setCountdownN(4); pulse(false); }, 2 * beatMs + totalMs + 2 * beatMs);

      // Reproduction
      tid(() => {
        pulse(true);
        setPhase("playing");
        startRef.current = performance.now();
        [1,2,3].forEach(k => {
          tid(() => {
            setBeatStrong(false); setBeatFlash(true);
            setTimeout(() => setBeatFlash(false), 110);
          }, k * beatMs);
        });
        const tick = () => {
          const el = performance.now() - startRef.current;
          setProgress(Math.min(el / totalMs, 1));
          if (el < totalMs) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        tid(() => {
          cancelAnimationFrame(rafRef.current);
          setProgress(1);
          setRevealed(true);
          setPhase("results");
        }, totalMs + beatMs * 0.6);
      }, 2 * beatMs + totalMs + 3 * beatMs);
      return;
    }

    // ── Activité 1 : countdown + tap simultané ────────────────────────────
    setPattern(pat); setSessionBpm(bpm);
    setTapTimes([]); tapTimesRef.current = [];
    setScores([]); setActiveIdx(-1); setProgress(0);
    setRevealed(revealBeat === 1);
    setPhase("countdown"); setCountdownN(1);
    pulse(true);

    playStartRef.current = performance.now() + 4 * beatMs;

    setMetroDotFlash(false);
    const totalTicks = 4 + Math.ceil((totalMs + beatMs * 0.6) / beatMs) + 1;
    for (let k = 0; k < totalTicks; k++) {
      const delay = k * beatMs + flashOffsetMs;
      if (delay >= 0) {
        tid(() => {
          setMetroDotFlash(true);
          setTimeout(() => setMetroDotFlash(false), 120);
        }, delay);
      }
    }

    [1,2,3,4].forEach((n, i) => {
      tid(() => {
        setCountdownN(n);
        if (i > 0) pulse(false);
        if (n >= revealBeat) setRevealed(true);
      }, i * beatMs);
    });

    tid(() => {
      // Visual flash beat 1 toujours, son seulement si pas silence
      setBeatFlash(true); setTimeout(() => setBeatFlash(false), 160);
      if (!pat.figs[0]?.rest) rhythmBeep(false);
      setPhase("playing");
      startRef.current = performance.now();

      timestamps.forEach((ts, i) => {
        tid(() => {
          setActiveIdx(i);
          if (i > 0 && !pat.figs[i].rest) rhythmPulse(false);
        }, ts);
      });

      const tick = () => {
        const el = performance.now() - startRef.current;
        setProgress(Math.min(el / totalMs, 1));
        if (el < totalMs) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      tid(() => {
        cancelAnimationFrame(rafRef.current);
        setProgress(1); setActiveIdx(-1);
        setPhase("results");
      }, totalMs + beatMs * 0.6);
    }, 4 * beatMs);
  }, [randomPattern, actualBpm, pulse, rhythmBeep, rhythmPulse, revealBeat, activity, flashOffsetMs, formulaCatalog, selectedFormulas, playPatternAudio]);

  // ── Choix act 3 & 4 ───────────────────────────────────────────────────────
  const handleChoice = useCallback((idx) => {
    if (phase !== "playing") return;
    audioTidsRef.current.forEach(clearTimeout); audioTidsRef.current = [];
    const correct = idx === correctIdx;
    setSelectedIdx(idx);
    const pts = correct ? 100 : 0;
    setEarnedPts(pts);
    setTotalPts(prev => prev + pts);
    setRevealed(true);
    setPhase("results");
  }, [phase, correctIdx]);

  // ── Tap ────────────────────────────────────────────────────────────────────
  const handleTap = useCallback((e) => {
    e.preventDefault();
    if (phase !== "playing" && (phase !== "countdown" || activity !== 1)) return;
    const t = performance.now() - playStartRef.current;
    // Pendant le décompte : n'accepter que dans la fenêtre d'anticipation
    if (t < -TOL.ok) return;
    setTapTimes(prev => [...prev, t]);
    tapBeep();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);
  }, [phase, activity, tapBeep]);

  // ── Calcul des résultats ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "results" || !pattern) return;
    if (activity === 3 || activity === 4) return;
    const beatMs = 60000 / sessionBpm;
    const { timestamps } = toTimestamps(pattern.figs, sessionBpm, pattern.timeSig);
    const playable = pattern.figs
      .map((fig, i) => ({ fig, ts: timestamps[i] }))
      .filter(({ fig }) => !fig.rest);

    // Offset optimal : minimise somme des carrés des écarts (= -moyenne des erreurs)
    const paired = playable
      .map(({ ts }, i) => ({ ts, tap: tapTimesRef.current[i] }))
      .filter(({ tap }) => tap !== undefined);
    const meanErr = paired.length > 0
      ? paired.reduce((sum, { tap, ts }) => sum + (tap - ts), 0) / paired.length
      : 0;
    const optOffset = Math.max(-200, Math.min(200, -meanErr));
    setDetectedOffset(Math.round(optOffset));

    const s = playable.map(({ ts }, i) => {
      const tap = tapTimesRef.current[i];
      if (tap === undefined) return { label:"Manqué ✕", pts:0, grade:"miss", dev:null };
      return scoreTap(tap + optOffset, ts, beatMs);
    });
    setScores(s);
    const raw    = s.reduce((sum, x) => sum + x.pts, 0);
    const bonus  = REVEAL_BONUS[revealBeat] / 100;
    const earned = Math.round(raw * (1 + bonus));
    setEarnedPts(earned);
    setTotalPts(prev => prev + earned);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activity]);

  // ── Détection d'attaques micro ─────────────────────────────────────────────
  useEffect(() => {
    if (!micActive || !(phase === "playing" || (phase === "countdown" && activity === 1))) return;
    const analyser = micAnalyserRef.current;
    if (!analyser) return;
    const data = new Float32Array(analyser.fftSize);
    const COOLDOWN = 200;
    const detect = () => {
      analyser.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      setMicLevel(rms);
      const now = performance.now();
      if (rms > micThreshold && now - lastOnsetRef.current > COOLDOWN) {
        lastOnsetRef.current = now;
        const t = now - playStartRef.current;
        if (t >= -TOL.ok) {
          setTapTimes(prev => [...prev, t]);
          setTapFlash(true);
          setTimeout(() => setTapFlash(false), 80);
        }
      }
      micRafRef.current = requestAnimationFrame(detect);
    };
    micRafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(micRafRef.current);
  }, [micActive, phase, micThreshold, activity]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTids(); cancelAnimationFrame(rafRef.current); stopMic(); audioTidsRef.current.forEach(clearTimeout); }, []);


  // ── Page réglages ──────────────────────────────────────────────────────────
  if (currentPage === "settings") {
    return (
      <SettingsPage
        formulaCatalog={formulaCatalog}
        levelOrder={levelOrder}
        levelFormulaIds={levelFormulaIds}
        selectedFormulas={selectedFormulas}
        onToggle={toggleFormula}
        onLevelSelect={selectLevel}
        onClose={() => setCurrentPage("home")}
        sheetId={sheetId}
        sheetStatus={sheetStatus}
        sheetError={sheetError}
        onSheetLoad={setSheetId}
        onSheetReset={resetToDefault}
        flashOffsetMs={flashOffsetMs}
        onFlashOffsetChange={setFlashOffsetMs}
        revealBeat={revealBeat}
        onRevealBeatChange={setRevealBeat}
        activity={activity}
        tempoMode={tempoMode}
        onTempoModeChange={setTempoMode}
        bpmFixed={bpmFixed}
        onBpmFixedChange={setBpmFixed}
        bpmMin={bpmMin}
        onBpmMinChange={setBpmMin}
        bpmMax={bpmMax}
        onBpmMaxChange={setBpmMax}
      />
    );
  }

  // ── Page accueil ───────────────────────────────────────────────────────────
  if (currentPage === "home") {
    const ACTIVITY_DESCS = {
      1: "Un rythme s'affiche. Reproduis-le en tapant.",
      2: "Écoute le rythme, puis reproduis-le en tapant.",
      3: "Écoute et identifie la bonne portée parmi 4.",
      4: "Observe la portée et identifie la bonne lecture audio.",
    };
    const formulaCountHome = selectedFormulas.size;

    // Détermine si un niveau est entièrement sélectionné (cumulatif)
    const isLevelActiveHome = (level) => {
      const cumIds = [];
      for (const lv of levelOrder) {
        (levelFormulaIds[lv] ?? []).forEach(id => cumIds.push(id));
        if (lv === level) break;
      }
      return cumIds.length > 0 && cumIds.every(id => selectedFormulas.has(id));
    };

    const styleBackHub = {
      background:"#111827", border:"1px solid #1f2937", borderRadius:8,
      color:"#c084fc", fontWeight:700, fontSize:12, padding:"4px 10px",
      cursor:"pointer", textDecoration:"none",
    };

    return (
      <div style={{
        minHeight:"100dvh", background:"#030712", color:"#f9fafb",
        display:"flex", flexDirection:"column", alignItems:"center",
        padding:"12px 14px 32px",
        fontFamily:"'Inter','Segoe UI',sans-serif", userSelect:"none",
      }}>
        {/* Header */}
        <div style={{width:"100%",maxWidth:540,display:"flex",
          justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <Link to="/" style={styleBackHub}>← Tessitura</Link>
          <button
            onClick={() => setCurrentPage("settings")}
            style={{
              background:"#111827",border:"1px solid #1f2937",borderRadius:10,
              color:"#9ca3af",fontSize:18,cursor:"pointer",
              padding:"2px 8px",lineHeight:1,
            }}
            title="Réglages avancés"
          >⚙</button>
        </div>

        <div style={{width:"100%",maxWidth:540}}>
          <div style={{fontSize:28,fontWeight:900,color:"#c084fc",marginBottom:18}}>
            Rythme
          </div>

          {/* 4 cartes activités */}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
            {ACTIVITIES.map(a => {
              const sel = activity === a.id;
              return (
                <div key={a.id}
                  role="button"
                  onClick={() => setActivity(a.id)}
                  style={{
                    borderRadius:14,border:`2px solid ${sel?"#7c3aed":"#1f2937"}`,
                    background:sel?"#1a0d3a":"#0a0f1a",
                    padding:"12px 16px",cursor:"pointer",
                    display:"flex",alignItems:"center",gap:14,
                    transition:"all 0.12s",
                  }}
                >
                  <div style={{
                    fontSize:22,fontWeight:900,color:sel?"#c084fc":"#374151",
                    minWidth:28,textAlign:"center",flexShrink:0,
                  }}>{a.id}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:sel?"#f9fafb":"#9ca3af"}}>
                      {a.label}
                    </div>
                    <div style={{fontSize:11,color:sel?"#a78bfa":"#4b5563",marginTop:2}}>
                      {ACTIVITY_DESCS[a.id]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA Commencer */}
          <button
            onClick={() => {
              // Init série
              if (seriesMode) {
                const baseBpm = tempoMode === "fixed" ? bpmFixed : Math.round((bpmMin + bpmMax) / 2);
                seriesBaseBpmRef.current = baseBpm;
                seriesIdxRef.current = 0;
              } else {
                seriesBaseBpmRef.current = null;
                seriesIdxRef.current = 0;
              }
              setSeriesIdx(0);
              setSeriesXpLog([]);
              setSeriesMedals([]);
              setSeriesResult(null);
              setCurrentPage("game");
              setPhase("idle");
              setPattern(null);
              setScores([]);
              setEarnedPts(0);
              setProgress(0);
              setActiveIdx(-1);
              setRevealed(false);
              setChoices([]);
              setSelectedIdx(null);
              setPendingIdx(null);
              setBeatFlash(false);
              setMetroDotFlash(false);
              setCountdownN(1);
              startGame();
            }}
            style={{
              width:"100%",padding:"18px 0",
              background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
              border:"none",borderRadius:20,cursor:"pointer",
              color:"#fff",fontSize:16,fontWeight:700,
              boxShadow:"0 8px 32px rgba(109,40,217,0.4)",
              marginBottom:18,
            }}
          >{seriesMode ? "▶ Commencer la série" : "▶ Commencer"}</button>

          {/* Mode de jeu — Exercice seul / Série de 10 */}
          <div style={{background:"#0a0f1a",borderRadius:14,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
              textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
              Mode de jeu
            </div>
            <div style={{display:"flex",gap:6}}>
              {[["single","Exercice seul"],["series","Série de 10"]].map(([mode,label]) => {
                const active = seriesMode ? mode==="series" : mode==="single";
                return (
                  <button key={mode}
                    onClick={() => setSeriesMode(mode==="series")}
                    style={{
                      flex:1,padding:"8px",borderRadius:10,fontSize:12,fontWeight:700,
                      cursor:"pointer",border:"none",
                      background:active?"#4f46e5":"#111827",
                      color:active?"#fff":"#6b7280",
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </div>

          {/* Niveaux */}
          <div style={{background:"#0a0f1a",borderRadius:14,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
              textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
              Niveau
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
              {levelOrder.map(level => {
                const active = isLevelActiveHome(level);
                const hasFormulas = (levelFormulaIds[level] ?? []).length > 0;
                return (
                  <button key={level}
                    onClick={() => selectLevel(level)}
                    disabled={!hasFormulas}
                    style={{
                      padding:"5px 14px",borderRadius:999,fontSize:11,fontWeight:700,
                      cursor:hasFormulas?"pointer":"default",border:"none",
                      background:active?"#7c3aed":hasFormulas?"#1f2937":"#111827",
                      color:active?"#fff":hasFormulas?"#9ca3af":"#374151",
                      transition:"all 0.15s",
                    }}
                  >{level}</button>
                );
              })}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:"#6b7280"}}>
                {formulaCountHome} formule{formulaCountHome!==1?"s":""} sélectionnée{formulaCountHome!==1?"s":""}
              </div>
              <button
                onClick={() => setCurrentPage("settings")}
                style={{
                  background:"none",border:"none",color:"#7c3aed",fontSize:11,
                  fontWeight:700,cursor:"pointer",padding:0,
                }}
              >Voir toutes les formules →</button>
            </div>
          </div>

          {/* Tempo + TAP/MIC */}
          <div style={{background:"#0a0f1a",borderRadius:14,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
              textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
              Tempo
            </div>
            {/* Ligne 1 : toggle Fixe/Variable + BPM affiché + TAP/MIC */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
              marginBottom:tempoMode==="range"?8:0}}>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {["fixed","range"].map(mode => (
                  <button key={mode}
                    onClick={() => setTempoMode(mode)}
                    style={{
                      padding:"4px 8px",borderRadius:8,fontSize:10,fontWeight:600,
                      cursor:"pointer",border:"none",
                      background:tempoMode===mode?"#4f46e5":"#111827",
                      color:tempoMode===mode?"#fff":"#6b7280",
                    }}
                  >{mode==="fixed"?"Fixe":"Variable"}</button>
                ))}
              </div>
              {tempoMode === "fixed" && (
                <div style={{flex:1,minWidth:80}}>
                  <input type="range" min={0} max={TEMPI.length-1}
                    value={closestTempoIdx(bpmFixed)}
                    onChange={e => setBpmFixed(TEMPI[+e.target.value])}
                    style={{width:"100%",accentColor:"#7c3aed",display:"block"}}
                  />
                </div>
              )}
              <div style={{fontSize:11,color:"#c084fc",fontWeight:700,
                flexShrink:0,minWidth:54,textAlign:"right"}}>
                {tempoMode==="fixed"
                  ? `${bpmFixed} BPM`
                  : `${Math.min(bpmMin,bpmMax)}↔${Math.max(bpmMin,bpmMax)}`}
              </div>
              {(activity===1||activity===2) && (
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  {[["tap","TAP"],["mic","🎤"]].map(([mode,label]) => (
                    <button key={mode}
                      onClick={() => {
                        if (mode==="mic") { setInputMode("mic"); startMic(); }
                        else { setInputMode("tap"); stopMic(); }
                      }}
                      style={{
                        padding:"4px 8px",borderRadius:8,fontSize:10,fontWeight:700,
                        cursor:"pointer",border:"none",
                        background:inputMode===mode?"#7c3aed":"#111827",
                        color:inputMode===mode?"#fff":"#6b7280",
                      }}
                    >{label}</button>
                  ))}
                </div>
              )}
            </div>
            {/* Ligne 2 : sliders Min/Max (mode Variable) */}
            {tempoMode === "range" && (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:9,color:"#6b7280",width:24,flexShrink:0}}>Min</span>
                  <input type="range" min={0} max={TEMPI.length-1}
                    value={closestTempoIdx(bpmMin)}
                    onChange={e => setBpmMin(TEMPI[+e.target.value])}
                    style={{flex:1,accentColor:"#7c3aed"}}
                  />
                  <span style={{fontSize:10,color:"#a78bfa",fontWeight:700,
                    width:38,textAlign:"right",flexShrink:0}}>{bpmMin} BPM</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:9,color:"#6b7280",width:24,flexShrink:0}}>Max</span>
                  <input type="range" min={0} max={TEMPI.length-1}
                    value={closestTempoIdx(bpmMax)}
                    onChange={e => setBpmMax(TEMPI[+e.target.value])}
                    style={{flex:1,accentColor:"#7c3aed"}}
                  />
                  <span style={{fontSize:10,color:"#a78bfa",fontWeight:700,
                    width:38,textAlign:"right",flexShrink:0}}>{bpmMax} BPM</span>
                </div>
              </div>
            )}
            {/* Seuil MIC */}
            {inputMode==="mic" && (activity===1||activity===2) && (
              <div style={{marginTop:10,background:"#111827",
                borderRadius:10,padding:"8px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  fontSize:10,color:"#6b7280",marginBottom:3}}>
                  <span>Seuil détection</span>
                  <span style={{color:"#c084fc",fontWeight:700}}>{micThreshold.toFixed(3)}</span>
                </div>
                <input type="range" min={5} max={500} step={5}
                  value={Math.round(micThreshold*1000)}
                  onChange={e => setMicThreshold(+e.target.value/1000)}
                  style={{width:"100%",accentColor:"#7c3aed"}}
                />
              </div>
            )}
            {micError && (
              <div style={{fontSize:10,color:"#f87171",marginTop:6,textAlign:"center"}}>
                {micError}
              </div>
            )}
          </div>

          {/* Reveal beat — act 1 seulement */}
          {activity===1 && (
            <div style={{background:"#0a0f1a",borderRadius:14,padding:"12px 14px",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6b7280",
                textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                Voir le rythme au temps…
              </div>
              <div style={{display:"flex",gap:5}}>
                {[1,2,3,4].map(beat => (
                  <button key={beat}
                    onClick={() => setRevealBeat(beat)}
                    style={{
                      flex:1,padding:"6px 4px",borderRadius:10,
                      fontSize:11,fontWeight:700,cursor:"pointer",border:"none",
                      background:revealBeat===beat?"#7c3aed":"#111827",
                      color:revealBeat===beat?"#fff":"#6b7280",
                    }}
                  >
                    {beat}
                    <div style={{fontSize:9,fontWeight:400,marginTop:1,
                      color:revealBeat===beat?"#ddd8fe":"#4b5563"}}>
                      {beat===1?"pas de bonus":beat===2?"+10%":beat===3?"+20%":"+50%"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── Page fin de série ─────────────────────────────────────────────────────
  if (currentPage === "series-end") {
    const totalXp     = seriesXpLog.reduce((a, b) => a + b, 0);
    const perfectSeries = seriesMedals.length === 10 && seriesMedals.every(m => m === "🥇");
    const medalCounts = seriesMedals.reduce((acc, m) => { acc[m] = (acc[m] ?? 0) + 1; return acc; }, {});
    const dominantMedal = ["🥇","🥈","🥉","🎯"].find(m => medalCounts[m] === Math.max(...Object.values(medalCounts))) ?? "🎯";

    return (
      <SeriesEndScreen
        xpLog={seriesXpLog}
        medals={seriesMedals}
        totalXp={totalXp}
        dominantMedal={dominantMedal}
        perfectSeries={perfectSeries}
        addSession={addSession}
        onReplay={() => {
          const baseBpm = tempoMode === "fixed" ? bpmFixed : Math.round((bpmMin + bpmMax) / 2);
          seriesBaseBpmRef.current = baseBpm;
          seriesIdxRef.current = 0;
          setSeriesIdx(0);
          setSeriesXpLog([]);
          setSeriesMedals([]);
          setSeriesResult(null);
          setCurrentPage("game");
          setPhase("idle");
          setPattern(null);
          setScores([]);
          setEarnedPts(0);
          setProgress(0);
          setActiveIdx(-1);
          setRevealed(false);
          setChoices([]);
          setSelectedIdx(null);
          setPendingIdx(null);
          setBeatFlash(false);
          setMetroDotFlash(false);
          setCountdownN(1);
          startGame();
        }}
        onBack={() => {
          seriesBaseBpmRef.current = null;
          seriesIdxRef.current = 0;
          setSeriesIdx(0);
          setSeriesXpLog([]);
          setSeriesMedals([]);
          setSeriesResult(null);
          setCurrentPage("home");
        }}
      />
    );
  }

  // ── Calculs affichage ──────────────────────────────────────────────────────
  const playableCount = pattern?.figs.filter(f => !f.rest).length ?? 1;
  const rawMax        = playableCount * 100;
  const bonusMult     = 1 + REVEAL_BONUS[revealBeat] / 100;
  const maxPts        = Math.round(rawMax * bonusMult);
  const pct           = maxPts ? Math.round((earnedPts / maxPts) * 100) : 0;
  const medal         = pct >= 90 ? "🥇" : pct >= 70 ? "🥈" : pct >= 50 ? "🥉" : "🎯";

  const gradeMap = {};
  const devMap   = {};
  pattern?.figs.forEach((fig, i) => {
    if (!fig.rest) {
      const scoreIdx = pattern.figs.slice(0, i+1).filter(f => !f.rest).length - 1;
      if (scores[scoreIdx]) {
        gradeMap[i] = scores[scoreIdx].grade;
        devMap[i]   = scores[scoreIdx].dev; // null si manqué
      }
    }
  });

  const vexFigs    = pattern?.figs ?? [];
  const canStart   = phase === "idle" || phase === "results";
  const isPlaying  = phase === "playing";
  const choiceCols = typeof window !== "undefined" && window.innerWidth < 380 ? 1 : 2;

  const handleNext = () => {
    if (!canStart) return;
    if (seriesMode && phase === "results") {
      const nextIdx = seriesIdx + 1;
      const updatedXpLog  = [...seriesXpLog, earnedPts];
      const updatedMedals = [...seriesMedals, medal];
      if (nextIdx >= 10) {
        setSeriesXpLog(updatedXpLog);
        setSeriesMedals(updatedMedals);
        setCurrentPage("series-end");
      } else {
        setSeriesXpLog(updatedXpLog);
        setSeriesMedals(updatedMedals);
        setSeriesIdx(nextIdx);
        seriesIdxRef.current = nextIdx;
        startGame();
      }
    } else {
      startGame();
    }
  };

  const formulaCount = selectedFormulas.size;

  // ── Rendu jeu ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100dvh", background:"#030712", color:"#f9fafb",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"12px 14px 24px",
      fontFamily:"'Inter','Segoe UI',sans-serif", userSelect:"none",
    }}>

      {/* ── HEADER ── */}
      <div style={{width:"100%",maxWidth:540,display:"flex",
        justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:"#c084fc"}}>🎵 App Rythme</div>
          <div style={{fontSize:10,color:"#6b7280",display:"flex",alignItems:"center",gap:5}}>
            <div style={{
              width:7,height:7,borderRadius:"50%",flexShrink:0,
              background: beatFlash ? (beatStrong ? "#c084fc" : "#7c3aed") : "#1f2937",
              boxShadow: beatFlash ? "0 0 6px #c084fc" : "none",
              transition:"background 0.04s, box-shadow 0.04s",
            }}/>
            {sessionBpm} BPM · {formulaCount} formule{formulaCount>1?"s":""}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{
            background:"#111827",border:"1px solid #1f2937",
            borderRadius:999,padding:"3px 10px",fontSize:12,color:"#e7e5e4",fontWeight:700,
          }}>⭐ {totalPts}</div>
          <button
            onClick={() => { if (canStart) setCurrentPage("settings"); }}
            style={{
              background:"#111827",border:"1px solid #1f2937",borderRadius:10,
              color:"#9ca3af",fontSize:18,cursor:"pointer",
              padding:"2px 8px",lineHeight:1,
            }}
            title="Réglages"
          >⚙</button>
          <button
            onClick={() => {
              clearTids();
              audioTidsRef.current.forEach(clearTimeout);
              audioTidsRef.current = [];
              cancelAnimationFrame(rafRef.current);
              stopMic();
              seriesBaseBpmRef.current = null;
              seriesIdxRef.current = 0;
              setSeriesIdx(0);
              setSeriesXpLog([]);
              setSeriesMedals([]);
              setCurrentPage("home");
              setPhase("idle");
              setPattern(null);
            }}
            style={{
              background:"#111827",border:"1px solid #1f2937",borderRadius:8,
              color:"#c084fc",fontWeight:700,fontSize:12,padding:"4px 10px",
              cursor:"pointer",
            }}
          >← Activités</button>
        </div>
      </div>


      {/* ── ZONE PRINCIPALE ── */}
      <div style={{flex:1,width:"100%",maxWidth:540,display:"flex",gap:10,alignItems:"stretch"}}>

        {/* Contenu central */}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",gap:16,minWidth:0}}>

          {/* IDLE */}
          {phase==="idle" && (
            <div style={{textAlign:"center",padding:"0 20px"}}>
              <div style={{fontSize:52,marginBottom:10}}>
                {activity===1?"🥁":activity===2?"👂":activity===3?"🎵":"🎼"}
              </div>
              <p style={{color:"#6b7280",fontSize:13,lineHeight:1.7,maxWidth:300}}>
                {activity===1 && "Un rythme aléatoire s'affiche sur la portée. Reproduis-le en tapant sur le bouton au bon moment."}
                {activity===2 && "Écoute le rythme et reproduis-le en tapant. La portée reste cachée pendant le jeu."}
                {activity===3 && "Écoute le rythme joué et identifie la bonne portée parmi 4 propositions."}
                {activity===4 && "Observe la portée et identifie parmi 4 lectures audio celle qui correspond."}
              </p>
              <p style={{color:"#4b5563",fontSize:11,marginTop:6}}>
                {formulaCount} formule{formulaCount>1?"s":""} sélectionnée{formulaCount>1?"s":""}
                {" · "}
                <span
                  onClick={() => setCurrentPage("settings")}
                  style={{color:"#7c3aed",cursor:"pointer",textDecoration:"underline"}}
                >
                  modifier
                </span>
              </p>
            </div>
          )}

          {/* DÉCOMPTE + JEU + RÉSULTATS — activités 1 & 2 */}
          {(activity === 1 || activity === 2) && phase !== "idle" && pattern && (
            <div style={{width:"100%"}}>
              {/* En-tête hauteur fixe : chiffre du décompte OU info timeSig */}
              <div style={{height:96,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",marginBottom:8}}>
                {(phase==="countdown" || phase==="listening") ? (
                  <>
                    <div style={{fontSize:72,fontWeight:900,color:"#c084fc",lineHeight:1}}>
                      {countdownN ?? ""}
                    </div>
                    <p style={{color:"#6b7280",fontSize:12,marginTop:4}}>
                      {activity===1 && (revealed ? "Mémorise le rythme…" : "Prépare-toi…")}
                      {activity===2 && phase==="countdown" && (countdownN ? "Prépare-toi…" : "")}
                      {activity===2 && phase==="listening" && "Écoute le rythme…"}
                    </p>
                  </>
                ) : phase==="playing" && activity===2 ? (
                  <div style={{textAlign:"center",fontSize:16,fontWeight:700,color:"#c084fc"}}>
                    À toi de jouer !
                  </div>
                ) : (
                  <div style={{textAlign:"center",fontSize:11,color:"#6b7280"}}>
                    {pattern.timeSig} · {sessionBpm} BPM
                    {activity===1 && phase==="results" && REVEAL_BONUS[revealBeat]>0 &&
                      <span style={{color:"#fbbf24",marginLeft:8}}>
                        +{REVEAL_BONUS[revealBeat]}% bonus
                      </span>
                    }
                  </div>
                )}
              </div>

              {/* Portée — toujours présente */}
              {revealed ? (
                <div
                  onClick={phase === "results" ? handleNext : undefined}
                  style={{
                  position:"relative",
                  background:"#0f172a",
                  border: (activity === 1 ? metroDotFlash : beatFlash) ? "2px solid #7c3aed" : "2px solid #1e293b",
                  borderRadius:14,padding:"10px 6px 6px",overflow:"hidden",
                  cursor: phase === "results" ? "pointer" : "default"}}>
                  {/* Bouton son Rythme — top-left de la portée */}
                  <button
                    onClick={() => setRhythmSoundOn(v => !v)}
                    style={{
                      position:"absolute",top:6,left:6,zIndex:10,
                      background:rhythmSoundOn?"rgba(124,58,237,0.25)":"rgba(31,41,55,0.7)",
                      border:"1px solid rgba(255,255,255,0.08)",
                      borderRadius:99,padding:"3px 9px",
                      color:rhythmSoundOn?"#c084fc":"#4b5563",
                      fontSize:11,fontWeight:700,cursor:"pointer",height:28,lineHeight:1,
                    }}
                  >{rhythmSoundOn?"🔊":"🔇"}</button>
                  <RythmStaff
                    figures={vexFigs}
                    timeSig={pattern.timeSig}
                    activeIdx={isPlaying ? activeIdx : -1}
                    scoreGrades={phase==="results" ? gradeMap : undefined}
                    scoreDevs={phase==="results" ? devMap : undefined}
                    sessionBpm={sessionBpm}
                  />
                </div>
              ) : (
                <div style={{background:"#0f172a",
                  border: (activity === 2 && beatFlash) ? "2px solid #7c3aed" : "1px dashed #374151",
                  borderRadius:14,padding:"20px",textAlign:"center",
                  fontSize:28,color:"#374151",letterSpacing:8,
                  transition:"border-color 0.04s"}}>
                  ? ? ? ?
                </div>
              )}

              {/* Barre de progression — hauteur réservée pour éviter les sauts */}
              <div style={{marginTop:8,height:22}}>
                {isPlaying && (
                  <>
                    <div style={{width:"100%",height:3,background:"#1f2937",
                      borderRadius:99,overflow:"hidden"}}>
                      <div style={{width:`${progress*100}%`,height:"100%",
                        background:"linear-gradient(90deg,#7c3aed,#c084fc)",
                        transition:"width 0.1s linear",borderRadius:99}}/>
                    </div>
                    <div style={{textAlign:"right",fontSize:10,color:"#4b5563",marginTop:3}}>
                      {tapTimes.length} / {playableCount} taps
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* BILAN act 1 & 2 */}
          {(activity === 1 || activity === 2) && phase==="results" && scores.length>0 && (
            <div style={{width:"100%",background:"#0f172a",
              border:"1px solid #1e293b",borderRadius:14,padding:16,textAlign:"center"}}>
              <div style={{fontSize:36}}>{medal}</div>
              <div style={{fontSize:32,fontWeight:900,marginTop:2}}>{pct}%</div>
              <div style={{fontSize:12,color:"#6b7280",marginBottom:10}}>
                {earnedPts} / {maxPts} pts
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center"}}>
                {scores.map((s,i) => (
                  <div key={i} style={{
                    background:"#1e293b",borderRadius:999,
                    padding:"2px 9px",fontSize:10,fontWeight:600,
                    color:GRADE_COLOR[s.grade],
                    border:`1px solid ${GRADE_COLOR[s.grade]}33`,
                  }}>
                    {i+1} · {s.label}
                  </div>
                ))}
              </div>
              {detectedOffset !== null && Math.abs(detectedOffset) > 15 && (
                <div style={{fontSize:9,color:"#4b5563",marginTop:8}}>
                  Décalage compensé : {detectedOffset > 0 ? "+" : ""}{detectedOffset} ms
                </div>
              )}
            </div>
          )}
          {/* GRILLE act 3 — 4 portées */}
          {activity === 3 && phase !== "idle" && choices.length > 0 && (
            <div style={{width:"100%"}}>
              <div style={{textAlign:"center",fontSize:11,color:"#6b7280",marginBottom:10,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {phase==="countdown" ? (
                  <span style={{fontSize:40,fontWeight:900,color:"#c084fc",lineHeight:1}}>{countdownN}</span>
                ) : (
                  <>
                    <span>{phase==="playing" ? "Quelle portée ?" : "Résultat"} · {sessionBpm} BPM</span>
                    <button
                      onClick={() => playPatternAudio(choices[correctIdx], sessionBpm)}
                      style={{
                        background:"#4f46e5",border:"none",borderRadius:6,
                        padding:"3px 10px",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",
                      }}
                    >▶ Rejouer</button>
                  </>
                )}
              </div>
              <div style={{display:"grid",
                gridTemplateColumns: choiceCols === 1 ? "1fr" : "1fr 1fr",
                gap:8, opacity: phase==="countdown" ? 0.45 : 1, transition:"opacity 0.3s"}}>
                {choices.map((c, i) => {
                  let borderColor = "#1e293b";
                  if (phase === "playing" && beatFlash) borderColor = "#4f46e5";
                  if (phase === "results") {
                    if (i === correctIdx) borderColor = "#34d399";
                    else if (i === selectedIdx) borderColor = "#f87171";
                  }
                  return (
                    <div
                      key={i}
                      role="button"
                      onClick={() => { if (phase === "playing") handleChoice(i); }}
                      style={{
                        cursor: phase === "playing" ? "pointer" : "default",
                        borderRadius:12,
                        border:`2px solid ${borderColor}`,
                        background:"#0a0f1a",
                        padding:"8px 6px 4px",
                        transition: phase === "results" ? "border-color 0.2s" : "none",
                        boxShadow: phase === "playing" && beatFlash
                          ? "0 0 8px rgba(79,70,229,0.4)" : "none",
                      }}
                    >
                      <RythmStaff
                        figures={c.figs}
                        timeSig={c.timeSig}
                        activeIdx={-1}
                        width={choiceCols === 1 ? 480 : 240}
                        height={90}
                        showClef={false}
                        showTimeSig={true}
                      />
                    </div>
                  );
                })}
              </div>
              {phase === "results" && (
                <div style={{
                  marginTop:12,textAlign:"center",fontSize:13,fontWeight:700,
                  color: selectedIdx === correctIdx ? "#34d399" : "#f87171",
                }}>
                  {selectedIdx === correctIdx ? "✓ Bonne réponse ! +100 pts" : "✕ Mauvaise réponse."}
                </div>
              )}
            </div>
          )}

          {/* act 4 — portée cible + 4 boutons audio */}
          {activity === 4 && phase !== "idle" && pattern && (
            <div style={{width:"100%"}}>
              <div style={{textAlign:"center",fontSize:11,color:"#6b7280",marginBottom:6,
                display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span>{phase==="playing" ? "Quelle lecture ?" : "Résultat"} · {sessionBpm} BPM</span>
                {act4CountN !== null && (
                  <span style={{fontSize:28,fontWeight:900,color:"#c084fc",lineHeight:1}}>{act4CountN}</span>
                )}
              </div>
              <div style={{
                background:"#0f172a",
                border:`2px solid ${phase==="results" ? (selectedIdx===correctIdx ? "#34d399" : "#f87171") : "#1e293b"}`,
                borderRadius:14,padding:"10px 6px 6px",overflow:"hidden",marginBottom:12,
                transition:"border-color 0.2s",
              }}>
                <RythmStaff figures={pattern.figs} timeSig={pattern.timeSig} activeIdx={-1} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                {choices.map((c, i) => {
                  let bg = "#1f2937"; let col = "#9ca3af";
                  if (pendingIdx === i) { bg = "#4c1d95"; col = "#c084fc"; }
                  if (phase === "results") {
                    if (i === correctIdx) { bg = "#064e3b"; col = "#34d399"; }
                    else if (i === selectedIdx && i !== correctIdx) { bg = "#7f1d1d"; col = "#f87171"; }
                  }
                  return (
                    <button key={i}
                      onClick={() => {
                        if (phase !== "playing") return;
                        playPatternAudio(c, sessionBpm);
                        setPendingIdx(i);
                        // Comptage des temps synchronisé avec l'audio
                        setAct4CountN(1);
                        const bMs = 60000 / sessionBpm;
                        [1,2,3,4].forEach(n => {
                          const id = setTimeout(() => setAct4CountN(n), (n-1) * bMs);
                          audioTidsRef.current.push(id);
                        });
                        const endId = setTimeout(() => setAct4CountN(null), 4 * bMs + 200);
                        audioTidsRef.current.push(endId);
                      }}
                      style={{
                        background:bg,border:"none",borderRadius:10,
                        padding:"10px 0",color:col,fontSize:13,fontWeight:700,
                        cursor: phase==="playing" ? "pointer" : "default",
                        transition:"all 0.15s",
                      }}
                    >▶ {String.fromCharCode(65+i)}</button>
                  );
                })}
              </div>
              {phase === "playing" && (
                <button
                  onClick={() => handleChoice(pendingIdx)}
                  disabled={pendingIdx === null}
                  style={{
                    width:"100%",padding:"12px 0",
                    background: pendingIdx !== null ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "#1f2937",
                    border:"none",borderRadius:14,
                    color: pendingIdx !== null ? "#fff" : "#4b5563",
                    fontSize:14,fontWeight:700,
                    cursor: pendingIdx !== null ? "pointer" : "default",
                    transition:"all 0.2s",
                  }}
                >
                  {pendingIdx !== null ? `Valider : ${String.fromCharCode(65+pendingIdx)}` : "Écoute puis valide"}
                </button>
              )}
              {phase === "results" && (
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,
                  color: selectedIdx === correctIdx ? "#34d399" : "#f87171"}}>
                  {selectedIdx === correctIdx
                    ? "✓ Bonne réponse ! +100 pts"
                    : `✕ Mauvaise réponse. La bonne réponse était ${String.fromCharCode(65+correctIdx)}.`}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* ── BOUTON TAP / MIC / START ── */}
      <div style={{width:"100%",maxWidth:540,marginTop:14}}>
        {/* Bouton SON TAP visible pendant la correction (act 1 & 2) */}
        {(activity===1||activity===2) && phase==="results" && (
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button
              onClick={() => setTapSoundOn(v => !v)}
              style={{
                background:tapSoundOn?"rgba(124,58,237,0.25)":"rgba(31,41,55,0.7)",
                border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:99,padding:"3px 12px",
                color:tapSoundOn?"#c084fc":"#4b5563",
                fontSize:11,fontWeight:700,cursor:"pointer",height:28,lineHeight:1,
              }}
            >{tapSoundOn?"🥁 Son TAP":"🔕 Son TAP"}</button>
          </div>
        )}

        {/* Entrée pendant le jeu */}
        {(phase === "playing" || (phase === "countdown" && (activity === 1 || activity === 2)) || (phase === "listening" && activity === 2)) && inputMode==="tap" && (activity === 1 || activity === 2) && (
          <button onPointerDown={handleTap} style={{
            position:"relative",
            width:"100%",height:130,
            background:tapFlash
              ?"linear-gradient(135deg,#9333ea,#ec4899)"
              : (phase==="countdown" || (phase==="listening" && activity===2))
                ?"linear-gradient(135deg,#4c1d95,#3b0764)"
                :"linear-gradient(135deg,#7c3aed,#6d28d9)",
            border:"none",borderRadius:20,cursor:"pointer",
            color: (phase==="countdown" || (phase==="listening" && activity===2)) ? "#6b21a8" : "#fff",
            fontSize:26,fontWeight:900,letterSpacing:3,
            boxShadow: (phase==="countdown" || (phase==="listening" && activity===2))
              ?"0 8px 32px rgba(109,40,217,0.2)"
              :"0 8px 32px rgba(109,40,217,0.5)",
            transform:tapFlash?"scale(0.96)":"scale(1)",
            transition:"transform 0.06s,background 0.06s,color 0.06s",touchAction:"none",
          }}>
            {/* Bouton son TAP — top-left de la zone TAP */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setTapSoundOn(v => !v); }}
              style={{
                position:"absolute",top:8,left:10,zIndex:10,
                background:tapSoundOn?"rgba(124,58,237,0.35)":"rgba(0,0,0,0.45)",
                border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:99,padding:"3px 9px",
                color:tapSoundOn?"#e9d5ff":"#6b7280",
                fontSize:11,fontWeight:700,cursor:"pointer",height:28,lineHeight:1,
              }}
            >{tapSoundOn?"🥁":"🔕"}</button>
            TAP
          </button>
        )}

        {(phase === "playing" || (phase === "countdown" && (activity === 1 || activity === 2)) || (phase === "listening" && activity === 2)) && inputMode==="mic" && (activity === 1 || activity === 2) && (
          <div style={{
            width:"100%",height:130,borderRadius:20,overflow:"hidden",
            background: tapFlash ? "#4c1d95" : "#0a0f1a",
            border: tapFlash ? "2px solid #c084fc" : "2px solid #1e293b",
            display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:10,
            transition:"background 0.06s,border-color 0.06s",
          }}>
            <div style={{fontSize:13,color: micActive ? "#c084fc" : "#4b5563",fontWeight:700}}>
              {micActive ? "🎤 Écoute…" : "🎤 Micro inactif"}
            </div>
            {/* Barre de niveau */}
            <div style={{width:"80%",height:8,background:"#1e293b",borderRadius:99,overflow:"hidden"}}>
              <div style={{
                height:"100%",borderRadius:99,
                width:`${Math.min(micLevel / (micThreshold * 3), 1) * 100}%`,
                background: micLevel > micThreshold ? "#c084fc" : "#374151",
                transition:"width 0.05s",
              }}/>
            </div>
            {/* Marqueur seuil */}
            <div style={{width:"80%",position:"relative",height:4}}>
              <div style={{
                position:"absolute",
                left:`${Math.min(1/3, 1) * 100}%`,
                top:0,width:2,height:4,background:"#7c3aed",borderRadius:1,
              }}/>
            </div>
          </div>
        )}
        {canStart && (
          <button
            onClick={handleNext}
            style={{
              width:"100%",padding:"18px 0",
              background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
              border:"none",borderRadius:20,cursor:"pointer",
              color:"#fff",fontSize:16,fontWeight:700,
              boxShadow:"0 8px 32px rgba(109,40,217,0.4)",
            }}
          >
            {phase==="idle"
              ? (seriesMode ? "▶ Commencer la série" : "▶ Commencer")
              : seriesMode
                ? (seriesIdx >= 9 ? "📊 Bilan de ta série" : `➜ Exercice ${seriesIdx + 2}/10`)
                : "🔄 Exercice suivant"}
          </button>
        )}
      </div>
    </div>
  );
}
