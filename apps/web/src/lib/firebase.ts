import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
export const db = getFirestore(app)
