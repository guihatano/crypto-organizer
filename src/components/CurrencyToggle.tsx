type Currency = 'BRL' | 'USD'

interface CurrencyToggleProps {
  value: Currency
  onChange: (next: Currency) => void
}

const SEGMENTS: Currency[] = ['BRL', 'USD']

/**
 * Two-segment BRL/USD toggle (D-05) in the app header. Active segment
 * bg-(--color-accent) text-(--color-accent-fg), inactive
 * text-(--color-text-muted) hover:bg-(--color-surface-hover) —
 * reusing the existing header button classes. Each segment exposes
 * aria-pressed for the active/inactive state and is keyboard-operable
 * (native <button>), satisfying the UI-SPEC a11y carry-over.
 */
export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  return (
    <div role="group" aria-label="Moeda de exibição" className="flex overflow-hidden rounded-md border border-(--color-border)">
      {SEGMENTS.map((segment) => {
        const active = segment === value
        return (
          <button
            key={segment}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment)}
            className={`cursor-pointer px-3 py-1.5 text-sm font-medium ${
              active ? 'bg-(--color-accent) text-(--color-accent-fg)' : 'text-(--color-text-muted) hover:bg-(--color-surface-hover)'
            }`}
          >
            {segment}
          </button>
        )
      })}
    </div>
  )
}
