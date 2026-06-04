import { SHOW_TEST_BADGE } from './featureFlags'

// Filigrane diagonal "MODULE EN PHASE DE TEST" — overlay fixed, ne bloque pas les clics.
export default function TestPhaseWatermark() {
  if (!SHOW_TEST_BADGE) return null
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-28deg)',
          fontSize: 'clamp(36px, 9vw, 80px)',
          fontWeight: 900,
          letterSpacing: 4,
          color: '#FF8B3D',
          opacity: 0.10,
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          fontFamily: "'Righteous','Inter',sans-serif",
        }}
      >
        Module en phase de test
      </div>
    </div>
  )
}
