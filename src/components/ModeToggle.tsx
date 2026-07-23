import { useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '../contexts/ThemeContext.tsx'

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Escuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
]

/**
 * Header 3-state theme control (D-03/D-04): a labeled dropdown — not a
 * 2-state sol/lua switch, not a cycling icon — so the active state
 * (Claro/Escuro/Sistema) is always explicit. Trigger reuses
 * LogoutButton's header button sizing; menu mechanics reuse
 * CoinDropdown's blur-close-with-delay trick so a menu-item click
 * registers before the blur closes the panel. Written directly in
 * semantic-token utilities since it is net-new (never hardcoded then
 * retrofitted, per 05-PATTERNS.md).
 */
export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2]
  const CurrentIcon = current.Icon

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Tema: ${current.label}`}
        className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium text-[--color-text-muted] hover:bg-[--color-surface-hover]"
      >
        <span className="flex items-center gap-1.5">
          <CurrentIcon className="h-4 w-4" />
          {current.label}
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-[--color-border] bg-[--color-surface] shadow-lg"
        >
          {OPTIONS.map((option) => {
            const active = option.value === theme
            const OptionIcon = option.Icon
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTheme(option.value)
                  setOpen(false)
                }}
                className={`flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-sm ${
                  active
                    ? 'bg-[--color-accent] text-[--color-accent-fg]'
                    : 'text-[--color-text-muted] hover:bg-[--color-surface-hover]'
                }`}
              >
                <OptionIcon className="h-4 w-4" />
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
