import { PageLegale, Section, P, Tableau, DerniereMiseAJour } from './PageLegale'

// Dépendances de production et leurs licences.
//
// Cette table est le résumé LISIBLE ; la référence qui fait foi est
// /THIRD_PARTY_NOTICES.txt, produit au build par scripts/generate-notices.mjs à
// partir des paquets réellement installés (dépendances transitives comprises).
// À revoir après tout ajout de dépendance : la sortie du build en donne la liste.
const BIBLIOTHEQUES: [nom: string, licence: string, lien: string][] = [
  ['React et React DOM', 'MIT', 'https://react.dev'],
  ['React Router', 'MIT', 'https://reactrouter.com'],
  ['Firebase JavaScript SDK', 'Apache 2.0', 'https://firebase.google.com'],
  ['pitchy', 'MIT', 'https://github.com/ianprime0509/pitchy'],
  ['Tone.js', 'MIT', 'https://tonejs.github.io'],
  ['VexFlow', 'MIT', 'https://vexflow.com'],
  ['soundfont-player', 'MIT', 'https://github.com/danigb/soundfont-player'],
  ['Tailwind CSS', 'MIT', 'https://tailwindcss.com'],
]

function Lien({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="text-rhythm underline" rel="noreferrer noopener" target="_blank">
      {children}
    </a>
  )
}

export default function CreditsPage() {
  return (
    <PageLegale titre="Crédits">
      <Section titre="Sons">
        <P>
          Échantillons instrumentaux : University of Iowa Electronic Music Studios,
          <i> Musical Instrument Samples</i> (Lawrence Fritts) —{' '}
          <Lien href="https://theremin.music.uiowa.edu">theremin.music.uiowa.edu</Lien>
        </P>
        <P>
          Banques de sons d’instruments à vent : soundfont <b>Musyng Kite</b>, rendue et
          redistribuée par le projet{' '}
          <Lien href="https://github.com/gleitz/midi-js-soundfonts">midi-js-soundfonts</Lien>,
          sous licence{' '}
          <Lien href="https://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution — Partage dans les mêmes conditions 3.0</Lien>.
        </P>
      </Section>

      <Section titre="Polices">
        <P>
          <b>Inter</b> — The Inter Project Authors (Rasmus Andersson), SIL Open Font License 1.1.{' '}
          <Lien href="/fonts/OFL-Inter.txt">Texte de la licence</Lien>
        </P>
        <P>
          <b>Righteous</b> — Brian J. Bonislawsky, Astigmatic (AOETI), SIL Open Font License 1.1.{' '}
          <Lien href="/fonts/OFL-Righteous.txt">Texte de la licence</Lien>
        </P>
      </Section>

      <Section titre="Détection de hauteur">
        <P>
          L’analyse de la justesse repose sur <b>pitchy</b> (licence MIT), qui met en œuvre
          l’algorithme d’autocorrélation normalisée de McLeod. Aucun modèle d’apprentissage
          automatique n’est utilisé, et aucun son ne quitte l’appareil.
        </P>
      </Section>

      <Section titre="Bibliothèques">
        <Tableau
          entetes={['Bibliothèque', 'Licence', 'Source']}
          lignes={BIBLIOTHEQUES.map(([nom, licence, lien]) => [
            nom, licence, <Lien href={lien}>{lien.replace(/^https?:\/\//, '')}</Lien>,
          ])}
        />
        <P>
          Le texte intégral des licences, dépendances indirectes comprises, figure dans{' '}
          <Lien href="/THIRD_PARTY_NOTICES.txt">THIRD_PARTY_NOTICES.txt</Lien>.
        </P>
      </Section>

      <Section titre="Œuvres musicales">
        <P>
          Les exercices ne reproduisent aucune œuvre : les hauteurs et les formules rythmiques
          sont générées par l’application. Des noms de compositeurs apparaissent seulement comme
          réponses de quiz de culture musicale.
        </P>
      </Section>

      <DerniereMiseAJour />
    </PageLegale>
  )
}
