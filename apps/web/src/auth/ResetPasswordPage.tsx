// ─── Atterrissage du lien de réinitialisation reçu par email ─────────────────
// Firebase envoie un lien vers l'« URL de gestion des actions » configurée dans
// la console (Authentication → Templates → Réinitialisation du mot de passe →
// « Personnaliser l'URL d'action »), avec en query string :
//   mode=resetPassword & oobCode=<code à usage unique> & apiKey=… & lang=fr
//
// Le flux en deux temps :
//   1. verifyPasswordResetCode  → valide le code ET renvoie l'email concerné,
//      ce qui permet d'afficher « Nouveau mot de passe pour x@y.fr » et de
//      détecter tout de suite un lien périmé ou déjà utilisé.
//   2. confirmPasswordReset     → applique le nouveau mot de passe et consomme
//      définitivement le code.
//
// Prérequis côté console Firebase : l'URL d'action doit pointer vers
// https://<domaine-de-prod>/reinitialiser, et le domaine figurer dans
// Authentication → Settings → Domaines autorisés.

import { useState, useEffect, FormEvent } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { auth } from '../lib/firebase'

const inputCls =
  "w-full rounded-lg px-3.5 py-2.5 text-sm text-app border border-app bg-(--input-bg) outline-none focus:border-rhythm transition-colors"

const MIN_PASSWORD = 6 // aligné sur la règle Firebase (weak-password en dessous)

type Etat = 'verification' | 'pret' | 'lien-invalide' | 'termine'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const oobCode = params.get('oobCode') ?? ''
  const mode = params.get('mode')

  const [etat, setEtat] = useState<Etat>('verification')
  const [emailCible, setEmailCible] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Validation du code au chargement : inutile d'afficher le formulaire si le
  // lien est déjà mort.
  useEffect(() => {
    let annule = false

    if (!oobCode || (mode && mode !== 'resetPassword')) {
      setEtat('lien-invalide')
      return
    }

    verifyPasswordResetCode(auth, oobCode)
      .then(email => {
        if (annule) return
        setEmailCible(email)
        setEtat('pret')
      })
      .catch(() => {
        if (annule) return
        setEtat('lien-invalide')
      })

    return () => { annule = true }
  }, [oobCode, mode])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD) {
      setError(`Mot de passe trop court (${MIN_PASSWORD} caractères min).`)
      return
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setEtat('termine')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('weak-password')) {
        setError(`Mot de passe trop court (${MIN_PASSWORD} caractères min).`)
      } else if (msg.includes('expired-action-code') || msg.includes('invalid-action-code')) {
        // Le code a expiré ou servi entre l'affichage du formulaire et l'envoi.
        setEtat('lien-invalide')
      } else {
        setError('La réinitialisation a échoué. Redemande un lien.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-app min-h-screen flex items-center justify-center px-5">
      <div className="bg-surface rounded-2xl p-10 w-full max-w-sm flex flex-col gap-5 shadow-sm border border-app">

        {etat === 'verification' && (
          <>
            <h1 className="text-2xl font-bold text-app m-0">Vérification…</h1>
            <p className="text-app-muted text-sm leading-relaxed m-0">
              On vérifie ton lien de réinitialisation.
            </p>
          </>
        )}

        {etat === 'lien-invalide' && (
          <>
            <h1 className="text-2xl font-bold text-app m-0">Lien expiré</h1>
            <p className="text-app-muted text-sm leading-relaxed m-0">
              Ce lien n’est plus valable : il a peut-être déjà servi, ou plus d’une heure s’est
              écoulée depuis son envoi.
            </p>
            <p className="text-app-muted text-sm leading-relaxed m-0">
              Demande-en un nouveau depuis la page de connexion.
            </p>
            <Link
              to="/login"
              className="w-full rounded-lg py-3 text-base font-semibold text-white border-none text-center no-underline"
              style={{ background: '#4A6CF7' }}
            >
              Retour à la connexion
            </Link>
          </>
        )}

        {etat === 'pret' && (
          <>
            <h1 className="text-2xl font-bold text-app m-0">Nouveau mot de passe</h1>
            <p className="text-app-muted text-sm leading-relaxed m-0">
              Pour le compte <span className="font-semibold text-app">{emailCible}</span>.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-app-muted text-sm mb-1.5 block font-medium">
                  Nouveau mot de passe
                </label>
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-app-muted text-sm mb-1.5 block font-medium">
                  Confirme le mot de passe
                </label>
                <input
                  className={inputCls}
                  type="password"
                  value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center m-0">{error}</p>}
              <button
                className="w-full rounded-lg py-3 text-base font-semibold text-white border-none transition-opacity disabled:opacity-50"
                style={{ background: '#4A6CF7' }}
                type="submit"
                disabled={loading}
              >
                {loading ? 'Enregistrement…' : 'Valider'}
              </button>
            </form>
          </>
        )}

        {etat === 'termine' && (
          <>
            <h1 className="text-2xl font-bold text-app m-0">Mot de passe modifié</h1>
            <p className="text-app-muted text-sm leading-relaxed m-0">
              Tu peux maintenant te connecter avec ton nouveau mot de passe.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full rounded-lg py-3 text-base font-semibold text-white border-none"
              style={{ background: '#4A6CF7' }}
            >
              Se connecter
            </button>
          </>
        )}

      </div>
    </div>
  )
}
