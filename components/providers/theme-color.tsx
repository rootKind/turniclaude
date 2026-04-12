'use client'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

const LIGHT_COLOR = '#ffffff'
const DARK_COLOR = '#0a0a0a'

export function ThemeColor() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const color = resolvedTheme === 'dark' ? DARK_COLOR : LIGHT_COLOR
    document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
      el.setAttribute('content', color)
    })
  }, [resolvedTheme])

  return null
}
