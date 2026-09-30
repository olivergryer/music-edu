// Domaine canonique — source unique.
//
// Il vit dans `seo/` et non dans `src/` parce qu'il n'est consommé qu'au BUILD
// (canonique, Open Graph, sitemap) : aucun code exécuté dans le navigateur n'a
// besoin d'une URL absolue, toutes les URL internes de l'app étant relatives.
// Le placer ici évite un pont ESM/TypeScript entre les scripts Node et Vite.
//
// Si un jour du code applicatif en a besoin, réexporter depuis `src/lib/` —
// ne pas recopier la valeur.
export const SITE_URL = 'https://tessitura-musique.fr'
