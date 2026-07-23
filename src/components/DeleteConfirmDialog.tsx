import { useEffect } from 'react'

interface DeleteConfirmDialogProps {
  open: boolean
  description?: string
  errorMessage?: string
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

/**
 * Delete confirmation dialog (D-12): "Tem certeza?" — deletion only
 * happens on explicit confirm. When the server rejects the delete (e.g.
 * CR-02's chronological non-negative-position guard), `errorMessage`
 * surfaces it inline instead of the dialog silently closing with no
 * feedback.
 */
export function DeleteConfirmDialog({
  open,
  description,
  errorMessage,
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
        className="w-full max-w-sm rounded-lg bg-[--color-surface] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-confirm-title" className="text-lg font-semibold text-[--color-text]">
          Tem certeza?
        </h2>
        <p className="mt-2 text-sm text-[--color-text-muted]">
          {description ?? 'Esta transação será excluída e as posições serão recalculadas.'}
        </p>
        {errorMessage && (
          <p role="alert" className="mt-2 text-sm text-[--color-destructive]">
            {errorMessage}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-[--color-text-muted] hover:bg-[--color-surface-hover]"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending}
            className="cursor-pointer rounded-md bg-[--color-destructive] px-4 py-2 text-sm font-medium text-[--color-accent-fg] hover:bg-[--color-destructive-hover] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onConfirm}
          >
            {isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
