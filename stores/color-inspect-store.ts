import { create } from 'zustand'
import type { ColorOverrides } from '@/lib/color-overrides'

interface ColorInspectState {
  active: boolean
  pendingChanges: ColorOverrides
  setActive: (v: boolean) => void
  setPendingChange: (theme: 'light' | 'dark', varName: string, value: string) => void
  clearPending: () => void
}

export const useColorInspectStore = create<ColorInspectState>()((set) => ({
  active: false,
  pendingChanges: {},
  setActive: (v) => set({ active: v }),
  setPendingChange: (theme, varName, value) =>
    set((s) => ({
      pendingChanges: {
        ...s.pendingChanges,
        [theme]: { ...(s.pendingChanges[theme] ?? {}), [varName]: value },
      },
    })),
  clearPending: () => set({ pendingChanges: {} }),
}))
