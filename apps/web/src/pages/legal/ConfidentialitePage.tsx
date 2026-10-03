import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { CONSERVATION_MOIS } from '../../lib/donneesPersonnelles'
import { PageLegale, Section, P, Liste, Tableau, LienContact, DerniereMiseAJour } from './PageLegale'
import BoutonEffacerMesDonnees from './BoutonEffacerMesDonnees'

export default function ConfidentialitePage() {
  const { user } = useAuth()
  const [copie, setCopie] = useState(false)

  async function copierIdentifiant() {
    if (!user) return
    try {
      await navigator.clipboard.writeText(user.uid)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch { /* presse-papier refusé : l'identifiant reste sélectionnable à la main */ }
  }

  return (
    <PageLegale titre="Confidentialité">

      <Section titre="Pour toi, en bref">
        <Liste items={[
          <>Tessitura retient ta progression pour que tu puisses reprendre là où tu t’es arrêté.</>,
          <>Sans compte, tout reste dans ton appareil : rien n’est envoyé.</>,
          <>Si tu crées un compte, on te demande une adresse e-mail et un nom — choisis
            un prénom ou un surnom, pas ton nom complet. Demande à un adulte avant de
            créer un compte.</>,
          <>Quand tu utilises l’accordeur, le son de ton micro reste dans ton appareil :
            il n’est ni envoyé ni enregistré.</>,
          <>Tu peux tout effacer quand tu veux avec le bouton « Effacer mes données », en
            bas de cette page.</>,
          <>Si tu as une question, demande à un adulte de nous écrire.</>,
        ]} />
      </Section>

      <Section titre="Pour les parents et les enseignants">
        <P>
          Tessitura s’utilise de deux façons. <b>Sans compte</b>, la progression est conservée
          dans le navigateur de l’appareil et rien n’est transmis. <b>Avec un compte</b>, la
          progression est synchronisée et peut être consultée par le professeur auquel l’élève
          s’est rattaché par un code.
        </P>
      </Section>

      <Section titre="Responsable du traitement">
        <P>Matthieu GAILLARD — <LienContact /></P>
      </Section>

      <Section titre="Données traitées">
        <Tableau
          entetes={['Donnée', 'Où', 'Pourquoi', 'Conservation']}
          lignes={[
            ['Adresse e-mail', 'Firebase Authentication (compte uniquement)', 'Identifier le compte, permettre la connexion et la réinitialisation du mot de passe', `${CONSERVATION_MOIS} mois après la dernière utilisation`],
            ['Nom d’affichage saisi à l’inscription', 'Firestore (compte uniquement)', 'Afficher l’élève dans le tableau de bord de son professeur', `${CONSERVATION_MOIS} mois après la dernière utilisation`],
            ['Rôle (élève ou professeur) et rattachements par code', 'Firestore (compte uniquement)', 'Relier un élève à son professeur', `${CONSERVATION_MOIS} mois après la dernière utilisation`],
            ['Progression, résultats et historique des sessions', 'Firestore avec un compte, navigateur sans compte', 'Reprendre là où l’élève s’est arrêté, afficher les statistiques', `${CONSERVATION_MOIS} mois après la dernière utilisation`],
            ['Préférences d’affichage et réglages (thème, instrument, diapason, niveau…)', 'Navigateur uniquement', 'Retrouver ses réglages à la visite suivante', 'Jusqu’à effacement par l’utilisateur'],
            ['Prénom ou pseudonyme et description saisis dans le formulaire de retours', 'Firestore', 'Répondre à un signalement de bug ou à une suggestion', 'Jusqu’au traitement du retour'],
            ['Données techniques de connexion (adresse IP, type de navigateur)', 'Journaux des hébergeurs', 'Sécurité et fonctionnement des serveurs', 'Durée fixée par chaque hébergeur'],
          ]}
        />
        <P>
          Tessitura ne demande ni âge, ni date de naissance, ni photo, ni adresse postale, et
          n’affiche aucune publicité.
        </P>
      </Section>

      <Section titre="Finalités et base légale">
        <P>
          Ces données servent uniquement à faire fonctionner l’application, à conserver la
          progression de l’élève et à permettre à son professeur de la suivre. Aucune donnée
          n’est utilisée à des fins publicitaires, de profilage ou de revente.
        </P>
        <P>
          <b>Base légale</b> : l’exécution du service demandé (article 6.1.b du RGPD).
          Conserver la progression et la rendre consultable par le professeur auquel l’élève
          s’est rattaché est précisément ce pour quoi l’application est utilisée.
        </P>
        <P>
          La création d’un compte par un élève de moins de 15 ans suppose l’accord du titulaire
          de l’autorité parentale (article 8 du RGPD). Tessitura est utilisable <b>sans compte</b>,
          et dans ce cas aucune donnée n’est transmise : c’est le mode à privilégier tant que cet
          accord n’est pas donné.
        </P>
      </Section>

      <Section titre="Micro">
        <P>
          L’accordeur et certains exercices de rythme utilisent le micro de l’appareil. Le son est
          analysé directement dans le navigateur pour en déduire une hauteur en hertz ; il n’est
          ni transmis, ni conservé, ni enregistré sur un serveur.
        </P>
        <P>
          L’accès au micro n’est demandé qu’à l’ouverture de ces activités et peut être refusé à
          tout moment dans les réglages du navigateur.
        </P>
      </Section>

      <Section titre="Stockage sur l’appareil">
        <P>
          Tessitura enregistre des informations dans le navigateur (stockage local, base de
          données locale et cache hors ligne) afin de fonctionner et de rester disponible sans
          connexion.
        </P>
        <P>
          Ce stockage est strictement nécessaire au service demandé : il ne requiert pas de
          consentement (article 82 de la loi Informatique et Libertés). Tessitura n’utilise aucun
          cookie publicitaire ni outil de mesure d’audience.
        </P>
      </Section>

      <Section titre="Destinataires et sous-traitants">
        <P>
          Les données ne sont ni vendues ni partagées. Un professeur voit la progression des
          élèves qui se sont rattachés à son code, et eux seuls. L’éditeur, en tant que
          responsable du traitement, peut accéder à l’ensemble des comptes pour administrer
          le service. Les prestataires techniques suivants interviennent :
        </P>
        <Liste items={[
          <>Vercel Inc. — hébergement de l’application</>,
          <>Google LLC — Firebase Authentication et Cloud Firestore (comptes et base de données) — base hébergée dans la multi-région européenne <code>eur3</code> (Belgique et Pays-Bas)</>,
          <>Cloudflare, Inc. — R2, diffusion des échantillons sonores</>,
          <>GitHub Inc. (Microsoft) — hébergement des banques de sons d’instruments à vent</>,
        ]} />
      </Section>

      <Section titre="Transferts hors de l’Union européenne">
        <P>
          La base de données est hébergée en Europe : la progression, les comptes et l’historique
          ne quittent pas l’Union européenne.
        </P>
        <P>
          Les prestataires restent toutefois des sociétés américaines, et des données techniques
          (adresse IP, journaux de serveur) peuvent être traitées hors de l’Union. Ces transferts
          sont encadrés par la décision d’adéquation de la Commission européenne du 10 juillet 2023
          (EU-US Data Privacy Framework).
        </P>
      </Section>

      <Section titre="Durée de conservation">
        <Liste items={[
          <>Compte et progression enregistrés en ligne : supprimés {CONSERVATION_MOIS} mois après la dernière utilisation.</>,
          <>Données stockées sur l’appareil : conservées jusqu’à leur effacement par l’utilisateur.</>,
          <>Journaux techniques des hébergeurs : durée limitée fixée par chaque hébergeur.</>,
        ]} />
      </Section>

      <Section titre="Vos droits">
        <P>
          Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et
          d’opposition.
        </P>
        <Liste items={[
          <>Effacement immédiat : bouton « Effacer mes données » ci-dessous.</>,
          <>Autres demandes : <LienContact />, en indiquant l’identifiant affiché ci-dessous.</>,
        ]} />
        <P>
          Vous pouvez également adresser une réclamation à la CNIL :{' '}
          <a href="https://www.cnil.fr" className="text-rhythm underline" rel="noreferrer noopener" target="_blank">www.cnil.fr</a>
        </P>
      </Section>

      <Section titre="Enfants">
        <P>
          Tessitura est conçue pour des enfants de 7 à 11 ans, utilisée avec l’accord de leurs
          parents ou dans le cadre de leur enseignement musical. L’application est utilisable
          sans compte, et donc sans qu’aucune donnée ne soit transmise. La création d’un compte
          suppose une adresse e-mail et un nom d’affichage : elle relève d’une décision adulte.
        </P>
      </Section>

      <Section titre="Modifications">
        <P>Cette politique peut évoluer ; la date de mise à jour figure en bas de page.</P>
      </Section>

      {/* Identifiant technique — permet à un parent d'exercer ses droits par e-mail
          sans que l'éditeur ait à recouper une identité. */}
      <Section titre="Votre identifiant">
        {user ? (
          <>
            <P>
              Cet identifiant désigne votre compte dans la base de données. Joignez-le à toute
              demande adressée par e-mail : c’est ce qui permet de retrouver vos données.
            </P>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-surface-2 border border-app rounded-lg px-2.5 py-2 break-all flex-1"
                    style={{ minWidth: 200 }}>
                {user.uid}
              </code>
              <button
                type="button"
                onClick={copierIdentifiant}
                className="rounded-xl px-4 font-bold text-sm border border-app text-app hover:bg-surface-2 transition-colors"
                style={{ minHeight: 44 }}
              >
                {copie ? 'Copié' : 'Copier'}
              </button>
            </div>
          </>
        ) : (
          <P>
            Vous n’êtes pas connecté : aucune donnée vous concernant n’est enregistrée en ligne,
            et il n’existe donc aucun identifiant. Tout ce que Tessitura a retenu se trouve dans
            ce navigateur, et le bouton ci-dessous l’efface.
          </P>
        )}
      </Section>

      <BoutonEffacerMesDonnees />

      <P>
        <span className="text-xs text-app-muted">
          Voir aussi les <Link to="/mentions-legales" className="underline">mentions légales</Link>
          {' '}et les <Link to="/credits" className="underline">crédits</Link>.
        </span>
      </P>

      <DerniereMiseAJour />
    </PageLegale>
  )
}
