// DEMO ONLY: frontend session restoration is temporary browser storage convenience,
// NOT production authentication or security enforcement.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useDemoData } from './DemoData'
import {
  DEMO_SESSION_STORAGE_KEY,
  authenticateDefaultUserForRole,
  authenticateDemoUser,
  clearPersistedSession,
  loadPersistedSession,
  savePersistedSession,
  validateDemoSession
} from '../services/demoStorage'

const Ctx = createContext(null)

export function DemoSessionProvider({ children }) {
  const { users, organizations, registerActor } = useDemoData()
  const [rawSession, setRawSession] = useState(() => loadPersistedSession())

  const validation = useMemo(
    () => validateDemoSession(rawSession, { users, organizations }),
    [rawSession, users, organizations]
  )

  const activeSession = validation.valid ? validation.session : null
  const activeUser = validation.valid ? validation.user : null
  const activeOrganization = validation.valid ? validation.organization : null

  // Keep DemoData actor ref aligned synchronously on initial restore and every state change
  registerActor(activeSession)

  useEffect(() => {
    if (rawSession && !validation.valid) {
      clearPersistedSession()
      setRawSession(null)
    }
  }, [rawSession, validation.valid])

  useEffect(() => {
    function handleStorage(e) {
      if (e.key !== DEMO_SESSION_STORAGE_KEY && e.key !== null) return
      setRawSession(loadPersistedSession())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const logout = useCallback(() => {
    clearPersistedSession()
    registerActor(null)
    setRawSession(null)
  }, [registerActor])

  const loginWithUser = useCallback(
    userId => {
      const res = authenticateDemoUser(userId, { users, organizations })
      if (!res.ok) return res
      savePersistedSession(undefined, res.session)
      registerActor(res.session)
      setRawSession(res.session)
      return { ok: true, session: res.session, user: res.user, organization: res.organization }
    },
    [users, organizations, registerActor]
  )

  const loginWithRole = useCallback(
    roleKey => {
      if (!roleKey) {
        logout()
        return { ok: true, session: null }
      }
      const res = authenticateDefaultUserForRole(roleKey, { users, organizations })
      if (!res.ok) return res
      savePersistedSession(undefined, res.session)
      registerActor(res.session)
      setRawSession(res.session)
      return { ok: true, session: res.session, user: res.user, organization: res.organization }
    },
    [users, organizations, logout, registerActor]
  )

  const value = useMemo(
    () => ({
      initialized: true,
      session: activeSession,
      role: activeSession?.role ?? null,
      userId: activeSession?.userId ?? null,
      orgId: activeSession?.orgId ?? null,
      user: activeUser,
      organization: activeOrganization,
      loginWithUser,
      loginWithRole,
      setRole: loginWithRole,
      logout
    }),
    [activeSession, activeUser, activeOrganization, loginWithUser, loginWithRole, logout]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useDemoSession = () => useContext(Ctx)
