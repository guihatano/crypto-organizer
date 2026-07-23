import { useState } from 'react'
import { ApiError } from '../api/client.ts'
import { useLogin, useSessionExpired } from '../hooks/useAuth.ts'

/**
 * Login card (AUTH-02, D-05 "Login" shell state). Wrong-credential copy is
 * intentionally generic and identical for an unknown username and a wrong
 * password — never hint at a failure counter or which field was wrong
 * (D-02 user-enumeration guard). The session-expired banner only appears
 * when the shell arrived here via a mid-session 401 (D-06), never on a
 * fresh first load.
 */
export function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const login = useLogin()
  const sessionExpired = useSessionExpired()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    login.mutate(
      { username, password },
      {
        onError: (err) => {
          setError(
            err instanceof ApiError && err.status === 401
              ? 'Usuário ou senha incorretos.'
              : 'Não foi possível entrar. Tente novamente.',
          )
        },
      },
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-(--color-bg) px-4">
      <div className="w-full max-w-sm rounded-lg border border-(--color-border) p-8">
        <h2 className="mb-4 text-lg font-semibold text-(--color-text)">Entrar</h2>

        {sessionExpired && (
          <p className="mb-4 text-sm text-(--color-text-muted)">Sua sessão expirou. Faça login novamente.</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-sm font-medium text-(--color-text)">
              Usuário
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              className="w-full rounded-md border border-(--color-border) px-3 py-2 text-sm focus:border-(--color-text-subtle) focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-(--color-text)">
              Senha
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-(--color-border) px-3 py-2 text-sm focus:border-(--color-text-subtle) focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="mt-1 text-sm text-(--color-destructive)">
                {error}
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={login.isPending}
              className="w-full cursor-pointer rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {login.isPending ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
