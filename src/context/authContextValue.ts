import { createContext } from 'react'
import type { User } from 'firebase/auth'

export interface AuthContextValue {
  user: User | null
  userId: string | null
  isAuthLoading: boolean
  authError: string | null
  isFirebaseActive: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
