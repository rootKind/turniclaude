'use client'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { LIGHT_BACKGROUND, DARK_BACKGROUND } from '@/lib/color-defaults'

export function ThemeColor() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    function currentBackground(isDark: boolean): string {
      // Keep the browser chrome in sync with the real app background. Only hex
      // is accepted: the CSS defaults are oklch() which isn't supported in every
      // browser's meta theme-color — fall back to the hex constants in that case.
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim()
      if (bg.startsWith('#')) return bg
      return isDark ? DARK_BACKGROUND : LIGHT_BACKGROUND
    }

    function applyColor() {
      const isDark = resolvedTheme
        ? resolvedTheme === 'dark'
        : document.documentElement.classList.contains('dark')
      const color = currentBackground(isDark)

      const existing = document.querySelectorAll('meta[name="theme-color"]')
      if (existing.length === 0) {
        const meta = document.createElement('meta')
        meta.setAttribute('name', 'theme-color')
        meta.setAttribute('content', color)
        document.head.appendChild(meta)
      } else {
        existing.forEach(el => {
          if (el.getAttribute('content') !== color) el.setAttribute('content', color)
        })
      }
    }

    applyColor()

    // Next.js App Router rewrites <head> on every navigation — reapply immediately
    const observer = new MutationObserver(applyColor)
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['content'],
    })

    return () => observer.disconnect()
  }, [resolvedTheme])

  return null
}
