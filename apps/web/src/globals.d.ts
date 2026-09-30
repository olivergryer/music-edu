// Constantes injectées par Vite (`define` dans vite.config.js).
// Jusqu'ici seuls des fichiers .jsx les utilisaient, où TypeScript ne vérifie
// rien ; les déclarer permet de s'en servir depuis du .ts/.tsx.

/** Date ISO du dernier commit au moment du build. Chaîne vide hors dépôt git. */
declare const __BUILD_DATE__: string

/** Version applicative issue de version.json (ex. « 0.13.0 »). */
declare const __APP_VERSION__: string
