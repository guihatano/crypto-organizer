interface EmptyStateProps {
  onCreateFirst: () => void
}

/**
 * Friendly empty state (D-13): shown instead of the tables when there are
 * zero transactions — no placeholder rows.
 */
export function EmptyState({ onCreateFirst }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--color-border) px-6 py-16 text-center">
      <p className="text-lg font-medium text-(--color-text)">
        Você ainda não registrou nenhuma transação.
      </p>
      <p className="mt-1 text-sm text-(--color-text-muted)">
        Registre sua primeira compra ou venda de criptomoedas para começar a
        acompanhar seu preço médio e custo de aquisição.
      </p>
      <button
        type="button"
        onClick={onCreateFirst}
        className="mt-6 cursor-pointer rounded-md bg-(--color-accent) px-5 py-2.5 text-sm font-medium text-(--color-accent-fg) hover:bg-(--color-accent-hover)"
      >
        Lançar primeira transação
      </button>
    </div>
  )
}
