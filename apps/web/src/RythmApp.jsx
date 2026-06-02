import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTheme, ThemeToggleInline } from "./ThemeContext";
import useSwipe from "./hooks/useSwipe";
import RythmStaff from "./RythmStaff";
import SettingsPage from "./SettingsPage";
import ConsigneOverlay, { consigneSeen } from "./ConsigneOverlay";
import MicCalibration from "./MicCalibration";
import { scoreRhythm } from "./rythmScoringScore.ts";
import { DEFAULT_PARAMS as RYTHM_SCORING_PARAMS } from "./rythmScoringParams.ts";
import { deadzone as scoringDeadzone } from "./rythmScoringAnalyze.ts";
import useSheetData from "./useSheetData";
import useProgressFirebase, { TROPHIES as TROPHIES_IMPORT } from "./hooks/useProgressFirebase";
import { generateDistractorSet, deriveNiveau } from "./rythmDistractors";
import { buildPalette, scoreActivity5, measureStatus, groupOf } from "./rythmActivity5";

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

// ─── Formules introduites à chaque NIVEAU (cycle C1/1…C3) ─────────────────────
// Fallback hardcodé si le CSV ne charge pas. Clé-é par cycle (≠ Rang XP) pour rester
// cohérent avec la colonne `niveau` du CSV. (Source de vérité = le CSV.)
export const NIVEAUX = [
  "C1/1", "C1/2", "C1/3", "C1/4", "C2/2", "C2/3", "C3",
];

export const NIVEAU_FORMULA_IDS = {
  "C1/1": ["bin_q","bin_qr","bin_h","bin_hr","bin_ee",
           "ter_qd","ter_eee","ter_qe","ter_eq"],
  "C1/2": ["bin_qde","bin_eqd","ter_ree","ter_eer","ter_qde_qde"],
  "C1/3": ["bin_ttt"],
  "C1/4": ["bin_ssss","bin_ess","bin_sse","bin_sser"],
  "C2/2": ["ter_hd"],
  "C2/3": ["bin_ere","bin_eer","bin_eqe","ter_ere"],
  "C3":   [],
};

// Formules actives par défaut : niveau le plus bas (C1/1)
const DEFAULT_SELECTED = new Set(NIVEAU_FORMULA_IDS["C1/1"]);

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

// Distracteurs act 3/4 : moteur de mutations typées piloté par DISTRACTOR_CONFIG.
// Voir ./rythmDistractors.ts (generateDistractorSet / deriveNiveau / audibleFingerprint).

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

// ─── Accentuation des temps d'une mesure classique ────────────────────────────
// Boost de volume appliqué UNIQUEMENT aux notes qui tombent SUR un temps (pas aux
// subdivisions internes). Reflète la hiérarchie métrique : temps fort > 3e temps >
// temps faibles.
// Activités 1-4 : accentuation plus marquée.
const BEAT_WEIGHTS = {
  4: [2.5, 1.6, 2.1, 1.6], // 4/4, 12/8 (4 temps musicaux)
  3: [2.5, 1.6, 1.6],      // 3/4, 9/8
  2: [2.5, 1.6],           // 2/4, 6/8
};
// Activité 5 : accentuation plus douce (rythme tenu, écoute longue).
const BEAT_WEIGHTS_ACT5 = {
  4: [2.0, 1.4, 1.8, 1.4],
  3: [2.0, 1.4, 1.4],
  2: [2.0, 1.4],
};
function beatsPerMeasure(timeSig) {
  if (timeSig === "3/4" || timeSig === "9/8") return 3;
  if (timeSig === "2/4" || timeSig === "6/8") return 2;
  return 4;
}
// Renvoie le multiplicateur de volume pour une note d'onset `ts` (ms) avec un
// `beatMs` (durée d'un temps musical). Off-beat → 1.0.
function beatVolMult(timeSig, ts, beatMs, isAct5 = false) {
  const bpm = beatsPerMeasure(timeSig);
  const table = isAct5 ? BEAT_WEIGHTS_ACT5 : BEAT_WEIGHTS;
  const weights = table[bpm] ?? [1, 1, 1, 1];
  const pos = ts / beatMs;
  const idx = Math.round(pos);
  if (Math.abs(pos - idx) * beatMs >= 5) return 1.0; // tolérance 5 ms : note hors temps
  return weights[idx % bpm] ?? 1.0;
}

// ─── Bilan visuel act 1 & 2 : dispersion des frappes + diagnostics ──────────────
function DiagRow({ label, value, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, fontSize:12, padding:'2px 0' }}>
      <span style={{ color:'var(--text-muted)', fontWeight:600 }}>{label}</span>
      <span style={{ color, fontWeight:800, textAlign:'right' }}>{value}</span>
    </div>
  );
}

function TapDiagnostics({ beatMs, analysis }) {
  const a = analysis ?? {};
  const flags = a.flags ?? [];
  const has = (f) => flags.includes(f);

  // Tempo : piloté par flags TEMPO_FAST / TEMPO_SLOW (engine = enveloppe tolérance/max)
  const tempoPct = a.hasTempo ? Math.round(Math.abs(a.tempoErr ?? 0) * 100) : 0;
  let tempoText, tempoColor;
  if (!a.hasTempo) {
    tempoText = '—'; tempoColor = 'var(--text-muted)';
  } else if (has('TEMPO_FAST')) {
    tempoText = `Tu joues plus vite que le modèle (~${tempoPct}%)`;
    tempoColor = Math.abs(a.tempoErr ?? 0) < 0.05 ? '#fbbf24' : '#f87171';
  } else if (has('TEMPO_SLOW')) {
    tempoText = `Tu ralentis (~${tempoPct}% trop lent)`;
    tempoColor = Math.abs(a.tempoErr ?? 0) < 0.05 ? '#fbbf24' : '#f87171';
  } else {
    tempoText = 'Tempo juste'; tempoColor = '#34d399';
  }

  // Décalage : piloté par flags OFFSET_LATE / OFFSET_EARLY
  const off = a.offsetMs ?? 0;
  let offText, offColor;
  if (has('OFFSET_LATE'))       { offText = `Tu démarres en retard (~${Math.round(off)} ms)`;       offColor = '#fbbf24'; }
  else if (has('OFFSET_EARLY')) { offText = `Tu démarres en avance (~${Math.abs(Math.round(off))} ms)`; offColor = '#fbbf24'; }
  else                          { offText = 'Bien calé';                                            offColor = '#34d399'; }

  // Régularité : ratio regularityStd / beatMs
  const r = a.regularityStd != null && beatMs ? a.regularityStd / beatMs : null;
  let regText, regColor;
  if (r == null)         { regText = '—';                regColor = 'var(--text-muted)'; }
  else if (has('IRREGULAR')) { regText = 'Ton tempo est en dents de scie'; regColor = '#f87171'; }
  else if (r < 0.05)     { regText = 'Très régulier';    regColor = '#34d399'; }
  else if (r < 0.12)     { regText = 'Régulier';         regColor = '#34d399'; }
  else                   { regText = 'Assez régulier';   regColor = '#fbbf24'; }

  // Dérive (nouveau) : DRIFT_ACCEL / DRIFT_DECEL
  let driftText = null, driftColor = '#fbbf24';
  if (has('DRIFT_ACCEL')) driftText = 'Tu accélères vers la fin';
  if (has('DRIFT_DECEL')) driftText = 'Tu ralentis vers la fin';

  const extras  = a.extras  ?? [];
  const missing = a.missing ?? [];

  return (
    <div style={{ marginTop:12, textAlign:'left', borderTop:'1px solid var(--border-c)', paddingTop:10 }}>
      <DiagRow label="Tempo"      value={tempoText} color={tempoColor} />
      <DiagRow label="Décalage"   value={offText}   color={offColor} />
      <DiagRow label="Régularité" value={regText}   color={regColor} />
      {driftText && <DiagRow label="Dérive" value={driftText} color={driftColor} />}
      {extras.length  > 0 && <DiagRow label="Frappes en trop" value={`${extras.length}`}  color="#f87171" />}
      {missing.length > 0 && <DiagRow label="Frappes manquées" value={`${missing.length}`} color="#f87171" />}
    </div>
  );
}

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
  { id:5, label:"Reconstituer" },
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
    let cancelled = false;
    addSession({ module: "rythme", xpEarned: totalXp, medal: dominantMedal, meta: { perfectSeries } })
      .then(r => { if (!cancelled) setResult(r); });
    return () => { cancelled = true };
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

        {/* Montée de rang XP */}
        {result?.rankedUp && (
          <div className="rounded-2xl p-3.5 mb-4 text-center border" style={{ background: 'rgba(74,108,247,0.08)', borderColor: '#4A6CF7' }}>
            <div className="text-2xl mb-1">🎉</div>
            <div className="text-sm font-bold" style={{ color: '#4A6CF7' }}>Rang supérieur !</div>
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
    /* Portée : 5 lignes + clé de sol + 2 notes centrées */
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      {[16,21,26,31,36].map(y => (
        <line key={y} x1="6" y1={y} x2="50" y2={y} stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      ))}
      <text x="6" y="33" fontSize="22" fill="currentColor" opacity="0.6" fontFamily="serif">𝄞</text>
      {/* Note 1 */}
      <ellipse cx="32" cy="31" rx="5" ry="3.5" fill="currentColor" transform="rotate(-15 32 31)"/>
      <line x1="36.5" y1="30" x2="36.5" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Note 2 */}
      <ellipse cx="44" cy="26" rx="5" ry="3.5" fill="currentColor" transform="rotate(-15 44 26)"/>
      <line x1="48.5" y1="25" x2="48.5" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  2: (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <path d="M28 10C19.16 10 12 17.16 12 26s7.16 16 16 16 16-7.16 16-16-7.16-16-16-16z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M21 23c0-3.87 3.13-7 7-7s7 3.13 7 7v7c0 3.87-3.13 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="28" y1="42" x2="28" y2="48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="22" y1="48" x2="34" y2="48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  3: (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <rect x="5" y="9" width="46" height="38" rx="5" stroke="currentColor" strokeWidth="2" fill="none"/>
      {/* 3 lignes internes de portée */}
      <line x1="5" y1="20" x2="51" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      <line x1="5" y1="28" x2="51" y2="28" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      <line x1="5" y1="36" x2="51" y2="36" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      <ellipse cx="18" cy="36" rx="5" ry="3.5" fill="currentColor" transform="rotate(-15 18 36)"/>
      <line x1="22.5" y1="35" x2="22.5" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <ellipse cx="35" cy="32" rx="5" ry="3.5" fill="currentColor" transform="rotate(-15 35 32)"/>
      <line x1="39.5" y1="31" x2="39.5" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  4: (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="20" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <path d="M22 20l16 8-16 8V20z" fill="currentColor"/>
    </svg>
  ),
  5: (
    /* Cellules posées sur une portée + une cellule en cours de pose (flèche bas) */
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      {[20,26,32,38,44].map(y => (
        <line key={y} x1="6" y1={y} x2="50" y2={y} stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      ))}
      <rect x="9"  y="27" width="11" height="11" rx="3" fill="currentColor" opacity="0.85"/>
      <rect x="22" y="27" width="11" height="11" rx="3" fill="currentColor" opacity="0.85"/>
      <rect x="35" y="9"  width="11" height="11" rx="3" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M40.5 22 v5 m-3 -2.5 l3 3 l3 -3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
};

const ACT_SHORT = {
  1: "Reproduis ce que tu vois",
  2: "Reproduis ce que tu entends",
  3: "Identifie le rythme entendu parmi les 4 rythmes écrits",
  4: "Identifie le rythme écrit parmi les 4 rythmes entendus",
  5: "Reconstitue le rythme entendu en posant des cellules",
};

// Consignes synthétiques affichées à l'arrivée sur chaque activité (overlay).
const CONSIGNES_RYTHME = {
  1: ["Un rythme s'affiche sur la portée.", "Reproduis-le en tapant (ou au micro) au bon moment, en suivant le tempo."],
  2: ["Écoute le rythme : la portée reste cachée.", "Reproduis-le ensuite en tapant au bon moment."],
  3: ["Écoute le rythme joué.", "Choisis, parmi les 4 portées, celle qui correspond."],
  4: ["Observe la portée affichée.", "Écoute les 4 lectures A/B/C/D et choisis celle qui correspond."],
  5: ["Écoute le rythme, puis reconstitue-le en posant les cellules sur la portée.", "Valide pour voir ton score."],
};
const RYTHME_SOUND_WARNING = { tone: "sound", text: "Monte le volume et désactive le mode silencieux de ton appareil — le son est nécessaire." };

// Sections de la popup d'explications avancées des réglages (depuis le bouton "?").
const REGLAGES_SECTIONS = [
  {
    title: "Saisie",
    body: "TAP : touche l'écran au rythme. Micro : chante, frappe ou joue à l'instrument — la détection sonore valide chaque attaque.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="12" r="6.5"/>
        <circle cx="12" cy="12" r="10.5" strokeOpacity="0.4"/>
      </svg>
    ),
  },
  {
    title: "Tempo",
    body: "Fixe (BPM choisi) ou variable (BPM tiré au hasard dans une plage min–max à chaque exercice).",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 21h10l-2-17h-6z"/>
        <line x1="12" y1="6" x2="16.5" y2="14"/>
        <line x1="6" y1="21" x2="18" y2="21"/>
      </svg>
    ),
  },
  {
    title: "Niveau",
    body: "Sélectionne les formules rythmiques par cycle scolaire (C1/1 → C3). Pilote la difficulté des rythmes et des distracteurs (act. 3, 4, 5).",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3"  y="14" width="4" height="7"  rx="1"/>
        <rect x="10" y="10" width="4" height="11" rx="1"/>
        <rect x="17" y="5"  width="4" height="16" rx="1"/>
      </svg>
    ),
  },
  {
    title: "Mode Extrême",
    body: "Activité 1 : son du rythme et flash bordure désactivés → score ×2. Cumulable avec le bonus de révélation.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/>
      </svg>
    ),
  },
  {
    title: "Révélation",
    body: "Activité 1 uniquement : la portée n'apparaît qu'au temps 1, 2, 3 ou 4 du rythme. Plus tardif = bonus de score (+10 %, +20 %, +50 %).",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>
        <circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    title: "Boutons en jeu",
    body: "Son du rythme, Flash et Son du tap : (dés)activables en cours d'exercice — détaillés dans la consigne d'arrivée.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="3" y1="6"  x2="21" y2="6"/>
        <circle cx="9"  cy="6"  r="2.5" fill="currentColor" stroke="none"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <circle cx="16" cy="12" r="2.5" fill="currentColor" stroke="none"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
        <circle cx="11" cy="18" r="2.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
];

// Boutons de l'exercice détaillés dans la consigne d'arrivée (icônes identiques à l'UI).
const CONSIGNE_CONTROLS = {
  rhythmSound: { icon: "🔊", name: "Son du rythme", desc: "Active ou coupe la lecture sonore du rythme à reproduire." },
  flash: {
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" fill="#4A6CF7" />
      </svg>
    ),
    name: "Flash",
    desc: "Fait clignoter le cadre à chaque temps — un repère visuel du tempo.",
  },
  tapSound: { icon: "🥁", name: "Son du tap", desc: "Active ou coupe le son joué à chacune de tes frappes." },
};

const TUTO_TOTAL = 4;

function TutorialOverlay({ onDone, niveauOrder, activity: initActivity, inputMode: initInputMode }) {
  const [slide, setSlide] = useState(0);
  const { dark } = useTheme();
  const swipe = useSwipe({
    onSwipeLeft:  () => setSlide(s => Math.min(s + 1, TUTO_TOTAL - 1)),
    onSwipeRight: () => setSlide(s => Math.max(s - 1, 0)),
  });

  const [tutoActivity,  setTutoActivity]  = useState(initActivity || 1);
  const [tutoInputMode, setTutoInputMode] = useState(initInputMode || "tap");
  const niveaux = niveauOrder.length > 0 ? niveauOrder : NIVEAUX;
  const [tutoNiveau, setTutoNiveau] = useState(niveaux[0] ?? null);

  const SLIDES = [
    {
      title: "Bienvenue dans Rythme !",
      body: "Entraîne-toi à reproduire et reconnaître des rythmes musicaux, du débutant au virtuose.",
    },
    {
      title: "Quel exercice ?",
      body: "Clique sur l'activité que tu veux pratiquer.",
    },
    {
      title: "Tap ou Micro ?",
      body: "Comment vas-tu saisir le rythme ?",
    },
    {
      title: "Choisis ton niveau",
      body: "Tu pourras en changer à tout moment dans les réglages.",
    },
  ];

  const { title, body } = SLIDES[slide];

  /* ── Visuals inline ────────────────────────── */
  function renderVisual() {
    if (slide === 0) {
      return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:280 }}>
          {[1,2,3,4,5].map(id => (
            <div key={id} style={{ background:'rgba(74,108,247,0.1)', border:'2px solid rgba(74,108,247,0.4)', borderRadius:14, padding:'16px 8px 12px', display:'flex', flexDirection:'column', alignItems:'center', color:'#c084fc' }}>
              {ACT_ICONS[id]}
              <div style={{ fontSize:10, color:'#a5b4fc', marginTop:8, lineHeight:1.3, textAlign:'center' }}>{ACTIVITIES[id-1].label}</div>
            </div>
          ))}
        </div>
      );
    }

    if (slide === 1) {
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:8, width:280 }}>
          {[1,2,3,4,5].map(i => {
            const sel = tutoActivity === i;
            return (
              <div key={i} role="button" onClick={() => setTutoActivity(i)} style={{
                display:'flex', alignItems:'center', gap:12,
                background: sel ? 'rgba(74,108,247,0.18)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'),
                border: `2px solid ${sel ? '#4A6CF7' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)')}`,
                borderRadius:14, padding:'10px 14px', cursor:'pointer',
                color: sel ? (dark ? '#fff' : '#111827') : (dark ? '#6b7280' : '#9ca3af'),
                transition:'all 0.15s',
              }}>
                <div style={{ color: sel ? '#4A6CF7' : (dark ? '#6b7280' : '#9ca3af'), flexShrink:0, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', transform:'scale(0.64)', transformOrigin:'center' }}>{ACT_ICONS[i]}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700 }}>{ACTIVITIES[i-1].label}</div>
                  <div style={{ fontSize:11, marginTop:2, fontWeight:500, color: sel ? (dark ? '#c4b5fd' : '#4A6CF7') : (dark ? '#9ca3af' : '#6b7280') }}>{ACT_SHORT[i]}</div>
                </div>
                {sel && <div style={{ marginLeft:'auto', width:10, height:10, borderRadius:5, background:'#4A6CF7', flexShrink:0 }}/>}
              </div>
            );
          })}
        </div>
      );
    }

    if (slide === 2) {
      const micColor = dark ? '#9ca3af' : '#6b7280';
      const tapSel = tutoInputMode === "tap";
      const micSel = tutoInputMode === "mic";
      return (
        <div style={{ display:'flex', gap:12, width:280 }}>
          <div role="button" onClick={() => setTutoInputMode("tap")} style={{
            flex:1, borderRadius:18, padding:'28px 12px', textAlign:'center', cursor:'pointer',
            background: tapSel ? 'rgba(74,108,247,0.18)' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
            border: `2px solid ${tapSel ? '#4A6CF7' : (dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
            transition:'all 0.15s',
          }}>
            <div style={{ fontSize:30, fontWeight:900, color: tapSel ? '#4A6CF7' : micColor, letterSpacing:2 }}>TAP</div>
            <div style={{ fontSize:12, fontWeight:500, color: tapSel ? (dark ? '#c4b5fd' : '#4A6CF7') : micColor, marginTop:8, lineHeight:1.4 }}>Touche l'écran au rythme</div>
          </div>
          <div role="button" onClick={() => setTutoInputMode("mic")} style={{
            flex:1, borderRadius:18, padding:'28px 12px', textAlign:'center', cursor:'pointer',
            background: micSel ? 'rgba(74,108,247,0.18)' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
            border: `2px solid ${micSel ? '#4A6CF7' : (dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
            transition:'all 0.15s',
          }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" style={{ margin:'0 auto', display:'block' }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke={micSel ? '#4A6CF7' : micColor} strokeWidth="2" fill="none"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke={micSel ? '#4A6CF7' : micColor} strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke={micSel ? '#4A6CF7' : micColor} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize:12, fontWeight:500, color: micSel ? (dark ? '#c4b5fd' : '#4A6CF7') : micColor, marginTop:8, lineHeight:1.4 }}>Chante, frappe dans tes mains ou joue à l'instrument</div>
          </div>
        </div>
      );
    }

    if (slide === 3) {
      return (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', width:280 }}>
          {niveaux.map(lv => {
            const sel = tutoNiveau === lv;
            return (
              <div key={lv} role="button" onClick={() => setTutoNiveau(lv)} style={{
                padding:'10px 18px', borderRadius:24, fontSize:13, fontWeight:700, cursor:'pointer',
                background: sel ? '#4A6CF7' : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                color: sel ? '#fff' : (dark ? '#9ca3af' : '#6b7280'),
                border: `2px solid ${sel ? '#4A6CF7' : 'transparent'}`,
                transition:'all 0.15s',
              }}>{lv}</div>
            );
          })}
        </div>
      );
    }

    return null;
  }

  return (
    <div {...swipe} style={{
      position:'fixed', inset:0, zIndex:100,
      background: dark ? '#030712' : '#f9fafb',
      color: dark ? '#f9fafb' : '#111827',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between',
      padding:'24px 20px 80px',
      overflowY:'auto',
    }}>
      {/* Top bar */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ display:'flex', gap:6 }}>
          {Array.from({ length: TUTO_TOTAL }).map((_, i) => (
            <div key={i} style={{
              width: i===slide ? 20 : 7, height:7, borderRadius:4,
              background: i <= slide ? '#4A6CF7' : (dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'),
              transition:'width 0.25s,background 0.25s',
            }}/>
          ))}
        </div>
        <button
          onClick={() => onDone(null)}
          style={{ background:'none', border:'none', color: dark ? '#6b7280' : '#9ca3af', fontSize:13, fontWeight:700, cursor:'pointer', padding:'4px 8px' }}
        >Ignorer</button>
      </div>

      {/* Visual */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 0' }}>
        {renderVisual()}
      </div>

      {/* Text */}
      <div style={{ width:'100%', maxWidth:400, textAlign:'center', marginBottom:32 }}>
        <div style={{ fontSize:22, fontWeight:900, color: dark ? '#f9fafb' : '#111827', marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:14, fontWeight:500, color: dark ? '#d1d5db' : '#374151', lineHeight:1.6 }}>{body}</div>
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
          onClick={() => slide < TUTO_TOTAL - 1 ? setSlide(s => s + 1) : onDone({ activity: tutoActivity, inputMode: tutoInputMode, niveau: tutoNiveau })}
          style={{ flex:2, padding:'14px 0', borderRadius:16, border:'none', background:'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color:'#fff', fontSize:15, fontWeight:900, cursor:'pointer', boxShadow:'0 8px 24px rgba(74,108,247,0.35)' }}
        >{slide < TUTO_TOTAL - 1 ? "Suivant →" : "▶ Commencer !"}</button>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RythmApp() {
  const {
    formulaCatalog, niveauOrder, niveauFormulaIds,
    sheetId, sheetStatus, sheetError, setSheetId: _setSheetId, resetToDefault: _resetToDefault,
  } = useSheetData(
    { formulaCatalog: FORMULA_CATALOG, niveauOrder: NIVEAUX, niveauFormulaIds: NIVEAU_FORMULA_IDS },
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
  const [showHelp,         setShowHelp]         = useState(false);
  const [showConsigne,     setShowConsigne]     = useState(false); // overlay consigne d'arrivée (home + revue depuis "?")
  const [consigneReviewing,setConsigneReviewing]= useState(false); // true = consigne ouverte pour relecture (depuis "?")
  const [showReglagesExpl, setShowReglagesExpl] = useState(false); // popup d'explications des réglages
  const [showMicCalib,     setShowMicCalib]     = useState(false); // modale calibration micro
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
  const [tapAnalysis,     setTapAnalysis]     = useState(null);
  const [rhythmSoundOn, setRhythmSoundOn] = useState(true);
  const [tapSoundOn,    setTapSoundOn]    = useState(true);
  const rhythmSoundRef = useRef(true);
  const tapSoundRef    = useRef(true);
  rhythmSoundRef.current = rhythmSoundOn;
  tapSoundRef.current    = tapSoundOn;

  // Mode Extrême act 1 : rythme + flash off → score x2
  const [extremeAnimOn, setExtremeAnimOn] = useState(false);
  const [scoreWasExtreme, setScoreWasExtreme] = useState(false);  // mode Extrême figé au calcul du score
  const extremeMode = activity === 1 && !rhythmSoundOn && !flashBorderOn;
  useEffect(() => {
    if (!extremeMode) return;
    setExtremeAnimOn(true);
    const t = setTimeout(() => setExtremeAnimOn(false), 1600);
    return () => clearTimeout(t);
  }, [extremeMode]);

  // Act 3/4 : nombre de propositions par ligne selon orientation (portrait=1, paysage=2)
  // matchMedia = fiable au changement d'orientation (innerWidth peut être périmé sur orientationchange)
  const [choiceCols, setChoiceCols] = useState(
    typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches ? 2 : 1
  );
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const update = () => setChoiceCols(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Act 3 & 4
  const [choices,     setChoices]     = useState([]);
  const [correctIdx,  setCorrectIdx]  = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [pendingIdx,  setPendingIdx]  = useState(null);
  const [act4CountN,  setAct4CountN]  = useState(null);
  const [act34Error,  setAct34Error]  = useState(null); // act 3/4 : génération distracteurs impossible
  const [act5Palette, setAct5Palette] = useState([]);   // act 5 : cellules (formules) proposées
  const [act5Placed,  setAct5Placed]  = useState([]);   // act 5 : cellules posées par l'élève (séquence)
  const [act5Invalid, setAct5Invalid] = useState(false);// act 5 : mesure non conforme à la validation
  const [act5CountN,  setAct5CountN]  = useState(null); // act 5 : décompte avant lecture (3, 4)

  // Série de 10
  const [seriesMode,   setSeriesMode]   = useState(false);
  const [seriesIdx,    setSeriesIdx]    = useState(0);
  const [seriesXpLog,  setSeriesXpLog]  = useState([]);
  const [seriesMedals, setSeriesMedals] = useState([]);
  const seriesBaseBpmRef               = useRef(null);
  const seriesIdxRef                   = useRef(0);
  // Résultat addSession (trophées + montée de rang XP) — affiché dans series-end
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
  const pendingTutoStartRef = useRef(false);
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

  const handleTutorialDone = (selections) => {
    if (ENABLE_TUTORIAL === "once") {
      localStorage.setItem(`rythm-tuto-${TUTORIAL_VERSION}`, "1");
    }
    setShowTutorial(false);
    if (!selections) return; // "Ignorer"
    const { activity: a, inputMode: im, niveau: lv } = selections;
    setActivity(a);
    if (im === "mic") { setInputMode("mic"); startMic(); }
    else { setInputMode("tap"); stopMic(); }
    if (lv) selectNiveau(lv);
    pendingTutoStartRef.current = true; // startSession fires after next render (fresh closures)
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
    if (niveauOrder.length > 0) {
      setSelectedFormulas(new Set(niveauFormulaIds[niveauOrder[0]] ?? []));
    }
  }, [formulaCatalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Efface l'erreur de génération act 3/4 dès que la sélection ou l'activité change.
  useEffect(() => { setAct34Error(null); }, [selectedFormulas, activity]);

  // Sélectionne toutes les formules de C1/1 jusqu'au niveau cliqué (cumulatif)
  const selectNiveau = useCallback(niveau => {
    const ids = new Set();
    for (const lv of niveauOrder) {
      (niveauFormulaIds[lv] ?? []).forEach(id => ids.add(id));
      if (lv === niveau) break;
    }
    setSelectedFormulas(ids);
  }, [niveauOrder, niveauFormulaIds]);

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
  const rhythmBeep = useCallback((strong = false, forced = false, volMult = 1) => {
    if (!forced && !rhythmSoundRef.current) return;
    try {
      const ac = getCtx();
      const o  = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle';
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = strong ? 440 : 330;
      g.gain.setValueAtTime(0.3 * volMult, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
      o.start(ac.currentTime); o.stop(ac.currentTime + 0.15);
    } catch(_) {}
  }, [getCtx]);

  // Note du rythme TENUE — résonne ~durée de la note (act 3/4) : distingue
  // une note tenue d'une attaque+silence à l'oreille (essentiel pour holdRestSwap).
  const rhythmSustain = useCallback((durMs, forced = false, volMult = 1) => {
    if (!forced && !rhythmSoundRef.current) return;
    try {
      const ac = getCtx();
      const o  = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle';
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = 330;
      const t   = ac.currentTime;
      const dur = Math.max(0.1, durMs / 1000);
      const peak = 0.3 * volMult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);     // attaque brève
      g.gain.setValueAtTime(peak, Math.max(t + 0.02, t + dur - 0.06));
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);    // release court
      o.start(t); o.stop(t + dur + 0.02);
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

  const rhythmPulse = useCallback((strong = false, volMult = 1) => {
    rhythmBeep(strong, false, volMult);
    setBeatStrong(strong);
    setBeatFlash(true);
    setTimeout(() => setBeatFlash(false), strong ? 160 : 110);
  }, [rhythmBeep]);

  // ── Microphone ─────────────────────────────────────────────────────────────
  // Reprend l'AudioContext suspendu (verrouillage device / passage en arrière-plan).
  const resumeAudio = useCallback(async () => {
    try {
      const ac = audioCtxRef.current;
      if (ac && ac.state === "suspended") await ac.resume();
    } catch (_) { /* ignore */ }
  }, []);

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

  // Garantit un micro vivant : résume l'audio context puis re-acquiert le flux si
  // les pistes sont mortes (cas typique après verrouillage device / sortie d'appli).
  const ensureMicAlive = useCallback(async () => {
    await resumeAudio();
    const tracks = micStreamRef.current?.getTracks?.() ?? [];
    const alive  = tracks.length > 0 && tracks.every(t => t.readyState === "live");
    if (alive) return;
    try { micStreamRef.current?.getTracks?.().forEach(t => t.stop()); } catch (_) {}
    micStreamRef.current   = null;
    micAnalyserRef.current = null;
    await startMic();
  }, [resumeAudio, startMic]);

  // Retour au premier plan (déverrouillage device / retour sur l'onglet) :
  // ré-active l'AudioContext et ré-acquiert le micro si nécessaire.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      await resumeAudio();
      if (inputMode === "mic") await ensureMicAlive();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [inputMode, resumeAudio, ensureMicAlive]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearTids = () => { tidsRef.current.forEach(clearTimeout); tidsRef.current = []; };
  const tid       = (fn, ms) => { const id = setTimeout(fn, ms); tidsRef.current.push(id); return id; };

  // sustain=true : lecture tenue (chaque note résonne ~sa durée) — act 3/4.
  const playPatternAudio = useCallback((pat, bpmVal, delayMs = 0, forced = false, sustain = false, isAct5 = false) => {
    audioTidsRef.current.forEach(clearTimeout);
    audioTidsRef.current = [];
    const { timestamps, totalMs } = toTimestamps(pat.figs, bpmVal, pat.timeSig);
    const isCompound = ["12/8", "6/8", "9/8"].includes(pat.timeSig);
    const quarterMs  = isCompound ? (60000 / bpmVal) / 1.5 : 60000 / bpmVal;
    const beatMs = 60000 / bpmVal;
    pat.figs.forEach((fig, i) => {
      if (!fig.rest) {
        const vol = beatVolMult(pat.timeSig, timestamps[i], beatMs, isAct5);
        const id = sustain
          ? setTimeout(() => rhythmSustain(figDur(fig) * quarterMs * 0.9, forced, vol), delayMs + timestamps[i])
          : setTimeout(() => rhythmBeep(false, forced, vol), delayMs + timestamps[i]);
        audioTidsRef.current.push(id);
      }
    });
    const nBeats = Math.round(totalMs / beatMs);
    for (let k = 0; k < nBeats; k++) {
      const id = setTimeout(() => {
        setBeatStrong(k === 0);
        setBeatFlash(true);
        setTimeout(() => setBeatFlash(false), k === 0 ? 160 : 110);
      }, delayMs + k * beatMs);
      audioTidsRef.current.push(id);
    }
  }, [rhythmBeep, rhythmSustain]);

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

    // ── Activité 5 : écoute puis reconstitue par tap-to-place ──────────────
    if (activity === 5) {
      const { palette } = buildPalette({
        solution: pat, selectedFormulas, formulaCatalog, niveauOrder, niveauFormulaIds,
      });
      setPattern(pat); setSessionBpm(bpm);
      setAct5Palette(palette); setAct5Placed([]); setAct5Invalid(false);
      setScores([]); setEarnedPts(0); setProgress(0); setActiveIdx(-1);
      setSelectedIdx(null); setRevealed(false);
      setPhase("building");
      // Décompte beats 3 & 4 (flash bordure) puis lecture tenue (flash sur chaque temps)
      setAct5CountN(3); pulse(false);
      tid(() => { setAct5CountN(4); pulse(false); }, beatMs);
      tid(() => { setAct5CountN(null); playPatternAudio(pat, bpm, 0, false, true, true); }, 2 * beatMs);
      return;
    }

    // ── Activités 3 & 4 : choix parmi 4 (3 en dernier recours) ──────────
    if (activity === 3 || activity === 4) {
      const niveau = deriveNiveau(selectedFormulas, niveauOrder, niveauFormulaIds);
      const res    = generateDistractorSet(pat, { selectedFormulas, formulaCatalog, niveau });
      if (res.blocked) {
        // Génération impossible (sélection trop pauvre) → blocage propre, pas de jeu.
        setAct34Error("Pas assez de figures pour générer 3 réponses distinctes dans ce mode. Sélectionne davantage de figures.");
        setPhase("idle"); setPattern(null);
        return;
      }
      setAct34Error(null);
      const shuffled = shuffle([pat, ...res.distractors]);
      const corrIdx  = shuffled.indexOf(pat);
      setPattern(pat); setSessionBpm(bpm);
      setChoices(shuffled); setCorrectIdx(corrIdx);
      setSelectedIdx(null); setPendingIdx(null); setAct4CountN(null);
      setScores([]); setEarnedPts(0); setProgress(0); setActiveIdx(-1);
      setRevealed(activity === 4);
      if (activity === 3) {
        // Décompte 3,4 puis lecture audio (tenue)
        setPhase("countdown"); setCountdownN(3);
        pulse(false);
        tid(() => { setCountdownN(4); pulse(false); }, beatMs);
        tid(() => {
          setPhase("playing");
          playPatternAudio(pat, bpm, 0, false, true);
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
          if (!pat.figs[i].rest) {
            const vol = beatVolMult(pat.timeSig, ts, beatMs);
            tid(() => rhythmBeep(false, false, vol), ts);
          }
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
      if (!pat.figs[0]?.rest) rhythmBeep(false, false, beatVolMult(pat.timeSig, 0, beatMs));
      setPhase("playing");
      startRef.current = performance.now();

      timestamps.forEach((ts, i) => {
        tid(() => {
          setActiveIdx(i);
          if (i > 0 && !pat.figs[i].rest) rhythmPulse(false, beatVolMult(pat.timeSig, ts, beatMs));
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
  }, [randomPattern, actualBpm, pulse, rhythmBeep, rhythmPulse, revealBeat, activity, flashOffsetMs, formulaCatalog, selectedFormulas, playPatternAudio, niveauOrder, niveauFormulaIds]);

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

  // ── Act 5 : pose/retire une cellule + validation (scoring partiel) ──────────
  const placeCell = useCallback((formula) => {
    if (phase !== "building") return;
    setAct5Placed(prev => [...prev, formula]);
  }, [phase]);
  const removeCell = useCallback((idx) => {
    if (phase !== "building") return;
    setAct5Placed(prev => prev.filter((_, i) => i !== idx));
  }, [phase]);
  const handleValidateAct5 = useCallback(() => {
    if (phase !== "building" || !pattern) return;
    audioTidsRef.current.forEach(clearTimeout); audioTidsRef.current = [];
    const answerFigs = act5Placed.flatMap(f => f.figs.map(x => ({ ...x })));
    // Mesure non conforme (incomplète ou trop longue) → exercice NON VALIDE : 0 point, pas de %.
    if (measureStatus(answerFigs, pattern.timeSig) !== "complete") {
      setAct5Invalid(true);
      setEarnedPts(0);
      setRevealed(true);
      setPhase("results");
      return;
    }
    setAct5Invalid(false);
    const group = groupOf(pattern.timeSig);
    const { pct } = scoreActivity5(pattern.figs, answerFigs, group, "16"); // grille fine (double-croche)
    setEarnedPts(pct);
    setTotalPts(prev => prev + pct);
    setRevealed(true);
    setPhase("results");
  }, [phase, pattern, act5Placed]);

  // ── Tap ────────────────────────────────────────────────────────────────────
  const handleTap = useCallback((e) => {
    e.preventDefault();
    // Accepte playing + pre-tap pendant le décompte pour act 1 ET act 2.
    if (phase !== "playing" && !(phase === "countdown" && (activity === 1 || activity === 2))) return;
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
    if (activity !== 1 && activity !== 2) return; // scoring tap : act 1 & 2 seulement
    const beatMs = 60000 / sessionBpm;
    const { timestamps } = toTimestamps(pattern.figs, sessionBpm, pattern.timeSig);
    const playable = pattern.figs
      .map((fig, i) => ({ fig, tsBeats: timestamps[i] / beatMs }))
      .filter(({ fig }) => !fig.rest);

    // Construction de l'attempt : targetOnsets en pulsations (sans bias d'unités),
    // tempo cible en ms/pulsation. userOnsets = brut, l'alignement DP gère les extras/missing.
    const attempt = {
      targetOnsets: playable.map(p => p.tsBeats),
      userOnsets:   [...tapTimesRef.current],
      targetTempoMsPerUnit: beatMs,
      activity,
    };
    const result = scoreRhythm(attempt, RYTHM_SCORING_PARAMS);

    // Reconstitue scores[] indexé par note jouable. Pour chaque cible : appariée → dev
    // (résidu en ms) + grade dérivé des seuils scoreTap ; manquée → grade "miss", dev null.
    const pairByTargetIdx = new Map();
    result.alignment.pairs.forEach((p, idx) => {
      pairByTargetIdx.set(p.targetIdx, result.fit.residuals[idx]);
    });
    const s = playable.map((_, i) => {
      if (!pairByTargetIdx.has(i)) {
        return { label: "Manqué ✕", pts: 0, grade: "miss", dev: null };
      }
      const dev = pairByTargetIdx.get(i);
      // Le grade utilise le résidu DEAD-ZONÉ (cohérent avec la régularité globale :
      // un résidu sous le plancher de bruit compte comme parfait). Le `dev` retourné
      // reste brut pour l'affichage (badge dépliable + point sur portée).
      const devGraded = scoringDeadzone(dev, RYTHM_SCORING_PARAMS.inputNoiseFloorMs);
      const graded = scoreTap(devGraded, 0, beatMs);
      return { ...graded, dev };
    });
    setScores(s);

    // Score global : combine le `total` structurel du moteur (composantes robustes au MAD)
    // avec la moyenne des points par note (sensibilité par-tap : un « Bien » isolé n'est
    // pas absorbé par la médiane). Un seul « Bien » sur 8 → perNoteAvg = 96,25 % → 96 %.
    const totalNotePts = s.reduce((acc, x) => acc + x.pts, 0);
    const perNoteAvg   = playable.length > 0 ? totalNotePts / (playable.length * 100) : 0;
    const combinedTotal = result.total * perNoteAvg;
    const bonus  = REVEAL_BONUS[revealBeat] / 100;
    const extremeMult = extremeMode ? 2 : 1;
    setScoreWasExtreme(extremeMode);
    const earnedFinal = Math.round(combinedTotal * 100 * playable.length * (1 + bonus) * extremeMult);
    setEarnedPts(earnedFinal);
    setTotalPts(prev => prev + earnedFinal);

    // Champs hérités (rétrocompatibilité tapAnalysis) + nouveaux (flags, drift, extras…)
    const N = attempt.targetOnsets.length;
    const hasTempo = N >= RYTHM_SCORING_PARAMS.minNotesForTempo;
    // tempoErr orienté comme avant : >0 = presse (élève plus rapide), <0 = ralentit.
    // result.diagnosis.tempoRatio = aFit/aCible. Élève plus rapide ⇒ aFit < aCible ⇒ ratio < 1 ⇒ presse.
    const tempoErr = hasTempo ? (1 / result.diagnosis.tempoRatio - 1) : 0;
    setTapAnalysis({
      // Anciens champs (UI existante)
      hasTempo,
      tempoErr,
      offsetMs: Math.round(result.diagnosis.offsetMs),
      regularityStd: Math.round(result.diagnosis.regularityMs),
      malusPts: 0, // malus tempo absorbé dans result.total désormais
      // Nouveaux champs
      flags:       result.diagnosis.flags,
      drift:       result.diagnosis.drift,
      extras:      result.alignment.extraUserIdx,
      missing:     result.alignment.missingTargetIdx,
      components:  result.components,
      total:       result.total,
    });
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

  // Lance le jeu après tutorial interactif (attend que les closures de startGame soient fraîches)
  // Doit rester AVANT tout early return (Rules of Hooks)
  useEffect(() => {
    if (pendingTutoStartRef.current) {
      pendingTutoStartRef.current = false;
      startSession();
    }
  });

  // Enregistre l'XP d'un exercice individuel (hors série) une seule fois par pattern.
  const recordedPatternRef = useRef(null);
  useEffect(() => {
    if (phase !== "results" || seriesMode || !pattern) return;
    if (recordedPatternRef.current === pattern) return;
    // Act 1/2 : earnedPts est posé après le calcul de scores (1 tick plus tard) — on attend.
    if ((activity === 1 || activity === 2) && scores.length === 0) return;
    recordedPatternRef.current = pattern;
    const playableCount = pattern.figs.filter(f => !f.rest).length || 1;
    const bonusMult     = 1 + REVEAL_BONUS[revealBeat] / 100;
    const maxPtsLocal   = activity === 5 ? 100 : Math.round(playableCount * 100 * bonusMult * (scoreWasExtreme ? 2 : 1));
    const pctLocal      = maxPtsLocal ? Math.round((earnedPts / maxPtsLocal) * 100) : 0;
    const medalLocal    = pctLocal >= 90 ? "🥇" : pctLocal >= 70 ? "🥈" : pctLocal >= 50 ? "🥉" : "🎯";
    addSession({ module: "rythme", xpEarned: earnedPts, medal: medalLocal, meta: { individual: true } });
  }, [phase, seriesMode, pattern, earnedPts, scores, activity, revealBeat, scoreWasExtreme, addSession]);


  // ── Page réglages ──────────────────────────────────────────────────────────
  if (currentPage === "settings") {
    return (
      <SettingsPage
        formulaCatalog={formulaCatalog}
        niveauOrder={niveauOrder}
        niveauFormulaIds={niveauFormulaIds}
        selectedFormulas={selectedFormulas}
        onToggle={toggleFormula}
        onNiveauSelect={selectNiveau}
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
  const isNiveauActif = (niveau) => {
    const cumIds = [];
    for (const lv of niveauOrder) {
      (niveauFormulaIds[lv] ?? []).forEach(id => cumIds.push(id));
      if (lv === niveau) break;
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

  // Lancement depuis la home : affiche la consigne d'arrivée (1ʳᵉ fois / non masquée), sinon lance.
  const requestStart = () => {
    if (consigneSeen(`rythme-${activity}`)) { startSession(); return; }
    setShowConsigne(true);
  };
  // Déverrouillage audio best-effort (geste utilisateur) + lancement.
  const startFromConsigne = () => {
    try { const ac = getCtx(); ac.resume?.(); } catch (_) {}
    setShowConsigne(false);
    startSession();
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
                        <span style={{ fontWeight:700, color:'#4A6CF7' }}>{(micThreshold*200).toFixed(1)}</span>
                      </div>
                      <input type="range" min={0} max={10} step={0.5} value={micThreshold*200}
                        onChange={e => { setMicThreshold(+e.target.value/200); ensureMicAlive(); }}
                        style={{ width:'100%', accentColor:'#4A6CF7' }}/>
                      <button
                        onClick={() => setShowMicCalib(true)}
                        style={{ marginTop:8, width:'100%', padding:'8px 0', borderRadius:10, border:'1px solid rgba(74,108,247,0.35)', background:'none', color:'#4A6CF7', fontSize:11, fontWeight:700, cursor:'pointer' }}
                      >
                        Calibrer automatiquement
                      </button>
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
                    {niveauOrder.map(niveau => {
                      const active = isNiveauActif(niveau);
                      const hasF = (niveauFormulaIds[niveau] ?? []).length > 0;
                      return (
                        <button key={niveau} onClick={() => selectNiveau(niveau)} disabled={!hasF}
                          style={{ padding:'6px 14px', borderRadius:20, border:'none', background: active ? '#4A6CF7' : 'var(--surface-2)', color: active ? '#fff' : hasF ? 'var(--text-muted)' : 'var(--border-c)', fontSize:11, fontWeight:700, cursor: hasF ? 'pointer' : 'default' }}
                        >{niveau}</button>
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
                        <div style={{ fontSize:9, color: revealBeat===beat ? '#ddd8fe' : 'var(--text-muted)', marginTop:2 }}>{beat===1?"–":beat===2?"+10%":beat===3?"+20%":"+50%"}</div>
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

  // ── Aide + Consignes (revue) + Réglages (explications) — partagés accueil ET en-jeu ──
  const closeConsigneReview = () => { setShowConsigne(false); setConsigneReviewing(false); };

  const HelpOverlay = showHelp ? (
    <>
      <div onClick={() => setShowHelp(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200 }}/>
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:201, width:'min(320px, 90vw)', background:'var(--surface)', border:'1.5px solid rgba(74,108,247,0.3)', borderRadius:20, padding:'28px 24px', textAlign:'center' }}>
        <div style={{ fontSize:18, fontWeight:900, color:'var(--text)', marginBottom:6 }}>Aide</div>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:24 }}>Que veux-tu consulter ?</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={() => { setShowHelp(false); setConsigneReviewing(true); setShowConsigne(true); }}
            style={{ padding:'14px 0', borderRadius:14, border:'none', background:'linear-gradient(135deg,#3b82f6,#4A6CF7)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer' }}>
            Consignes
          </button>
          <button onClick={() => { setShowHelp(false); setShowReglagesExpl(true); }}
            style={{ padding:'14px 0', borderRadius:14, border:'2px solid rgba(74,108,247,0.35)', background:'none', color:'#4A6CF7', fontSize:14, fontWeight:800, cursor:'pointer' }}>
            Réglages
          </button>
        </div>
        <button onClick={() => setShowHelp(false)} style={{ marginTop:16, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer' }}>Fermer</button>
      </div>
    </>
  ) : null;

  const ConsigneModal = showConsigne ? (
    <ConsigneOverlay
      storageKey={`rythme-${activity}`}
      icon={activity===1?"🥁":activity===2?"👂":activity===3?"🎵":activity===4?"🎼":"🧩"}
      title={ACTIVITIES[activity - 1]?.label ?? "Activité"}
      lines={CONSIGNES_RYTHME[activity] ?? []}
      controls={[
        ...(activity === 1 ? [CONSIGNE_CONTROLS.rhythmSound] : []),
        ...((activity === 1 || activity === 2) ? [CONSIGNE_CONTROLS.flash] : []),
        ...((inputMode === "tap" && (activity === 1 || activity === 2)) ? [CONSIGNE_CONTROLS.tapSound] : []),
      ]}
      warning={RYTHME_SOUND_WARNING}
      startLabel={consigneReviewing ? "Fermer" : (seriesMode ? "▶ Commencer la série" : "▶ Commencer")}
      onStart={consigneReviewing ? closeConsigneReview : startFromConsigne}
      onClose={consigneReviewing ? closeConsigneReview : () => setShowConsigne(false)}
    />
  ) : null;

  const MicCalibModal = showMicCalib ? (
    <MicCalibration
      analyserRef={micAnalyserRef}
      ensureMic={ensureMicAlive}
      stopMic={stopMic}
      inputMode={inputMode}
      onApply={(t) => setMicThreshold(t)}
      onClose={() => setShowMicCalib(false)}
    />
  ) : null;

  const ReglagesExplModal = showReglagesExpl ? (
    <>
      <div onClick={() => setShowReglagesExpl(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:300 }}/>
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:301, width:'min(360px, 92vw)', maxHeight:'88vh', overflowY:'auto', background:'var(--surface)', border:'1.5px solid rgba(74,108,247,0.3)', borderRadius:20, padding:'26px 22px 20px' }}>
        <div style={{ fontSize:18, fontWeight:900, color:'var(--text)', marginBottom:4, textAlign:'center' }}>Réglages — Rythme</div>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16, textAlign:'center' }}>À quoi servent les options ?</div>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:18 }}>
          {REGLAGES_SECTIONS.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
              <span style={{
                flexShrink:0, width:32, height:32, borderRadius:10,
                display:'flex', alignItems:'center', justifyContent:'center',
                background:'var(--surface-2)', border:'1px solid var(--border-c)',
                color:'#4A6CF7',
              }}>{s.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:2 }}>{s.title}</div>
                <div style={{ fontSize:12, lineHeight:1.45, color:'var(--text-muted)' }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setShowReglagesExpl(false)}
          style={{ width:'100%', padding:'13px 0', borderRadius:14, border:'none', background:'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer' }}>
          Fermer
        </button>
      </div>
    </>
  ) : null;

  // ── Page accueil ───────────────────────────────────────────────────────────
  if (currentPage === "home") {
    return (
      <>
        {showTutorial && <TutorialOverlay onDone={handleTutorialDone} niveauOrder={niveauOrder} activity={activity} inputMode={inputMode} />}
        {HelpOverlay}
        {SettingsModal}
        <div className="bg-app text-app min-h-dvh flex flex-col items-center px-3.5 py-3 pb-8 select-none">
          {/* Header */}
          <div className="w-full max-w-xl flex justify-between items-center mb-4">
            <Link to="/" className="bg-surface-2 border border-app rounded-lg px-2.5 py-1 font-bold text-xs no-underline" style={{ color: '#4A6CF7' }}>← Tessitura</Link>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <ThemeToggleInline />
              <button
                onClick={() => setShowHelp(true)}
                title="Aide"
                className="bg-surface-2 border border-app rounded-lg cursor-pointer flex items-center justify-center"
                style={{ width:32, height:32, fontWeight:700, fontSize:15, color:'var(--text-muted)' }}
              >?</button>
              <button
                onClick={() => { setOpenAccordion("saisie"); setSettingsModalOpen(true); }}
                className="bg-surface-2 border border-app rounded-xl text-app-muted text-lg cursor-pointer px-2 py-0.5 leading-none"
                title="Réglages"
                data-tour="btn-reglages-rythme"
              >⚙</button>
            </div>
          </div>

          <div className="w-full max-w-xl">
            <div className="text-3xl font-black mb-5" style={{ color: '#4A6CF7' }}>Rythme</div>

            {/* grille activités (dernière carte pleine largeur si nombre impair) */}
            <div className="grid grid-cols-2 gap-3 mb-5" data-tour="activite-grid">
              {ACTIVITIES.map((a, idx) => {
                const sel = activity === a.id;
                const fullWidth = ACTIVITIES.length % 2 === 1 && idx === ACTIVITIES.length - 1;
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
                      gridColumn: fullWidth ? '1 / -1' : undefined,
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
              onClick={requestStart}
              data-tour="btn-commencer"
              className="w-full border-none rounded-2xl cursor-pointer text-white text-base font-bold"
              style={{ padding: '18px 0', background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', boxShadow: '0 8px 32px rgba(74,108,247,0.4)' }}
            >{seriesMode ? "▶ Commencer la série" : "▶ Commencer"}</button>
          </div>
        </div>

        {ConsigneModal}
        {ReglagesExplModal}
        {MicCalibModal}
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
  // Act 5 : earnedPts EST déjà un pourcentage (scoring partiel) → maxPts = 100.
  const maxPts        = activity === 5 ? 100 : Math.round(rawMax * bonusMult * (scoreWasExtreme ? 2 : 1));
  const pct           = maxPts ? Math.round((earnedPts / maxPts) * 100) : 0;
  const medal         = pct >= 90 ? "🥇" : pct >= 70 ? "🥈" : pct >= 50 ? "🥉" : "🎯";

  // Act 5 : figures posées + conformité de la mesure (pour l'indicateur live et la validation)
  const act5Figs = activity === 5 ? act5Placed.flatMap(f => f.figs) : [];
  const act5Stat = activity === 5 && pattern ? measureStatus(act5Figs, pattern.timeSig) : "complete";

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
    {HelpOverlay}
    {ConsigneModal}
    {ReglagesExplModal}
    {MicCalibModal}
    <div
      className="bg-app text-app min-h-dvh flex flex-col items-center px-3.5 py-3 pb-6 select-none"
      style={{ touchAction: (phase === 'results' || activity === 5) ? 'pan-y' : 'none' }}
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
      <div
        className="w-full max-w-xl flex justify-between items-center mb-2.5"
        onPointerDown={e => e.stopPropagation()}
      >
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
        {activity === 5 && (phase === "building" || phase === "results") && (
          <span className="text-[12px] font-bold text-app truncate px-2" style={{ maxWidth: 200 }}>
            Reconstitue le rythme{pattern ? ` · ${pattern.timeSig}` : ""}
          </span>
        )}
        <div className="flex gap-2 items-center">
          <div className="bg-surface-2 border border-app rounded-full px-2.5 py-0.5 text-xs text-app font-bold">⭐ {totalPts}</div>
          <ThemeToggleInline />
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setShowHelp(true); }}
            title="Aide"
            className="bg-surface-2 border border-app rounded-lg cursor-pointer flex items-center justify-center"
            style={{ width:32, height:32, fontWeight:700, fontSize:15, color:'var(--text-muted)' }}
          >?</button>
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

          {/* Animation Mode Extrême activé */}
          {extremeAnimOn && (
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 50,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  animation: 'extreme-pop 1.6s ease-out forwards',
                  textAlign: 'center',
                  background: 'rgba(3,7,18,0.85)',
                  border: '2px solid #f87171',
                  borderRadius: 20,
                  padding: '20px 32px',
                  boxShadow: '0 0 40px rgba(248,113,113,0.5)',
                }}
              >
                <div style={{ fontSize: 40, lineHeight: 1 }}>⚡</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#f87171', marginTop: 6 }}>
                  Mode Extrême Activé
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginTop: 2 }}>
                  Score ×2
                </div>
              </div>
            </div>
          )}

          {/* IDLE */}
          {phase==="idle" && (
            <div className="text-center px-5">
              <div className="text-5xl mb-2.5">
                {activity===1?"🥁":activity===2?"👂":activity===3?"🎵":activity===4?"🎼":"🧩"}
              </div>
              <p className="text-app-muted text-sm leading-relaxed" style={{ maxWidth: 300 }}>
                {activity===1 && "Un rythme aléatoire s'affiche sur la portée. Reproduis-le en tapant sur le bouton au bon moment."}
                {activity===2 && "Écoute le rythme et reproduis-le en tapant. La portée reste cachée pendant le jeu."}
                {activity===3 && "Écoute le rythme joué et identifie la bonne portée parmi 4 propositions."}
                {activity===4 && "Observe la portée et identifie parmi 4 lectures audio celle qui correspond."}
                {activity===5 && "Écoute le rythme, puis reconstitue-le en posant des cellules rythmiques sur la portée. Score partiel selon la justesse."}
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
              {(activity===3 || activity===4) && act34Error && (
                <div
                  className="mt-3 mx-auto rounded-xl text-[12px] font-semibold leading-snug"
                  style={{
                    maxWidth: 320, padding: '10px 12px',
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid #fbbf24', color: '#fbbf24',
                  }}
                >
                  {act34Error}
                  <div
                    onClick={() => { setOpenAccordion("niveau"); setSettingsModalOpen(true); }}
                    className="cursor-pointer underline mt-1.5"
                    style={{ color: '#4A6CF7' }}
                  >
                    Ouvrir les réglages
                  </div>
                </div>
              )}
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
                    {activity===1 && phase==="results" && scoreWasExtreme &&
                      <span className="ml-2 font-black" style={{ color: '#f87171' }}>
                        ⚡ ×2 Extrême
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
                    border: (flashBorderOn && (
                      phase === "results"
                        ? beatFlash  // relecture (Réécouter / Solution) : beatFlash pilote partout
                        : (activity === 1 ? metroDotFlash : beatFlash)
                    )) ? '2px solid #4A6CF7' : '2px solid var(--border-c)',
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
                    scoreDevs={phase==="results" ? devMap : undefined}
                    sessionBpm={sessionBpm}
                  />
                  {phase==="results" && scores.length > 0 && (
                    <div style={{
                      position:'absolute', bottom:6, left:6,
                      display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                      pointerEvents:'none',
                    }}>
                      {/* Mini-réplique du marqueur (note + guide + axe + pile), pas de point */}
                      <svg width="50" height="44" style={{ display:'block' }}>
                        <ellipse cx="25" cy="6" rx="5" ry="3.5" fill="#4b5563" />
                        <line x1="25" y1="10" x2="25" y2="26" stroke="#9ca3af" strokeOpacity="0.45" />
                        <line x1="8"  y1="32" x2="42" y2="32" stroke="#9ca3af" strokeOpacity="0.55" />
                        <line x1="25" y1="28" x2="25" y2="36" stroke="#9ca3af" strokeOpacity="0.8" />
                        <text x="8"  y="43" fontSize="7" textAnchor="start" style={{ fill:'var(--text-muted)' }}>avance</text>
                        <text x="42" y="43" fontSize="7" textAnchor="end"   style={{ fill:'var(--text-muted)' }}>retard</text>
                      </svg>
                    </div>
                  )}
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
              <TapDiagnostics beatMs={60000 / sessionBpm} analysis={tapAnalysis} />
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
            <div
              className="w-full"
              style={choiceCols === 2
                /* paysage : déborde le cap max-w-xl (576) pour des cellules larges ; le parent flex items-center recentre */
                ? { width: 'min(94vw, 960px)', maxWidth: 'none' }
                : undefined}
            >
              <div className="text-center text-[11px] text-app-muted mb-2.5 flex items-center justify-center gap-2">
                {phase==="countdown" ? (
                  <span className="text-[40px] font-black leading-none" style={{ color: '#4A6CF7' }}>{countdownN}</span>
                ) : (
                  <>
                    <span>{phase==="playing" ? "Quelle portée ?" : "Résultat"} · {sessionBpm} BPM</span>
                    <button
                      onClick={() => playPatternAudio(choices[correctIdx], sessionBpm, 0, false, true)}
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
                        width={choiceCols === 1 ? 520 : 440}
                        height={120}
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
                        playPatternAudio(c, sessionBpm, 0, false, true);
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

          {/* act 5 — reconstitution par tap-to-place */}
          {activity === 5 && (phase === "building" || phase === "results") && pattern && (
            <div className="w-full">
              {phase === "building" && (
                <>
                  {/* Une seule ligne d'actions : décompte OU [Réécouter] [Annuler] (style Apple) */}
                  <div className="flex items-center justify-center gap-2 mb-1.5" style={{ minHeight: 38 }}>
                    {act5CountN !== null ? (
                      <span className="text-[28px] font-black leading-none" style={{ color: '#4A6CF7' }}>{act5CountN}</span>
                    ) : (
                      <>
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => playPatternAudio(pattern, sessionBpm, 0, false, true, true)}
                          className="flex items-center gap-1.5 rounded-full text-[12px] font-semibold cursor-pointer text-white"
                          style={{ background: '#4A6CF7', padding: '6px 16px' }}
                        >▶ Réécouter</button>
                        {act5Placed.length > 0 && (
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onClick={() => removeCell(act5Placed.length - 1)}
                            className="flex items-center gap-1.5 rounded-full text-[12px] font-semibold cursor-pointer"
                            style={{ background: 'var(--surface-2)', color: '#4A6CF7', padding: '6px 14px', border: '1px solid var(--border-c)' }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" />
                            </svg>
                            Annuler
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Portée en construction — métrique dès le départ, pas de re-scaling (compact) ;
                      bordure flash pendant le décompte + la lecture du rythme */}
                  <div
                    className="rounded-2xl overflow-hidden mb-1 transition-colors duration-150"
                    style={{ background: 'var(--surface)', padding: '10px 6px 6px', border: `2px solid ${beatFlash ? '#4A6CF7' : 'var(--border-c)'}` }}
                  >
                    <RythmStaff figures={act5Figs} timeSig={pattern.timeSig} activeIdx={-1} showClef={false} showTimeSig={true} compact={true} />
                  </div>

                  {/* Indicateur de conformité de la mesure */}
                  <div className="text-center text-[11px] font-bold mb-2"
                    style={{ color: act5Stat === "complete" ? '#34d399' : act5Stat === "over" ? '#f87171' : '#fbbf24' }}>
                    {act5Stat === "complete" ? "● Mesure complète" : act5Stat === "over" ? "⚠ Mesure trop longue" : "○ Mesure incomplète"}
                  </div>

                  {/* Palette de cellules disponibles (tap = poser) — sans card */}
                  <div className="text-[11px] text-app-muted text-center mb-1.5">Cellules disponibles</div>
                  <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                    {act5Palette.map((f, i) => (
                      <div
                        key={`${f.id}-${i}`}
                        role="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => placeCell(f)}
                        className="cursor-pointer overflow-hidden"
                        style={{ width: 87, height: 70 }}
                      >
                        {/* rendu à taille « correcte » puis scale uniforme → notation proportionnelle */}
                        <div style={{ width: 124, transformOrigin: 'top left', transform: 'scale(0.7)' }}>
                          <RythmStaff figures={f.figs} timeSig={pattern.timeSig} activeIdx={-1} width={124} height={100} showClef={false} showTimeSig={false} compact={true} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={handleValidateAct5}
                    disabled={act5Placed.length === 0}
                    className="w-full border-none rounded-2xl text-sm font-bold disabled:cursor-default cursor-pointer"
                    style={{
                      padding: '12px 0',
                      background: act5Placed.length > 0 ? 'linear-gradient(135deg,#4A6CF7,#8B5CF6)' : 'var(--surface-2)',
                      color: act5Placed.length > 0 ? '#fff' : 'var(--text-muted)',
                      transition: 'all 0.2s',
                    }}
                  >Valider</button>
                </>
              )}

              {phase === "results" && (
                <>
                  {act5Invalid ? (
                    <div className="text-center mb-2">
                      <div className="text-lg font-black" style={{ color: '#f87171' }}>✕ Exercice non valide</div>
                      <div className="text-[12px] text-app-muted mt-1">
                        {act5Stat === "over" ? "Mesure trop longue" : "Mesure incomplète"} — la métrique n'est pas respectée. Aucun point.
                      </div>
                    </div>
                  ) : (
                    <div className="text-center mb-2">
                      <div className="text-3xl font-black" style={{ color: '#4A6CF7' }}>{medal} +{earnedPts} pts</div>
                    </div>
                  )}
                  <div className="text-[11px] text-app-muted mb-1">Ta réponse</div>
                  <div className="rounded-2xl overflow-hidden mb-2" style={{ background: 'var(--surface)', padding: '10px 6px 6px', border: `2px solid ${act5Invalid ? '#f87171' : 'var(--border-c)'}` }}>
                    {act5Placed.length > 0
                      ? <RythmStaff figures={act5Figs} timeSig={pattern.timeSig} activeIdx={-1} showClef={false} compact={true} strikeMeter={act5Invalid} />
                      : <div className="text-center text-[12px] text-app-muted py-8">(aucune cellule posée)</div>}
                  </div>
                  <div className="text-[11px] text-app-muted mb-1">Solution</div>
                  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', padding: '10px 6px 6px', border: '2px solid #22C55E' }}>
                    <RythmStaff figures={pattern.figs} timeSig={pattern.timeSig} activeIdx={-1} showClef={false} />
                  </div>
                </>
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
