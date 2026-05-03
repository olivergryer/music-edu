import { useRef, useEffect, useCallback } from 'react'

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
  // bleu (220°) → orange (30°) selon amplitude normalisée 0→1
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

  const bins = freqData.length
  const nyquist = sampleRate / 2

  // ─── Barres spectrales ───────────────────────────────────────────────────────
  const barW = Math.max(1, W / bins)
  for (let k = 0; k < bins; k++) {
    const hz = (k / bins) * nyquist
    if (hz < HZ_MIN_DISPLAY || hz > HZ_MAX_DISPLAY) continue
    const x = hzToX(hz, W)

    let norm
    if (isBytes) {
      norm = freqData[k] / 255
    } else {
      norm = Math.max(0, Math.min(1, (freqData[k] - DB_FLOOR) / (DB_CEIL - DB_FLOOR)))
    }
    if (norm < 0.01) continue

    const barH = norm * H
    ctx.fillStyle = ampColor(norm)
    ctx.fillRect(x, H - barH, barW + 0.5, barH)
  }

  // ─── Axe X : labels fréquences ───────────────────────────────────────────────
  const freqLabels = [100, 200, 500, 1000, 2000, 4000]
  ctx.fillStyle = COL_MUTED2
  ctx.font = '9px Inter, sans-serif'
  ctx.textAlign = 'center'
  freqLabels.forEach(f => {
    const x = hzToX(f, W)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(x, 0, 1, H)
    ctx.fillStyle = COL_MUTED2
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 3)
  })

  // ─── Marqueurs harmoniques ───────────────────────────────────────────────────
  if (fundamentalHz && fundamentalHz > 0) {
    for (let n = 1; n <= 10; n++) {
      const fHarm = fundamentalHz * n
      if (fHarm < HZ_MIN_DISPLAY || fHarm > HZ_MAX_DISPLAY) continue
      const x = hzToX(fHarm, W)
      ctx.strokeStyle = n === 1 ? COL_ACCENT : '#a78bfa'
      ctx.globalAlpha = n === 1 ? 0.9 : 0.55
      ctx.setLineDash([3, 3])
      ctx.lineWidth = n === 1 ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H - 14)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.fillStyle = n === 1 ? COL_ACCENT : '#a78bfa'
      ctx.font = `bold 9px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`f${n}`, x, 10)
    }
  }
}

export default function SpectrePaneau({ mode, spectreAnalyserRef, spectreData, sampleRate, fundamentalHz, onClose }) {
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const hzRef      = useRef(fundamentalHz)

  useEffect(() => { hzRef.current = fundamentalHz }, [fundamentalHz])

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

  // ─── Mode static : render unique ─────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'static' || !spectreData || !canvasRef.current) return
    const sr = sampleRate || 44100
    renderSpectreCanvas(canvasRef.current, spectreData, sr, fundamentalHz, false)
  }, [mode, spectreData, sampleRate, fundamentalHz])

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 540
  const panelW = isMobile ? window.innerWidth : 320
  const canvasW = panelW - 32

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100vh',
      width: panelW, background: COL_BG,
      borderLeft: `1px solid ${COL_BORDER}`,
      zIndex: 100, display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
    }}>
      {/* En-tête */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 12px', borderBottom: `1px solid ${COL_BORDER}`,
      }}>
        <span style={{ color: COL_TEXT, fontWeight: 700, fontSize: 14 }}>◈ Spectre harmonique</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: COL_MUTED2,
          fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4,
        }}>✕</button>
      </div>

      {/* Canvas */}
      <div style={{ padding: '16px 16px 8px' }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={220}
          style={{ display: 'block', borderRadius: 8, border: `1px solid ${COL_BORDER}` }}
        />
      </div>

      {/* Légende */}
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 80, height: 8, borderRadius: 4,
            background: 'linear-gradient(to right, hsl(220,90%,55%), hsl(30,90%,55%))',
          }} />
          <span style={{ color: COL_MUTED2, fontSize: 11 }}>faible → fort</span>
        </div>
        {fundamentalHz && fundamentalHz > 0 && (
          <div style={{ color: COL_MUTED2, fontSize: 11 }}>
            <span style={{ color: COL_ACCENT }}>f1</span> = {Math.round(fundamentalHz)} Hz
            &nbsp;·&nbsp; f2…f10 harmoniques
          </div>
        )}
        <div style={{ color: COL_MUTED2, fontSize: 11 }}>
          {mode === 'live' ? '● temps réel' : '◼ spectre moyen enregistrement'}
        </div>
      </div>
    </div>
  )
}
