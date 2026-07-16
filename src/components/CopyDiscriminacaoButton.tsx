import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CopyDiscriminacaoButtonProps {
  text: string
}

/**
 * Copy-to-clipboard button for a Discriminação line (IR-03/D-04). Always
 * enabled, even when the line's exchange or CNPJ is missing (D-06/D-08) —
 * the server already substituted the placeholders into `text`. Deliberately
 * secondary/outline styled, not accent-filled: this button repeats on
 * every line, so filling it with the reserved gray-900 accent would blow
 * the 10% accent budget (UI-SPEC Color). Uses the native clipboard API
 * directly — no library, no deprecated document-command-based fallback.
 */
export function CopyDiscriminacaoButton({ text }: CopyDiscriminacaoButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      <span aria-live="polite">{copied ? 'Copiado!' : 'Copiar Discriminação'}</span>
    </button>
  )
}
