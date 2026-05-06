import { useState, useRef, useEffect } from 'react'
import { hzToMidi, midiToNoteName } from './accordeurUtils'

const COL_BG      = '#0a0f1a'
const COL_BORDER  = '#1f2937'
const COL_TEXT    = '#f9fafb'
const COL_MUTED2  = '#6b7280'
const COL_ACCENT  = '#c084fc'

const HZ_MIN_DISPLAY = 50
const HZ_MAX_DISPLAY = 4000
const DB_FLOOR       = -90
const DB_CEIL        = 0

function hzToX(hz, width) {
  const logMin = Math.log10(HZ_MIN_DISPLAY)
  const logMax = Math.log10(HZ_MAX_DISPLAY)
  return ((Math.log10(hz) - logMin) / (logMax - logMin)) * width
}

function ampColor(norm) {
  const h = 220 + (30 - 220) * norm
  return `hsl(${h}, 90%, 55%)`
}

function renderSpectreCanvas(canvas, freqData, sampleRate, fundamentalHz, isBytes) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#050d1a'
  ctx.fillRect(0, 0, W, H)

  const bins    = freqData.length
  const nyquist = sampleRate / 2
  const logMin  = Math.log10(HZ_MIN_DISPLAY)
  const logMax  = Math.log10(HZ_MAX_DISPLAY)

  // Iterate pixel columns — accumulate max bin amplitude per column
  for (let px = 0; px < W; px++) {
    const hzLo = Math.pow(10, logMin + (px / W) * (logMax - logMin))
    const hzHi = Math.pow(10, logMin + ((px + 1) / W) * (logMax - logMin))
    const kLo  = Math.max(0, Math.floor((hzLo / nyquist) * bins))
    const kHi  = Math.min(bins - 1, Math.ceil((hzHi / nyquist) * bins))
    let maxRaw = 0
    for (let k = kLo; k <= kHi; k++) maxRaw = Math.max(maxRaw, freqData[k])
    const norm = isBytes
      ? maxRaw / 255
      : Math.max(0, Math.min(1, (maxRaw - DB_FLOOR) / (DB_CEIL - DB_FLOOR)))
    if (norm < 0.01) continue
    ctx.fillStyle = ampColor(norm)
    ctx.fillRect(px, H - norm * H, 1, norm * H)
  }

  // Grille fréquences
  ctx.font = '9px Inter, sans-serif'
  ctx.textAlign = 'center'
  ;[100, 200, 500, 1000, 2000, 4000].forEach(f => {
    const x = hzToX(f, W)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(x, 0, 1, H)
    ctx.fillStyle = COL_MUTED2
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 3)
  })

  // Marqueurs harmoniques
  if (fundamentalHz && fundamentalHz > 0) {
    for (let n = 1; n <= 10; n++) {
      const fHarm = fundamentalHz * n
      if (fHarm < HZ_MIN_DISPLAY || fHarm > HZ_MAX_DISPLAY) continue
      const x = hzToX(fHarm, W)
      ctx.strokeStyle = n === 1 ? COL_ACCENT : '#a78bfa'
      ctx.globalAlpha = n === 1 ? 0.9 : 0.55
      ctx.setLineDash([3, 3])
      ctx.lineWidth   = n === 1 ? 1.5 : 1
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 14); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.fillStyle   = n === 1 ? COL_ACCENT : '#a78bfa'
      ctx.font        = 'bold 9px Inter, sans-serif'
      ctx.textAlign   = 'center'
      ctx.fillText(`f${n}`, x, 10)
    }
  }
}

export default function SpectrePaneau({
  mode,              // 'live' | 'static'
  spectreAnalyserRef,
  spectreParNote,    // Float32Array[] — un par note (static)
  notes,             // objets note avec nom/octave/muCents (static)
  sampleRate,
  fundamentalHz,     // Hz note live courante
  muCents,           // déviation courante (live)
  onClose,
}) {
  const canvasRef    = useRef(null)
  const rafRef       = useRef(null)
  const hzRef        = useRef(fundamentalHz)
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => { hzRef.current = fundamentalHz }, [fundamentalHz])

  // Reset selectedIdx quand les notes changent
  useEffect(() => { setSelectedIdx(0) }, [spectreParNote])

  // ─── Mode live : RAF ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return
    const analyser = spectreAnalyserRef?.current
    if (!analyser) return
    const freqData = new Uint8Array(analyser.frequencyBinCount)
    const sr = sampleRate || 44100
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      if (!canvasRef.current) return
      analyser.getByteFrequencyData(freqData)
      renderSpectreCanvas(canvasRef.current, freqData, sr, hzRef.current, true)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [mode, spectreAnalyserRef, sampleRate])

  // ─── Mode static : render quand note sélectionnée change ─────────────────────
  useEffect(() => {
    if (mode !== 'static') return
    const data = spectreParNote?.[selectedIdx]
    if (!data || !canvasRef.current) return
    const sr = sampleRate || 44100
    const noteHz = notes?.[selectedIdx]
      ? 440 * Math.pow(2, (notes[selectedIdx].midiCible - 69) / 12)
      : null
    renderSpectreCanvas(canvasRef.current, data, sr, noteHz, false)
  }, [mode, spectreParNote, selectedIdx, sampleRate, notes])

  const panelW  = typeof window !== 'undefined' ? Math.min(380, Math.round(window.innerWidth * 0.8)) : 320
  const canvasW = panelW - 32

  // Légende note courante
  const noteLabel = (() => {
    if (mode === 'live' && fundamentalHz && fundamentalHz > 0) {
      const midi = Math.round(hzToMidi(fundamentalHz))
      const { name, octave } = midiToNoteName(midi)
      return { name: `${name}${octave}`, hz: Math.round(fundamentalHz), cents: muCents }
    }
    if (mode === 'static' && notes?.[selectedIdx]) {
      const n = notes[selectedIdx]
      const hz = Math.round(440 * Math.pow(2, (n.midiCible - 69) / 12))
      return { name: `${n.nom}${n.octave}`, hz, cents: n.muCents }
    }
    return null
  })()

  return (
    <div
      className="fixed top-0 right-0 h-screen flex flex-col overflow-y-auto z-[100]"
      style={{ width: panelW, background: COL_BG, borderLeft: `1px solid ${COL_BORDER}`, boxShadow: '-4px 0 24px rgba(0,0,0,0.5)' }}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${COL_BORDER}` }}>
        <span className="text-sm font-bold" style={{ color: COL_TEXT }}>◈ Spectre harmonique</span>
        <button onClick={onClose} className="bg-transparent border-none text-lg cursor-pointer leading-none p-1" style={{ color: COL_MUTED2 }}>✕</button>
      </div>

      {/* Canvas */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={220}
          className="block rounded-lg"
          style={{ border: `1px solid ${COL_BORDER}` }}
        />
      </div>

      {/* Légende note courante */}
      {noteLabel && (
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="flex gap-3 items-center rounded-lg px-3 py-2" style={{ background: '#0d1424', border: `1px solid ${COL_BORDER}` }}>
            <span className="text-lg font-black" style={{ color: COL_ACCENT }}>{noteLabel.name}</span>
            <span className="text-xs" style={{ color: COL_MUTED2 }}>{noteLabel.hz} Hz</span>
            {noteLabel.cents != null && (
              <span className="text-xs font-bold" style={{
                color: Math.abs(noteLabel.cents) <= 10 ? '#34d399' : Math.abs(noteLabel.cents) <= 20 ? '#fbbf24' : '#f87171',
              }}>
                {noteLabel.cents >= 0 ? '+' : ''}{noteLabel.cents.toFixed(1)}¢
              </span>
            )}
            <span className="text-[11px] ml-auto" style={{ color: COL_MUTED2 }}>f1</span>
          </div>
        </div>
      )}

      {/* Liste notes cliquables (mode static) */}
      {mode === 'static' && notes?.length > 0 && (
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="text-[10px] mb-1.5" style={{ color: COL_MUTED2 }}>Note</div>
          <div className="flex flex-wrap gap-1.5">
            {notes.map((note, i) => (
              <button key={i} onClick={() => setSelectedIdx(i)}
                className="px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer"
                style={{
                  border: `1px solid ${i === selectedIdx ? COL_ACCENT : COL_BORDER}`,
                  background: i === selectedIdx ? 'rgba(192,132,252,0.15)' : COL_BG,
                  color: i === selectedIdx ? COL_ACCENT : COL_MUTED2,
                }}
              >
                {note.nom}{note.octave}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gradient légende */}
      <div className="px-4 pb-4 flex-shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 rounded" style={{ background: 'linear-gradient(to right, hsl(220,90%,55%), hsl(30,90%,55%))' }} />
          <span className="text-[11px]" style={{ color: COL_MUTED2 }}>faible → fort</span>
        </div>
        <div className="text-[11px]" style={{ color: COL_MUTED2 }}>
          {mode === 'live' ? '● temps réel' : '◼ spectre moyen par note'}
        </div>
      </div>
    </div>
  )
}
