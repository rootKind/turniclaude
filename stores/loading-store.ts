import { create } from 'zustand'

// Single-flag loading state for top-level route-transition spinner only.
// Safe only when one operation runs at a time. Do not use for concurrent operations —
// use TanStack Query's isFetching/isPending instead.
interface LoadingState {
  isLoading: boolean
  setIsLoading: (v: boolean) => void
}

export const useLoadingStore = create<LoadingState>((set, get) => ({
  isLoading: false,
  setIsLoading: (isLoading) => {
    if (process.env.NODE_ENV === 'development' && isLoading && get().isLoading) {
      console.warn('[loading-store] setIsLoading(true) called while already loading — concurrent use detected')
    }
    set({ isLoading })
  },
}))
