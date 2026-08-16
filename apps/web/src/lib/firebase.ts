import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBs3DRuUJvr80R4iJ_4a90ospHqiSLdxRE",
  authDomain: "tessitura-97d58.firebaseapp.com",
  projectId: "tessitura-97d58",
  storageBucket: "tessitura-97d58.firebasestorage.app",
  messagingSenderId: "211925432785",
  appId: "1:211925432785:web:d974982c90f67541b288f0"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Cache local persistant (IndexedDB) — indispensable au fonctionnement hors ligne.
// Sans lui : `getDoc` ne répond pas, `onSnapshot` ne se déclenche jamais, et les
// écritures restent en suspens → la progression était perdue en silence et les
// écrans de fin de session se figeaient.
//
// `persistentMultipleTabManager` permet plusieurs onglets sur le même appareil.
// Si IndexedDB est indisponible (navigation privée sur certains navigateurs,
// stockage saturé), on retombe sur un Firestore en mémoire : l'appli reste
// utilisable en ligne, elle perd seulement le hors-ligne.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch (err) {
    console.warn('Firestore : cache persistant indisponible, mode mémoire.', err)
    return initializeFirestore(app, {})
  }
}

export const db = createDb()
