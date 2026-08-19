# Harmonie — le double découpage niveaux × activités

Note de conception, écrite le 2026-08-19 à la demande de Matthieu. **Aucun code n'a été touché** :
c'est un état des lieux et trois organisations possibles, à trancher avant d'y toucher.

## Le problème, dit simplement

Le module a **deux axes** qui ne se recouvrent pas :

- un **barème** de 0 à 8, qui décrit une progression pédagogique (`niveaux.ts`) ;
- sept **activités**, chacune avec sa route, son écran et sa mécanique de réponse.

L'élève, lui, voit une liste d'activités sur `/harmonie`, puis **un sélecteur de niveau à l'intérieur
de chacune** — dont les valeurs ne sont pas les mêmes d'une activité à l'autre. La détection propose
3 à 7, le flux 6 et 7, le binaire 2, 4, 5, la dictée aucun choix (c'est le niveau 1), les cadences
deux « paliers » qui ne sont pas des niveaux. **Le même mot, « niveau », ne désigne pas la même chose
d'un écran à l'autre**, et rien à l'écran ne dit qu'un niveau 4 en binaire et un niveau 4 en détection
sont le même point du barème.

| Niveau | Ce que le barème demande | Activité(s) qui le couvrent |
|---|---|---|
| 0 | majeur ou mineur | **aucune** |
| 1 | dictée de basse | dictée |
| 2 | dominante / sous-dominante | binaire |
| 3 | type de cadence | cadences · détection |
| 4 | fondamental / renversé | binaire · détection |
| 5 | avec / sans septième | binaire · détection |
| 6 | chiffrage complet | flux · détection |
| 7 | 6/4 et III | flux · détection |
| 8 | degrés secondaires | non générable |
| — | intervalles | intervalles (hors barème) |

Trois symptômes se lisent directement dans ce tableau : **le niveau 0 n'a aucune porte d'entrée**, le
**niveau 8 est déclaré mais non générable**, et **les intervalles flottent hors barème** — ce qui
oblige déjà les clés Firestore à être préfixées (`basse:1`, `cadences:tout`, `intervalles:moyen`)
tandis que la détection garde la clé historique nue (`"4"`).

## Ce qui est sain et qu'il ne faut pas casser

- **Une activité = une page = une route.** Ça évite les en-têtes empilés et permet à chaque écran
  d'avoir sa propre mécanique de saisie. Aucune des trois pistes ci-dessous n'y touche.
- **Les clés `levels` préfixées.** Elles supportent déjà plusieurs axes. Une réorganisation qui
  changerait les clés effacerait la progression des élèves : à éviter, ou à migrer explicitement.
- **`NIVEAUX` comme source de vérité du contenu.** Le vocabulaire, les renversements et les septièmes
  d'un niveau sont ce qui garantit que rien d'illisible n'est montré. C'est un acquis.

## Trois pistes

### A — Le parcours : l'élève choisit un NIVEAU, pas une activité

`/harmonie` liste 0 → 7. On choisit un niveau, et le module propose la ou les activités qui le
couvrent — la première par défaut, l'autre en « autre exercice ».

- **Pour** : le double découpage disparaît de la vue de l'élève. Le barème redevient ce qu'il est,
  une progression. Le niveau 0 manquant et le 8 non générable deviennent visibles, donc traités.
- **Contre** : demande de remplir le niveau 0 (l'exercice à trous « majeur ou mineur », déjà au
  « Suite » du module) et de décider quoi faire du 8. Les intervalles, hors barème, ont besoin d'une
  entrée à part — « en plus du parcours ».
- **Coût** : un écran de plus, aucun changement de clé Firestore. Les pages d'activité reçoivent leur
  niveau par la route au lieu d'un sélecteur interne.

### B — Le geste : regrouper par ce que l'élève FAIT

Trois familles : **reconnaître** (binaire, cadences, intervalles) · **écrire** (dictée, flux) ·
**vérifier** (détection). Le niveau reste un réglage interne.

- **Pour** : c'est le découpage le plus lisible pour qui ouvre l'app sans rien savoir ; les
  mécaniques de saisie se ressemblent à l'intérieur d'une famille.
- **Contre** : ça **n'élimine pas** le double découpage, ça le déplace d'un cran. Le barème reste
  invisible et les trous restent des trous.
- **Coût** : faible — c'est un regroupement d'écran d'accueil. C'est aussi le moins ambitieux.

### C — Deux entrées assumées : « Progresser » et « S'entraîner »

`/harmonie` offre deux portes. **Progresser** = le parcours de la piste A, avec un niveau courant
retenu et une seule activité proposée à la fois. **S'entraîner** = la liste actuelle des sept
activités, tous niveaux ouverts, hors progression.

- **Pour** : les deux publics sont servis sans compromis — l'élève qui suit un cours, et le prof (ou
  l'élève avancé) qui veut cibler un exercice précis. Le double découpage cesse d'être une confusion
  et devient un choix explicite, énoncé à l'entrée.
- **Contre** : deux chemins à maintenir, et il faut décider si « s'entraîner » compte au barème (je
  proposerais **non** : même clé `levels`, mais pas de progression de niveau — sinon les deux portes
  se contredisent).
- **Coût** : le plus élevé des trois, mais additif : la porte « s'entraîner » **est** l'écran
  d'aujourd'hui, inchangé.

## Ce que je recommanderais

**C**, en la construisant dans l'ordre : d'abord la piste A comme porte « Progresser » (elle a la
vraie valeur pédagogique), l'écran actuel devenant la porte « S'entraîner » sans être retouché. Ça
n'oblige à trancher le sort du niveau 8 que le jour où le parcours y arrive.

Deux préalables indépendants de la piste retenue, parce qu'ils font mal dans les trois :

1. **Remplir le niveau 0** — c'est la première marche, et elle manque.
2. **Uniformiser les clés `levels`** en préfixant aussi la détection (`detection:4`), avec une
   migration qui lit l'ancienne clé nue. Sans ça, tout écran d'historique devra connaître l'exception.

## Une question de vocabulaire, à trancher en même temps

Le projet distingue déjà **Rang** (l'XP, cross-module) et **Niveau** (le cycle scolaire C1/1…C3) —
c'est écrit dans le `CLAUDE.md`. Or Harmonie appelle « niveau » son barème 0-8, qui n'est **ni** l'un
**ni** l'autre. Trois notions, deux mots. Quelle que soit la piste retenue, il faudra un troisième
terme pour le barème d'Harmonie — « palier » est déjà employé en interne par les cadences, et
conviendrait.
