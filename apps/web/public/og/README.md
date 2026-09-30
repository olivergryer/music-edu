# Image Open Graph

Ce dossier doit contenir `og-default.png` : l'image affichée en aperçu quand un
lien vers Tessitura est partagé (messagerie, réseaux sociaux, ENT).

Elle est référencée en dur par `scripts/seo-build.mjs` sur **toutes** les pages.
Tant qu'elle manque, les aperçus s'affichent sans visuel.

## Format attendu

- **PNG**, exactement **1200 × 630 px** (ratio 1,91:1)
- **moins de 300 Ko** — au-delà, certains services renoncent à la charger
- texte lisible en petit : l'aperçu descend souvent à ~260 px de large dans un
  fil de discussion. Gros titre, peu de mots, fort contraste.
- pas de texte dans les 60 px du bord : les vignettes carrées rognent les côtés
- fond opaque — la transparence tombe sur du noir chez certains clients

## Après l'avoir déposée

Rien à faire côté code : le fichier est copié tel quel depuis `public/`.
Vérifier l'aperçu avec l'outil de débogage de partage de Facebook, qui garde
l'ancienne version en cache et demande un rafraîchissement explicite.
