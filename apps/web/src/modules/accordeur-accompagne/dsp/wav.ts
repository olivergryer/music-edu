// ─── Lecture / écriture WAV mono (spec §5 : micro.wav, sortie.wav) ────────────
// Lit PCM 16/24/32 bits et flottant 32 bits, mélange en mono. Écrit en flottant 32 bits.

export type Wav = { sampleRate: number; donnees: Float32Array }

export function lireWav(buf: Uint8Array): Wav {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Fichier WAV invalide')
  let fmt = 0, canaux = 1, fs = 44100, bits = 16, offData = -1, tailleData = 0
  for (let o = 12; o + 8 <= buf.byteLength;) {
    const id = tag(o), taille = dv.getUint32(o + 4, true)
    if (id === 'fmt ') {
      fmt = dv.getUint16(o + 8, true); canaux = dv.getUint16(o + 10, true)
      fs = dv.getUint32(o + 12, true); bits = dv.getUint16(o + 22, true)
      if (fmt === 0xfffe) fmt = dv.getUint16(o + 32, true)   // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') { offData = o + 8; tailleData = Math.min(taille, buf.byteLength - offData); break }
    o += 8 + taille + (taille & 1)
  }
  if (offData < 0) throw new Error('Pas de bloc data')
  const octets = bits / 8
  const n = Math.floor(tailleData / (octets * canaux))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < canaux; c++) {
      const o = offData + (i * canaux + c) * octets
      let v: number
      if (fmt === 3 && bits === 32) v = dv.getFloat32(o, true)
      else if (bits === 16) v = dv.getInt16(o, true) / 32768
      else if (bits === 24) v = ((dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16))) / 8388608
      else if (bits === 32) v = dv.getInt32(o, true) / 2147483648
      else throw new Error(`Format WAV non géré (${fmt}/${bits})`)
      s += v
    }
    out[i] = s / canaux
  }
  return { sampleRate: fs, donnees: out }
}

export function ecrireWav(w: Wav): Uint8Array {
  const n = w.donnees.length
  const buf = new Uint8Array(44 + n * 4)
  const dv = new DataView(buf.buffer)
  const ecrire = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  ecrire(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ecrire(8, 'WAVE')
  ecrire(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, w.sampleRate, true); dv.setUint32(28, w.sampleRate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 32, true)
  ecrire(36, 'data'); dv.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) dv.setFloat32(44 + i * 4, w.donnees[i], true)
  return buf
}
