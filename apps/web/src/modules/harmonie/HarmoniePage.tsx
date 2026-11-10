// ─── Harmonie — choix d'activité ─────────────────────────────────────────────
//
// `/harmonie` menait droit à la détection d'erreur, seule activité du module.
// Elle démarre au niveau 3 : les niveaux 0 à 2 n'avaient donc aucune porte
// d'entrée. Cet écran ouvre le module par le bas du barème.
//
// Chaque activité reste une PAGE à part entière, avec sa route et son en-tête —
// pas un composant monté ici. Deux en-têtes empilés sinon, et `DetectionPage`
// n'aurait pas pu rester intacte.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'
import { NIVEAUX_BINAIRE } from './binaire.ts'
import { NIVEAU_MAX_DETECTION, NIVEAU_MIN_DETECTION } from './detection.ts'
import { NIVEAU_DICTEE } from './dictee.ts'
import { NIVEAU_CADENCES } from './cadences.ts'
import { NIVEAU_MAX_FLUX, NIVEAU_MIN_FLUX } from './flux.ts'
import {
  ETAPES,
  alternatives,
  avancementEtape,
  exerciceConseille,
  lienJalon,
  statutsEtapes,
  type CarteLevels,
  type Etape,
  type Jalon,
} from './parcours.ts'

const ACCENT = '#c084fc'

interface Activite {
  route: string
  titre: string
  sousTitre: string
  niveau: string
  disponible: boolean
}

const ACTIVITES: Activite[] = [
  {
    route: '/harmonie/basse',
    titre: 'Dictée de basse',
    sousTitre:
      'Note la basse de chaque accord. C’est le prérequis de tout le reste : qui n’entend pas la basse ne peut rien chiffrer.',
    niveau: `Niveau ${NIVEAU_DICTEE}`,
    disponible: true,
  },
  {
    route: '/harmonie/binaire',
    titre: 'Choix binaire',
    sousTitre:
      'Une question, deux réponses, sur un seul accord de la suite : sa fonction, sa basse ou sa septième — selon le niveau.',
    niveau: `Niveaux ${NIVEAUX_BINAIRE.join(', ')}`,
    disponible: true,
  },
  {
    route: '/harmonie/cadences',
    titre: 'Cadences',
    sousTitre:
      'Nomme la cadence entendue — et, au palier suivant, l’accord chromatique qui l’approche : napolitaine ou sixte augmentée.',
    niveau: `Niveau ${NIVEAU_CADENCES} et plus`,
    disponible: true,
  },
  {
    route: '/harmonie/detection',
    titre: 'Détection d’erreur',
    sousTitre:
      'Lis une suite d’accords, écoute-la, et repère celui qui ne correspond pas à ce qui est écrit.',
    niveau: `Niveaux ${NIVEAU_MIN_DETECTION} à ${NIVEAU_MAX_DETECTION}`,
    disponible: true,
  },
  {
    route: '/harmonie/flux',
    titre: 'Chiffrage en flux',
    sousTitre:
      'Nomme le degré et l’état de chaque accord de la suite. C’est l’aboutissement du module — et la seule activité qui mesure les quatre canaux de l’erreur.',
    niveau: `Niveaux ${NIVEAU_MIN_FLUX} à ${NIVEAU_MAX_FLUX}`,
    disponible: true,
  },
  {
    route: '/harmonie/intervalles',
    titre: 'Intervalles',
    sousTitre: 'Reconnais l’intervalle entendu, arpégé ou plaqué.',
    niveau: 'Hors barème',
    disponible: true,
  },
]

// ─── Deux entrées, une seule progression ─────────────────────────────────────
//
// « Parcours guidé » (4 étapes) et « Mode libre » (la liste d'activités d'avant)
// COHABITENT : mêmes routes, mêmes pages, mêmes clés `levels`. Le choix est une
// préférence d'AFFICHAGE, par appareil — pas de la progression — donc
// localStorage et non `payload` (le hook partagé n'écrit `payload` qu'en fin de
// session). Défaut : mode libre, pour que ceux qui aiment l'ancien écran ne
// voient aucun changement.

type Vue = 'libre' | 'parcours'
const CLE_VUE = 'harmonie-vue-v1'

function lireVue(): Vue {
  try {
    return localStorage.getItem(CLE_VUE) === 'parcours' ? 'parcours' : 'libre'
  } catch {
    return 'libre'
  }
}

function ecrireVue(v: Vue) {
  try {
    localStorage.setItem(CLE_VUE, v)
  } catch {
    /* navigation privée : le choix vaut pour la session seulement */
  }
}

export default function HarmoniePage() {
  const navigate = useNavigate()
  const [vue, setVue] = useState<Vue>(lireVue)
  const mp = useModuleProgress('harmonie')

  const choisir = (v: Vue) => {
    setVue(v)
    ecrireVue(v)
  }

  return (
    <div
      className="bg-app min-h-dvh flex flex-col"
      style={{ maxWidth: 540, margin: '0 auto', width: '100%' }}
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate('/')}
          aria-label="Retour à l’accueil"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-c)',
            borderRadius: 10,
            width: 40,
            height: 40,
            color: 'var(--text)',
          }}
        >
          ←
        </button>
        <h1
          style={{
            fontFamily: "'Righteous', sans-serif",
            fontSize: 22,
            color: 'var(--text)',
            margin: 0,
            flex: 1,
          }}
        >
          Harmonie
        </h1>
        <ThemeToggleInline />
      </header>

      <main className="px-4 pb-8 flex flex-col gap-3">
        <ChoixVue vue={vue} onChoisir={choisir} />

        {vue === 'parcours' ? (
          <Parcours levels={mp.progress.levels as CarteLevels} />
        ) : (
          <>
            <p className="text-app-muted" style={{ fontSize: 14, margin: '0 0 4px', lineHeight: 1.5 }}>
              Choisis une activité.
            </p>

            {ACTIVITES.map((a) =>
              a.disponible ? (
                <Link key={a.route} to={a.route} className="no-underline">
                  <CarteActivite activite={a} />
                </Link>
              ) : (
                <CarteActivite key={a.route} activite={a} />
              ),
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ChoixVue({ vue, onChoisir }: { vue: Vue; onChoisir: (v: Vue) => void }) {
  const options: { id: Vue; libelle: string }[] = [
    { id: 'parcours', libelle: 'Parcours guidé' },
    { id: 'libre', libelle: 'Mode libre' },
  ]
  return (
    <div
      role="group"
      aria-label="Façon de travailler"
      className="flex"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-c)',
        borderRadius: 12,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const actif = vue === o.id
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={actif}
            onClick={() => onChoisir(o.id)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 9,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              background: actif ? ACCENT : 'transparent',
              color: actif ? '#030712' : 'var(--text-muted)',
            }}
          >
            {o.libelle}
          </button>
        )
      })}
    </div>
  )
}

// ─── Le parcours guidé ───────────────────────────────────────────────────────

/** Libellé d'un exercice DANS le parcours : la question travaillée, pas un numéro. */
const LIBELLES_JALONS: Record<string, string> = {
  'basse:1': 'Dictée de basse',
  'binaire:2': 'Dominante ou sous-dominante',
  'cadences:3': 'Reconnaître les cadences',
  'binaire:4': 'Fondamental ou renversé',
  'binaire:5': 'Avec ou sans septième',
  'detection:4': 'Détection d’erreur · renversements',
  'detection:5': 'Détection d’erreur · septièmes',
  'flux:6': 'Chiffrage en flux · bases',
  'flux:7': 'Chiffrage en flux · 6/4 et III',
  'detection:6': 'Détection d’erreur · chiffrage complet',
  'detection:7': 'Détection d’erreur · 6/4 et III',
}

function libelleJalon(j: Jalon): string {
  return LIBELLES_JALONS[`${j.activite}:${j.niveau}`] ?? j.activite
}

function Parcours({ levels }: { levels: CarteLevels }) {
  const statuts = statutsEtapes(levels)

  return (
    <>
      <p className="text-app-muted" style={{ fontSize: 14, margin: '0 0 4px', lineHeight: 1.5 }}>
        Quatre étapes, de la basse au chiffrage complet. Rien n’est verrouillé : tu peux
        aller où tu veux.
      </p>
      {ETAPES.map((e) => (
        <CarteEtape key={e.numero} etape={e} statut={statuts[e.numero]} levels={levels} />
      ))}
    </>
  )
}

function CarteEtape({
  etape,
  statut,
  levels,
}: {
  etape: Etape
  statut: 'terminee' | 'courante' | 'a_venir'
  levels: CarteLevels
}) {
  const courante = statut === 'courante'
  const propose = exerciceConseille(levels, etape)
  const autres = alternatives(levels, etape)
  const avancement = avancementEtape(levels, etape)

  return (
    <section
      aria-label={`Étape ${etape.numero} : ${etape.titre}`}
      className="bg-surface"
      style={{
        borderWidth: courante ? 2 : 1,
        borderStyle: 'solid',
        borderColor: courante ? ACCENT : 'var(--border-c)',
        borderRadius: 14,
        padding: 16,
        opacity: statut === 'a_venir' ? 0.8 : 1,
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <PastilleEtape numero={etape.numero} terminee={statut === 'terminee'} courante={courante} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{etape.titre}</div>
          <div className="text-app-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
            {etape.question}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{ height: 4, borderRadius: 2, background: 'var(--border-c)', margin: '12px 0' }}
      >
        <div
          style={{
            width: `${Math.round(avancement * 100)}%`,
            height: '100%',
            borderRadius: 2,
            background: '#34d399',
          }}
        />
      </div>

      <Link
        to={lienJalon(propose, etape.numero)}
        className="no-underline flex items-center justify-between"
        style={{
          minHeight: 44,
          padding: '0 14px',
          borderRadius: 10,
          background: courante ? ACCENT : 'transparent',
          border: courante ? 'none' : '1px solid var(--border-c)',
          color: courante ? '#030712' : 'var(--text)',
          fontSize: 14,
          fontWeight: 600,
          gap: 8,
        }}
      >
        <span>{courante ? 'Continuer' : statut === 'terminee' ? 'Rejouer' : 'Commencer'}</span>
        <span style={{ fontWeight: 400, fontSize: 13, textAlign: 'right' }}>{libelleJalon(propose)}</span>
      </Link>

      {autres.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
          {autres.map((j) => (
            <Link
              key={`${j.activite}:${j.niveau}`}
              to={lienJalon(j, etape.numero)}
              className="no-underline text-app-muted"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 999,
                border: '1px solid var(--border-c)',
                fontSize: 12,
              }}
            >
              {libelleJalon(j)}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function PastilleEtape({
  numero,
  terminee,
  courante,
}: {
  numero: number
  terminee: boolean
  courante: boolean
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        fontWeight: 700,
        background: terminee ? '#34d399' : courante ? ACCENT : 'transparent',
        border: terminee || courante ? 'none' : '1px solid var(--border-c)',
        color: terminee || courante ? '#030712' : 'var(--text-muted)',
      }}
    >
      {terminee ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        numero
      )}
    </span>
  )
}

function CarteActivite({ activite }: { activite: Activite }) {
  const { titre, sousTitre, niveau, disponible } = activite

  return (
    <div
      className="bg-surface border-app"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 14,
        padding: '16px 16px',
        minHeight: 88,
        opacity: disponible ? 1 : 0.5,
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{titre}</span>
        <span
          className="text-app-muted"
          style={{
            fontSize: 11,
            border: '1px solid var(--border-c)',
            borderRadius: 999,
            padding: '3px 9px',
            whiteSpace: 'nowrap',
            color: disponible ? ACCENT : 'var(--text-muted)',
          }}
        >
          {disponible ? niveau : 'Bientôt'}
        </span>
      </div>
      <p className="text-app-muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
        {sousTitre}
      </p>
    </div>
  )
}
