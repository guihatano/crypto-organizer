import { useQuery } from '@tanstack/react-query'
import { apiClient, type Coin } from './api/client.ts'

function useCoins() {
  return useQuery({
    queryKey: ['coins'],
    queryFn: () => apiClient.get<Coin[]>('/coins'),
  })
}

/**
 * Walking-skeleton proof (W0-3): the seeded coin list, fetched live from
 * SQLite via GET /api/coins, rendered with loading/error states. This is
 * the one real DB read surfaced in one real UI interaction that proves the
 * full DB -> API -> UI stack works before any transaction feature exists.
 */
function SeededCoinsSkeletonProof() {
  const { data: coinList, isLoading, isError } = useCoins()

  if (isLoading) {
    return <p className="text-sm text-gray-400">Carregando moedas...</p>
  }

  if (isError) {
    return (
      <p className="text-sm text-red-500">
        Não foi possível carregar as moedas. Verifique se a API está rodando.
      </p>
    )
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {coinList?.map((coin) => (
        <li
          key={coin.id}
          className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700"
        >
          {coin.symbol}
        </li>
      ))}
    </ul>
  )
}

function App() {
  return (
    <div className="min-h-svh bg-white">
      <header className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Crypto Organizer</h1>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-10">
        {/* Positions region (D-09/D-10). Mount point for <PositionTable /> in Wave 1. */}
        <section aria-labelledby="positions-heading">
          <h2 id="positions-heading" className="mb-3 text-lg font-medium text-gray-900">
            Posições
          </h2>
          <div className="rounded-lg border border-dashed border-gray-300 p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
              Moedas cadastradas (prova do esqueleto)
            </p>
            <SeededCoinsSkeletonProof />
          </div>
        </section>

        {/* History region (D-09). Mount point for <TransactionHistory /> in Wave 1. */}
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-lg font-medium text-gray-900">
            Histórico de transações
          </h2>
          <div className="rounded-lg border border-dashed border-gray-300 p-4">
            <p className="text-sm text-gray-400">
              O histórico de transações aparecerá aqui.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
