import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'

interface CopyDiscriminacaoButtonProps {
  text: string
}

/**
 * Copy-to-clipboard button for a Discriminação line (IR-03/D-04). Always
 * enabled, even when the line's exchange or CNPJ is missing (D-06/D-08) —
 * the server already substituted the placeholders into `text`. Deliberately
 * secondary/outline styled, not accent-filled: this button repeats on
 * every line, so filling it with the reserved --color-accent would blow
 * the 10% accent budget (UI-SPEC Color). Uses the native clipboard API
 * directly — no library, no deprecated document-command-based fallback.
 *
 * A rejected `writeText` (permission denied, focus lost, or the API being
 * unavailable outside a secure context once this app is hosted) surfaces a
 * distinct "Não foi possível copiar" state instead of silently no-op'ing —
 * this button's only job is producing text the user pastes verbatim into
 * the IRPF program, so a silent failure is worse than a loud one.
 */
export function CopyDiscriminacaoButton({ text }: CopyDiscriminacaoButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    timeoutRef.current = setTimeout(() => setStatus('idle'), 2000)
  }

  const label =
    status === 'copied'
      ? 'Copiado!'
      : status === 'failed'
        ? 'Não foi possível copiar'
        : 'Copiar Discriminação'

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-1 rounded-md border border-[--color-border] px-2 py-1 text-sm text-[--color-text] hover:bg-[--color-surface-hover]"
    >
      {status === 'copied' ? (
        <Check className="h-4 w-4 text-[--color-profit]" />
      ) : status === 'failed' ? (
        <AlertTriangle className="h-4 w-4 text-[--color-destructive]" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      <span aria-live="polite">{label}</span>
    </button>
  )
}
