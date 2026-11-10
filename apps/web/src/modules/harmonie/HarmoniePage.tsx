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
  avancementEtape,
  etapeCourante,
  etapeTerminee,
  exerciceConseille,
  jalonValide,
  lienJalon,
  statutsEtapes,
  type CarteLevels,
  type Etape,
  type Jalon,
  type NumeroEtape,
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
  const courante = etapeCourante(levels)
  // L'étape affichée : celle que l'élève a touchée, sinon la courante (la dernière
  // si le parcours est fini). Pas d'effet de synchronisation : `levels` arrive en
  // différé, et tant que l'élève n'a rien choisi, l'affichage suit la courante.
  const [choix, setChoix] = useState<NumeroEtape | null>(null)
  const numero = choix ?? courante?.numero ?? ETAPES[ETAPES.length - 1].numero
  const etape = ETAPES.find((e) => e.numero === numero) ?? ETAPES[0]

  return (
    <>
      <p className="text-app-muted" style={{ fontSize: 14, margin: '0 0 4px', lineHeight: 1.5 }}>
        Choisis une étape, puis un exercice. Rien n’est verrouillé.
      </p>

      <div
        role="group"
        aria-label="Étape"
        className="flex"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-c)',
          borderRadius: 12,
          padding: 4,
          gap: 4,
        }}
      >
        {ETAPES.map((e) => {
          const actif = e.numero === numero
          const statut = statuts[e.numero]
          return (
            <button
              key={e.numero}
              type="button"
              aria-pressed={actif}
              aria-label={`Étape ${e.numero} : ${e.titre}${statut === 'terminee' ? ', terminée' : statut === 'courante' ? ', en cours' : ''}`}
              onClick={() => setChoix(e.numero)}
              className="flex items-center justify-center"
              style={{
                flex: 1,
                minHeight: 44,
                gap: 6,
                borderRadius: 9,
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                background: actif ? ACCENT : 'transparent',
                color: actif ? '#030712' : 'var(--text-muted)',
              }}
            >
              <span aria-hidden="true">{e.numero}</span>
              {statut === 'terminee' && <IconeValide couleur={actif ? '#030712' : '#34d399'} />}
              {statut === 'courante' && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: actif ? '#030712' : ACCENT,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      <DetailEtape etape={etape} courante={statuts[etape.numero] === 'courante'} levels={levels} />
    </>
  )
}

function DetailEtape({
  etape,
  courante,
  levels,
}: {
  etape: Etape
  courante: boolean
  levels: CarteLevels
}) {
  const propose = exerciceConseille(levels, etape)
  const avancement = avancementEtape(levels, etape)
  const termine = etapeTerminee(levels, etape)
  const actionPropose = courante ? 'Continuer' : termine ? 'Rejouer' : 'Commencer'
  const conseilles = etape.jalons.filter((j) => j.conseille)
  const enPlus = etape.jalons.filter((j) => !j.conseille)

  return (
    <section
      aria-label={`Étape ${etape.numero} : ${etape.titre}`}
      className="bg-surface"
      style={{
        border: '1px solid var(--border-c)',
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{etape.titre}</div>
      <div className="text-app-muted" style={{ fontSize: 13, lineHeight: 1.4, marginTop: 2 }}>
        {etape.question}
      </div>

      <div
        aria-hidden="true"
        style={{ height: 4, borderRadius: 2, background: 'var(--border-c)', margin: '12px 0 4px' }}
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

      <GroupeExercices
        titre="Conseillé"
        jalons={conseilles}
        etape={etape}
        propose={propose}
        actionPropose={actionPropose}
        courante={courante}
        levels={levels}
      />
      {enPlus.length > 0 && (
        <GroupeExercices
          titre="En plus"
          jalons={enPlus}
          etape={etape}
          propose={propose}
          actionPropose={actionPropose}
          courante={courante}
          levels={levels}
        />
      )}
    </section>
  )
}

/** Un groupe titré. Le texte des exercices est toujours aligné à gauche : seule la
 *  ligne proposée porte une pastille à droite, les autres un chevron. */
function GroupeExercices({
  titre,
  jalons,
  etape,
  propose,
  actionPropose,
  courante,
  levels,
}: {
  titre: string
  jalons: Jalon[]
  etape: Etape
  propose: Jalon
  actionPropose: string
  courante: boolean
  levels: CarteLevels
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {titre}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {jalons.map((j, i) => {
          const estPropose = j.activite === propose.activite && j.niveau === propose.niveau
          return (
            <li
              key={`${j.activite}:${j.niveau}`}
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-c)' }}
            >
              <Link
                to={lienJalon(j, etape.numero)}
                className="no-underline flex items-center"
                style={{ minHeight: 48, gap: 10, color: 'var(--text)' }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                  {libelleJalon(j)}
                </span>
                {jalonValide(levels, j) && <IconeValide />}
                {estPropose ? (
                  <span
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 36,
                      padding: '0 14px',
                      borderRadius: 999,
                      background: courante ? ACCENT : 'transparent',
                      border: courante ? 'none' : `1px solid ${ACCENT}`,
                      color: courante ? '#030712' : ACCENT,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {actionPropose}
                  </span>
                ) : (
                  <Chevron />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-muted)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function IconeValide({ couleur = '#34d399' }: { couleur?: string }) {
  return (
    <svg
      role="img"
      aria-label="Validé"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
