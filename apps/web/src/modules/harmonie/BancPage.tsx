// ─── Banc d'écoute Harmonie — HARNAIS DE DÉVELOPPEMENT ───────────────────────
//
// Route `dev` uniquement (`/harmonie/banc`), aucun lien depuis le Hub, aucune XP,
// aucun Firestore. Sert à trancher à l'oreille ce qui ne se tranche pas sur le
// papier : poids des deux matrices, `POIDS_RENVERSEMENT_V1`, `PROBA_SEPTIEME_V1`,
// et surtout l'échelle de `difficulte` des perturbations (§4).
//
// LE RÉGLAGE DES POIDS SE FAIT DANS LES FICHIERS, pas ici : éditer `matrice.ts`
// puis laisser le HMR de Vite recharger. C'est la boucle « régler et réécouter »
// sans polluer l'API du noyau d'un paramètre de matrice optionnel.
//
// Cette page ne fait que LIRE le noyau. Aucune de ses fonctions n'est modifiée.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { IS_DEV } from '../../isDev'
import { ThemeToggleInline } from '../../ThemeContext'

import {
  INSTRUMENTS_BANC,
  arreter,
  chargerInstrument,
  jouerSuite,
  midiVersNom,
  type NomInstrument,
} from './audio.ts'
import { formatGabarit } from './gabarits.ts'
import { ROMAINS, chiffrer } from './chiffrage.ts'
import ChiffrageEmpile from './ChiffrageEmpile.tsx'
import { genererProgression, longueursDisponibles } from './generateur.ts'
import { NIVEAUX, NIVEAU_MAX_IMPLEMENTE, niveauSpec } from './niveaux.ts'
import { ligneRestreinte } from './matrice.ts'
import { perturbationsPossibles, perturber } from './perturbation.ts'
import { creerAccord, type Accord, type Degre, type Mode, type Progression } from './types.ts'
import { INTRO_DEFAUT, avecIntro, type Intro, type PlanLecture } from './intro.ts'
import { realiserProgression, plageTransposition } from './dispositions.ts'

const ACCENT = '#c084fc'
const TONIQUES = ['do', 'do♯', 'ré', 'mi♭', 'mi', 'fa', 'fa♯', 'sol', 'la♭', 'la', 'si♭', 'si']

export default function BancPage() {
  if (!IS_DEV) return <Navigate to="/" replace />
  return <Banc />
}

function Banc() {
  const [mode, setMode] = useState<Mode>('majeur')
  const [niveau, setNiveau] = useState(6)
  const [longueur, setLongueur] = useState(6)
  const [graine, setGraine] = useState(1)
  const [tonique, setTonique] = useState(0)
  const [transposition, setTransposition] = useState(0)
  const [bpm, setBpm] = useState(66)
  const [instrument, setInstrument] = useState<NomInstrument>('piano')
  const [intro, setIntro] = useState<Intro>(INTRO_DEFAUT)

  const [indexActif, setIndexActif] = useState<number | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const [chargement, setChargement] = useState(false)
  const [erreurAudio, setErreurAudio] = useState<string | null>(null)
  const [gesteRecu, setGesteRecu] = useState(false)
  const [indexDemande, setIndexDemande] = useState(1)

  const finLecture = useRef<ReturnType<typeof setTimeout> | null>(null)

  const spec = niveauSpec(niveau)
  const longueursOk = useMemo(() => longueursDisponibles(spec), [spec])

  // Le niveau change → la longueur courante peut ne plus être produisible.
  useEffect(() => {
    if (!longueursOk.includes(longueur)) setLongueur(longueursOk[0])
  }, [longueursOk, longueur])

  // Le tirage peut légitimement refuser (niveau 5 longueur 5, par exemple) : on
  // retourne l'erreur au lieu de la poser en état pendant le rendu.
  const { progression, refus } = useMemo<{
    progression: Progression | null
    refus: string | null
  }>(() => {
    try {
      const brute = genererProgression(mode, niveau, longueur, graine)
      return { progression: { ...brute, tonique }, refus: null }
    } catch (e) {
      return { progression: null, refus: e instanceof Error ? e.message : String(e) }
    }
  }, [mode, niveau, longueur, graine, tonique])

  const erreur = erreurAudio ?? refus

  const realisation = useMemo(
    () => (progression ? realiserProgression(progression) : []),
    [progression],
  )
  const plage = useMemo(
    () => (progression ? plageTransposition(progression) : ([0, 0] as [number, number])),
    [progression],
  )

  // La plage change avec la progression : ramener la transposition dedans.
  useEffect(() => {
    setTransposition((t) => Math.min(plage[1], Math.max(plage[0], t)))
  }, [plage])

  // Index d'accord effectivement observé : borné à la progression courante, sans
  // état intermédiaire à resynchroniser.
  const indexPerturbe = progression
    ? Math.min(indexDemande, progression.accords.length - 1)
    : 0

  // Politique d'autoplay : tout AudioContext créé hors geste utilisateur reste
  // suspendu, et `Soundfont.instrument` ne résout alors JAMAIS sa promesse — le
  // préchargement au montage laisserait la page sur « chargement… » indéfiniment.
  // On attend donc le premier clic, quel qu'il soit.
  useEffect(() => {
    if (gesteRecu) return
    const activer = () => setGesteRecu(true)
    window.addEventListener('pointerdown', activer, { once: true })
    return () => window.removeEventListener('pointerdown', activer)
  }, [gesteRecu])

  // Précharge l'instrument dès qu'il change, pour que le premier ▶ ne traîne pas.
  useEffect(() => {
    if (!gesteRecu) return
    setChargement(true)
    setErreurAudio(null)
    chargerInstrument(instrument)
      .catch((e) => setErreurAudio(`Chargement du son impossible : ${String(e)}`))
      .finally(() => setChargement(false))
  }, [instrument, gesteRecu])

  useEffect(() => () => arreter(), [])

  const jouer = useCallback(
    async (plan: PlanLecture, options: { suivreIndex?: boolean } = {}) => {
      if (finLecture.current) clearTimeout(finLecture.current)
      setEnLecture(true)
      setIndexActif(null)
      try {
        const duree = await jouerSuite(
          plan.accords.map((a) => a.map((h) => h + transposition)),
          {
            bpm,
            instrument,
            durees: plan.durees,
            tenues: plan.tenues,
            onAccord: options.suivreIndex ? setIndexActif : undefined,
          },
        )
        finLecture.current = setTimeout(() => {
          setEnLecture(false)
          setIndexActif(null)
        }, duree + 200)
      } catch (e) {
        setErreurAudio(`Lecture impossible : ${String(e)}`)
        setEnLecture(false)
      }
    },
    [bpm, instrument, transposition],
  )

  // Contexte tonal : l'accord de tonique sonne avant l'item quand le niveau
  // l'exige (annexe §3 — hors contexte, un accord mineur est indécidable entre i
  // en mineur et VI en majeur). C'est bien le degré I qui sonne, pas le premier
  // accord de la progression : au régime `atome` celle-ci ne commence pas sur I.
  const toniqueRealisee = useMemo<number[] | null>(() => {
    if (!spec.contexteTonal || !progression) return null
    const [accordTonique] = realiserProgression({
      ...progression,
      accords: [creerAccord(0, { degre: 1 })],
    })
    return accordTonique
  }, [spec.contexteTonal, progression])

  // C'est ici que se juge à l'oreille la forme de l'intro — longueur de l'arpège,
  // du silence. Les constantes se règlent dans `intro.ts`, par HMR.
  const planDe = useCallback(
    (accords: number[][]) => avecIntro(accords, toniqueRealisee, intro),
    [toniqueRealisee, intro],
  )

  // `suivreIndex` allume l'accord en cours. L'intro occupe les premiers index
  // quand elle est jouée : on décale pour que la surbrillance retombe sur le bon.
  const decalageContexte = planDe(realisation).decalage

  const jouerProgression = useCallback(() => {
    void jouer(planDe(realisation), { suivreIndex: true })
  }, [jouer, planDe, realisation])

  const jouerPerturbee = useCallback(
    (index: number, substitut: Accord) => {
      if (!progression) return
      const accords = progression.accords.slice()
      accords[index] = substitut
      void jouer(planDe(realiserProgression({ ...progression, accords })))
    },
    [jouer, planDe, progression],
  )

  const perturbations = useMemo(() => {
    if (!progression) return []
    return perturbationsPossibles(progression, indexPerturbe, niveau)
      .map((type) => perturber(progression, indexPerturbe, type))
      .sort((a, b) => a.difficulte - b.difficulte)
  }, [progression, indexPerturbe, niveau])

  const ligne = useMemo(() => {
    if (!progression || indexPerturbe < 1) return null
    const precedent = progression.accords[indexPerturbe - 1].degre
    return { depuis: precedent, poids: ligneRestreinte(mode, precedent, spec.vocabulaire) }
  }, [progression, indexPerturbe, mode, spec.vocabulaire])

  return (
    <div className="bg-app text-app" style={{ minHeight: '100vh', padding: '16px 20px 64px' }}>
      <header className="flex items-center justify-between" style={{ marginBottom: 20 }}>
        <div>
          <h1
            style={{
              fontFamily: "'Righteous', 'Inter', sans-serif",
              fontSize: 26,
              margin: 0,
              color: ACCENT,
            }}
          >
            Banc d’écoute — Harmonie
          </h1>
          <p className="text-app-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Outil de développement. Les poids se règlent dans{' '}
            <code>matrice.ts</code> et <code>generateur.ts</code> — le HMR recharge tout seul.
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 12 }}>
          <ThemeToggleInline />
          <Link to="/" className="text-app-muted" style={{ fontSize: 22, textDecoration: 'none' }}>
            ⌂
          </Link>
        </div>
      </header>

      {erreur && (
        <div
          style={{
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid #f87171',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 14,
            color: '#f87171',
          }}
        >
          {erreur}
        </div>
      )}

      {/* ── Réglages ─────────────────────────────────────────────────────── */}
      <Panneau titre="Réglages">
        <div className="flex flex-wrap" style={{ gap: 18 }}>
          <Champ label="Mode">
            <Segments
              options={[
                { valeur: 'majeur', label: 'Majeur' },
                { valeur: 'mineur', label: 'Mineur' },
              ]}
              actif={mode}
              onChange={(v) => setMode(v as Mode)}
            />
          </Champ>

          <Champ label={`Niveau ${niveau} — ${spec.regime} · ${spec.tache}`}>
            <Segments
              options={NIVEAUX.slice(0, NIVEAU_MAX_IMPLEMENTE + 1).map((s) => ({
                valeur: String(s.niveau),
                label: String(s.niveau),
              }))}
              actif={String(niveau)}
              onChange={(v) => setNiveau(Number(v))}
            />
          </Champ>

          <Champ label="Longueur">
            <Segments
              options={longueursOk.map((l) => ({ valeur: String(l), label: String(l) }))}
              actif={String(longueur)}
              onChange={(v) => setLongueur(Number(v))}
            />
          </Champ>

          <Champ label="Graine">
            <div className="flex items-center" style={{ gap: 6 }}>
              <input
                type="number"
                value={graine}
                onChange={(e) => setGraine(Number(e.target.value))}
                className="bg-surface-2 text-app border-app"
                style={{ width: 88, padding: '6px 8px', borderRadius: 8, borderWidth: 1 }}
              />
              <Bouton onClick={() => setGraine((g) => g + 1)}>+1</Bouton>
              <Bouton onClick={() => setGraine(Math.floor(Math.random() * 100000))}>⤳</Bouton>
            </div>
          </Champ>

          <Champ label={`Tonique — ${TONIQUES[tonique]}`}>
            <input
              type="range"
              min={0}
              max={11}
              value={tonique}
              onChange={(e) => setTonique(Number(e.target.value))}
              style={{ width: 150, accentColor: ACCENT }}
            />
          </Champ>

          <Champ label={`Transposition ${transposition >= 0 ? '+' : ''}${transposition} ½ ton`}>
            <input
              type="range"
              min={plage[0]}
              max={plage[1]}
              value={transposition}
              onChange={(e) => setTransposition(Number(e.target.value))}
              style={{ width: 150, accentColor: ACCENT }}
            />
            <div className="text-app-muted" style={{ fontSize: 11, marginTop: 2 }}>
              plage admissible [{plage[0]}, {plage[1]}] — {plage[1] - plage[0] + 1} valeurs
            </div>
          </Champ>

          <Champ label={`Tempo ${bpm}`}>
            <input
              type="range"
              min={30}
              max={140}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              style={{ width: 150, accentColor: ACCENT }}
            />
          </Champ>

          <Champ label="Intro tonale">
            <Segments
              options={[
                { valeur: 'arpegee', label: 'Arpégée' },
                { valeur: 'aucune', label: 'Aucune' },
              ]}
              actif={intro}
              onChange={(v) => setIntro(v as Intro)}
            />
          </Champ>

          <Champ
            label={`Timbre${
              !gesteRecu ? ' — un clic active le son' : chargement ? ' — chargement…' : ''
            }`}
          >
            <Segments
              options={Object.entries(INSTRUMENTS_BANC).map(([valeur, i]) => ({
                valeur,
                label: i.label,
              }))}
              actif={instrument}
              onChange={(v) => setInstrument(v as NomInstrument)}
            />
          </Champ>
        </div>
      </Panneau>

      {progression && (
        <>
          {/* ── Progression tirée ───────────────────────────────────────── */}
          <Panneau
            titre="Progression"
            aDroite={
              <div className="flex items-center" style={{ gap: 8 }}>
                <span className="text-app-muted" style={{ fontSize: 12 }}>
                  {!spec.contexteTonal
                    ? 'sans contexte tonal'
                    : intro === 'arpegee'
                      ? 'intro tonale avant'
                      : 'tonique non jouée'}
                </span>
                <Bouton onClick={jouerProgression} principal>
                  {enLecture ? '▶ …' : '▶ Écouter'}
                </Bouton>
                <Bouton
                  onClick={() => {
                    arreter()
                    setEnLecture(false)
                    setIndexActif(null)
                  }}
                >
                  ■
                </Bouton>
              </div>
            }
          >
            <div style={{ fontFamily: 'monospace', fontSize: 13, marginBottom: 10 }}>
              <span className="text-app-muted">brut </span>
              {formatGabarit(progression.accords)}
            </div>

            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {progression.accords.map((accord, i) => (
                <button
                  key={accord.id}
                  onClick={() => {
                    setIndexDemande(i)
                    void jouer(avecIntro([realisation[i]], null, intro))
                  }}
                  className="bg-surface-2 border-app text-app"
                  style={{
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: i === indexPerturbe ? ACCENT : undefined,
                    borderRadius: 10,
                    padding: '8px 12px',
                    minWidth: 96,
                    textAlign: 'left',
                    outline: i + decalageContexte === indexActif ? `2px solid ${ACCENT}` : 'none',
                  }}
                >
                  <div style={{ fontSize: 19, fontWeight: 600, color: ACCENT }}>
                    <ChiffrageEmpile accord={accord} mode={mode} taille={19} couleur={ACCENT} />
                  </div>
                  <div className="text-app-muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {accord.positionMetrique === 'fort' ? '● fort' : '○ faible'} · {accord.duree}p
                  </div>
                  <div className="text-app-muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {realisation[i].map((h) => midiVersNom(h + transposition)).join(' ')}
                  </div>
                </button>
              ))}
            </div>
          </Panneau>

          {/* ── Perturbations, A/B ──────────────────────────────────────── */}
          <Panneau
            titre={`Perturbations sur l’accord ${indexPerturbe + 1} — ${chiffrer(
              progression.accords[indexPerturbe],
              mode,
            )}`}
            aDroite={
              <Bouton onClick={jouerProgression}>▶ original</Bouton>
            }
          >
            <p className="text-app-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
              Triées de la plus saillante à la plus difficile à détecter. L’ordre affiché est celui
              des bases de la §4 — c’est lui qu’il s’agit de valider à l’oreille.
            </p>

            {perturbations.length === 0 ? (
              <p className="text-app-muted" style={{ fontSize: 13, margin: 0 }}>
                Aucune perturbation praticable ici. Aux bornes de la progression, tout changement de
                degré violerait la contrainte n°1 — il serait détectable par la grammaire, pas par
                l’oreille.
              </p>
            ) : (
              <div className="flex flex-col" style={{ gap: 6 }}>
                {perturbations.map((p) => (
                  <div
                    key={p.type}
                    className="bg-surface-2 border-app flex items-center flex-wrap"
                    style={{
                      borderWidth: 1,
                      borderStyle: 'solid',
                      borderRadius: 10,
                      padding: '8px 12px',
                      gap: 12,
                    }}
                  >
                    <code style={{ fontSize: 13, minWidth: 160 }}>{p.type}</code>

                    <div
                      className="flex items-center"
                      style={{ minWidth: 120, fontSize: 15, gap: 6 }}
                    >
                      <ChiffrageEmpile
                        accord={p.original}
                        mode={mode}
                        taille={15}
                        couleur="var(--text-muted)"
                      />
                      <span className="text-app-muted">→</span>
                      <ChiffrageEmpile
                        accord={p.substitut}
                        mode={mode}
                        taille={15}
                        couleur={ACCENT}
                      />
                    </div>

                    <Jauge valeur={p.difficulte} />

                    <div className="flex" style={{ gap: 6, marginLeft: 'auto' }}>
                      <Bouton onClick={jouerProgression}>▶ A</Bouton>
                      <Bouton onClick={() => jouerPerturbee(indexPerturbe, p.substitut)} principal>
                        ▶ B
                      </Bouton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panneau>

          {/* ── Matrice, lecture seule ──────────────────────────────────── */}
          {ligne && (
            <Panneau titre={`Ligne de matrice — depuis ${ROMAINS[ligne.depuis as Degre]}`}>
              <p className="text-app-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Renormalisée sur le vocabulaire du niveau {niveau}. Édition dans{' '}
                <code>matrice.ts</code>.
              </p>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {([1, 2, 3, 4, 5, 6, 7] as Degre[]).map((d) => (
                  <div
                    key={d}
                    className="bg-surface-2 border-app"
                    style={{
                      borderWidth: 1,
                      borderStyle: 'solid',
                      borderRadius: 8,
                      padding: '6px 10px',
                      minWidth: 62,
                      textAlign: 'center',
                      opacity: ligne.poids[d] > 0 ? 1 : 0.35,
                    }}
                  >
                    <div style={{ fontSize: 14, color: ligne.poids[d] > 0 ? ACCENT : undefined }}>
                      {ROMAINS[d]}
                    </div>
                    <div className="text-app-muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {ligne.poids[d] > 0 ? ligne.poids[d].toFixed(2) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </Panneau>
          )}
        </>
      )}
    </div>
  )
}

// ─── Éléments d'interface ────────────────────────────────────────────────────

function Panneau({
  titre,
  aDroite,
  children,
}: {
  titre: string
  aDroite?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      className="bg-surface border-app"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 16,
      }}
    >
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{titre}</h2>
        {aDroite}
      </div>
      {children}
    </section>
  )
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-app-muted" style={{ fontSize: 11, marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Segments({
  options,
  actif,
  onChange,
}: {
  options: { valeur: string; label: string }[]
  actif: string
  onChange: (valeur: string) => void
}) {
  return (
    <div className="flex" style={{ gap: 4 }}>
      {options.map((o) => (
        <button
          key={o.valeur}
          onClick={() => onChange(o.valeur)}
          className={o.valeur === actif ? '' : 'bg-surface-2 text-app border-app'}
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 8,
            padding: '7px 11px',
            minHeight: 44,
            fontSize: 13,
            ...(o.valeur === actif
              ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
              : {}),
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Bouton({
  children,
  onClick,
  principal,
}: {
  children: React.ReactNode
  onClick: () => void
  principal?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={principal ? '' : 'bg-surface-2 text-app border-app'}
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: '7px 12px',
        minHeight: 44,
        fontSize: 13,
        ...(principal ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 } : {}),
      }}
    >
      {children}
    </button>
  )
}

// Difficulté = inverse de la saillance perceptive. 1 = le plus dur à entendre.
function Jauge({ valeur }: { valeur: number }) {
  return (
    <div className="flex items-center" style={{ gap: 8, minWidth: 150 }}>
      <div
        className="bg-app"
        style={{ width: 96, height: 7, borderRadius: 4, overflow: 'hidden' }}
      >
        <div
          style={{
            width: `${valeur * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, #34d399, #fbbf24 55%, #f87171)`,
          }}
        />
      </div>
      <span className="text-app-muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>
        {valeur.toFixed(2)}
      </span>
    </div>
  )
}
