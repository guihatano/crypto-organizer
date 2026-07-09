interface EmptyStateProps {
  onCreateFirst: () => void
}

/**
 * Friendly empty state (D-13): shown instead of the tables when there are
 * zero transactions — no placeholder rows.
 */
export function EmptyState({ onCreateFirst }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center">
      <p className="text-lg font-medium text-gray-900">
        Você ainda não registrou nenhuma transação.
      </p>
      <p className="mt-1 text-sm text-gray-500">
        Registre sua primeira compra ou venda de criptomoedas para começar a
        acompanhar seu preço médio e custo de aquisição.
      </p>
      <button
        type="button"
        onClick={onCreateFirst}
        className="mt-6 cursor-pointer rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
      >
        Lançar primeira transação
      </button>
    </div>
  )
}
