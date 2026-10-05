import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore }

const config = {
  apiKey: "AIzaSyC62pz5jMjVuZ8GryITDPxBXBIN0UTHMR0",
  authDomain: "pantry-c7377.firebaseapp.com",
  projectId: "pantry-c7377",
  storageBucket: "pantry-c7377.firebasestorage.app",
  messagingSenderId: "476256572649",
  appId: "1:476256572649:web:af9c929e46080069510c78",
  measurementId: "G-B8GMM67EN0"
};

const isConfigured = Object.values(config).every(Boolean)
let services: FirebaseServices | null = null

export function getFirebaseServices(): FirebaseServices | null {
  if (!isConfigured) return null
  if (!services) {
    const app = getApps().length ? getApp() : initializeApp(config)
    services = { app, auth: getAuth(app), db: getFirestore(app) }
  }
  return services
}

export function isFirebaseConfigured() { return isConfigured }
