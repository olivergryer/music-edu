// ─── Fiche des chiffrages du module Harmonie — générateur ────────────────────
//
// Produit `docs/chiffrages-harmonie.pdf` DEPUIS LE CODE, jamais à la main : le
// jour où `chiffrage.ts`, `gabarits.ts` ou `niveaux.ts` bougent, il suffit de
// relancer le script pour que la fiche redevienne juste. Une fiche retapée à la
// main diverge en silence, et c'est un document que des élèves auront en main.
//
//   npm run generate:chiffrages        (depuis apps/web/)
//
// Rendu PDF par Chrome en mode headless — aucune dépendance npm ajoutée.

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chiffrageDe, romainChiffre } from '../src/modules/harmonie/chiffrage.ts'
import { parseGabarit } from '../src/modules/harmonie/gabarits.ts'
import { NIVEAUX } from '../src/modules/harmonie/niveaux.ts'
import {
  DEGRES,
  creerAccord,
  qualite,
  type Accord,
  type Degre,
  type Mode,
  type Renversement,
} from '../src/modules/harmonie/types.ts'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../../..')
const SORTIE_PDF = resolve(RACINE, 'docs/chiffrages-harmonie.pdf')
const SORTIE_HTML = resolve(ICI, '../.chiffrages-tmp.html')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const MODES: Mode[] = ['majeur', 'mineur']
const RENVERSEMENTS: Renversement[] = [0, 1, 2, 3]

const NOMS_RENVERSEMENT = [
  'état fondamental',
  '1er renversement',
  '2e renversement',
  '3e renversement',
]

const LIBELLE_QUALITE: Record<string, string> = {
  M: 'majeur',
  m: 'mineur',
  dim: 'diminué',
  aug: 'augmenté',
}

const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const accord = (degre: Degre, renversement: Renversement, septieme: boolean): Accord =>
  creerAccord(0, { degre, renversement, septieme })

/** Les chiffres seuls, empilés. */
function figure(a: Accord): string {
  const etages = chiffrageDe(a)
    .etages.map((e) => `<span>${echapper(e)}</span>`)
    .join('')
  return `<span class="pile">${etages}</span>`
}

/** Chiffre romain + chiffres empilés. */
function chiffrageComplet(a: Accord, mode: Mode): string {
  return `<span class="ch"><span class="rom">${echapper(
    romainChiffre(a.degre, mode),
  )}</span>${figure(a)}</span>`
}

// ─── Sections ────────────────────────────────────────────────────────────────

function sectionTable(): string {
  const troisSons = RENVERSEMENTS.filter((r) => r !== 3)
    .map(
      (r) => `<tr>
        <td class="fig">${figure(accord(1, r, false))}</td>
        <td>${NOMS_RENVERSEMENT[r]}</td>
      </tr>`,
    )
    .join('')

  // V7 en do : sol si ré fa. Ce qui rend la table lisible, c'est de dire OÙ est
  // la sensible — le « + » la marque, le chiffre dit à quel intervalle.
  const OU_EST_LA_SENSIBLE = [
    'basse <b>sol</b> — la sensible est à la tierce, marquée par le « + » seul',
    'basse <b>si</b> — la sensible <em>est</em> la basse : on note alors la quinte diminuée si–fa',
    'basse <b>ré</b> — la sensible est à la sixte',
    'basse <b>fa</b> — la sensible est à la quarte augmentée fa–si',
  ]

  const dominante = RENVERSEMENTS.map(
    (r) => `<tr>
      <td class="fig">${figure(accord(5, r, true))}</td>
      <td>${NOMS_RENVERSEMENT[r]}</td>
      <td class="ou">${OU_EST_LA_SENSIBLE[r]}</td>
    </tr>`,
  ).join('')

  const ordinaires = RENVERSEMENTS.map(
    (r) => `<tr>
      <td class="fig">${figure(accord(2, r, true))}</td>
      <td>${NOMS_RENVERSEMENT[r]}</td>
    </tr>`,
  ).join('')

  return `<h2>1 · La table des chiffrages</h2>
  <p>Les chiffres notent les intervalles <strong>au-dessus de la basse</strong> — c'est la
  convention française. Ils ne disent donc pas le degré, mais quel son de l'accord est descendu
  à la basse.</p>

  <h3>Trois sons</h3>
  <table class="compact"><tbody>${troisSons}</tbody></table>

  <h3>Quatre sons — septième de dominante</h3>
  <p>Le <strong>+</strong> marque la <strong>sensible</strong>, et le chiffre dit à quel intervalle
  elle se trouve au-dessus de la basse. C'est ce qui rend la table cohérente plutôt qu'arbitraire.
  Exemple sur V<sup>7</sup> en do majeur — <em>sol si ré fa</em>, sensible = <b>si</b> :</p>
  <table class="compact"><tbody>${dominante}</tbody></table>

  <h3>Quatre sons — septièmes ordinaires</h3>
  <p>Sur toute septième qui n'est pas celle de dominante (ii<sup>7</sup> au niveau 6,
  IV<sup>7</sup> au niveau 7), ni « + » ni quinte barrée : il n'y a ni sensible ni quinte
  diminuée à signaler.</p>
  <table class="compact"><tbody>${ordinaires}</tbody></table>`
}

function tableDegres(mode: Mode): string {
  const colonnes: { renversement: Renversement; septieme: boolean }[] = [
    { renversement: 0, septieme: false },
    { renversement: 1, septieme: false },
    { renversement: 2, septieme: false },
    { renversement: 0, septieme: true },
    { renversement: 1, septieme: true },
    { renversement: 2, septieme: true },
    { renversement: 3, septieme: true },
  ]

  const entetes = colonnes
    .map((c) => `<th>${c.septieme ? '7<sup>e</sup> ' : ''}${c.renversement}</th>`)
    .join('')

  const lignes = DEGRES.map((degre: Degre) => {
    const q = qualite(mode, degre)
    const cellules = colonnes
      .map((c) => {
        const a = accord(degre, c.renversement, c.septieme)
        // Contrainte dure n°2 : aucun accord diminué à l'état fondamental.
        const interdit = c.renversement === 0 && q === 'dim'
        return `<td class="fig${interdit ? ' interdit' : ''}">${chiffrageComplet(a, mode)}</td>`
      })
      .join('')

    return `<tr>
      <th class="degre">${echapper(romainChiffre(degre, mode))}</th>
      <td class="qualite">${LIBELLE_QUALITE[q] ?? q}</td>
      ${cellules}
    </tr>`
  }).join('')

  return `<h3>${mode === 'majeur' ? 'Mode majeur' : 'Mode mineur (harmonique)'}</h3>
  <table class="degres">
    <thead><tr><th>Degré</th><th>Qualité</th>${entetes}</tr></thead>
    <tbody>${lignes}</tbody>
  </table>`
}

function sectionDegres(): string {
  return `<h2>2 · Les sept degrés, chiffrés</h2>
  <p>La casse et le « ° » se <strong>déduisent de la qualité</strong> de l'accord : capitales pour
  les majeurs, minuscules pour les mineurs et les diminués, « ° » sur les diminués. Ils ne sont
  jamais choisis à la main. Les colonnes donnent les quatre renversements, à trois puis à quatre
  sons.</p>
  ${MODES.map(tableDegres).join('')}
  <p class="note"><span class="pastille"></span> Grisé : interdit par la contrainte dure n° 2,
  <em>aucun accord diminué à l'état fondamental</em>. Le chiffrage reste donné pour la lecture,
  mais le générateur ne le produit jamais.</p>
  <p class="note">Seule la ligne du <strong>V</strong> porte le « + » et la quinte barrée : V est
  majeur dans les deux modes — en mineur grâce à la sensible haussée — et c'est le seul degré dont
  la septième soit celle de dominante.</p>
  <p class="note">En mineur, le III est bâti sur le 7<sup>e</sup> degré <strong>naturel</strong>
  alors que V et vii° portent la sensible haussée : c'est pour cela qu'il est majeur et non
  augmenté.</p>`
}

function sectionNiveaux(): string {
  const lignes = NIVEAUX.map((spec) => {
    const vocabulaire = MODES.map(
      (mode) =>
        `<div class="voc"><span class="mode">${mode.slice(0, 3)}.</span> ` +
        spec.vocabulaire.map((d) => echapper(romainChiffre(d, mode))).join(' · ') +
        '</div>',
    ).join('')

    const septieme =
      spec.septiemeSur.length === 0
        ? '<span class="vide">aucune</span>'
        : spec.septiemeSur.map((d) => echapper(romainChiffre(d, 'majeur'))).join(' · ')

    const finales =
      spec.finales.length === 0
        ? '<span class="vide">libre</span>'
        : spec.finales.map((d) => echapper(romainChiffre(d, 'majeur'))).join(' · ')

    return `<tr>
      <th>${spec.niveau}</th>
      <td>${spec.regime}</td>
      <td>${spec.tache.replace(/_/g, ' ')}</td>
      <td>${vocabulaire}</td>
      <td class="fig">${spec.renversements.join(' · ')}</td>
      <td class="fig">${septieme}</td>
      <td class="fig">${spec.longueur[0]}–${spec.longueur[1]}</td>
      <td class="fig">${finales}</td>
    </tr>`
  }).join('')

  return `<h2>3 · Ce que chaque niveau autorise</h2>
  <table class="niveaux">
    <thead><tr>
      <th>Niv.</th><th>Régime</th><th>Tâche</th><th>Vocabulaire</th>
      <th>Renv.</th><th>Septième sur</th><th>Long.</th><th>Finales</th>
    </tr></thead>
    <tbody>${lignes}</tbody>
  </table>
  <p class="note">Le vocabulaire du niveau 4 <strong>resserre</strong> volontairement par rapport
  au niveau 3 : la discrimination y porte sur la basse, pas sur le degré. C'est la seule rupture
  de la croissance par inclusion, et elle est intentionnelle.</p>`
}

function sectionGabarits(): string {
  const blocs = NIVEAUX.filter((s) => s.gabarits && s.gabarits.length > 0)
    .map((spec) => {
      const lignes = spec
        .gabarits!.map((gabarit) => {
          const accords = parseGabarit(gabarit)
          const rendus = MODES.map(
            (mode) =>
              `<td class="fig">${accords.map((a) => chiffrageComplet(a, mode)).join('<span class="sep">–</span>')}</td>`,
          ).join('')
          return `<tr><td class="source">${echapper(gabarit)}</td>${rendus}</tr>`
        })
        .join('')

      return `<h3>Niveau ${spec.niveau}</h3>
      <table class="gabarits">
        <thead><tr><th>Écriture du gabarit</th><th>En majeur</th><th>En mineur</th></tr></thead>
        <tbody>${lignes}</tbody>
      </table>`
    })
    .join('')

  return `<h2>4 · Les formules (niveaux 2 à 5)</h2>
  <p>Les niveaux 2 à 5 sont engendrés par formules, sans matrice de transition. Le gabarit est
  écrit une fois ; sa lecture en majeur et en mineur donne des chiffrages différents, puisque la
  casse suit la qualité.</p>
  ${blocs}
  <p class="note">La colonne de gauche est la <strong>syntaxe de saisie</strong> des formules, en
  ASCII — elle n'a pas à ressembler à la notation affichée. <code>V7</code>, <code>V+6</code> et
  <code>V+4</code> y désignent la septième de dominante et ses renversements.</p>
  <p class="note">En mineur, le <code>II</code> de <code>I-VI-II-V</code> est diminué : le
  générateur le promeut au premier renversement pour respecter la contrainte n° 2, bien que le
  niveau 3 n'enseigne pas encore les renversements. L'alternative était musicalement fausse.</p>`
}

function sectionNotes(): string {
  return `<h2>5 · À savoir</h2>
  <ul>
    <li><strong>Le 6/4 est cadentiel</strong> jusqu'au niveau 6 inclus : il n'apparaît que sur un
    temps fort, suivi de V. Au niveau 7 la restriction saute — cadentiel contre passage devient
    justement la discrimination du niveau.</li>
    <li><strong>Jamais trois fois le même degré</strong> de suite.</li>
    <li><strong>Le suffixe <code>~</code></strong> ne relève d'aucune convention d'écriture. Il
    marque un accord dont la qualité a été inversée par le moteur de perturbation — un accord hors
    tonalité, donc non chiffrable. Il n'apparaît qu'au feedback de la détection d'erreur, jamais
    dans une progression à lire. Un tel accord retombe sur les chiffres ordinaires : la bascule
    majeur → mineur détruit la sensible, le « + » n'aurait plus rien à marquer.</li>
    <li><strong>Le niveau 8</strong> (degrés secondaires) est déclaré mais pas encore engendré.</li>
  </ul>`
}

// ─── Assemblage ──────────────────────────────────────────────────────────────

const date = new Date().toLocaleDateString('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Chiffrages — module Harmonie</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10pt; line-height: 1.45; color: #16181d; margin: 0;
  }
  h1 { font-size: 20pt; margin: 0 0 2mm; letter-spacing: -0.01em; }
  h2 {
    font-size: 13pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm;
    border-bottom: 1.5px solid #7c3aed; color: #4c1d95; break-after: avoid;
  }
  h3 { font-size: 11pt; margin: 5mm 0 2mm; color: #4c1d95; break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  ul { margin: 0 0 2.5mm; padding-left: 5mm; }
  li { margin-bottom: 1.5mm; }
  .sous-titre { color: #5b6070; font-size: 9pt; margin-bottom: 6mm; }
  table {
    width: 100%; border-collapse: collapse; margin: 0 0 3mm;
    font-size: 9pt; break-inside: avoid;
  }
  th, td {
    border: 0.5px solid #cfd3dc; padding: 1.6mm 2mm; text-align: left;
    vertical-align: middle;
  }
  thead th {
    background: #f2eefc; color: #4c1d95; font-weight: 600;
    font-size: 8.5pt; white-space: nowrap;
  }
  tbody th { background: #faf8ff; font-weight: 600; }
  .compact td:first-child { width: 22mm; text-align: center; }
  .compact td:nth-child(2) { width: 38mm; }
  .fig { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ou { color: #5b6070; font-size: 8.5pt; }

  /* Le chiffrage empilé : chiffre romain, puis les étages superposés. */
  .ch { display: inline-flex; align-items: center; gap: 0.6mm; }
  .rom { font-size: 10.5pt; font-weight: 600; }
  .pile {
    display: inline-flex; flex-direction: column; align-items: center;
    line-height: 1.02; font-size: 7.5pt; font-weight: 500;
  }
  .compact .pile { font-size: 11pt; }
  .sep { color: #9aa0ac; margin: 0 1mm; font-size: 9pt; }

  .degre { font-size: 11pt; }
  .qualite { color: #5b6070; font-size: 8.5pt; }
  .interdit { background: #eceef2; }
  .interdit .ch { opacity: 0.42; }
  .vide { color: #9aa0ac; font-style: italic; }
  .source {
    font-family: 'SF Mono', Menlo, monospace; font-size: 8.5pt;
    font-weight: 600; background: #faf8ff; white-space: nowrap;
  }
  .voc { white-space: nowrap; }
  .voc .mode { color: #9aa0ac; font-size: 8pt; display: inline-block; width: 7mm; }
  .note { font-size: 8.5pt; color: #5b6070; }
  .pastille {
    display: inline-block; width: 3mm; height: 3mm; background: #eceef2;
    border: 0.5px solid #cfd3dc; vertical-align: -0.3mm; margin-right: 1mm;
  }
  code { font-family: 'SF Mono', Menlo, monospace; font-size: 8.5pt; background: #f4f5f7; padding: 0 1mm; }
  footer { margin-top: 8mm; padding-top: 2mm; border-top: 0.5px solid #cfd3dc;
           font-size: 7.5pt; color: #9aa0ac; }
</style></head><body>
<h1>Chiffrages — module Harmonie</h1>
<div class="sous-titre">Tessitura · notation française académique · fiche générée depuis le code le ${date}</div>
${sectionTable()}
${sectionDegres()}
${sectionNiveaux()}
${sectionGabarits()}
${sectionNotes()}
<footer>
  Document généré par <code>apps/web/scripts/generer-chiffrages.ts</code> à partir de
  <code>chiffrage.ts</code>, <code>gabarits.ts</code>, <code>niveaux.ts</code> et
  <code>contraintes.ts</code>. Ne pas éditer à la main — relancer le script.
</footer>
</body></html>`

writeFileSync(SORTIE_HTML, html, 'utf8')
mkdirSync(dirname(SORTIE_PDF), { recursive: true })

try {
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${SORTIE_PDF}`,
      `file://${SORTIE_HTML}`,
    ],
    { stdio: 'pipe' },
  )
} finally {
  rmSync(SORTIE_HTML, { force: true })
}

console.log(`Fiche écrite : ${SORTIE_PDF}`)
