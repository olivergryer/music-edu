import { Link } from 'react-router-dom'
import { PageLegale, Section, P, LienContact, DerniereMiseAJour } from './PageLegale'

/** Année du dernier déploiement, ou année système hors dépôt git. */
function anneeCourante() {
  return __BUILD_DATE__ ? new Date(__BUILD_DATE__).getFullYear() : new Date().getFullYear()
}

export default function MentionsLegalesPage() {
  return (
    <PageLegale titre="Mentions légales">
      <Section titre="Éditeur">
        <P>
          Tessitura est éditée à titre non commercial par Matthieu GAILLARD, particulier.
        </P>
        <P>Contact : <LienContact /></P>
        <P>Directeur de la publication : Matthieu GAILLARD</P>
      </Section>

      <Section titre="Hébergement">
        <P>
          Vercel Inc.<br />
          440 N Barranca Ave #4133, Covina, CA 91723, États-Unis<br />
          Téléphone : non publié par l’hébergeur<br />
          <a href="https://vercel.com" className="text-rhythm underline" rel="noreferrer noopener" target="_blank">vercel.com</a>
        </P>
      </Section>

      <Section titre="Services techniques">
        <P>Base de données et comptes utilisateurs : Google Firebase (Cloud Firestore et Firebase Authentication), Google LLC.</P>
        <P>Diffusion des fichiers audio : Cloudflare R2, Cloudflare, Inc., et GitHub Pages, GitHub Inc.</P>
        <P>
          Le détail des données traitées figure dans la{' '}
          <Link to="/confidentialite" className="text-rhythm underline">politique de confidentialité</Link>.
        </P>
      </Section>

      <Section titre="Propriété intellectuelle">
        <P>
          L’application Tessitura (code, textes, exercices, visuels et logo) est protégée par le
          droit d’auteur.
        </P>
        {/* Année courante plutôt qu'année de première publication : l'application
            est modifiée en continu, et le pied de page du Hub suit déjà la même
            règle — deux années différentes sur le même site se remarqueraient. */}
        <P>© {anneeCourante()} Matthieu GAILLARD.</P>
        <P>
          Toute reproduction ou réutilisation, totale ou partielle, sans autorisation écrite est
          interdite. Les enseignants peuvent librement utiliser l’application et des captures
          d’écran dans le cadre de leurs cours.
        </P>
        <P>
          Les éléments de tiers (sons, polices, bibliothèques) restent la propriété de leurs
          auteurs : voir la page <Link to="/credits" className="text-rhythm underline">Crédits</Link>.
        </P>
      </Section>

      <Section titre="Responsabilité">
        <P>
          L’éditeur s’efforce d’assurer l’exactitude des contenus pédagogiques mais ne peut
          garantir l’absence d’erreur.
        </P>
        <P>Pour signaler un problème : <LienContact />, ou le{' '}
          <Link to="/feedback" className="text-rhythm underline">formulaire de retours</Link>.
        </P>
      </Section>

      <Section titre="Droit applicable">
        <P>Le présent site est soumis au droit français.</P>
      </Section>

      <DerniereMiseAJour />
    </PageLegale>
  )
}
