import { useEffect, useRef, useState } from "react";
import { Renderer, Stave, StaveNote, Beam, Voice, Formatter, Dot, Tuplet, StaveTie } from "vexflow";

const DUR_Q = {
  w:4, wd:6, h:2, hd:3, q:1, qd:1.5,
  "8":0.5, "8d":0.75, "16":0.25, "16d":0.375, "32":0.125,
  wr:4, hr:2, qr:1, "8r":0.5, "16r":0.25, "32r":0.125,
};

// Beat size = nombre de quarts-de-note par pulsation (pour grouper les ligatures).
// Inclut les métriques mises à l'échelle par l'unité de lecture (blanche / croche).
// NB : les métriques internes générées sont uniquement 4/4 et 12/8 ; 4/2, 4/8, 6/2, 6/8
// n'apparaissent QUE comme sorties mises à l'échelle → leurs pulsations valent le temps
// interne × facteur (croche ternaire 6/8 : croche pointée = 0,75 quart, pas 1,5).
const BEAT_SIZE = {
  "4/4":1, "3/4":1, "2/4":1, "12/8":1.5, "9/8":1.5,
  "4/2":2, "4/8":0.5,     // binaire : blanche 4/2, croche 4/8
  "6/2":3, "6/8":0.75,    // ternaire : blanche 6/2 (blanche pointée), croche 6/8 (croche pointée)
};
const BEAMABLE  = new Set(["8","16","32"]);

// ─── Unité de lecture : transformation AU RENDU uniquement ────────────────────
// Le rythme interne (durées en noires) est inchangé ; on échelonne les durées écrites
// (×2 blanche / ÷2 croche) et la métrique affichée. Le son reste identique.
const READUNIT_TIMESIG = {
  "4/4":  { noire:"4/4",  blanche:"4/2", croche:"4/8" },
  "12/8": { noire:"12/8", blanche:"6/2", croche:"6/8" },
};
// Échelle des valeurs : w · h · q · 8 · 16 · 32
const DUR_UP   = { "16":"8", "8":"q", q:"h", h:"w" };            // blanche (×2, plus long)
const DUR_DOWN = { h:"q", q:"8", "8":"16", "16":"32", w:"h" };   // croche (÷2, plus court)

function scaleTimeSig(timeSig, readUnit) {
  if (readUnit === "noire") return timeSig;
  return READUNIT_TIMESIG[timeSig]?.[readUnit] ?? timeSig;
}

// Transforme un code de durée (ex. "8d", "16r", "qd") en préservant point `d` et silence `r`.
function scaleDur(durCode, readUnit) {
  if (readUnit === "noire") return durCode;
  const rest = durCode.endsWith("r");
  let core = rest ? durCode.slice(0, -1) : durCode;
  const dot = core.endsWith("d");
  const base = dot ? core.slice(0, -1) : core;
  const map = readUnit === "blanche" ? DUR_UP : DUR_DOWN;
  const scaled = map[base];
  if (!scaled) return durCode; // hors échelle → identité (garde-fou)
  return scaled + (dot ? "d" : "") + (rest ? "r" : "");
}

// ─── Liaisons (Phase C) : NOTATION seule ──────────────────────────────────────
// Une note pointée à cheval sur un temps (binaire : qd = 1,5 · hd = 3) peut s'écrire comme
// deux têtes liées : [jusqu'à la frontière de temps] ⌒ [reste]. N'affecte ni l'audio ni le
// scoring (transform au rendu). Durées en quarts → code de figure (valeurs simples uniquement).
const QUARTERS_TO_CODE = { 4:"w", 3:"hd", 2:"h", 1.5:"qd", 1:"q", 0.75:"8d", 0.5:"8", 0.25:"16" };
const codeForQuarters = (qv) => QUARTERS_TO_CODE[qv] ?? null;
const isBinaryTimeSig = (timeSig) => !["12/8", "6/8", "9/8"].includes(timeSig);

// Scinde les notes pointées-à-cheval en paires liées. Retourne les figures rendues, les paires
// d'indices liés, et origIndex[renderedIdx] = index de la figure d'origine (-1 = tête liée-reste).
function splitTiesAcrossBeats(figures, timeSig) {
  const beatSize = BEAT_SIZE[timeSig] ?? 1;
  const outFigs = [];
  const origIndex = [];
  const tiePairs = [];
  let pos = 0;

  figures.forEach((fig, i) => {
    const raw = fig.dur;
    const dur = DUR_Q[raw.replace(/r$/, "")] ?? 1;
    const isDottedCross = !fig.rest && (raw === "qd" || raw === "hd"); // binaire uniquement (voir appelant)
    const nextBoundary = (Math.floor(pos / beatSize + 1e-6) + 1) * beatSize;
    const firstQ = nextBoundary - pos;

    if (isDottedCross && firstQ > 1e-6 && firstQ < dur - 1e-6) {
      const c1 = codeForQuarters(firstQ);
      const c2 = codeForQuarters(dur - firstQ);
      if (c1 && c2) {
        const a = outFigs.length;
        outFigs.push({ ...fig, dur: c1 }); origIndex.push(i);   // tête d'attaque
        const b = outFigs.length;
        outFigs.push({ ...fig, dur: c2 }); origIndex.push(-1);  // tête liée (reste)
        tiePairs.push([a, b]);
        pos += dur;
        return;
      }
    }
    outFigs.push(fig); origIndex.push(i);
    pos += dur;
  });

  return { figs: outFigs, origIndex, tiePairs };
}

// Couleur classique : le grade est porté par les points sous la portée (pas de redondance)
function noteColor() {
  return "#4b5563";
}

function makeVexNote(figure, idx, activeIdx, scoreGrades) {
  const isRest = figure.rest || false;
  const color  = noteColor();
  const raw    = figure.dur;
  const hasDot = raw.endsWith("d") && !raw.endsWith("rd");
  const baseForVex = hasDot ? raw.slice(0, -1) : raw;

  const note = new StaveNote({
    keys:         ["b/4"],
    duration:     baseForVex,
    dots:         hasDot ? 1 : 0,
    align_center: isRest,
  });
  if (hasDot) Dot.buildAndAttach([note]);
  note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

// Ligature les notes ligaturables CONSÉCUTIVES à l'intérieur d'un même temps.
// Brise la ligature sur : (a) une note non-ligaturable (noire, blanche…) — on ne peut pas
// ligaturer par-dessus une noire (syncope croche-noire-croche « 8,q,8 ») ; (b) une note qui
// CHEVAUCHE une frontière de pulsation (syncope, ex. « 16,8,16 » à la croche : la croche
// centrale straddle le temps) → elle n'est pas ligaturée. Les silences sont transparents.
function buildBeams(figures, vexNotes, timeSig) {
  const beatSize = BEAT_SIZE[timeSig] ?? 1;
  const beams = [];
  let run = [];       // suite de notes ligaturables consécutives (même temps)
  let runBeat = -1;
  let pos = 0;
  const flush = () => { if (run.length >= 2) beams.push(new Beam(run)); run = []; };

  figures.forEach((fig, i) => {
    const raw    = fig.dur;
    const hasDot = raw.endsWith("d") && !raw.endsWith("rd");
    const base   = hasDot ? raw.slice(0, -1) : raw.replace(/r$/, "");
    const beamable = BEAMABLE.has(base) && !fig.rest;

    const dur = fig.triplet
      ? (DUR_Q[base] ?? 0.5) * (2 / 3)
      : (DUR_Q[raw.replace(/r$/, "")] ?? DUR_Q[base] ?? 1);

    const startBeat = Math.floor(pos / beatSize + 1e-6);
    const endBeat   = Math.floor((pos + dur - 1e-6) / beatSize);
    const straddles = startBeat !== endBeat; // la note traverse une frontière de temps (syncope)

    if (beamable && !straddles) {
      if (run.length > 0 && startBeat !== runBeat) flush(); // franchit un temps → nouvelle ligature
      if (run.length === 0) runBeat = startBeat;
      run.push(vexNotes[i]);
    } else if (!fig.rest) {
      flush(); // note non-ligaturable OU note syncopée (chevauche un temps) → brise la ligature
    }
    // silences : transparents (pas de flush)
    pos += dur;
  });
  flush();
  return beams;
}

// Points du graphe de décalage : teintes désaturées + halo coloré (rendu moderne, moins plat).
const DOT_FILL = { perfect:"#b3a4e6", good:"#62cda3", ok:"#ecc873", miss:"#ef9a9a" };
const DOT_GLOW = {
  perfect:"rgba(167,139,250,0.55)", good:"rgba(52,211,153,0.5)",
  ok:"rgba(251,191,36,0.5)",       miss:"rgba(248,113,113,0.5)",
};

export default function RythmStaff({
  figures,
  timeSig      = "4/4",
  activeIdx    = -1,
  scoreGrades,
  scoreDevs,
  sessionBpm,
  width        = 480,
  height       = 150,
  showClef     = true,
  showTimeSig  = true,
  compact      = false,
  strikeMeter  = false,
  readUnit     = "noire",
  tieAcrossBeat = false,
}) {
  const ref         = useRef(null);
  const [renderWidth, setRenderWidth] = useState(null);

  // Mesure la largeur réelle du container — s'adapte au viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      if (w > 0) setRenderWidth(Math.min(w, width));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  useEffect(() => {
    if (!ref.current || !figures || !renderWidth) return;
    ref.current.innerHTML = "";

    // ── Liaisons (Phase C) : scinde les pointés-à-cheval AVANT l'échelle (structure interne) ──
    const tie = (tieAcrossBeat && isBinaryTimeSig(timeSig))
      ? splitTiesAcrossBeats(figures, timeSig)
      : { figs: figures, origIndex: figures.map((_, i) => i), tiePairs: [] };
    const { origIndex, tiePairs } = tie;

    // ── Unité de lecture : durées + métrique mises à l'échelle (rendu uniquement) ──
    const figs = tie.figs.map(f => ({ ...f, dur: scaleDur(f.dur, readUnit) }));
    const ts   = scaleTimeSig(timeSig, readUnit);

    try {
      const renderer = new Renderer(ref.current, Renderer.Backends.SVG);
      renderer.resize(renderWidth, height);
      const ctx = renderer.getContext();
      ctx.setFont("Arial", 10);

      const staveY = height >= 150 ? 24 : Math.max(4, Math.round(height / 2 - 60));
      const stave  = new Stave(10, staveY, renderWidth - 20);
      if (showClef)    stave.addClef("treble");
      if (showTimeSig) stave.addTimeSignature(ts);
      stave.setStyle({ strokeStyle: "#4b5563", fillStyle: "#4b5563" });
      stave.setContext(ctx).draw();

      // Trait oblique rouge sur la métrique (act 5 : mesure non conforme → indication fausse)
      if (strikeMeter && showTimeSig) {
        const x1 = stave.getX() + (showClef ? 32 : 6);
        const x2 = Math.max(x1 + 14, stave.getNoteStartX() - 3);
        const yT = stave.getYForLine(0) - 4;
        const yB = stave.getYForLine(4) + 4;
        ctx.save();
        ctx.setLineWidth(3);
        ctx.setStrokeStyle("#f87171");
        ctx.beginPath();
        ctx.moveTo(x1, yB);
        ctx.lineTo(x2, yT);
        ctx.stroke();
        ctx.restore();
      }

      // Portée vide (act 5, départ) : on affiche la métrique seule, pas de voix.
      if (figs.length === 0) return;

      const vexNotes = figs.map((fig, i) =>
        makeVexNote(fig, i, activeIdx, scoreGrades)
      );

      const [beats, beatVal] = ts.split("/").map(Number);
      const voice = new Voice({ num_beats: beats, beat_value: beatVal });
      voice.setMode(Voice.Mode.SOFT);
      voice.addTickables(vexNotes);

      // ── Ligatures créées AVANT le draw pour supprimer les drapeaux de croches ──
      const DECO = "#4b5563";
      const beams = buildBeams(figs, vexNotes, ts);

      const availableWidth = stave.getX() + stave.getWidth() - stave.getNoteStartX() - 10;
      // compact = limite la largeur de formatage pour éviter l'étirement des notes
      const formatWidth = compact
        ? Math.min(availableWidth, figs.length * 55 + 20)
        : availableWidth;

      new Formatter().joinVoices([voice]).format([voice], formatWidth);
      voice.draw(ctx, stave);

      // ── Dessin des ligatures ──────────────────────────────────────────────────
      beams.forEach(b => {
        ctx.setFillStyle(DECO);
        ctx.setStrokeStyle(DECO);
        b.setContext(ctx).draw();
      });

      // ── Liaisons (Phase C) : courbe de tenue entre les têtes scindées ──────────
      tiePairs.forEach(([a, b]) => {
        const t = new StaveTie({
          first_note:  vexNotes[a],
          last_note:   vexNotes[b],
          first_indices: [0],
          last_indices:  [0],
        });
        t.setContext(ctx).draw();
      });

      // ── Triolets ──────────────────────────────────────────────────────────────
      let i = 0;
      while (i < figs.length) {
        if (figs[i].triplet) {
          const start  = i;
          const tNotes = [];
          while (i < figs.length && figs[i].triplet) {
            tNotes.push(vexNotes[i++]);
          }
          if (tNotes.length >= 2) {
            const base0    = figs[start].dur.replace(/d$/, "").replace(/r$/, "");
            const isBeamed = BEAMABLE.has(base0);
            const tuplet   = new Tuplet(tNotes, {
              num_notes:      tNotes.length,
              notes_occupied: tNotes.length === 3 ? 2 : tNotes.length,
              ratioed:        false,
              bracketed:      !isBeamed,
              beat_value:     parseInt(ts.split("/")[1] ?? "4"),
            });
            tuplet.setStyle({ fillStyle: DECO, strokeStyle: DECO });
            tuplet.setContext(ctx).draw();
          }
        } else {
          i++;
        }
      }

      const svg = ref.current.querySelector("svg");
      if (svg) {
        svg.style.background = "transparent";
        svg.querySelectorAll("text").forEach(t => { t.style.fill = "#6b7280"; });

        // ── Bande de décalage par note, sous la portée ───────────────────────
        // Chaque note a son mini-axe tôt(gauche)/tard(droite) centré sous elle,
        // aligné verticalement avec la tête de note → correspondance immédiate.
        if (scoreDevs && sessionBpm) {
          const beatMs  = 60000 / sessionBpm;
          const halfMs  = beatMs * 0.5;
          const bottomY = stave.getYForLine(4);
          const stripY  = bottomY + 22;
          const NS      = "http://www.w3.org/2000/svg";

          const scored = [];
          vexNotes.forEach((note, idx) => {
            const oi = origIndex[idx];            // index de la figure d'origine (-1 = tête liée-reste)
            if (oi < 0 || scoreGrades?.[oi] == null) return; // silences / têtes liées / non scorées
            // Centre de la tête de note (getAbsoluteX vise le bord gauche)
            const xL = note.getNoteHeadBeginX?.() ?? note.getAbsoluteX();
            const xR = note.getNoteHeadEndX?.() ?? (xL + 10);
            scored.push({ x: (xL + xR) / 2, dev: scoreDevs[oi], grade: scoreGrades[oi] });
          });

          if (scored.length > 0) {
            const xs = scored.map(s => s.x).sort((a, b) => a - b);
            let minGap = Infinity;
            for (let k = 1; k < xs.length; k++) minGap = Math.min(minGap, xs[k] - xs[k - 1]);
            const w = scored.length < 2 ? 16 : Math.max(6, Math.min(16, minGap * 0.42));

            const addLine = (x1, y1, x2, y2, stroke, op) => {
              const l = document.createElementNS(NS, "line");
              l.setAttribute("x1", x1); l.setAttribute("y1", y1);
              l.setAttribute("x2", x2); l.setAttribute("y2", y2);
              l.style.stroke = stroke; l.style.strokeWidth = 1; l.style.opacity = op;
              svg.appendChild(l);
            };

            scored.forEach(({ x, dev, grade }) => {
              addLine(x, bottomY + 3, x, stripY - 5, "#9ca3af", 0.40);   // guide note → marqueur
              addLine(x - w, stripY, x + w, stripY, "#9ca3af", 0.50);    // axe tôt/tard
              addLine(x, stripY - 3, x, stripY + 3, "#9ca3af", 0.80);    // repère « pile »
              if (dev != null) {
                const cx  = x + Math.max(-1, Math.min(1, (dev / halfMs) * 2)) * w;
                const dot = document.createElementNS(NS, "circle");
                dot.setAttribute("cx", cx);
                dot.setAttribute("cy", stripY);
                dot.setAttribute("r", "3.6");
                dot.style.fill = DOT_FILL[grade] ?? "#9ca3af";
                dot.style.opacity = "1";
                dot.style.filter = `drop-shadow(0 0 3px ${DOT_GLOW[grade] ?? "rgba(156,163,175,0.5)"})`;
                svg.appendChild(dot);
              }
            });
          }
        }

        // ── Réduction adaptative UNIQUEMENT si la mesure déborde la largeur dispo ──
        // Cas normal (contenu ≤ renderWidth) : on ne touche à rien → taille native.
        // Écran trop étroit + mesure dense : on réduit juste ce qu'il faut (jamais en-dessous).
        try {
          const bb = svg.getBBox();
          const contentW = Math.ceil(bb.x + bb.width + 4);
          if (contentW > renderWidth) {
            svg.setAttribute("viewBox", `0 0 ${contentW} ${height}`);
            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
            svg.setAttribute("width", String(renderWidth));
            svg.setAttribute("height", String(height));
          }
        } catch { /* getBBox indispo : on garde le rendu natif */ }
      }
    } catch (err) {
      console.warn("VexFlow:", err.message ?? err);
    }
  }, [figures, timeSig, activeIdx, scoreGrades, scoreDevs, sessionBpm, renderWidth, height, showClef, showTimeSig, compact, strikeMeter, readUnit, tieAcrossBeat]);

  return <div ref={ref} style={{ width:"100%", maxWidth:width, height:height, overflow:"hidden" }} />;
}
