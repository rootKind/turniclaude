'use client'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

const LIGHT_COLOR = '#ffffff'
const DARK_COLOR = '#0a0a0a'

export function ThemeColor() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    // Fallback to html class if resolvedTheme not yet resolved (avoids white flash on navigation)
    const isDark = resolvedTheme
      ? resolvedTheme === 'dark'
      : document.documentElement.classList.contains('dark')
    const color = isDark ? DARK_COLOR : LIGHT_COLOR
    document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
      el.setAttribute('content', color)
    })
  }, [resolvedTheme])

  return null
}
