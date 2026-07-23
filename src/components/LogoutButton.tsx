import { LogOut } from 'lucide-react'
import { useLogout } from '../hooks/useAuth.ts'

/**
 * Header "Sair" control (AUTH-03). Secondary/ghost style — not the
 * bg-(--color-accent) primary CTA. No confirmation dialog (logout is not a
 * destructive/data-loss action); disabled while pending to block a
 * double-click. On settle the auth-status cache flips to unauthenticated
 * (useLogout), so the shell shows Login with no banner (deliberate
 * logout, not a 401 kick).
 */
export function LogoutButton() {
  const logout = useLogout()

  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-hover) disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center gap-1.5">
        <LogOut className="h-4 w-4" />
        Sair
      </span>
    </button>
  )
}
