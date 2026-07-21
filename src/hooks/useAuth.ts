import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiClient, registerUnauthorizedHandler, type AuthStatus } from '../api/client.ts'

export interface SetupInput {
  username: string
  password: string
}

export interface LoginInput {
  username: string
  password: string
}

const AUTH_STATUS_KEY = ['auth-status'] as const
const SESSION_EXPIRED_KEY = ['session-expired'] as const

/**
 * D-06: called once by the registered global-401 handler. Marks the
 * cached auth-status as unauthenticated (without waiting for a refetch)
 * and flips the session-expired flag so LoginForm can show the
 * "Sua sessão expirou" banner — but only for this mid-session-kick path,
 * never on a fresh first load.
 */
function handleUnauthorized(queryClient: QueryClient) {
  queryClient.setQueryData<AuthStatus>(AUTH_STATUS_KEY, (old) => ({
    setup_required: old?.setup_required ?? false,
    authenticated: false,
  }))
  queryClient.setQueryData<boolean>(SESSION_EXPIRED_KEY, true)
}

/**
 * Drives the App.tsx shell state machine (D-05). staleTime: 0 so a
 * mid-session 401's cache write (see handleUnauthorized) is never masked
 * by a stale cached "authenticated: true" — but the write itself is
 * synchronous via setQueryData, so the UI updates immediately regardless.
 */
export function useAuthStatus() {
  const queryClient = useQueryClient()

  // Registered once per app mount: apiClient has no access to
  // queryClient on its own, so the global-401 handler is wired up here,
  // the single place useAuthStatus (and therefore the shell) is mounted.
  useEffect(() => {
    registerUnauthorizedHandler(() => handleUnauthorized(queryClient))
  }, [queryClient])

  return useQuery({
    queryKey: AUTH_STATUS_KEY,
    queryFn: () => apiClient.get<AuthStatus>('/auth/status'),
    staleTime: 0,
  })
}

/**
 * A real 401 kick (D-06) sets this true so LoginForm renders the
 * session-expired banner. Cleared on a fresh successful login (useLogin)
 * so the banner never lingers into the next session.
 */
export function useSessionExpired() {
  return useQuery({
    queryKey: SESSION_EXPIRED_KEY,
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
  }).data
}

export function useSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SetupInput) =>
      apiClient.post<{ ok: true; username: string }>('/auth/setup', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY })
    },
  })
}

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: LoginInput) => apiClient.post<{ ok: true }>('/auth/login', input),
    onSuccess: () => {
      // A fresh successful login is not a 401-kick — clear any stale
      // session-expired flag before the shell re-renders as the app.
      queryClient.setQueryData<boolean>(SESSION_EXPIRED_KEY, false)
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.post<{ ok: true }>('/auth/logout', {}),
    onSettled: () => {
      // Best-effort per UI-SPEC: once the user asked to log out, drop to
      // Login on success OR failure. Not a 401 kick — no banner.
      queryClient.setQueryData<AuthStatus>(AUTH_STATUS_KEY, (old) => ({
        setup_required: old?.setup_required ?? false,
        authenticated: false,
      }))
    },
  })
}
