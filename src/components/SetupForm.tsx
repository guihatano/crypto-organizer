import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'
import { useSetup } from '../hooks/useAuth.ts'

/**
 * One-time setup card (AUTH-01, D-05 "Setup" shell state). The server is
 * the sole gate on whether this screen is reachable (setup_required) — a
 * concurrent 409 (race: another tab/session already created the account)
 * re-fetches auth-status so the shell transitions straight to Login
 * instead of showing a dead-end error.
 */
export function SetupForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const setup = useSetup()
  const queryClient = useQueryClient()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)
    setFormError(null)

    if (!username.trim()) {
      setFieldError('Informe um usuário.')
      return
    }
    if (password.length < 8) {
      setFieldError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setFieldError('As senhas não coincidem.')
      return
    }

    setup.mutate(
      { username: username.trim(), password },
      {
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setFormError('Uma conta já foi criada.')
            queryClient.invalidateQueries({ queryKey: ['auth-status'] })
            return
          }
          setFormError('Não foi possível criar a conta. Tente novamente.')
        },
      },
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 p-8">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Configuração inicial</h2>
        <p className="mb-6 text-sm text-gray-500">
          Crie o usuário e a senha que vão proteger o acesso ao Crypto Organizer. Esta tela só
          aparece uma vez — depois de criada a conta, ela não volta a aparecer.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="setup-username" className="mb-1 block text-sm font-medium text-gray-700">
              Usuário
            </label>
            <input
              id="setup-username"
              type="text"
              autoComplete="username"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="setup-password" className="mb-1 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              id="setup-password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="setup-confirm-password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Confirmar senha
            </label>
            <input
              id="setup-confirm-password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {fieldError && (
              <p role="alert" className="mt-1 text-sm text-red-600">
                {fieldError}
              </p>
            )}
            {formError && (
              <p role="alert" className="mt-1 text-sm text-red-600">
                {formError}
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={setup.isPending}
              className="w-full cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {setup.isPending ? 'Criando conta...' : 'Criar conta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
