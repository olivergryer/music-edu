// ─── Tri des listes de comptes — interface ───────────────────────────────────
//
// Partagé par « Mes élèves » et par le panneau d'administration. Les deux listes
// ne servent pas à la même chose — suivre une classe d'un côté, surveiller les
// inscriptions de l'autre — donc chacune mémorise son propre réglage.
// La logique de comparaison vit dans `triLogique.ts` (testée).

import { useState, useEffect, useRef } from 'react'
import { CRITERES, type CritereTri } from './triLogique'

export { CRITERES, trier, type CritereTri } from './triLogique'

// ─── Mémorisation ────────────────────────────────────────────────────────────

interface EtatTri { critere: CritereTri; descendant: boolean }

const DEFAUT: EtatTri = { critere: 'activite', descendant: true }

/**
 * Réglage de tri conservé dans le navigateur, par liste.
 * Toute lecture de localStorage peut échouer (navigation privée, stockage
 * saturé) : on retombe silencieusement sur le tri par défaut.
 */
export function useTriMemorise(cle: string): [EtatTri, (e: EtatTri) => void] {
  const [etat, setEtat] = useState<EtatTri>(() => {
    try {
      const brut = localStorage.getItem(`tri-${cle}`)
      if (!brut) return DEFAUT
      const lu = JSON.parse(brut) as EtatTri
      return CRITERES.some(c => c.id === lu.critere) ? lu : DEFAUT
    } catch { return DEFAUT }
  })

  useEffect(() => {
    try { localStorage.setItem(`tri-${cle}`, JSON.stringify(etat)) } catch { /* ignore */ }
  }, [cle, etat])

  return [etat, setEtat]
}

// ─── Icône ───────────────────────────────────────────────────────────────────

/** Trois traits de longueurs croissantes dans un cercle. */
export function IconeTri({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" />
      {/* Traits alignés à gauche comme dans un tableur, mais calés pour que le
          plus long soit centré dans le cercle — sinon le groupe penche à gauche. */}
      <path d="M8 8.8h4M8 12h6M8 15.2h8" />
    </svg>
  )
}

// ─── Sélecteur ───────────────────────────────────────────────────────────────

export function SelecteurTri({ etat, onChange }: { etat: EtatTri; onChange: (e: EtatTri) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const conteneur = useRef<HTMLDivElement>(null)

  // Fermeture au clic extérieur : sans ça, le menu resterait ouvert derrière la
  // liste et masquerait les premières cartes.
  useEffect(() => {
    if (!ouvert) return
    function auClic(e: MouseEvent) {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    return () => document.removeEventListener('mousedown', auClic)
  }, [ouvert])

  const actif = CRITERES.find(c => c.id === etat.critere) ?? CRITERES[0]

  function choisir(id: CritereTri) {
    // Re-cliquer sur le critère déjà actif inverse le sens — c'est le geste
    // attendu d'un en-tête de tri, et ça évite un second contrôle.
    if (id === etat.critere) onChange({ critere: id, descendant: !etat.descendant })
    else onChange({ critere: id, descendant: true })
    setOuvert(false)
  }

  return (
    <div className="relative" ref={conteneur}>
      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        className="flex items-center gap-1.5 border border-app rounded-lg px-2.5 bg-surface text-app-muted hover:text-app hover:bg-surface-2 transition-colors"
        style={{ minHeight: 34 }}
        aria-expanded={ouvert}
        aria-label={`Trier — actuellement : ${actif.label}`}
        title={`Trier — actuellement : ${actif.label}`}
      >
        <IconeTri />
        <span className="text-[11px] font-bold whitespace-nowrap">
          {actif.label} {etat.descendant ? '↓' : '↑'}
        </span>
      </button>

      {ouvert && (
        <div className="absolute right-0 z-20 mt-1.5 bg-surface border border-app rounded-xl shadow-sm overflow-hidden"
             style={{ minWidth: 210 }}>
          {CRITERES.map(c => {
            const estActif = c.id === etat.critere
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => choisir(c.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-transparent border-none cursor-pointer hover:bg-surface-2 transition-colors"
                style={{ minHeight: 40 }}
              >
                <span className="text-xs flex-1" style={{ color: estActif ? '#FF8B3D' : 'var(--text)' }}>
                  {c.label}
                </span>
                <span className="text-[10px] text-app-muted">
                  {estActif
                    ? `${etat.descendant ? '↓' : '↑'} ${c.sensLabel[etat.descendant ? 0 : 1]}`
                    : ''}
                </span>
              </button>
            )
          })}
          <div className="px-3 py-2 text-[10px] text-app-muted" style={{ borderTop: '1px solid var(--border-c)' }}>
            Re-cliquer sur le critère actif inverse l’ordre.
          </div>
        </div>
      )}
    </div>
  )
}
