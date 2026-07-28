# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.



# Skills and plugins

# Everything Claude Code
https://github.com/affaan-m/everything-claude-code

# Claude Mem
https://github.com/thedotmack/claude-mem

# UI UX Pro Max
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

# Marketplace Claude Code

frontend-backend design

figma



# Conseils Deigns

Contexte : inline styles partout, dark theme, tablette-first, solo dev. Options réalistes :

1. /ui-ux-pro-max (skill dispo ici)
Analyse directement le code existant → suggestions concrètes UX/UI sans quitter le projet. Bon pour améliorations incrémentales.

2. /everything-claude-code:design-system
Extrait les constantes de tes inline styles (#030712, #c084fc, 8px, etc.) → objet tokens centralisé. Rend les modifs globales instantanées.

3. Figma (MCP intégré)
Crée des maquettes → /figma:figma-implement-design génère le code. Idéal si tu veux retravailler une page entière visuellement avant de coder.

4. /everything-claude-code:liquid-glass-design
Style glassmorphism moderne — pertinent pour une app musicale.

Recommandation pour toi :

Priorité d'abord → /ui-ux-pro-max sur les pages clés (Hub, DashboardEleve, FeedbackPage) pour identifier les problèmes concrets UX sans overhead. Ensuite si refonte visuelle souhaitée → Figma + /figma:figma-implement-design.

Le design system vaut le coup dès que les retours testeurs arrivent et que tu veux itérer vite sur le style global.





# Command pour commit and push sur GitHub puis Vercel (original)

cd ..
cd ..
git add .
git commit -m "V2 - Modules générateurs accords et exercice gamme"
git push
cd apps/web



# Workflow Dev puis Main

# Tu travailles toujours sur dev
git checkout dev
git add -A
git commit -m "V7 - déploiement sur Dev"
git push



# Merge Dev sur Main
git checkout main && git merge dev --ff-only && git push && git checkout dev && npm run release


# Si erreur et push sur Main
git checkout dev && git rebase main



# Supprimer les infos de téléchargements PWA ou non

# DevTools console (F12) sur tessitura.app ou URL preview :
localStorage.removeItem('pwa-tuto-hub-off')
localStorage.removeItem('pwa-tuto-dash-off')
localStorage.removeItem('pwa-tuto-dash-last')
localStorage.removeItem('pwa-inapp-off')
location.reload()