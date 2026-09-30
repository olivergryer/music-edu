// Gabarit commun aux trois pages légales (mentions, confidentialité, crédits).
//
// Elles sont longues et purement textuelles, là où le reste de l'app est fait
// d'écrans d'exercice : ce fichier centralise la mise en page du texte long pour
// que les trois restent identiques et lisibles en thème clair comme en sombre.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PageLegale({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-16">
      <div className="w-full max-w-xl min-w-0">
        <header className="flex items-center gap-3 py-2 mb-4">
          <Link
            to="/"
            aria-label="Retour à l’accueil"
            className="shrink-0 rounded-full border border-app text-app-muted hover:text-app transition-colors"
            style={{ width: 44, height: 44, display: 'grid', placeItems: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="text-2xl font-black text-app" style={{ fontFamily: "'Righteous', 'Inter', sans-serif" }}>
            {titre}
          </h1>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Section de texte long : un titre, puis du contenu. */
export function Section({ titre, children }: { titre?: string; children: ReactNode }) {
  return (
    <section className="bg-surface border border-app rounded-2xl p-5 mb-3">
      {titre && (
        <h2 className="text-xs font-bold text-app-muted uppercase tracking-widest mb-3">{titre}</h2>
      )}
      <div className="text-sm text-app" style={{ lineHeight: 1.65 }}>{children}</div>
    </section>
  )
}

/** Paragraphe. Marge basse sauf sur le dernier, géré par le parent. */
export function P({ children }: { children: ReactNode }) {
  return <p className="mb-3 last:mb-0">{children}</p>
}

/** Liste à puces. */
export function Liste({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-3 last:mb-0 pl-4" style={{ listStyle: 'disc' }}>
      {items.map((item, i) => <li key={i} className="mb-1.5">{item}</li>)}
    </ul>
  )
}

/**
 * Tableau de données. Il défile horizontalement dans son propre conteneur :
 * sur un téléphone, quatre colonnes de texte déborderaient sinon la page.
 */
export function Tableau({ entetes, lignes }: { entetes: string[]; lignes: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mb-3 last:mb-0" style={{ maxWidth: '100%' }}>
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 460 }}>
        <thead>
          <tr>
            {entetes.map(e => (
              <th key={e} className="text-app-muted font-bold uppercase tracking-wider text-left align-bottom pb-2 pr-3"
                  style={{ borderBottom: '1px solid var(--border-c)', fontSize: 10 }}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr key={i}>
              {ligne.map((cellule, j) => (
                <td key={j} className="py-2 pr-3 align-top"
                    style={{ borderBottom: '1px solid var(--border-c)' }}>
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Adresse de contact — un seul endroit à changer si elle bouge. */
export const CONTACT = 'contact@tessitura-musique.fr'

export function LienContact() {
  return <a href={`mailto:${CONTACT}`} className="text-rhythm underline">{CONTACT}</a>
}

/**
 * Date de dernière mise à jour. `__BUILD_DATE__` porte la date du dernier commit :
 * elle avance donc à chaque déploiement, y compris quand le texte n'a pas bougé.
 * C'est volontairement prudent — annoncer une date trop ancienne serait pire.
 */
export function DerniereMiseAJour() {
  const date = __BUILD_DATE__ ? new Date(__BUILD_DATE__) : new Date()
  return (
    <p className="text-xs text-app-muted text-center mt-4">
      Dernière mise à jour : {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
    </p>
  )
}
