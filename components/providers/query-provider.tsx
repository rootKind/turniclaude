'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { GlobalLoadingBar } from '@/components/ui/global-loading-bar'
import {
  isPersistableQuery,
  queryKeyToIdbKey,
  readAllQueryCache,
  writeQueryCache,
} from '@/lib/query-idb-cache'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }))

  // Cache-first fase 2 (20/09/2026): all'avvio ripristina dall'IndexedDB le
  // query anagrafiche (utenti, albero squadre) con il LORO dataUpdatedAt, così
  // restano «fresche» esattamente come quando l'app si è chiusa; da lì in poi
  // ogni fetch riuscita di una query whitelist viene riscritta sull'IDB.
  // Il realtime (RealtimeInvalidation) invalida query+IDB sui cambi reali.
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    ;(async () => {
      const entries = await readAllQueryCache()
      if (cancelled) return
      const lastWritten = new Map<string, number>()
      for (const e of entries) {
        lastWritten.set(e.key, e.at)
        try {
          const key = JSON.parse(e.key) as unknown
          if (!Array.isArray(key)) continue
          queryClient.setQueryData(key, e.data, { updatedAt: e.at })
        } catch { /* chiave non recuperabile: la rete la ricreerà */ }
      }

      const cache = queryClient.getQueryCache()
      unsubscribe = cache.subscribe(event => {
        const { query } = event
        if (!isPersistableQuery(query)) return
        const { data, dataUpdatedAt, status } = query.state
        if (status !== 'success' || data === undefined || dataUpdatedAt === 0) return
        const key = queryKeyToIdbKey(query.queryKey)
        if ((lastWritten.get(key) ?? 0) >= dataUpdatedAt) return
        lastWritten.set(key, dataUpdatedAt)
        void writeQueryCache(query.queryKey, data, dataUpdatedAt)
      })
    })()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoadingBar />
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
