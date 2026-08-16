import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// L'enregistrement du service worker vit dans index.html : il s'exécute sans
// attendre l'analyse du bundle, et n'était dupliqué ici que par accident.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
