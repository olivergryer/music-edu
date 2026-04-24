import { useState, useEffect, useRef, useCallback } from "react";
import RythmStaff from "./RythmStaff";
import SettingsPage from "./SettingsPage";
import useSheetData from "./useSheetData";

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
export const LEVEL_ORDER = ["C1/1","C1/2","C1/3","C1/4","C2/1","C2/2","C2/3","C2/4","C3"];

export const LEVEL_FORMULA_IDS = {
  "C1/1": ["bin_q","bin_qr","bin_h","bin_hr","bin_ee",
           "ter_qd","ter_eee","ter_qe","ter_eq"],
  "C1/2": ["bin_qde","bin_eqd","ter_ree","ter_eer","ter_qde_qde"],
  "C1/3": ["bin_ttt"],
  "C1/4": ["bin_ssss","bin_ess","bin_sse","bin_sser"],
  "C2/1": ["ter_hd"],
  "C2/2": ["bin_ere","bin_eer","bin_eqe","ter_ere"],
  "C2/3": [],
  "C2/4": [],
  "C3":   [],
};

// Formules actives par défaut : C1/1
const DEFAULT_SELECTED = new Set(LEVEL_FORMULA_IDS["C1/1"]);

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

function generateDistractors(target, pool, n = 3) {
  const key = p => p.figs.map(f => f.dur + (f.triplet ? "t" : "")).join(",");
  const targetKey = key(target);
  const result = [];
  let attempts = 0;
  while (result.length < n && attempts < 50) {
    attempts++;
    const c = generateDistractorVariant(target, pool);
    const ck = key(c);
    if (ck !== targetKey && result.every(d => key(d) !== ck)) result.push(c);
  }
  while (result.length < n) result.push(generateMeasure(target.timeSig, pool));
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
  // BPM = beats/min. Binary beat = quarter; ternary beat = dotted quarter = 1.5 quarters.
  // figDur() returns value in quarters, so normalize to ms-per-quarter.
  const quarterMs = isCompound ? (60000 / bpm) / 1.5 : 60000 / bpm;
  const ts = []; let t = 0;
  figs.forEach(fig => { ts.push(t); t += figDur(fig) * quarterMs; });
  return { timestamps: ts, totalMs: t };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
const TOL = { perfect:80, good:160, ok:280 };
function scoreTap(actual, expected) {
  const d = Math.abs(actual - expected);
  if (d <= TOL.perfect) return { label:"Parfait ✦", pts:100, grade:"perfect" };
  if (d <= TOL.good)    return { label:"Bien ✓",    pts:70,  grade:"good" };
  if (d <= TOL.ok)      return { label:"Moyen",     pts:40,  grade:"ok" };
  return                       { label:"Raté ✕",    pts:0,   grade:"miss" };
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

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RythmApp() {
  const {
    formulaCatalog, levelOrder, levelFormulaIds,
    sheetId, sheetStatus, sheetError, setSheetId, resetToDefault,
  } = useSheetData({ formulaCatalog: FORMULA_CATALOG, levelOrder: LEVEL_ORDER, levelFormulaIds: LEVEL_FORMULA_IDS });

  const [currentPage,     setCurrentPage]     = useState("game");
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
  const [flashOffsetMs,setFlashOffsetMs]= useState(-50);
  const [lives,        setLives]        = useState(3);

  // Act 3 & 4
  const [choices,     setChoices]     = useState([]);
  const [correctIdx,  setCorrectIdx]  = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [pendingIdx,  setPendingIdx]  = useState(null);
  const [act4CountN,  setAct4CountN]  = useState(null);

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

  const pulse = useCallback((strong = false) => {
    beep(strong);
    setBeatStrong(strong);
    setBeatFlash(true);
    setTimeout(() => setBeatFlash(false), strong ? 160 : 110);
  }, [beep]);

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
        const id = setTimeout(() => beep(i === 0), delayMs + timestamps[i]);
        audioTidsRef.current.push(id);
      }
    });
  }, [beep]);

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
    const lo = Math.min(bpmMin, bpmMax);
    const hi = Math.max(bpmMin, bpmMax);
    return TEMPI.reduce((prev, cur) => {
      const rand = lo + Math.random() * (hi - lo);
      return Math.abs(cur - rand) < Math.abs(prev - rand) ? cur : prev;
    }, TEMPI[0]);
  }, [tempoMode, bpmFixed, bpmMin, bpmMax]);

  // ── Démarrage ─────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    clearTids();
    audioTidsRef.current.forEach(clearTimeout); audioTidsRef.current = [];
    cancelAnimationFrame(rafRef.current);
    const pat  = randomPattern();
    const bpm  = actualBpm();
    const beatMs = 60000 / bpm;
    const { timestamps, totalMs } = toTimestamps(pat.figs, bpm, pat.timeSig);

    // ── Activités 3 & 4 : countdown court + choix parmi 4 ─────────────────
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
      setPhase("countdown"); setCountdownN(3);
      pulse();
      tid(() => { setCountdownN(4); pulse(false); }, beatMs);
      tid(() => {
        setPhase("playing");
        if (activity === 3) playPatternAudio(pat, bpm);
      }, 2 * beatMs);
      return;
    }

    // ── Activité 2 : écoute puis reproduit (3 mesures enchaînées) ──────────
    if (activity === 2) {
      setPattern(pat); setSessionBpm(bpm);
      setTapTimes([]); tapTimesRef.current = [];
      setScores([]); setActiveIdx(-1); setProgress(0);
      setRevealed(false);
      setPhase("countdown"); setCountdownN(1);
      pulse(true);
      // playStartRef = début de la mesure de reproduction (mesure 3)
      playStartRef.current = performance.now() + 4 * beatMs + totalMs + 3 * beatMs;

      // Mesure 1 — décompte avec beeps : beats 2,3,4 graves
      [1,2,3,4].forEach((n, i) => {
        tid(() => { setCountdownN(n); if (i > 0) pulse(false); }, i * beatMs);
      });

      // Mesure 2 — modèle joue : flash visuel seulement, pas de beep métronome
      tid(() => {
        setPhase("listening"); setCountdownN(1);
        setBeatStrong(true); setBeatFlash(true); setTimeout(() => setBeatFlash(false), 160);
        // Notes du rythme modèle
        timestamps.forEach((ts, i) => {
          if (!pat.figs[i].rest) tid(() => beep(i === 0), ts);
        });
        // Beats 2,3,4 : flash visuel uniquement
        [1,2,3].forEach(k => {
          tid(() => {
            setCountdownN(k + 1);
            setBeatStrong(false); setBeatFlash(true); setTimeout(() => setBeatFlash(false), 110);
          }, k * beatMs);
        });
      }, 4 * beatMs);

      // Mesure 3 — reproduction : commence exactement après la mesure modèle
      tid(() => {
        pulse(true);
        setPhase("playing");
        startRef.current = performance.now();
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
      }, 4 * beatMs + totalMs);
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
      pulse(true);
      setPhase("playing");
      startRef.current = performance.now();

      timestamps.forEach((ts, i) => {
        tid(() => {
          setActiveIdx(i);
          if (i > 0 && !pat.figs[i].rest) pulse();
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
  }, [randomPattern, actualBpm, pulse, beep, revealBeat, activity, flashOffsetMs, formulaCatalog, selectedFormulas, playPatternAudio]);

  // ── Choix act 3 & 4 ───────────────────────────────────────────────────────
  const handleChoice = useCallback((idx) => {
    if (phase !== "playing") return;
    audioTidsRef.current.forEach(clearTimeout); audioTidsRef.current = [];
    const correct = idx === correctIdx;
    setSelectedIdx(idx);
    const pts = correct ? 100 : 0;
    setEarnedPts(pts);
    setTotalPts(prev => prev + pts);
    if (!correct) setLives(l => Math.max(0, l - 1));
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
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 80);
  }, [phase, activity]);

  // ── Calcul des résultats ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "results" || !pattern) return;
    if (activity === 3 || activity === 4) return;
    const { timestamps } = toTimestamps(pattern.figs, sessionBpm, pattern.timeSig);
    const playable = pattern.figs
      .map((fig, i) => ({ fig, ts: timestamps[i] }))
      .filter(({ fig }) => !fig.rest);
    const s = playable.map(({ ts }, i) => {
      const tap = tapTimesRef.current[i];
      if (tap === undefined) return { label:"Manqué ✕", pts:0, grade:"miss" };
      return scoreTap(tap, ts);
    });
    setScores(s);
    const raw    = s.reduce((sum, x) => sum + x.pts, 0);
    const bonus  = REVEAL_BONUS[revealBeat] / 100;
    const earned = Math.round(raw * (1 + bonus));
    setEarnedPts(earned);
    setTotalPts(prev => prev + earned);
    const pct = playable.length ? Math.round((raw / (playable.length * 100)) * 100) : 0;
    if (pct < 50) setLives(l => Math.max(0, l - 1));
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
        onClose={() => setCurrentPage("game")}
        sheetId={sheetId}
        sheetStatus={sheetStatus}
        sheetError={sheetError}
        onSheetLoad={setSheetId}
        onSheetReset={resetToDefault}
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
  pattern?.figs.forEach((fig, i) => {
    if (!fig.rest) {
      const scoreIdx = pattern.figs.slice(0, i+1).filter(f => !f.rest).length - 1;
      if (scores[scoreIdx]) gradeMap[i] = scores[scoreIdx].grade;
    }
  });

  const vexFigs   = pattern?.figs ?? [];
  const canStart  = phase === "idle" || phase === "results";
  const isPlaying = phase === "playing";

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
          {[0,1,2].map(i => (
            <span key={i} style={{fontSize:20,color:i<lives?"#c084fc":"#1f2937"}}>♩</span>
          ))}
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
        </div>
      </div>

      {/* ── ACTIVITÉS ── */}
      <div style={{width:"100%",maxWidth:540,display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
        {ACTIVITIES.map(a => (
          <button key={a.id}
            onClick={() => { if (canStart) setActivity(a.id); }}
            style={{
              flex:1,padding:"5px 4px",borderRadius:10,fontSize:10,fontWeight:600,
              cursor:"pointer",border:"none",minWidth:80,
              background:activity===a.id?"#7c3aed":"#111827",
              color:activity===a.id?"#fff":"#6b7280",
            }}
          >
            {a.id}. {a.label}
          </button>
        ))}
      </div>

      {/* ── TEMPO ── */}
      <div style={{width:"100%",maxWidth:540,marginBottom:12,
        background:"#0a0f1a",borderRadius:14,padding:"10px 14px"}}>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {["fixed","range"].map(mode => (
            <button key={mode}
              onClick={() => { if (canStart) setTempoMode(mode); }}
              style={{
                flex:1,padding:"4px",borderRadius:8,fontSize:11,fontWeight:600,
                cursor:"pointer",border:"none",
                background:tempoMode===mode?"#4f46e5":"#111827",
                color:tempoMode===mode?"#fff":"#6b7280",
              }}
            >{mode==="fixed"?"Tempo fixe":"Plage aléatoire"}</button>
          ))}
        </div>
        {tempoMode === "fixed" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",
              fontSize:10,color:"#6b7280",marginBottom:3}}>
              <span>Tempo</span>
              <span style={{color:"#c084fc",fontWeight:700}}>{bpmFixed} BPM</span>
            </div>
            <input type="range" min={0} max={TEMPI.length-1}
              value={closestTempoIdx(bpmFixed)}
              onChange={e => setBpmFixed(TEMPI[+e.target.value])}
              disabled={isPlaying||phase==="countdown"}
              style={{width:"100%",accentColor:"#7c3aed"}}
            />
          </div>
        )}
        {tempoMode === "range" && (
          <div style={{display:"flex",gap:12}}>
            {[["Min",bpmMin,setBpmMin],["Max",bpmMax,setBpmMax]].map(([label,val,set])=>(
              <div key={label} style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  fontSize:10,color:"#6b7280",marginBottom:3}}>
                  <span>{label}</span>
                  <span style={{color:"#c084fc",fontWeight:700}}>{val} BPM</span>
                </div>
                <input type="range" min={0} max={TEMPI.length-1}
                  value={closestTempoIdx(val)}
                  onChange={e => set(TEMPI[+e.target.value])}
                  disabled={isPlaying||phase==="countdown"}
                  style={{width:"100%",accentColor:"#7c3aed"}}
                />
              </div>
            ))}
          </div>
        )}
        {/* Offset flash visuel */}
        <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #1f2937"}}>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:10,color:"#6b7280",marginBottom:3}}>
            <span>Offset flash bordure</span>
            <span style={{color:"#c084fc",fontWeight:700}}>{flashOffsetMs} ms</span>
          </div>
          <input type="range" min={-200} max={200} step={5}
            value={flashOffsetMs}
            onChange={e => setFlashOffsetMs(+e.target.value)}
            style={{width:"100%",accentColor:"#7c3aed"}}
          />
        </div>
      </div>

      {/* ── BONUS RÉVÉLATION ── */}
      {canStart && activity===1 && (
        <div style={{width:"100%",maxWidth:540,marginBottom:12}}>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:6}}>
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
                      {countdownN}
                    </div>
                    <p style={{color:"#6b7280",fontSize:12,marginTop:4}}>
                      {activity===1 && (revealed ? "Mémorise le rythme…" : "Prépare-toi…")}
                      {activity===2 && phase==="countdown" && "Prépare-toi…"}
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
                <div style={{
                  background:"#0f172a",
                  border: metroDotFlash ? "2px solid #7c3aed" : "2px solid #1e293b",
                  borderRadius:14,padding:"10px 6px 6px",overflow:"hidden"}}>
                  <RythmStaff
                    figures={vexFigs}
                    timeSig={pattern.timeSig}
                    activeIdx={isPlaying ? activeIdx : -1}
                    scoreGrades={phase==="results" ? gradeMap : undefined}
                    width={520}
                  />
                </div>
              ) : (
                <div style={{background:"#0f172a",border:"1px dashed #374151",
                  borderRadius:14,padding:"20px",textAlign:"center",
                  fontSize:28,color:"#374151",letterSpacing:8}}>
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
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,
                opacity: phase==="countdown" ? 0.45 : 1, transition:"opacity 0.3s"}}>
                {choices.map((c, i) => {
                  let borderColor = "#1e293b";
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
                        transition:"border-color 0.2s",
                      }}
                    >
                      <RythmStaff
                        figures={c.figs}
                        timeSig={c.timeSig}
                        activeIdx={-1}
                        width={240}
                        height={90}
                        showClef={false}
                        showTimeSig={false}
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
                <RythmStaff figures={pattern.figs} timeSig={pattern.timeSig} activeIdx={-1} width={520} />
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

        {/* Toggle TAP / MIC — visible quand canStart + act 1 & 2 */}
        {canStart && (activity === 1 || activity === 2) && (
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {[["tap","TAP"],["mic","🎤 MIC"]].map(([mode,label]) => (
              <button key={mode}
                onClick={() => {
                  if (mode === "mic") { setInputMode("mic"); startMic(); }
                  else { setInputMode("tap"); stopMic(); }
                }}
                style={{
                  flex:1,padding:"6px",borderRadius:10,fontSize:12,fontWeight:700,
                  cursor:"pointer",border:"none",
                  background: inputMode===mode ? "#7c3aed" : "#111827",
                  color: inputMode===mode ? "#fff" : "#6b7280",
                }}
              >{label}</button>
            ))}
          </div>
        )}

        {/* Sensibilité micro — visible quand mode MIC + canStart */}
        {inputMode==="mic" && canStart && (
          <div style={{marginBottom:8,background:"#0a0f1a",
            borderRadius:10,padding:"8px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              fontSize:10,color:"#6b7280",marginBottom:3}}>
              <span>Seuil de détection <span style={{color:"#4b5563"}}>↑ moins sensible</span></span>
              <span style={{color:"#c084fc",fontWeight:700}}>
                {micThreshold.toFixed(3)}
              </span>
            </div>
            <input type="range" min={5} max={500} step={5}
              value={Math.round(micThreshold * 1000)}
              onChange={e => setMicThreshold(+e.target.value / 1000)}
              style={{width:"100%",accentColor:"#7c3aed"}}
            />
          </div>
        )}

        {/* Erreur micro */}
        {micError && (
          <div style={{fontSize:10,color:"#f87171",marginBottom:6,textAlign:"center"}}>
            {micError}
          </div>
        )}

        {/* Entrée pendant le jeu */}
        {(phase === "playing" || (phase === "countdown" && activity === 1)) && inputMode==="tap" && (activity === 1 || activity === 2) && (
          <button onPointerDown={handleTap} style={{
            width:"100%",height:130,
            background:tapFlash
              ?"linear-gradient(135deg,#9333ea,#ec4899)"
              : phase==="countdown"
                ?"linear-gradient(135deg,#4c1d95,#3b0764)"
                :"linear-gradient(135deg,#7c3aed,#6d28d9)",
            border:"none",borderRadius:20,cursor:"pointer",
            color: phase==="countdown" ? "#6b21a8" : "#fff",
            fontSize:26,fontWeight:900,letterSpacing:3,
            boxShadow: phase==="countdown"
              ?"0 8px 32px rgba(109,40,217,0.2)"
              :"0 8px 32px rgba(109,40,217,0.5)",
            transform:tapFlash?"scale(0.96)":"scale(1)",
            transition:"transform 0.06s,background 0.06s,color 0.06s",touchAction:"none",
          }}>TAP</button>
        )}

        {(phase === "playing" || (phase === "countdown" && activity === 1)) && inputMode==="mic" && (activity === 1 || activity === 2) && (
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
          <button onClick={startGame} style={{
            width:"100%",padding:"18px 0",
            background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
            border:"none",borderRadius:20,cursor:"pointer",
            color:"#fff",fontSize:16,fontWeight:700,
            boxShadow:"0 8px 32px rgba(109,40,217,0.4)",
          }}>
            {phase==="idle" ? "▶ Commencer" : "🔄 Exercice suivant"}
          </button>
        )}
      </div>
    </div>
  );
}
