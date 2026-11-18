// Visibilité de la page « Accordeur accompagné » : dev et préversion (IS_DEV) tant que
// `ACCOMPAGNE_VISIBLE` vaut false. Passer à true pour ouvrir la page à tous en production.
import { IS_DEV } from '../../isDev'

export const ACCOMPAGNE_VISIBLE = false
export const ACCOMPAGNE_ACCESSIBLE: boolean = IS_DEV || ACCOMPAGNE_VISIBLE
