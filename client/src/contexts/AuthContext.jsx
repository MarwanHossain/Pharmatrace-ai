// PharmaTrace AI — Real Backend Administrator Authentication Context
// Strictly manages authenticated session state in memory (zero localStorage/sessionStorage persistence)

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')

  const clearSession = useCallback(() => {
    setAdminUser(null)
    setCurrentUser(null)
    setIsAuthenticated(false)
    setSessionError('')
  }, [])

  const checkSession = useCallback(async () => {
    try {
      const res = await api.get('/v1/auth/me')
      const user = res.data?.user || res.user
      if (user) {
        setCurrentUser(user)
        if (user.role === 'admin') {
          setAdminUser(user)
        } else {
          setAdminUser(null)
        }
        setIsAuthenticated(true)
        setSessionError('')
        return { ok: true, user }
      } else {
        clearSession()
        return { ok: false, error: 'NO_USER' }
      }
    } catch (err) {
      clearSession()
      return { ok: false, error: err.code || err.message }
    } finally {
      setIsLoading(false)
    }
  }, [clearSession])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const login = useCallback(async (email, password) => {
    setSessionError('')
    try {
      const res = await api.post('/v1/auth/login', { email, password })
      const user = res.data?.user || res.user
      if (!user) {
        clearSession()
        const err = new Error('Authentication failed.')
        err.code = 'AUTH_FAILED'
        throw err
      }
      setCurrentUser(user)
      if (user.role === 'admin') {
        setAdminUser(user)
      } else {
        setAdminUser(null)
      }
      setIsAuthenticated(true)
      return { ok: true, user }
    } catch (err) {
      clearSession()
      throw err
    }
  }, [clearSession])

  const logout = useCallback(async () => {
    try {
      await api.post('/v1/auth/logout', {})
    } catch {
      // Ignore network failures on logout
    } finally {
      clearSession()
    }
  }, [clearSession])

  return (
    <AuthContext.Provider
      value={{
        adminUser,
        currentUser,
        isAuthenticated,
        isLoading,
        sessionError,
        setSessionError,
        login,
        logout,
        clearSession,
        checkSession
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
