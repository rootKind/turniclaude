'use client'
import { useEffect } from 'react'
import { useTheme } from 'next-themes'

const LIGHT_COLOR = '#f0f7fc'
const DARK_COLOR = '#0a0a0a'

export function ThemeColor() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    function applyColor() {
      const isDark = resolvedTheme
        ? resolvedTheme === 'dark'
        : document.documentElement.classList.contains('dark')
      const color = isDark ? DARK_COLOR : LIGHT_COLOR

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
