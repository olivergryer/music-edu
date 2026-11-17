// Constantes partagées (miroir de accordeurUtils.js : HZ_MIN / HZ_MAX).
// Dupliquées ici pour que les modules purs n'importent pas le JS de l'Accordeur
// quand ce n'est pas nécessaire ; un test vérifie qu'elles restent identiques.
export const HZ_MIN = 60
export const HZ_MAX = 2000
