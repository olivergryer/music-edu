// ─── Icônes de trophées (SVG inline) ─────────────────────────────────────────
// Les trophées portaient des emojis, contre la règle du design system (« icônes
// SVG inline, jamais d'emojis »). Ils rendaient en plus mal à 20px : ♩ ♫ ♬ ♪
// étaient indiscernables les uns des autres, et le rendu variait selon l'OS.
//
// Chaque trophée référence ici une clé d'icône (`icon` dans TROPHIES). Les trois
// clés `flamme` / `rang` / `trophee` servent à la couche de célébration, qui
// affiche aussi streak et montée de rang : mélanger SVG et emoji dans la même
// popup se verrait immédiatement.
//
// Convention : viewBox 24×24, tracé au trait (`currentColor`), remplissage
// réservé aux pleins volontaires (têtes de notes, étoile, points). La couleur
// vient du parent — aucune couleur en dur ici.

export type TropheeIconId =
  // Transverses
  | 'note' | 'duo' | 'portee-flamme' | 'barre-mesure' | 'accord' | 'diapason' | 'pupitre'
  // Rythme
  | 'serie-dix' | 'etoile' | 'clef-sol' | 'metronome'
  // Théorie
  | 'livre'
  // Notes
  | 'dechiffrage' | 'lecture-parfaite' | 'clef-fa' | 'oeil'
  // Accordeur / Harmonie
  | 'accordeur' | 'harmonie'
  // Code de la route musicale — portée en perspective, 1 à 3 repères par cycle
  | 'perspective-1' | 'perspective-2' | 'perspective-3'
  // Célébrations (hors trophées)
  | 'flamme' | 'rang' | 'trophee'

interface Props {
  id: TropheeIconId
  size?: number
  /** Épaisseur du trait. Réduire au-delà de 32px pour garder le dessin léger. */
  strokeWidth?: number
  className?: string
}

// Rails et traverses de la portée en perspective — partagés par les trois
// variantes de cycle, qui ne diffèrent que par le nombre de repères au loin.
const PERSPECTIVE = (
  <>
    <path d="M2.5 21 10.6 6.2M21.5 21 13.4 6.2" />
    <path d="M4.7 17h14.6M6.9 12.9h10.2M8.7 9.7h6.6" />
  </>
)

// Les repères se posent au point de fuite, resserrés pour rester dans l'écart
// des rails : au-delà de 15.4 ils débordaient du dessin en cycle 3.
function repere(x: number) {
  return <circle key={x} cx={x} cy="3.6" r="1.1" fill="currentColor" stroke="none" />
}

// Flamme au TRAIT, et non pleine avec une découpe. Une découpe suppose de
// connaître la couleur du fond : ici la carte est tantôt `--surface-2`, tantôt
// un violet translucide selon que le trophée est obtenu — la découpe se serait
// vue. Partagée par `portee-flamme` et `flamme`.
const FLAMME = (
  <>
    <path d="M12.4 2.4c.4 2.6 1.9 3.6 3.1 5.2 1 1.4 1.7 2.8 1.7 4.5a5.2 5.2 0 0 1-10.4 0c0-2 .8-3.3 1.9-4.7.5-.6.9-1.3 1.1-2.1.5.7.9 1.3 1.2 2 .4-1.7.9-3.4 1.4-4.9Z" />
    <path d="M12 12.2c1.2 1.5 1.8 2.4 1.8 3.4a1.85 1.85 0 0 1-3.7 0c0-1 .7-1.9 1.9-3.4Z" />
  </>
)

function tracé(id: TropheeIconId) {
  switch (id) {
    // ── Transverses ──────────────────────────────────────────────────────────
    case 'note': // Première note — une noire
      return (
        <>
          <ellipse cx="8.5" cy="17.5" rx="4.2" ry="3.1" transform="rotate(-20 8.5 17.5)" fill="currentColor" stroke="none" />
          <path d="M12.4 16.5V3.5" />
        </>
      )
    case 'duo': // Duo — deux notes liées par une barre
      return (
        <>
          <ellipse cx="6.5" cy="17.5" rx="3.4" ry="2.5" transform="rotate(-20 6.5 17.5)" fill="currentColor" stroke="none" />
          <ellipse cx="16.5" cy="15.5" rx="3.4" ry="2.5" transform="rotate(-20 16.5 15.5)" fill="currentColor" stroke="none" />
          <path d="M9.6 16.8V5.2l10-2v11.3" />
          <path d="M9.6 5.2l10-2" />
        </>
      )
    case 'portee-flamme': // Sur la portée — 7 jours de suite
      return (
        <>
          {/* Portée interrompue au centre : la flamme étant au trait, des lignes
              continues la traverseraient et brouilleraient le dessin. */}
          <path d="M2 6h4.4M17.6 6h4.4M2 10h3.6M18.4 10h3.6M2 14h3.4M18.6 14h3.4M2 18h4.2M17.8 18h4.2" opacity="0.42" />
          {FLAMME}
        </>
      )
    case 'barre-mesure': // Barre de mesure — 30 jours de suite
      return (
        <>
          <path d="M2.5 6h19M2.5 10h19M2.5 14h19M2.5 18h19" opacity="0.38" />
          <path d="M14.5 3.5v17" />
          <path d="M18.8 3.5v17" strokeWidth="3.4" />
        </>
      )
    case 'accord': // Do majeur — accord de trois notes sur la portée
      return (
        <>
          {/* Sans la portée derrière, les trois têtes empilées lisaient « feu
              tricolore » plutôt qu'accord. */}
          <path d="M2.5 5.4h19M2.5 9.4h19M2.5 13.4h19M2.5 17.4h19" opacity="0.35" />
          <ellipse cx="8" cy="17.4" rx="3" ry="2.2" transform="rotate(-18 8 17.4)" fill="currentColor" stroke="none" />
          <ellipse cx="8" cy="13.4" rx="3" ry="2.2" transform="rotate(-18 8 13.4)" fill="currentColor" stroke="none" />
          <ellipse cx="8" cy="9.4" rx="3" ry="2.2" transform="rotate(-18 8 9.4)" fill="currentColor" stroke="none" />
          <path d="M10.8 17V4" />
        </>
      )
    case 'diapason': // Diapason — deux branches, un manche
      return (
        <>
          <path d="M7.5 3v8.5a4.5 4.5 0 0 0 9 0V3" />
          <path d="M12 16v5M9.4 21h5.2" />
        </>
      )
    case 'pupitre': // Concert — pupitre d'orchestre
      return (
        <>
          {/* Le lutrin était d'abord un triangle pointe en bas : ça lisait
              « verre à pied ». Un plateau incliné le rend lisible. */}
          <path d="M3.8 6.6 19.6 3.2l.7 3.2L4.5 9.8z" />
          <path d="M12 9V19" />
          <path d="M8 21.5 12 19l4 2.5" />
        </>
      )

    // ── Rythme ───────────────────────────────────────────────────────────────
    case 'serie-dix': // Première série — dix exercices
      return (
        <>
          {[0, 1, 2, 3, 4].map(i => (
            <circle key={`a${i}`} cx={4 + i * 4} cy="9" r="1.7" fill="currentColor" stroke="none" />
          ))}
          {[0, 1, 2, 3, 4].map(i => (
            <circle key={`b${i}`} cx={4 + i * 4} cy="15" r="1.7" fill="currentColor" stroke="none" />
          ))}
        </>
      )
    case 'etoile': // Série parfaite
      return <path d="M12 2.5l2.9 6.2 6.6.8-4.8 4.6 1.2 6.4L12 17.4 6.1 20.5l1.2-6.4L2.5 9.5l6.6-.8z" fill="currentColor" stroke="none" />
    case 'clef-sol': // Clé de Sol — 10 séries
      // Trois sous-tracés : la hampe qui descend du crochet, la grande spirale
      // et la boucle basse. Deux courbes de taille égale donnaient un « 8 ».
      return (
        <>
          <path d="M14.6 2.2c-3 2.2-5 5-5 7.9 0 2 .8 3.6 1.8 5.3" />
          <path d="M14.6 2.2c1.3.9 2 2.2 2 3.7 0 3.5-3.6 6.4-6.1 9-1.5 1.5-2.5 2.9-2.5 4.4 0 2 1.7 3.5 3.8 3.5 2 0 3.5-1.4 3.5-3.3 0-1.6-1.1-2.8-2.6-3" />
          <path d="M11.4 15.4c1.5 2.6 2.4 4.6 2.4 6.5 0 1.5-.8 2.5-2 2.5" />
        </>
      )
    case 'metronome':
      return (
        <>
          <path d="M9.8 3h4.4l3.3 18H6.5z" />
          <path d="M6.9 16.4h10.2" />
          <path d="M12.6 18.5 15.4 6.4" />
        </>
      )

    // ── Théorie ──────────────────────────────────────────────────────────────
    case 'livre':
      return (
        <>
          <path d="M2.8 5.3c3-1 6-1 9.2.6 3.2-1.6 6.2-1.6 9.2-.6v13.2c-3-1-6-1-9.2.6-3.2-1.6-6.2-1.6-9.2-.6z" />
          <path d="M12 5.9v13.2" />
        </>
      )

    // ── Notes ────────────────────────────────────────────────────────────────
    case 'dechiffrage': // Premier déchiffrage — une note sur la portée
      return (
        <>
          <path d="M2.5 5h19M2.5 9h19M2.5 13h19M2.5 17h19M2.5 21h19" opacity="0.38" />
          <ellipse cx="8" cy="15" rx="3.1" ry="2.3" transform="rotate(-20 8 15)" fill="currentColor" stroke="none" />
          <path d="M10.9 14.4V5" />
        </>
      )
    case 'lecture-parfaite': // Session Notes sans aucune faute
      return (
        <>
          <path d="M2.5 5h19M2.5 9h19M2.5 13h19M2.5 17h19M2.5 21h19" opacity="0.3" />
          <path d="M5.5 13.5 10 18 19 6.5" strokeWidth="2.6" />
        </>
      )
    case 'clef-fa':
      return (
        <>
          <circle cx="6.8" cy="7.6" r="1.9" fill="currentColor" stroke="none" />
          <path d="M6.8 5.7c3.7 0 5.9 2.4 5.9 5.6 0 4.4-3.6 7.6-6.9 9.2" />
          <circle cx="17.4" cy="6.4" r="1.05" fill="currentColor" stroke="none" />
          <circle cx="17.4" cy="10.2" r="1.05" fill="currentColor" stroke="none" />
        </>
      )
    case 'oeil': // Lecteur.rice à vue
      return (
        <>
          <path d="M2 12s3.8-6.2 10-6.2S22 12 22 12s-3.8 6.2-10 6.2S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </>
      )

    // ── Accordeur / Harmonie ─────────────────────────────────────────────────
    case 'accordeur': // Cadran d'accordage, aiguille juste
      return (
        <>
          <path d="M3 17.5a9 9 0 0 1 18 0" />
          <path d="M12 17.5 15.6 9" />
          <circle cx="12" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
          <path d="M3 17.5h2M21 17.5h-2M12 8.5v-2" opacity="0.5" />
        </>
      )
    case 'harmonie': // Deux ondes superposées
      return (
        <>
          <path d="M2.8 8.4c2.5-4.2 5.6-4.2 8.2 0s5.7 4.2 8.2 0" />
          <path d="M2.8 16.4c2.5-4.2 5.6-4.2 8.2 0s5.7 4.2 8.2 0" />
        </>
      )

    // ── Code de la route musicale ────────────────────────────────────────────
    case 'perspective-1':
      return <>{PERSPECTIVE}{repere(12)}</>
    case 'perspective-2':
      return <>{PERSPECTIVE}{[10.2, 13.8].map(repere)}</>
    case 'perspective-3':
      return <>{PERSPECTIVE}{[8.6, 12, 15.4].map(repere)}</>

    // ── Célébrations ─────────────────────────────────────────────────────────
    case 'flamme':
      return <>{FLAMME}<path d="M6.5 21.5h11" /></>
    case 'rang':
      // Deux chevrons dans un cercle. Une étoile aurait doublonné avec
      // « Série parfaite », qui peut apparaître dans la même file de popups.
      return (
        <>
          <circle cx="12" cy="12" r="9.2" />
          <path d="M7.6 13.6 12 9.2l4.4 4.4M7.6 17.4 12 13l4.4 4.4" />
        </>
      )
    case 'trophee':
    default:
      return (
        <>
          <path d="M7 3.5h10V9a5 5 0 0 1-10 0z" />
          <path d="M7 5.5H4.2a3.2 3.2 0 0 0 3.2 3.2M17 5.5h2.8a3.2 3.2 0 0 1-3.2 3.2" />
          <path d="M12 14v3.6M8.2 20.5h7.6l-.8-2.9H9z" />
        </>
      )
  }
}

export default function TropheeIcon({ id, size = 24, strokeWidth = 1.7, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {tracé(id)}
    </svg>
  )
}
