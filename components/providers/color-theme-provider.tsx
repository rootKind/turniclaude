'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { applyColorOverrides, type ColorOverrides } from '@/lib/color-overrides'

export function ColorThemeProvider() {
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('app_settings')
      .select('color_overrides')
      .single()
      .then(({ data }) => {
        const overrides = data?.color_overrides as ColorOverrides | undefined
        if (overrides && (overrides.light || overrides.dark)) {
          applyColorOverrides(overrides)
        }
      })
  }, [])

  return null
}
