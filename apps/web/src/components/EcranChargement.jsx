// Écran de chargement partagé — repli de <Suspense> pendant le chargement d'un
// module, et état d'attente des routes protégées (qui rendaient `null`, donc un
// écran blanc).
//
// Volontairement calqué sur l'écran de démarrage inline d'index.html : mêmes
// points bleus, même rythme. La transition entre les deux passe inaperçue.

export default function EcranChargement() {
  return (
    <div className="bg-app min-h-dvh flex flex-col items-center justify-center gap-4">
      <div className="flex gap-2.5" role="status" aria-label="Chargement">
        {[0, 1, 2, 3].map(i => (
          <span
            key={i}
            style={{
              width: 11, height: 11, borderRadius: '50%',
              background: '#4A6CF7', display: 'block',
              animation: `boot-pulse 1.15s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
