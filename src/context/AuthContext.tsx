import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { getFirebaseServices, isFirebaseConfigured } from '../lib/firebase'
import { AuthContext } from './authContextValue'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const isFirebaseActive = isFirebaseConfigured()

  useEffect(() => {
    if (!isFirebaseActive) {
      setUserId('local-user')
      setIsAuthLoading(false)
      return
    }

    const services = getFirebaseServices()
    if (!services) {
      setUserId('local-user')
      setIsAuthLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(
      services.auth,
      async (currentUser) => {
        if (currentUser) {
          setUser(currentUser)
          setUserId(currentUser.uid)
          setAuthError(null)
          setIsAuthLoading(false)
        } else {
          try {
            const credential = await signInAnonymously(services.auth)
            setUser(credential.user)
            setUserId(credential.user.uid)
            setAuthError(null)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Authentication initialization failed.'
            if (import.meta.env.DEV) {
              console.warn('[SmartPantry] Anonymous authentication could not complete:', message)
            }
            setAuthError(message)
            setUserId('local-user')
          } finally {
            setIsAuthLoading(false)
          }
        }
      },
      (error) => {
        const message = error.message || 'Authentication error occurred.'
        if (import.meta.env.DEV) {
          console.error('[SmartPantry] Auth state error:', message)
        }
        setAuthError(message)
        setUserId('local-user')
        setIsAuthLoading(false)
      }
    )

    return () => unsubscribe()
  }, [isFirebaseActive])

  return (
    <AuthContext.Provider
      value={{
        user,
        userId,
        isAuthLoading,
        authError,
        isFirebaseActive,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
