// Accès applicatif au domaine canonique.
//
// La valeur n'est PAS redéfinie ici : elle est réexportée depuis `seo/site.mjs`,
// qui sert aussi aux scripts de build (canonique, Open Graph, sitemap). Recopier
// la chaîne des deux côtés, c'est garantir qu'un jour l'une des deux sera oubliée.

export { SITE_URL } from '../../seo/site.mjs'

import { SITE_URL as URL_SITE } from '../../seo/site.mjs'

/** Domaine seul, sans protocole — pour l'afficher à l'écran (« ouvre X dans Chrome »). */
export const SITE_HOST: string = String(URL_SITE).replace(/^https?:\/\//, '')
