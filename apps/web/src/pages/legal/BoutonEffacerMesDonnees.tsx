// Bouton « Effacer mes données » — confirmation en deux temps.
//
// Le geste est irréversible et s'adresse à un enfant : le premier appui n'efface
// rien, il ouvre une demande de confirmation explicite qui dit ce qui va
// disparaître et invite à demander à un adulte.

import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { effacerMesDonnees } from '../../lib/donneesPersonnelles'

type Etat = 'repos' | 'confirmation' | 'en-cours' | 'erreur'

export default function BoutonEffacerMesDonnees() {
  const { user } = useAuth()
  const [etat, setEtat] = useState<Etat>('repos')
  const [message, setMessage] = useState('')

  async function effacer() {
    setEtat('en-cours')
    try {
      const resultat = await effacerMesDonnees()
      // Le compte Auth non supprimé est le seul cas où l'on ne peut pas repartir
      // en silence : l'adresse e-mail existe toujours et l'utilisateur doit le
      // savoir pour recommencer après reconnexion.
      if (resultat.raisonCompteConserve === 'reconnexion-requise') {
        setEtat('erreur')
        setMessage(
          'Tes données ont été effacées, mais ton compte existe encore : pour le supprimer '
          + 'aussi, reconnecte-toi puis reviens appuyer sur ce bouton.',
        )
        return
      }
      // Rechargement complet plutôt que navigation React : le stockage local et
      // les bases IndexedDB viennent d'être supprimés sous les pieds de l'app,
      // dont l'état en mémoire ne correspond plus à rien.
      window.location.replace('/')
    } catch (err) {
      setEtat('erreur')
      setMessage(
        (err as Error).message === 'hors-ligne'
          ? 'Tu n’as pas de connexion Internet. Reconnecte-toi à Internet et réessaie, sinon '
            + 'tes données en ligne ne seraient pas vraiment supprimées.'
          : 'L’effacement n’a pas pu aller au bout. Réessaie, ou demande à un adulte de nous écrire.',
      )
    }
  }

  return (
    <section className="bg-surface border rounded-2xl p-5 mb-3" style={{ borderColor: '#f8717166' }}>
      <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#f87171' }}>
        Effacer mes données
      </h2>

      {etat === 'confirmation' ? (
        <>
          <p className="text-sm text-app mb-1" style={{ lineHeight: 1.6 }}>
            Tu vas effacer toute ta progression. Elle ne pourra pas être récupérée.
          </p>
          {user && (
            <p className="text-sm text-app mb-1" style={{ lineHeight: 1.6 }}>
              Ton compte et ton adresse e-mail seront supprimés aussi.
            </p>
          )}
          <p className="text-sm text-app-muted mb-4" style={{ lineHeight: 1.6 }}>
            Si tu as un doute, demande à un adulte.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setEtat('repos')}
              className="flex-1 rounded-xl px-4 font-bold text-sm border border-app text-app hover:bg-surface-2 transition-colors"
              style={{ minHeight: 44, minWidth: 130 }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={effacer}
              className="flex-1 rounded-xl px-4 font-bold text-sm transition-opacity hover:opacity-90"
              style={{ minHeight: 44, minWidth: 130, background: '#f87171', color: '#030712' }}
            >
              Oui, tout effacer
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-app-muted mb-4" style={{ lineHeight: 1.6 }}>
            {user
              ? 'Supprime ta progression, ton historique et ton compte. L’application reste utilisable ensuite, comme au premier jour.'
              : 'Supprime la progression et les réglages enregistrés dans ce navigateur.'}
          </p>
          <button
            type="button"
            onClick={() => setEtat('confirmation')}
            disabled={etat === 'en-cours'}
            className="w-full rounded-xl px-4 font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ minHeight: 44, border: '1px solid #f87171', color: '#f87171' }}
          >
            {etat === 'en-cours' ? 'Effacement…' : 'Effacer mes données'}
          </button>
        </>
      )}

      {message && (
        <p className="text-xs mt-3" style={{ color: '#fbbf24', lineHeight: 1.55 }}>{message}</p>
      )}
    </section>
  )
}
