// Table des pages indexables — source unique consommée par scripts/seo-build.mjs.
//
// N'y figurent que les pages qui ont un sens pour un visiteur arrivant par un
// moteur de recherche. Sont donc EXCLUES :
//   - les routes réservées au développement (`IS_DEV` dans App.jsx) ;
//   - les routes protégées par authentification (/profil, /dashboard/*) ;
//   - /login, /register, /reinitialiser et /feedback, sans intérêt en recherche
//     et qui diluent le référencement ;
//   - les sous-activités d'Harmonie, qui ne s'atteignent que depuis /harmonie
//     et partageraient toutes la même intention de recherche.
//
// Toute route ajoutée ici doit exister dans App.jsx, sinon Vercel servira un
// HTML statique sur une URL que React redirigera aussitôt vers « / ».

export const ROUTES = [
  {
    path: '/',
    // Titre volontairement réduit à la marque. Le poids du référencement est
    // porté par les pages de module, dont les titres restent descriptifs, et par
    // la description ci-dessous — qui n'apparaît qu'en résultat de recherche,
    // jamais dans l'onglet du navigateur.
    title: 'Tessitura',
    description: 'Application gratuite d’exercices de rythme, de théorie musicale, de lecture de notes, d’harmonie et d’intonation. Entraînement progressif du cycle 1 au cycle 3, sans inscription.',
  },
  {
    path: '/rythme',
    title: 'Exercices de rythme en ligne — Tessitura',
    description: 'Exercices de reproduction et de reconnaissance rythmique du cycle 1 au cycle 3, avec analyse détaillée des erreurs de placement. Gratuit, sans inscription.',
  },
  {
    path: '/theorie',
    title: 'Quiz de théorie musicale par niveau — Tessitura',
    description: 'Quiz de théorie musicale organisés par niveau, du cycle 1 au cycle 3, en mode entraînement ou examen. Gratuit, sans inscription.',
  },
  {
    path: '/notes',
    title: 'Lecture de notes sur la portée — Tessitura',
    description: 'Entraînement à la lecture de notes en clé de sol, de fa et d’ut, avec une tessiture adaptable à son instrument. Gratuit, sans inscription.',
  },
  {
    path: '/harmonie',
    title: 'Exercices d’harmonie et de chiffrage — Tessitura',
    description: 'Reconnaissance de cadences et d’intervalles, dictée de basse, détection d’erreur et chiffrage d’accords, du plus simple au plus avancé. Gratuit, sans inscription.',
  },
  {
    path: '/accordeur',
    title: 'Accordeur en ligne gratuit — Tessitura',
    description: 'Un accordeur qui analyse la justesse de phrases entières, pas seulement de notes isolées. Le son est traité sur l’appareil et n’est jamais enregistré.',
  },
  {
    path: '/mentions-legales',
    title: 'Mentions légales — Tessitura',
    description: 'Informations légales sur l’éditeur et l’hébergement de Tessitura.',
  },
  {
    path: '/confidentialite',
    title: 'Confidentialité — Tessitura',
    description: 'Données traitées par Tessitura, stockage, durées de conservation et droits des utilisateurs.',
  },
  {
    path: '/credits',
    title: 'Crédits — Tessitura',
    description: 'Sons, polices, bibliothèques et œuvres utilisés dans Tessitura.',
  },
]
