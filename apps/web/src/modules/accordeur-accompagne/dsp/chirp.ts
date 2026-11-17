// ─── Chirp d'alignement et mesure de latence de boucle (spec §6.2, §7.3) ──────
// Chirp linéaire 1→4 kHz, 50 ms. Retrouvé dans le micro par corrélation croisée.

export function genererChirp(fs: number, dureeS = 0.05, f0 = 1000, f1 = 4000, niveau = 0.5): Float32Array {
  const n = Math.round(dureeS * fs)
  const out = new Float32Array(n)
  const k = (f1 - f0) / dureeS
  for (let i = 0; i < n; i++) {
    const t = i / fs
    const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))   // Hann : pas de clic
    out[i] = niveau * env * Math.sin(2 * Math.PI * (f0 * t + 0.5 * k * t * t))
  }
  return out
}

/**
 * Position (en échantillons) du chirp dans `micro`, par corrélation croisée normalisée.
 * Cherche dans [0, maxS] secondes. Retourne aussi la qualité (pic / médiane des pics).
 */
export function trouverChirp(micro: Float32Array, fs: number, maxS = 5, dureeS = 0.05, depuisS = 0): { indice: number; qualite: number } {
  const ref = genererChirp(fs, dureeS)
  const n = ref.length
  const fin = Math.min(micro.length - n, Math.round(maxS * fs))
  const nrmRef = Math.sqrt(ref.reduce((s, v) => s + v * v, 0))
  let meilleur = 0, indice = 0, somme = 0, compte = 0
  // énergie glissante
  const debut = Math.max(0, Math.round(depuisS * fs))
  let e = 0
  for (let i = 0; i < n; i++) e += micro[debut + i] * micro[debut + i]
  for (let d = debut; d <= fin; d++) {
    if (d > debut) { e += micro[d + n - 1] ** 2 - micro[d - 1] ** 2 }
    let c = 0
    for (let i = 0; i < n; i++) c += micro[d + i] * ref[i]
    const v = Math.abs(c) / (nrmRef * Math.sqrt(Math.max(e, 1e-20)))
    somme += v; compte++
    if (v > meilleur) { meilleur = v; indice = d }
  }
  return { indice, qualite: meilleur / Math.max(somme / Math.max(compte, 1), 1e-12) }
}
