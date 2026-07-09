import { useEffect } from 'react'

interface DeleteConfirmDialogProps {
  open: boolean
  description?: string
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

/**
 * Delete confirmation dialog (D-12): "Tem certeza?" — deletion only
 * happens on explicit confirm.
 */
export function DeleteConfirmDialog({
  open,
  description,
  onConfirm,
  onCancel,
  isPending,
}: DeleteConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-confirm-title" className="text-lg font-semibold text-gray-900">
          Tem certeza?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {description ?? 'Esta transação será excluída e as posições serão recalculadas.'}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending}
            className="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onConfirm}
          >
            {isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
