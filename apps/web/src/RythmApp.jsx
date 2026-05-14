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

  const sameCount = alternatives.filter(f => f.figs.length === slot.formula.figs.length);
  const pool2 = sameCount.length > 0 ? sameCount : alternatives;
  const newFormula = pool2[Math.floor(Math.random() * pool2.length)];
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
  const pf  = beatMs * 0.02;  // modification manuelle --> ne pas altérer !
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
    <div className="bg-app text-app min-h-dvh flex flex-col items-center px-3.5 py-5 pb-8">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">{dominantMedal}</div>
          <div className="text-2xl font-black" style={{ color: '#4A6CF7' }}>Série terminée !</div>
          <div className="text-sm text-app-muted mt-1">
            {perfectSeries ? "Série parfaite — incroyable !" : `Score total : +${totalXp} XP`}
          </div>
        </div>

        {/* Grille des 10 exercices */}
        <div className="bg-surface rounded-2xl p-3.5 mb-4">
          <div className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-2.5">
            Détail de la série
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {medals.map((m, i) => (
              <div key={i} className="bg-surface-2 rounded-xl p-2 text-center">
                <div className="text-lg">{m}</div>
                <div className="text-[9px] text-app-muted mt-0.5">+{xpLog[i] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>

        {/* XP total */}
        <div className="bg-surface rounded-2xl p-3.5 mb-4 flex justify-between items-center">
          <span className="text-sm text-app-muted">XP gagné</span>
          <span className="text-xl font-black" style={{ color: '#4A6CF7' }}>+{totalXp} ⭐</span>
        </div>

        {/* Trophées débloqués */}
        {result?.newTrophies?.length > 0 && (
          <div className="rounded-2xl p-3.5 mb-4 border" style={{ background: 'rgba(74,108,247,0.08)', borderColor: '#4A6CF7' }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: '#4A6CF7' }}>
              🏅 Trophée{result.newTrophies.length > 1 ? "s" : ""} débloqué{result.newTrophies.length > 1 ? "s" : ""} !
            </div>
            {result.newTrophies.map(id => {
              const t = TROPHIES_IMPORT.find(x => x.id === id);
              return t ? (
                <div key={id} className="text-sm text-app mb-1">{t.icon} {t.label}</div>
              ) : null;
            })}
          </div>
        )}

        {/* Level-up */}
        {result?.leveledUp && (
          <div className="rounded-2xl p-3.5 mb-4 text-center border" style={{ background: 'rgba(74,108,247,0.08)', borderColor: '#4A6CF7' }}>
            <div className="text-2xl mb-1">🎉</div>
            <div className="text-sm font-bold" style={{ color: '#4A6CF7' }}>Niveau supérieur !</div>
          </div>
        )}

        <div className="flex gap-2.5 mt-2">
          <button onClick={onBack} className="flex-1 py-3.5 rounded-2xl cursor-pointer bg-surface-2 border border-app text-app-muted text-sm font-bold">
            ← Activités
          </button>
          <button onClick={onReplay} className="flex-[2] py-3.5 rounded-2xl cursor-pointer text-white text-sm font-bold border-none" style={{ background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', boxShadow: '0 8px 32px rgba(74,108,247,0.4)' }}>
            🔄 Rejouer la série
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Persistance réglages ─────────────────────────────────────────────────────
const SETTINGS_KEY = "rythm-settings-v1";
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── Tutorial ────────────────────────────────────────────────────────────────
export const ENABLE_TUTORIAL = true;   // true = toujours | false = jamais | "once" = une fois
export const TUTORIAL_VERSION = "1";   // incrémenter force réaffichage en mode "once"

const ACT_ICONS = {
  1: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="10" width="24" height="3" rx="1.5" fill="#4b5563"/>
      <rect x="4" y="15" width="24" height="3" rx="1.5" fill="#4b5563"/>
      <rect x="4" y="20" width="24" height="3" rx="1.5" fill="#4b5563"/>
      <circle cx="10" cy="20" r="3" fill="currentColor"/>
      <line x1="13" y1="20" x2="13" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="21" cy="18" r="3" fill="currentColor"/>
      <line x1="24" y1="18" x2="24" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  2: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 7C11.03 7 7 11.03 7 16s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 14c0-2.21 1.79-4 4-4s4 1.79 4 4v4c0 2.21-1.79 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="16" y1="25" x2="16" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="28" x2="20" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  3: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="6" width="26" height="20" rx="3" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="3" y1="12" x2="29" y2="12" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="3" y1="20" x2="29" y2="20" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="20" r="2.5" fill="currentColor"/>
      <line x1="12.5" y1="20" x2="12.5" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="20" cy="18" r="2.5" fill="currentColor"/>
      <line x1="22.5" y1="18" x2="22.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  4: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M13 11.5l9 4.5-9 4.5V11.5z" fill="currentColor"/>
    </svg>
  ),
};

const ACT_SHORT = {
  1: "Reproduis ce que tu vois",
  2: "Reproduis ce que tu entends",
  3: "Identifie la bonne portée",
  4: "Identifie la bonne lecture",
};

function TutorialSlide1() {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:220 }}>
      {[1,2,3,4].map(id => (
        <div key={id} style={{ background:'rgba(74,108,247,0.1)', border:'2px solid rgba(74,108,247,0.4)', borderRadius:14, padding:'14px 8px 10px', textAlign:'center', color:'#c084fc' }}>
          {ACT_ICONS[id]}
          <div style={{ fontSize:10, color:'#a5b4fc', marginTop:6, lineHeight:1.3 }}>{ACTIVITIES[id-1].label}</div>
        </div>
      ))}
    </div>
  );
}

function TutorialSlide2({ activity }) {
  const id = activity || 1;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, width:240 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:10,
          background: i===id ? 'rgba(74,108,247,0.15)' : 'rgba(255,255,255,0.03)',
          border: `2px solid ${i===id ? '#4A6CF7' : 'rgba(255,255,255,0.06)'}`,
          borderRadius:12, padding:'8px 12px',
          color: i===id ? '#fff' : '#6b7280',
        }}>
          <div style={{ color: i===id ? '#4A6CF7' : '#6b7280', flexShrink:0 }}>{ACT_ICONS[i]}</div>
          <div>
            <div style={{ fontSize:11, fontWeight:700 }}>{ACTIVITIES[i-1].label}</div>
            <div style={{ fontSize:9, marginTop:2, color: i===id ? '#a5b4fc' : '#4b5563' }}>{ACT_SHORT[i]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TutorialSlide3() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, alignItems:'center', width:220 }}>
      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:1, background:'rgba(74,108,247,0.18)', border:'2px solid #4A6CF7', borderRadius:16, padding:'20px 24px', textAlign:'center' }}>
          <div style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:2 }}>TAP</div>
          <div style={{ fontSize:10, color:'#a5b4fc', marginTop:6 }}>Touche l'écran</div>
        </div>
        <div style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'2px solid rgba(255,255,255,0.1)', borderRadius:16, padding:'20px 12px', textAlign:'center' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin:'0 auto', display:'block' }}>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="#6b7280" strokeWidth="2" fill="none"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
            <line x1="12" y1="19" x2="12" y2="23" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <div style={{ fontSize:10, color:'#6b7280', marginTop:6 }}>Micro</div>
        </div>
      </div>
      <div style={{ fontSize:11, color:'#6b7280', textAlign:'center', lineHeight:1.6, maxWidth:200 }}>
        TAP : tape l'écran au rythme.<br/>Micro : chante ou frappe des mains.
      </div>
    </div>
  );
}

function TutorialSlide4({ levelOrder }) {
  const levels = levelOrder.length > 0 ? levelOrder : ["C1/1","C1/2","C2/1","C2/2","C3/1","C3/2"];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, alignItems:'center', width:240 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center' }}>
        {levels.map((lv, i) => (
          <div key={lv} style={{
            padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700,
            background: i===0 ? '#4A6CF7' : i===1 ? 'rgba(74,108,247,0.25)' : 'rgba(255,255,255,0.05)',
            color: i===0 ? '#fff' : i===1 ? '#a5b4fc' : '#4b5563',
          }}>{lv}</div>
        ))}
      </div>
      <div style={{ fontSize:11, color:'#6b7280', textAlign:'center', lineHeight:1.6, maxWidth:220 }}>
        Chaque niveau introduit de nouvelles formules rythmiques. Commence en C1/1 !
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(74,108,247,0.08)', border:'1px solid rgba(74,108,247,0.2)', borderRadius:10, padding:'8px 14px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fbbf24"/></svg>
        <span style={{ fontSize:11, color:'#fbbf24', fontWeight:600 }}>XP débloqués à chaque exercice réussi</span>
      </div>
    </div>
  );
}

function TutorialSlide5() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, alignItems:'center', width:240 }}>
      <div style={{ width:'100%', borderRadius:18, padding:'18px 0', background:'linear-gradient(135deg,#4A6CF7,#8B5CF6)', textAlign:'center', color:'#fff', fontSize:16, fontWeight:900, boxShadow:'0 8px 32px rgba(74,108,247,0.4)' }}>
        ▶ Commencer
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'10px 16px', width:'100%', boxSizing:'border-box' }}>
        <span style={{ fontSize:20 }}>⚙</span>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#e5e7eb' }}>Réglages</div>
          <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>Tempo · Niveau · Mode de jeu</div>
        </div>
      </div>
    </div>
  );
}

const TUTO_SLIDES = [
  {
    title: "Bienvenue dans Rythme !",
    body: "Entraîne-toi à reproduire et reconnaître des rythmes musicaux, du débutant au virtuose.",
    Visual: TutorialSlide1,
  },
  {
    title: "4 exercices progressifs",
    body: "Chaque mode travaille une compétence différente. Alterne-les pour progresser vite.",
    Visual: TutorialSlide2,
  },
  {
    title: "Tap ou Micro",
    body: "Choisis ton mode de saisie dans les Réglages avant de commencer.",
    Visual: TutorialSlide3,
  },
  {
    title: "Choisis ton niveau",
    body: "Commence en C1/1. Les niveaux se débloquent au fur et à mesure de ta progression.",
    Visual: TutorialSlide4,
  },
  {
    title: "C'est parti !",
    body: "Lance un exercice. Tes réglages sont sauvegardés d'une session à l'autre.",
    Visual: TutorialSlide5,
  },
];

function TutorialOverlay({ onDone, levelOrder, activity }) {
  const [slide, setSlide] = useState(0);
  const total = TUTO_SLIDES.length;
  const { title, body, Visual } = TUTO_SLIDES[slide];

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:100,
      background:'#030712',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between',
      padding:'24px 20px 36px',
      overflowY:'auto',
    }}>
      {/* Top bar */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ display:'flex', gap:6 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              width: i===slide ? 20 : 7, height:7, borderRadius:4,
              background: i <= slide ? '#4A6CF7' : 'rgba(255,255,255,0.1)',
              transition:'width 0.25s,background 0.25s',
            }}/>
          ))}
        </div>
        <button
          onClick={onDone}
          style={{ background:'none', border:'none', color:'#6b7280', fontSize:13, fontWeight:700, cursor:'pointer', padding:'4px 8px' }}
        >Ignorer</button>
      </div>

      {/* Visual */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 0' }}>
        <Visual levelOrder={levelOrder} activity={activity} />
      </div>

      {/* Text */}
      <div style={{ width:'100%', maxWidth:400, textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'#f9fafb', marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:14, color:'#9ca3af', lineHeight:1.6 }}>{body}</div>
      </div>

      {/* Navigation */}
      <div style={{ width:'100%', maxWidth:400, display:'flex', gap:10 }}>
        {slide > 0 && (
          <button
            onClick={() => setSlide(s => s - 1)}
            style={{ flex:1, padding:'14px 0', borderRadius:16, border:'2px solid rgba(74,108,247,0.3)', background:'none', color:'#4A6CF7', fontSize:14, fontWeight:700, cursor:'pointer' }}
          >← Précédent</button>
        )}
        <button
          onClick={() => slide < total - 1 ? setSlide(s => s + 1) : onDone()}
          style={{ flex:2, padding:'14px 0', borderRadius:16, border:'none', background:'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer', boxShadow:'0 8px 24px rgba(74,108,247,0.35)' }}
        >{slide < total - 1 ? "Suivant →" : "Commencer !"}</button>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RythmApp() {
  const {
    formulaCatalog, levelOrder, levelFormulaIds,
    sheetId, sheetStatus, sheetError, setSheetId: _setSheetId, resetToDefault: _resetToDefault,
  } = useSheetData(
    { formulaCatalog: FORMULA_CATALOG, levelOrder: LEVEL_ORDER, levelFormulaIds: LEVEL_FORMULA_IDS },
    "/formules-rythme-template.csv"
  );

  const [currentPage,     setCurrentPage]     = useState("home");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [openAccordion,   setOpenAccordion]   = useState("saisie");
  const [showTutorial,    setShowTutorial]    = useState(() => {
    if (!ENABLE_TUTORIAL) return false;
    if (ENABLE_TUTORIAL === true) return true;
    return !localStorage.getItem(`rythm-tuto-${TUTORIAL_VERSION}`);
  });
  const [selectedFormulas,setSelectedFormulas] = useState(() => {
    const s = loadSettings();
    return s.selectedFormulas ? new Set(s.selectedFormulas) : DEFAULT_SELECTED;
  });
  const [activity,        setActivity]        = useState(1);

  // Tempo
  const [tempoMode,    setTempoMode]    = useState(() => loadSettings().tempoMode    ?? "fixed");
  const [bpmFixed,     setBpmFixed]     = useState(() => loadSettings().bpmFixed     ?? 80);
  const [bpmMin,       setBpmMin]       = useState(() => loadSettings().bpmMin       ?? 60);
  const [bpmMax,       setBpmMax]       = useState(() => loadSettings().bpmMax       ?? 100);
  const [sessionBpm,   setSessionBpm]   = useState(80);

  // Bonus révélation
  const [revealBeat,   setRevealBeat]   = useState(() => loadSettings().revealBeat ?? 1);

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
  const [flashBorderOn, setFlashBorderOn] = useState(true);
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
  const [inputMode,    setInputMode]    = useState(() => loadSettings().inputMode ?? "tap"); // "tap" | "mic"
  const [micActive,    setMicActive]    = useState(false);
  const [micLevel,     setMicLevel]     = useState(0);
  const [micThreshold, setMicThreshold] = useState(0.05);
  const [micError,     setMicError]     = useState("");
  const [expandedBadge, setExpandedBadge] = useState(null);

  const pointerDownPosRef = useRef(null);
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

  const userSheetLoadRef = useRef(false);
  const setSheetId = useCallback((raw) => {
    userSheetLoadRef.current = true;
    _setSheetId(raw);
  }, [_setSheetId]);
  const resetToDefault = useCallback(() => {
    userSheetLoadRef.current = true;
    _resetToDefault();
  }, [_resetToDefault]);

  const { addSession } = useProgressFirebase();

  const handleTutorialDone = () => {
    if (ENABLE_TUTORIAL === "once") {
      localStorage.setItem(`rythm-tuto-${TUTORIAL_VERSION}`, "1");
    }
    setShowTutorial(false);
  };

  // Son rythme toujours actif pour act 2/3/4 (essentiel à l'écoute)
  useEffect(() => {
    if (activity >= 2) setRhythmSoundOn(true);
  }, [activity]);

  // ── Persistance réglages ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        selectedFormulas: [...selectedFormulas],
        tempoMode, bpmFixed, bpmMin, bpmMax,
        revealBeat, inputMode,
      }));
    } catch {}
  }, [selectedFormulas, tempoMode, bpmFixed, bpmMin, bpmMax, revealBeat, inputMode]);

  // ── Gestion formules / niveaux ─────────────────────────────────────────────
  const toggleFormula = useCallback(id => {
    setSelectedFormulas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Reset formules seulement si l'utilisateur a chargé un sheet manuellement
  useEffect(() => {
    if (!userSheetLoadRef.current) return;
    userSheetLoadRef.current = false;
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
  const rhythmBeep = useCallback((strong = false, forced = false) => {
    if (!forced && !rhythmSoundRef.current) return;
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
  const tapBeep = useCallback((forced = false) => {
    if (!forced && !tapSoundRef.current) return;
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

  const replayTaps = useCallback(() => {
    audioTidsRef.current.forEach(clearTimeout);
    audioTidsRef.current = [];
    const minT = Math.min(0, ...tapTimes);
    tapTimes.forEach(t => {
      const delay = Math.max(0, t - minT);
      const id = setTimeout(() => tapBeep(true), delay);
      audioTidsRef.current.push(id);
    });
    if (pattern && sessionBpm) {
      const beatMs = 60000 / sessionBpm;
      const { totalMs } = toTimestamps(pattern.figs, sessionBpm, pattern.timeSig);
      const nBeats = Math.round(totalMs / beatMs);
      for (let k = 0; k < nBeats; k++) {
        const id = setTimeout(() => {
          setBeatStrong(k === 0);
          setBeatFlash(true);
          setTimeout(() => setBeatFlash(false), k === 0 ? 160 : 110);
        }, k * beatMs);
        audioTidsRef.current.push(id);
      }
    }
  }, [tapTimes, tapBeep, pattern, sessionBpm]);

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

  const playPatternAudio = useCallback((pat, bpmVal, delayMs = 0, forced = false) => {
    audioTidsRef.current.forEach(clearTimeout);
    audioTidsRef.current = [];
    const { timestamps, totalMs } = toTimestamps(pat.figs, bpmVal, pat.timeSig);
    pat.figs.forEach((fig, i) => {
      if (!fig.rest) {
        const id = setTimeout(() => rhythmBeep(false, forced), delayMs + timestamps[i]);
        audioTidsRef.current.push(id);
      }
    });
    const beatMs = 60000 / bpmVal;
    const nBeats = Math.round(totalMs / beatMs);
    for (let k = 0; k < nBeats; k++) {
      const id = setTimeout(() => {
        setBeatStrong(k === 0);
        setBeatFlash(true);
        setTimeout(() => setBeatFlash(false), k === 0 ? 160 : 110);
      }, delayMs + k * beatMs);
      audioTidsRef.current.push(id);
    }
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

  // ── Helpers home page ─────────────────────────────────────────────────────
  const isLevelActive = (level) => {
    const cumIds = [];
    for (const lv of levelOrder) {
      (levelFormulaIds[lv] ?? []).forEach(id => cumIds.push(id));
      if (lv === level) break;
    }
    return cumIds.length > 0 && cumIds.every(id => selectedFormulas.has(id));
  };

  const startSession = () => {
    if (seriesMode) {
      const baseBpm = tempoMode === "fixed" ? bpmFixed : Math.round((bpmMin + bpmMax) / 2);
      seriesBaseBpmRef.current = baseBpm;
      seriesIdxRef.current = 0;
    } else {
      seriesBaseBpmRef.current = null;
      seriesIdxRef.current = 0;
    }
    setSeriesIdx(0); setSeriesXpLog([]); setSeriesMedals([]); setSeriesResult(null);
    setCurrentPage("game"); setPhase("idle"); setPattern(null);
    setScores([]); setEarnedPts(0); setProgress(0); setActiveIdx(-1);
    setRevealed(false); setChoices([]); setSelectedIdx(null); setPendingIdx(null);
    setBeatFlash(false); setMetroDotFlash(false); setCountdownN(1);
    startGame();
  };

  // ── Modal réglages ─────────────────────────────────────────────────────────
  const formulaCountModal = selectedFormulas.size;
  const SettingsModal = settingsModalOpen && (
    <div
      onClick={() => setSettingsModalOpen(false)}
      style={{ position:'fixed', inset:0, zIndex:50, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:540, background:'var(--surface)', borderRadius:'24px 24px 0 0', padding:'20px 16px 36px', maxHeight:'88dvh', overflowY:'auto' }}
      >
        {/* Handle + titre */}
        <div style={{ width:40, height:4, borderRadius:2, background:'rgba(255,255,255,0.15)', margin:'0 auto 16px' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontSize:16, fontWeight:900, color:'var(--text)' }}>Réglages</span>
          <button onClick={() => setSettingsModalOpen(false)} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:20, cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>

        {/* Accordion helper */}
        {[
          { key:"saisie",    label:"① Saisie" },
          { key:"tempo",     label:"② Tempo" },
          { key:"niveau",    label:"③ Niveau · Formules" },
          { key:"mode",      label:"④ Mode de jeu" },
          { key:"reveal",    label:"⑤ Révélation", disabled: activity===3||activity===4 },
        ].map(({ key, label, disabled }) => {
          const open = openAccordion === key;
          return (
            <div key={key} style={{ marginBottom:6 }}>
              <button
                onClick={() => setOpenAccordion(open ? null : key)}
                style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', background: open ? 'rgba(74,108,247,0.1)' : 'var(--surface-2)', border: open ? '1px solid rgba(74,108,247,0.3)' : '1px solid transparent', borderRadius:12, padding:'11px 14px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}
                disabled={!!disabled}
              >
                <span style={{ fontSize:13, fontWeight:700, color: open ? '#a5b4fc' : 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontSize:16, color: open ? '#4A6CF7' : 'var(--border-c)', transition:'transform 0.2s', display:'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>⌄</span>
              </button>

              {open && key==="saisie" && (
                <div style={{ padding:'12px 14px 4px' }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>Mode de saisie (activités 1 &amp; 2)</div>
                  <div style={{ display:'flex', gap:8, marginBottom: inputMode==="mic" ? 12 : 0 }}>
                    <button onClick={() => { setInputMode("tap"); stopMic(); }} style={{ flex:1, padding:'14px 0', borderRadius:14, border:'none', background: inputMode==="tap" ? 'linear-gradient(135deg,#4A6CF7,#8B5CF6)' : 'var(--surface-2)', color: inputMode==="tap" ? '#fff' : 'var(--text-muted)', fontWeight:900, fontSize:15, cursor:'pointer' }}>
                      TAP
                    </button>
                    <button onClick={() => { setInputMode("mic"); startMic(); }} style={{ flex:1, padding:'14px 0', borderRadius:14, border:'none', background: inputMode==="mic" ? 'linear-gradient(135deg,#4A6CF7,#8B5CF6)' : 'var(--surface-2)', color: inputMode==="mic" ? '#fff' : 'var(--text-muted)', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ verticalAlign:'middle', marginRight:4 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      Micro
                    </button>
                  </div>
                  {inputMode==="mic" && (
                    <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'10px 12px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginBottom:4 }}>
                        <span>Seuil détection</span>
                        <span style={{ fontWeight:700, color:'#4A6CF7' }}>{micThreshold.toFixed(3)}</span>
                      </div>
                      <input type="range" min={5} max={500} step={5} value={Math.round(micThreshold*1000)} onChange={e => setMicThreshold(+e.target.value/1000)} style={{ width:'100%', accentColor:'#4A6CF7' }}/>
                    </div>
                  )}
                  {micError && <div style={{ fontSize:10, color:'#f87171', marginTop:6 }}>{micError}</div>}
                </div>
              )}

              {open && key==="tempo" && (
                <div style={{ padding:'12px 14px 4px' }}>
                  <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                    {["fixed","range"].map(mode => (
                      <button key={mode} onClick={() => setTempoMode(mode)} style={{ flex:1, padding:'8px 0', borderRadius:10, border:'none', background: tempoMode===mode ? '#4A6CF7' : 'var(--surface-2)', color: tempoMode===mode ? '#fff' : 'var(--text-muted)', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                        {mode==="fixed" ? "Fixe" : "Variable"}
                      </button>
                    ))}
                  </div>
                  {tempoMode==="fixed" && (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <input type="range" min={0} max={TEMPI.length-1} value={closestTempoIdx(bpmFixed)} onChange={e => setBpmFixed(TEMPI[+e.target.value])} style={{ flex:1, accentColor:'#4A6CF7' }}/>
                      <span style={{ fontSize:13, fontWeight:900, color:'#4A6CF7', minWidth:60 }}>{bpmFixed} BPM</span>
                    </div>
                  )}
                  {tempoMode==="range" && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {[["Min",bpmMin,setBpmMin],["Max",bpmMax,setBpmMax]].map(([lbl,val,setter]) => (
                        <div key={lbl} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:10, color:'var(--text-muted)', width:24 }}>{lbl}</span>
                          <input type="range" min={0} max={TEMPI.length-1} value={closestTempoIdx(val)} onChange={e => setter(TEMPI[+e.target.value])} style={{ flex:1, accentColor:'#4A6CF7' }}/>
                          <span style={{ fontSize:11, fontWeight:700, color:'#4A6CF7', width:50 }}>{val} BPM</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {open && key==="niveau" && (
                <div style={{ padding:'12px 14px 4px' }}>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                    {levelOrder.map(level => {
                      const active = isLevelActive(level);
                      const hasF = (levelFormulaIds[level] ?? []).length > 0;
                      return (
                        <button key={level} onClick={() => selectLevel(level)} disabled={!hasF}
                          style={{ padding:'6px 14px', borderRadius:20, border:'none', background: active ? '#4A6CF7' : 'var(--surface-2)', color: active ? '#fff' : hasF ? 'var(--text-muted)' : 'var(--border-c)', fontSize:11, fontWeight:700, cursor: hasF ? 'pointer' : 'default' }}
                        >{level}</button>
                      );
                    })}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>{formulaCountModal} formule{formulaCountModal!==1?"s":""} sélectionnée{formulaCountModal!==1?"s":""}</span>
                    <button onClick={() => { setSettingsModalOpen(false); setCurrentPage("settings"); }} style={{ background:'none', border:'none', color:'#4A6CF7', fontSize:11, fontWeight:700, cursor:'pointer' }}>Détail formules →</button>
                  </div>
                </div>
              )}

              {open && key==="mode" && (
                <div style={{ padding:'12px 14px 4px' }}>
                  <div style={{ display:'flex', gap:8 }}>
                    {[["single","Exercice seul"],["series","Série de 10"]].map(([mode,label]) => {
                      const active = seriesMode ? mode==="series" : mode==="single";
                      return (
                        <button key={mode} onClick={() => setSeriesMode(mode==="series")}
                          style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background: active ? '#4A6CF7' : 'var(--surface-2)', color: active ? '#fff' : 'var(--text-muted)', fontWeight:700, fontSize:12, cursor:'pointer' }}
                        >{label}</button>
                      );
                    })}
                  </div>
                </div>
              )}

              {open && key==="reveal" && !disabled && (
                <div style={{ padding:'12px 14px 4px' }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>Afficher la portée au temps… (activité 1)</div>
                  <div style={{ display:'flex', gap:6 }}>
                    {[1,2,3,4].map(beat => (
                      <button key={beat} onClick={() => setRevealBeat(beat)}
                        style={{ flex:1, padding:'8px 0', borderRadius:10, border:'none', background: revealBeat===beat ? '#4A6CF7' : 'var(--surface-2)', color: revealBeat===beat ? '#fff' : 'var(--text-muted)', fontWeight:700, fontSize:12, cursor:'pointer', textAlign:'center' }}
                      >
                        <div>{beat}</div>
                        <div style={{ fontSize:9, color: revealBeat===beat ? '#ddd8fe' : 'var(--border-c)', marginTop:2 }}>{beat===1?"–":beat===2?"+10%":beat===3?"+20%":"+50%"}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Réglages avancés */}
        <button onClick={() => { setSettingsModalOpen(false); setCurrentPage("settings"); }}
          style={{ width:'100%', marginTop:16, padding:'11px 0', borderRadius:12, border:'1px solid rgba(255,255,255,0.06)', background:'none', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          Réglages avancés (feuille CSV, calibration…)
        </button>
      </div>
    </div>
  );

  // ── Page accueil ───────────────────────────────────────────────────────────
  if (currentPage === "home") {
    return (
      <>
        {showTutorial && <TutorialOverlay onDone={handleTutorialDone} levelOrder={levelOrder} activity={activity} />}
        {SettingsModal}
        <div className="bg-app text-app min-h-dvh flex flex-col items-center px-3.5 py-3 pb-8 select-none">
          {/* Header */}
          <div className="w-full max-w-xl flex justify-between items-center mb-4">
            <Link to="/" className="bg-surface-2 border border-app rounded-lg px-2.5 py-1 font-bold text-xs no-underline" style={{ color: '#4A6CF7' }}>← Tessitura</Link>
            <button
              onClick={() => { setOpenAccordion("saisie"); setSettingsModalOpen(true); }}
              className="bg-surface-2 border border-app rounded-xl text-app-muted text-lg cursor-pointer px-2 py-0.5 leading-none"
              title="Réglages"
            >⚙</button>
          </div>

          <div className="w-full max-w-xl">
            <div className="text-3xl font-black mb-5" style={{ color: '#4A6CF7' }}>Rythme</div>

            {/* 2×2 grid activités */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {ACTIVITIES.map(a => {
                const sel = activity === a.id;
                return (
                  <div key={a.id}
                    role="button"
                    onClick={() => setActivity(a.id)}
                    className="rounded-2xl cursor-pointer flex flex-col items-center justify-center gap-2 transition-all duration-150"
                    style={{
                      padding:'20px 12px 16px',
                      border: `2px solid ${sel ? '#4A6CF7' : 'var(--border-c)'}`,
                      background: sel ? 'rgba(74,108,247,0.1)' : 'var(--surface)',
                      color: sel ? '#c084fc' : '#6b7280',
                      minHeight: 100,
                    }}
                  >
                    {ACT_ICONS[a.id]}
                    <div style={{ fontSize:12, fontWeight:700, textAlign:'center', color: sel ? 'var(--text)' : 'var(--text-muted)', lineHeight:1.3 }}>{a.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Résumé réglages */}
            <button
              onClick={() => { setOpenAccordion("saisie"); setSettingsModalOpen(true); }}
              className="w-full rounded-2xl mb-3 flex items-center justify-between"
              style={{ background:'var(--surface)', border:'1px solid var(--border-c)', padding:'12px 16px', cursor:'pointer' }}
            >
              <div style={{ display:'flex', flexDirection:'column', gap:3, textAlign:'left' }}>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>Réglages</span>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {tempoMode==="fixed" ? `${bpmFixed} BPM` : `${bpmMin}–${bpmMax} BPM`}
                  {" · "}{selectedFormulas.size} formule{selectedFormulas.size!==1?"s":""}
                  {" · "}{seriesMode?"Série de 10":"Exercice seul"}
                  {(activity===1||activity===2) && ` · ${inputMode==="tap"?"TAP":"Micro"}`}
                </span>
              </div>
              <span style={{ fontSize:18, color:'#4A6CF7' }}>⚙</span>
            </button>

            {/* CTA Commencer */}
            <button
              onClick={startSession}
              className="w-full border-none rounded-2xl cursor-pointer text-white text-base font-bold"
              style={{ padding: '18px 0', background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', boxShadow: '0 8px 32px rgba(74,108,247,0.4)' }}
            >{seriesMode ? "▶ Commencer la série" : "▶ Commencer"}</button>
          </div>
        </div>
      </>
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
    setExpandedBadge(null);
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
    <>
    {SettingsModal}
    <div
      className="bg-app text-app min-h-dvh flex flex-col items-center px-3.5 py-3 pb-6 select-none"
      style={{ touchAction: phase === 'results' ? 'pan-y' : 'none' }}
      onPointerDown={(e) => {
        const isTapPhase =
          (phase === 'playing' ||
           (phase === 'countdown' && (activity === 1 || activity === 2)) ||
           (phase === 'listening' && activity === 2)) &&
          inputMode === 'tap';
        if (isTapPhase) handleTap(e);
        else if (phase === 'results') {
          pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
        }
      }}
      onPointerUp={(e) => {
        if (phase === 'results' && pointerDownPosRef.current) {
          const dx = e.clientX - pointerDownPosRef.current.x;
          const dy = e.clientY - pointerDownPosRef.current.y;
          pointerDownPosRef.current = null;
          if (Math.sqrt(dx*dx + dy*dy) < 10) handleNext();
        }
      }}
    >

      {/* ── HEADER ── */}
      <div className="w-full max-w-xl flex justify-between items-center mb-2.5">
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
          onPointerDown={e => e.stopPropagation()}
          className="bg-surface-2 border border-app rounded-lg font-bold text-xs cursor-pointer px-2.5 py-1"
          style={{ color: '#4A6CF7' }}
        >← Activités</button>
        <div className="flex gap-2 items-center">
          <div className="bg-surface-2 border border-app rounded-full px-2.5 py-0.5 text-xs text-app font-bold">⭐ {totalPts}</div>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              clearTids();
              audioTidsRef.current.forEach(clearTimeout);
              audioTidsRef.current = [];
              cancelAnimationFrame(rafRef.current);
              stopMic();
              setPhase("idle");
              setPattern(null);
              setOpenAccordion("saisie");
              setSettingsModalOpen(true);
            }}
            className="bg-surface-2 border border-app rounded-xl text-app-muted text-lg cursor-pointer px-2 py-0.5 leading-none"
            title="Réglages"
          >⚙</button>
        </div>
      </div>


      {/* ── ZONE PRINCIPALE ── */}
      <div className="flex-1 w-full max-w-xl flex gap-2.5 items-stretch">

        {/* Contenu central */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 min-w-0">

          {/* IDLE */}
          {phase==="idle" && (
            <div className="text-center px-5">
              <div className="text-5xl mb-2.5">
                {activity===1?"🥁":activity===2?"👂":activity===3?"🎵":"🎼"}
              </div>
              <p className="text-app-muted text-sm leading-relaxed" style={{ maxWidth: 300 }}>
                {activity===1 && "Un rythme aléatoire s'affiche sur la portée. Reproduis-le en tapant sur le bouton au bon moment."}
                {activity===2 && "Écoute le rythme et reproduis-le en tapant. La portée reste cachée pendant le jeu."}
                {activity===3 && "Écoute le rythme joué et identifie la bonne portée parmi 4 propositions."}
                {activity===4 && "Observe la portée et identifie parmi 4 lectures audio celle qui correspond."}
              </p>
              <p className="text-[11px] text-app-muted mt-1.5">
                {formulaCount} formule{formulaCount>1?"s":""} sélectionnée{formulaCount>1?"s":""}
                {" · "}
                <span
                  onClick={() => setCurrentPage("settings")}
                  className="cursor-pointer underline"
                  style={{ color: '#4A6CF7' }}
                >
                  modifier
                </span>
              </p>
            </div>
          )}

          {/* DÉCOMPTE + JEU + RÉSULTATS — activités 1 & 2 */}
          {(activity === 1 || activity === 2) && phase !== "idle" && pattern && (
            <div className="w-full">
              {/* En-tête hauteur fixe : chiffre du décompte OU info timeSig */}
              <div className="h-24 flex flex-col items-center justify-center mb-2">
                {(phase==="countdown" || phase==="listening") ? (
                  <>
                    <div className="text-[72px] font-black leading-none" style={{ color: '#4A6CF7' }}>
                      {countdownN ?? ""}
                    </div>
                    <p className="text-app-muted text-xs mt-1">
                      {activity===1 && (revealed ? "Mémorise le rythme…" : "Prépare-toi…")}
                      {activity===2 && phase==="countdown" && (countdownN ? "Prépare-toi…" : "")}
                      {activity===2 && phase==="listening" && "Écoute le rythme…"}
                    </p>
                  </>
                ) : phase==="playing" && activity===2 ? (
                  <div className="text-center text-base font-bold" style={{ color: '#4A6CF7' }}>
                    À toi de jouer !
                  </div>
                ) : (
                  <div className="text-center text-[11px] text-app-muted">
                    {pattern.timeSig} · {sessionBpm} BPM
                    {activity===1 && phase==="results" && REVEAL_BONUS[revealBeat]>0 &&
                      <span className="text-yellow-400 ml-2">
                        +{REVEAL_BONUS[revealBeat]}% bonus
                      </span>
                    }
                  </div>
                )}
              </div>

              {/* Portée — toujours présente */}
              {revealed ? (
                <div
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    background: 'var(--surface)',
                    border: (flashBorderOn && (activity === 1 ? metroDotFlash : beatFlash)) ? '2px solid #4A6CF7' : '2px solid var(--border-c)',
                    padding: '10px 6px 6px',
                    cursor: phase === "results" ? "pointer" : "default",
                  }}
                >
                  {/* Bouton son Rythme — top-left, masqué pour act 2 (son toujours requis) */}
                  {activity === 1 && (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setRhythmSoundOn(v => !v)}
                      className="absolute top-1.5 left-1.5 z-10 rounded-full px-2.5 border-0 text-[11px] font-bold cursor-pointer h-7 leading-none"
                      style={{ background: rhythmSoundOn ? 'rgba(74,108,247,0.18)' : 'rgba(0,0,0,0.25)', color: rhythmSoundOn ? '#4A6CF7' : 'var(--text-muted)' }}
                    >{rhythmSoundOn?"🔊":"🔇"}</button>
                  )}
                  {/* Toggle flash bordure — top-right de la portée */}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); setFlashBorderOn(v => !v); }}
                    className="absolute top-1.5 right-1.5 z-10 rounded-full border-0 cursor-pointer h-7 w-7 flex items-center justify-center"
                    style={{ background: flashBorderOn ? 'rgba(74,108,247,0.18)' : 'rgba(0,0,0,0.25)' }}
                    title={flashBorderOn ? "Désactiver flash bordure" : "Activer flash bordure"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill={flashBorderOn ? "#4A6CF7" : "#6b7280"} />
                      {!flashBorderOn && <line x1="3" y1="3" x2="21" y2="21" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"/>}
                    </svg>
                  </button>
                  <RythmStaff
                    figures={vexFigs}
                    timeSig={pattern.timeSig}
                    activeIdx={isPlaying ? activeIdx : -1}
                    scoreGrades={phase==="results" ? gradeMap : undefined}
                    scoreDevs={undefined}
                    sessionBpm={sessionBpm}
                  />
                </div>
              ) : (
                <div
                  className="rounded-2xl p-5 text-center text-3xl tracking-[8px] transition-colors duration-75"
                  style={{
                    background: 'var(--surface)',
                    border: (flashBorderOn && activity === 2 && beatFlash) ? '2px solid #4A6CF7' : '1px dashed var(--border-c)',
                    color: 'var(--border-c)',
                  }}
                >
                  ? ? ? ?
                </div>
              )}

              {/* Barre de progression — hauteur réservée pour éviter les sauts */}
              <div className="mt-2 h-[22px]">
                {isPlaying && (
                  <>
                    <div className="w-full h-[3px] bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-[width] duration-100 ease-linear"
                        style={{ width: `${progress*100}%`, background: 'linear-gradient(90deg,#4A6CF7,#8B5CF6)' }}
                      />
                    </div>
                    <div className="text-right text-[10px] text-app-muted mt-0.5">
                      {tapTimes.length} / {playableCount} taps
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* BILAN act 1 & 2 */}
          {(activity === 1 || activity === 2) && phase==="results" && scores.length>0 && (
            <div
              className="w-full bg-surface border border-app rounded-2xl p-4 text-center"
              onPointerDown={e => e.stopPropagation()}
            >
              <div className="text-4xl">{medal}</div>
              <div className="text-3xl font-black mt-0.5">{pct}%</div>
              <div className="text-xs text-app-muted mb-2.5">{earnedPts} / {maxPts} pts</div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {scores.map((s,i) => (
                  <div key={i}
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-surface-2 cursor-pointer"
                    style={{ color: GRADE_COLOR[s.grade], border: `1px solid ${GRADE_COLOR[s.grade]}33` }}
                    onClick={() => setExpandedBadge(expandedBadge === i ? null : i)}
                  >
                    {i+1} · {s.label}
                    {expandedBadge === i && s.dev !== null && s.dev !== undefined && (
                      <span style={{ marginLeft: 6, color: s.dev > 0 ? '#fbbf24' : '#60a5fa' }}>
                        {`${Math.round(Math.abs(s.dev) / 10) * 10}ms ${s.dev > 0 ? 'trop tard' : 'trop tôt'}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {detectedOffset !== null && Math.abs(detectedOffset) > 15 && (
                <div className="text-[9px] text-app-muted mt-2">
                  Décalage compensé : {detectedOffset > 0 ? "+" : ""}{detectedOffset} ms
                </div>
              )}
              {tapTimes.length > 0 && (
                <div className="flex gap-2 justify-center mt-3">
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={replayTaps}
                    className="rounded-xl border-none px-3 py-1.5 text-[11px] font-bold cursor-pointer"
                    style={{ background: 'rgba(74,108,247,0.12)', color: '#4A6CF7' }}
                  >▶ Réécouter</button>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => playPatternAudio(pattern, sessionBpm, 0, true)}
                    className="rounded-xl border-none px-3 py-1.5 text-[11px] font-bold cursor-pointer"
                    style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}
                  >▶ Solution</button>
                </div>
              )}
            </div>
          )}

          {/* GRILLE act 3 — 4 portées */}
          {activity === 3 && phase !== "idle" && choices.length > 0 && (
            <div className="w-full">
              <div className="text-center text-[11px] text-app-muted mb-2.5 flex items-center justify-center gap-2">
                {phase==="countdown" ? (
                  <span className="text-[40px] font-black leading-none" style={{ color: '#4A6CF7' }}>{countdownN}</span>
                ) : (
                  <>
                    <span>{phase==="playing" ? "Quelle portée ?" : "Résultat"} · {sessionBpm} BPM</span>
                    <button
                      onClick={() => playPatternAudio(choices[correctIdx], sessionBpm)}
                      className="rounded border-none px-2.5 py-0.5 text-white text-[10px] font-bold cursor-pointer"
                      style={{ background: '#4A6CF7' }}
                    >▶ Rejouer</button>
                  </>
                )}
              </div>
              <div
                className="grid gap-2 transition-opacity duration-300"
                style={{
                  gridTemplateColumns: choiceCols === 1 ? "1fr" : "1fr 1fr",
                  opacity: 1,
                }}
              >
                {choices.map((c, i) => {
                  let borderColor = 'var(--border-c)';
                  if (phase === "playing" && flashBorderOn && beatFlash) borderColor = '#4A6CF7';
                  if (phase === "results") {
                    if (i === correctIdx) borderColor = '#22C55E';
                    else if (i === selectedIdx) borderColor = '#f87171';
                  }
                  return (
                    <div
                      key={i}
                      role="button"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => { if (phase === "playing") handleChoice(i); }}
                      className="rounded-xl bg-surface"
                      style={{
                        cursor: phase === "playing" ? "pointer" : "default",
                        border: `2px solid ${borderColor}`,
                        padding: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: phase === "playing" && beatFlash ? '0 0 8px rgba(74,108,247,0.4)' : 'none',
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
                <div className="mt-3 text-center text-sm font-bold"
                  style={{ color: selectedIdx === correctIdx ? '#22C55E' : '#f87171' }}>
                  {selectedIdx === correctIdx ? "✓ Bonne réponse ! +100 pts" : "✕ Mauvaise réponse."}
                </div>
              )}
            </div>
          )}

          {/* act 4 — portée cible + 4 boutons audio */}
          {activity === 4 && phase !== "idle" && pattern && (
            <div className="w-full">
              <div className="text-center text-[11px] text-app-muted mb-1.5 flex items-center justify-center gap-2.5">
                <span>{phase==="playing" ? "Quelle lecture ?" : "Résultat"} · {sessionBpm} BPM</span>
                {act4CountN !== null && (
                  <span className="text-[28px] font-black leading-none" style={{ color: '#4A6CF7' }}>{act4CountN}</span>
                )}
              </div>
              <div
                className="rounded-2xl overflow-hidden mb-3 transition-colors duration-200"
                style={{
                  background: 'var(--surface)',
                  padding: '10px 6px 6px',
                  border: `2px solid ${phase==="results" ? (selectedIdx===correctIdx ? '#22C55E' : '#f87171') : 'var(--border-c)'}`,
                }}
              >
                <RythmStaff figures={pattern.figs} timeSig={pattern.timeSig} activeIdx={-1} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2.5">
                {choices.map((c, i) => {
                  let bg = 'var(--surface-2)'; let col = 'var(--text-muted)';
                  if (pendingIdx === i) { bg = 'rgba(74,108,247,0.15)'; col = '#4A6CF7'; }
                  if (phase === "results") {
                    if (i === correctIdx) { bg = '#064e3b'; col = '#22C55E'; }
                    else if (i === selectedIdx && i !== correctIdx) { bg = '#7f1d1d'; col = '#f87171'; }
                  }
                  return (
                    <button key={i}
                      onPointerDown={e => e.stopPropagation()}
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
                      className="border-none rounded-xl py-2.5 text-sm font-bold"
                      style={{ background: bg, color: col, cursor: phase==="playing" ? "pointer" : "default", transition: "all 0.15s" }}
                    >▶ {String.fromCharCode(65+i)}</button>
                  );
                })}
              </div>
              {phase === "playing" && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => handleChoice(pendingIdx)}
                  disabled={pendingIdx === null}
                  className="w-full border-none rounded-2xl text-sm font-bold disabled:cursor-default cursor-pointer"
                  style={{
                    padding: '12px 0',
                    background: pendingIdx !== null ? 'linear-gradient(135deg,#4A6CF7,#8B5CF6)' : 'var(--surface-2)',
                    color: pendingIdx !== null ? '#fff' : 'var(--text-muted)',
                    transition: "all 0.2s",
                  }}
                >
                  {pendingIdx !== null ? `Valider : ${String.fromCharCode(65+pendingIdx)}` : "Écoute puis valide"}
                </button>
              )}
              {phase === "results" && (
                <div className="text-center text-sm font-bold"
                  style={{ color: selectedIdx === correctIdx ? '#22C55E' : '#f87171' }}>
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
      <div className="w-full max-w-xl mt-3.5">
        {/* Bouton SON TAP visible pendant la correction (act 1 & 2) */}
        {(activity===1||activity===2) && phase==="results" && (
          <div className="flex justify-end mb-2">
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setTapSoundOn(v => !v)}
              className="rounded-full px-3 text-[11px] font-bold cursor-pointer h-7 leading-none border"
              style={{
                background: tapSoundOn ? 'rgba(74,108,247,0.18)' : 'rgba(0,0,0,0.12)',
                borderColor: 'rgba(0,0,0,0.08)',
                color: tapSoundOn ? '#4A6CF7' : 'var(--text-muted)',
              }}
            >{tapSoundOn?"🥁 Son TAP":"🔕 Son TAP"}</button>
          </div>
        )}

        {/* Entrée pendant le jeu */}
        {(phase === "playing" || (phase === "countdown" && (activity === 1 || activity === 2)) || (phase === "listening" && activity === 2)) && inputMode==="tap" && (activity === 1 || activity === 2) && (
          <div
            className="relative w-full rounded-2xl text-[15px] font-black tracking-[2px] flex items-center justify-center"
            style={{
              height: 72,
              background: tapFlash
                ? "linear-gradient(135deg,#9333ea,#ec4899)"
                : (phase==="countdown" || (phase==="listening" && activity===2))
                  ? "linear-gradient(135deg,#3b4fd4,#2040b5)"
                  : "linear-gradient(135deg,#4A6CF7,#8B5CF6)",
              color: (phase==="countdown" || (phase==="listening" && activity===2)) ? 'rgba(74,108,247,0.4)' : '#fff',
              boxShadow: (phase==="countdown" || (phase==="listening" && activity===2))
                ? "0 8px 32px rgba(74,108,247,0.2)"
                : "0 8px 32px rgba(74,108,247,0.5)",
              transform: tapFlash ? "scale(0.96)" : "scale(1)",
              transition: "transform 0.06s,background 0.06s,color 0.06s",
              borderRadius: '1rem',
            }}
          >
            {/* Bouton son TAP — top-left de la zone TAP */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setTapSoundOn(v => !v); }}
              className="absolute top-2 left-2.5 z-10 rounded-full px-2.5 border text-[11px] font-bold cursor-pointer h-7 leading-none"
              style={{
                background: tapSoundOn ? 'rgba(74,108,247,0.3)' : 'rgba(0,0,0,0.4)',
                borderColor: 'rgba(255,255,255,0.12)',
                color: tapSoundOn ? '#e9d5ff' : 'var(--text-muted)',
              }}
            >{tapSoundOn?"🥁":"🔕"}</button>
            Tap anywhere
          </div>
        )}

        {(phase === "playing" || (phase === "countdown" && (activity === 1 || activity === 2)) || (phase === "listening" && activity === 2)) && inputMode==="mic" && (activity === 1 || activity === 2) && (
          <div
            className="w-full rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2.5"
            style={{
              height: 130,
              background: tapFlash ? 'rgba(74,108,247,0.15)' : 'var(--surface)',
              border: tapFlash ? '2px solid #4A6CF7' : '2px solid var(--border-c)',
              transition: "background 0.06s,border-color 0.06s",
            }}
          >
            <div className="text-sm font-bold" style={{ color: micActive ? '#4A6CF7' : 'var(--text-muted)' }}>
              {micActive ? "🎤 Écoute…" : "🎤 Micro inactif"}
            </div>
            {/* Barre de niveau */}
            <div className="w-4/5 h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${Math.min(micLevel / (micThreshold * 3), 1) * 100}%`,
                background: micLevel > micThreshold ? '#4A6CF7' : 'var(--border-c)',
                transition: "width 0.05s",
              }}/>
            </div>
            {/* Marqueur seuil */}
            <div className="w-4/5 relative h-1">
              <div className="absolute top-0 w-0.5 h-1 rounded-sm" style={{ left: `${Math.min(1/3, 1) * 100}%`, background: '#4A6CF7' }}/>
            </div>
          </div>
        )}
        {phase === 'results' && (
          <div
            className="w-full text-center text-sm font-bold"
            style={{ padding: '20px 0', color: 'var(--text-muted)', animation: 'pulse-hint 1.5s ease-in-out infinite' }}
          >
            Tape pour continuer →
          </div>
        )}
        {phase === 'idle' && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={handleNext}
            className="w-full border-none rounded-2xl cursor-pointer text-white text-base font-bold"
            style={{ padding: '18px 0', background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', boxShadow: '0 8px 32px rgba(74,108,247,0.4)' }}
          >
            {seriesMode ? "▶ Commencer la série" : "▶ Commencer"}
          </button>
        )}
      </div>
    </div>
    </>
  );
}
