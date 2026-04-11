import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types/database'

// Client-only store (never import from Server Components).
// Persisted to localStorage to avoid cold-start fetch on every PWA wake.
interface UserState {
  profile: UserProfile | null
  setProfile: (profile: UserProfile | null) => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
    }),
    { name: 'user-profile' }
  )
)
