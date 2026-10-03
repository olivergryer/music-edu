// ─── Panneau d'administration — tous les comptes ─────────────────────────────
//
// Rendu sous la liste des élèves rattachés, dans le tableau de bord professeur,
// et seulement pour un UID de `ADMIN_UIDS`. Replié par défaut : c'est un outil
// de supervision, pas l'écran de travail quotidien.
//
// Le masquage côté interface ne protège rien — c'est `firestore.rules` qui
// décide de ce que le serveur renvoie. Un non-admin qui forcerait le rendu de ce
// composant obtiendrait une erreur de permission, pas des données.

import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { estCompteTest } from '../lib/admin'
import { getRank, rankLabel } from '../hooks/useProgressFirebase'

interface Compte {
  uid: string
  displayName: string
  role: string
  teacherCode: string | null
  /** Date de création, absente tant que `scripts/backfill-created-at.ts` n'a pas tourné. */
  creeLe: Date | null
  xp: number
  /** Dernier jour d'activité (streak.lastDate), au format AAAA-MM-JJ. */
  derniereActivite: string | null
  /** Élève : codes des professeurs rejoints. */
  profCodes: string[]
  /** Prof : nombre d'élèves rattachés, calculé sur l'ensemble des comptes. */
  nbEleves: number
  estTest: boolean
}

/** Firestore renvoie un Timestamp ; les documents non rattrapés n'ont rien. */
function versDate(valeur: unknown): Date | null {
  if (valeur && typeof (valeur as { toDate?: () => Date }).toDate === 'function') {
    return (valeur as { toDate: () => Date }).toDate()
  }
  return null
}

function formaterDate(d: Date | null): string {
  return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

export default function AdminComptes({ uidProf }: { uidProf: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [comptes, setComptes] = useState<Compte[] | null>(null)
  const [erreur, setErreur] = useState('')
  const [afficherTests, setAfficherTests] = useState(false)

  // Chargement différé : rien n'est lu tant que le panneau n'est pas déplié.
  // Une trentaine de comptes, c'est une soixantaine de lectures Firestore — à ne
  // pas dépenser à chaque ouverture du tableau de bord.
  useEffect(() => {
    if (!ouvert || comptes !== null) return

    async function charger() {
      try {
        const snap = await getDocs(collection(db, 'users'))

        // Nombre d'élèves par prof, calculé sur la liste complète : évite une
        // requête supplémentaire par professeur.
        const elevesParProf = new Map<string, number>()
        snap.docs.forEach(d => {
          const profIds = (d.data().profIds as string[] | undefined) ?? []
          profIds.forEach(id => elevesParProf.set(id, (elevesParProf.get(id) ?? 0) + 1))
        })

        const lignes = await Promise.all(snap.docs.map(async d => {
          const data = d.data()
          const progSnap = await getDoc(doc(db, 'users', d.id, 'progress', 'data'))
          const prog = progSnap.exists() ? progSnap.data() : null
          return {
            uid: d.id,
            displayName: (data.displayName as string) ?? '—',
            role: (data.role as string) ?? '—',
            teacherCode: (data.teacherCode as string | null) ?? null,
            creeLe: versDate(data.createdAt),
            xp: (prog?.xp as number) ?? 0,
            derniereActivite: (prog?.streak?.lastDate as string | null) ?? null,
            profCodes: (data.profCodes as string[] | undefined) ?? [],
            nbEleves: elevesParProf.get(d.id) ?? 0,
            estTest: estCompteTest(d.id),
          } satisfies Compte
        }))

        // Les plus récents d'abord : c'est l'ordre utile pour surveiller les
        // inscriptions. Les comptes sans date remontent en fin de liste.
        lignes.sort((a, b) => (b.creeLe?.getTime() ?? 0) - (a.creeLe?.getTime() ?? 0))
        setComptes(lignes)
      } catch (e) {
        setErreur(
          (e as { code?: string }).code === 'permission-denied'
            ? 'Accès refusé par les règles Firestore. Les règles admin ne sont peut-être pas déployées.'
            : 'Chargement impossible.',
        )
      }
    }
    charger()
  }, [ouvert, comptes])

  const visibles = (comptes ?? []).filter(c => afficherTests || !c.estTest)
  const nbTests = (comptes ?? []).filter(c => c.estTest).length
  const nbReels = (comptes ?? []).length - nbTests

  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        className="w-full flex items-center gap-2.5 bg-surface border border-app rounded-2xl px-5 py-4 text-left cursor-pointer hover:bg-surface-2 transition-colors"
        style={{ minHeight: 44 }}
        aria-expanded={ouvert}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             className="text-app-muted shrink-0"
             style={{ transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}
             aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-base font-bold text-app flex-1">Tous les comptes</span>
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md"
              style={{ color: '#FF8B3D', background: '#FF8B3D1a' }}>
          Admin
        </span>
        {comptes && <span className="text-xs text-app-muted">{nbReels}</span>}
      </button>

      {ouvert && (
        <div className="mt-3">
          {erreur && (
            <p className="text-sm text-center py-4" style={{ color: '#f87171' }}>{erreur}</p>
          )}

          {!erreur && comptes === null && (
            <p className="text-app-muted text-center py-4 text-sm">Chargement…</p>
          )}

          {comptes !== null && !erreur && (
            <>
              {nbTests > 0 && (
                <label className="flex items-center gap-2 text-xs text-app-muted mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={afficherTests}
                    onChange={e => setAfficherTests(e.target.checked)}
                    style={{ accentColor: '#FF8B3D', width: 15, height: 15 }}
                  />
                  Afficher les {nbTests} comptes du protocole de test
                </label>
              )}

              {visibles.map(c => (
                <div key={c.uid}
                     className="bg-surface border border-app rounded-2xl px-4 py-3 mb-2"
                     style={c.estTest ? { opacity: 0.55 } : undefined}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-sm font-bold text-app">{c.displayName}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={c.role === 'prof'
                            ? { color: '#FF8B3D', background: '#FF8B3D1a' }
                            : { color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                      {c.role}
                    </span>
                    {c.teacherCode && (
                      <span className="text-[11px] font-black tracking-widest" style={{ color: '#FF8B3D' }}>
                        {c.teacherCode}
                      </span>
                    )}
                    {c.estTest && <span className="text-[10px] text-app-muted">test</span>}
                    <span className="text-xs text-app-muted ml-auto">{c.xp} XP</span>
                  </div>

                  <div className="flex gap-x-4 gap-y-1 flex-wrap text-[11px] text-app-muted">
                    <span>Créé le {formaterDate(c.creeLe)}</span>
                    <span>Dernière activité : {c.derniereActivite ?? 'jamais'}</span>
                    {c.role === 'prof'
                      ? <span>{c.nbEleves} élève{c.nbEleves > 1 ? 's' : ''}</span>
                      : c.profCodes.length > 0
                        ? <span>Rattaché à {c.profCodes.join(', ')}</span>
                        : <span>Aucun professeur</span>}
                    {c.xp > 0 && <span>{rankLabel(getRank(c.xp))}</span>}
                  </div>

                  <div className="text-[10px] text-app-muted opacity-50 mt-1 break-all">
                    {c.uid}{c.uid === uidProf ? ' — vous' : ''}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  )
}
