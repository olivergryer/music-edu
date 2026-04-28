import { useEffect, useRef, useState } from "react";
import { Renderer, Stave, StaveNote, Beam, Voice, Formatter, Dot, Tuplet } from "vexflow";

const DUR_Q = {
  w:4, h:2, hd:3, q:1, qd:1.5,
  "8":0.5, "8d":0.75, "16":0.25,
  wr:4, hr:2, qr:1, "8r":0.5, "16r":0.25,
};

const BEAT_SIZE = { "4/4":1, "3/4":1, "2/4":1, "12/8":1.5, "6/8":1.5, "9/8":1.5 };
const BEAMABLE  = new Set(["8","16"]);

function noteColor(idx, activeIdx, scoreGrades) {
  if (scoreGrades) {
    const g = scoreGrades[idx];
    if (g === "perfect") return "#a78bfa";
    if (g === "good")    return "#34d399";
    if (g === "ok")      return "#fbbf24";
    if (g === "miss")    return "#f87171";
    return "#4b5563";
  }
  if (activeIdx === idx) return "#c084fc";
  return "#4b5563";
}

function makeVexNote(figure, idx, activeIdx, scoreGrades) {
  const isRest = figure.rest || false;
  const color  = noteColor(idx, activeIdx, scoreGrades);
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

// Regroupe les notes ligatables par temps (binaire : 2/temps, ternaire : 3/temps)
function buildBeams(figures, vexNotes, timeSig) {
  const beatSize   = BEAT_SIZE[timeSig] ?? 1;
  const beatGroups = {};
  let pos = 0;

  figures.forEach((fig, i) => {
    const raw    = fig.dur;
    const hasDot = raw.endsWith("d") && !raw.endsWith("rd");
    const base   = hasDot ? raw.slice(0, -1) : raw.replace(/r$/, "");
    const beamable = BEAMABLE.has(base) && !fig.rest;

    const dur = fig.triplet
      ? (DUR_Q[base] ?? 0.5) * (2 / 3)
      : (DUR_Q[raw.replace(/r$/, "")] ?? DUR_Q[base] ?? 1);

    if (beamable) {
      const beat = Math.floor(pos / beatSize + 1e-6);
      if (!beatGroups[beat]) beatGroups[beat] = [];
      beatGroups[beat].push(vexNotes[i]);
    }
    pos += dur;
  });

  const beams = [];
  Object.values(beatGroups).forEach(group => {
    if (group.length >= 2) beams.push(new Beam(group));
  });
  return beams;
}

const DEV_COLORS = { perfect:"#a78bfa", good:"#34d399", ok:"#fbbf24", miss:"#f87171" };

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
    if (!ref.current || !figures?.length || !renderWidth) return;
    ref.current.innerHTML = "";

    try {
      const renderer = new Renderer(ref.current, Renderer.Backends.SVG);
      renderer.resize(renderWidth, height);
      const ctx = renderer.getContext();
      ctx.setFont("Arial", 10);

      const staveY = height < 120 ? 8 : 24;
      const stave  = new Stave(10, staveY, renderWidth - 20);
      if (showClef)    stave.addClef("treble");
      if (showTimeSig) stave.addTimeSignature(timeSig);
      stave.setStyle({ strokeStyle: "#4b5563", fillStyle: "#4b5563" });
      stave.setContext(ctx).draw();

      const vexNotes = figures.map((fig, i) =>
        makeVexNote(fig, i, activeIdx, scoreGrades)
      );

      const [beats, beatVal] = timeSig.split("/").map(Number);
      const voice = new Voice({ num_beats: beats, beat_value: beatVal });
      voice.setMode(Voice.Mode.SOFT);
      voice.addTickables(vexNotes);

      // ── Ligatures créées AVANT le draw pour supprimer les drapeaux de croches ──
      const DECO = "#4b5563";
      const beams = buildBeams(figures, vexNotes, timeSig);

      const noteWidth = stave.getX() + stave.getWidth() - stave.getNoteStartX() - 10;
      new Formatter().joinVoices([voice]).format([voice], noteWidth);
      voice.draw(ctx, stave);

      // ── Dessin des ligatures ──────────────────────────────────────────────────
      beams.forEach(b => {
        ctx.setFillStyle(DECO);
        ctx.setStrokeStyle(DECO);
        b.setContext(ctx).draw();
      });

      // ── Triolets ──────────────────────────────────────────────────────────────
      let i = 0;
      while (i < figures.length) {
        if (figures[i].triplet) {
          const start  = i;
          const tNotes = [];
          while (i < figures.length && figures[i].triplet) {
            tNotes.push(vexNotes[i++]);
          }
          if (tNotes.length >= 2) {
            const base0    = figures[start].dur.replace(/d$/, "").replace(/r$/, "");
            const isBeamed = BEAMABLE.has(base0);
            const tuplet   = new Tuplet(tNotes, {
              num_notes:      tNotes.length,
              notes_occupied: tNotes.length === 3 ? 2 : tNotes.length,
              ratioed:        false,
              bracketed:      !isBeamed,
              beat_value:     parseInt(timeSig.split("/")[1] ?? "4"),
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

        // ── Flèches de décalage temporel ────────────────────────────────────
        if (scoreDevs && sessionBpm) {
          const beatMs = 60000 / sessionBpm;
          vexNotes.forEach((note, i) => {
            const dev   = scoreDevs[i];
            const grade = scoreGrades?.[i];
            if (dev == null || !grade) return;
            const x     = note.getAbsoluteX();
            const pct   = Math.round(Math.abs(dev) / beatMs * 100);
            const capped = Math.min(Math.abs(dev), 420);
            const size  = 9 + Math.round((capped / 420) * 5);
            const arrow = dev < 0 ? "←" : "→";
            const color = DEV_COLORS[grade] ?? "#6b7280";
            const el    = document.createElementNS("http://www.w3.org/2000/svg", "text");
            el.setAttribute("x", x);
            el.setAttribute("y", staveY - 2);
            el.setAttribute("text-anchor", "middle");
            el.setAttribute("font-size", size);
            el.setAttribute("fill", color);
            el.setAttribute("font-family", "Arial");
            el.setAttribute("font-weight", "700");
            el.setAttribute("title", `${dev < 0 ? "Trop tôt" : "Trop tard"} : ${pct}% du temps`);
            el.textContent = arrow;
            svg.appendChild(el);
          });
        }
      }
    } catch (err) {
      console.warn("VexFlow:", err.message ?? err);
    }
  }, [figures, timeSig, activeIdx, scoreGrades, scoreDevs, sessionBpm, renderWidth, height, showClef, showTimeSig]);

  return <div ref={ref} style={{ width:"100%", maxWidth:width, overflow:"hidden" }} />;
}
