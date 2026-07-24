interface EmptyStateProps {
  onCreateFirst: () => void
  /**
   * Opens the same file picker as the History toolbar's "Importar CSV"
   * trigger (BACKUP-02 reachability, D-10): at zero transactions the
   * History section doesn't mount, so without this link a wiped DB would
   * have no path back to a CSV backup.
   */
  onImportClick: () => void
}

/**
 * Friendly empty state (D-13): shown instead of the tables when there are
 * zero transactions — no placeholder rows.
 */
export function EmptyState({ onCreateFirst, onImportClick }: EmptyStateProps) {
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
      <p className="mt-4 text-sm text-(--color-text-muted)">
        ou{' '}
        <button
          type="button"
          onClick={onImportClick}
          className="cursor-pointer font-medium text-(--color-text) underline hover:no-underline"
        >
          importe um backup CSV
        </button>
      </p>
    </div>
  )
}
