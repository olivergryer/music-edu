// ─── Harmonie — choix d'activité ─────────────────────────────────────────────
//
// `/harmonie` menait droit à la détection d'erreur, seule activité du module.
// Elle démarre au niveau 3 : les niveaux 0 à 2 n'avaient donc aucune porte
// d'entrée. Cet écran ouvre le module par le bas du barème.
//
// Chaque activité reste une PAGE à part entière, avec sa route et son en-tête —
// pas un composant monté ici. Deux en-têtes empilés sinon, et `DetectionPage`
// n'aurait pas pu rester intacte.

import { Link, useNavigate } from 'react-router-dom'

import { ThemeToggleInline } from '../../ThemeContext'
import { NIVEAUX_BINAIRE } from './binaire.ts'
import { NIVEAU_MAX_DETECTION, NIVEAU_MIN_DETECTION } from './detection.ts'
import { NIVEAU_DICTEE } from './dictee.ts'

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
    route: '/harmonie/detection',
    titre: 'Détection d’erreur',
    sousTitre:
      'Lis une suite d’accords, écoute-la, et repère celui qui ne correspond pas à ce qui est écrit.',
    niveau: `Niveaux ${NIVEAU_MIN_DETECTION} à ${NIVEAU_MAX_DETECTION}`,
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

export default function HarmoniePage() {
  const navigate = useNavigate()

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
      </main>
    </div>
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
