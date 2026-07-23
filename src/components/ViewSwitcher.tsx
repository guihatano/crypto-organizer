export type AppView = 'dashboard' | 'ir-report'

interface ViewSwitcherProps {
  value: AppView
  onChange: (next: AppView) => void
}

const SEGMENTS: { value: AppView; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'ir-report', label: 'Relatório IR' },
]

/**
 * Two-segment Dashboard/Relatório IR view switcher in the app header,
 * copying CurrencyToggle's shape wholesale (role="group", aria-pressed per
 * segment, same active/inactive classes, native <button> keyboard
 * operability). The active segment is this phase's one new use of the
 * reserved --color-accent (UI-SPEC Color).
 */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div role="group" aria-label="Visualização" className="flex overflow-hidden rounded-md border border-(--color-border)">
      {SEGMENTS.map((segment) => {
        const active = segment.value === value
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={`cursor-pointer px-3 py-1.5 text-sm font-medium ${
              active ? 'bg-(--color-accent) text-(--color-accent-fg)' : 'text-(--color-text-muted) hover:bg-(--color-surface-hover)'
            }`}
          >
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}
