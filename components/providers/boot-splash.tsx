'use client'
import { useEffect, useRef, useState } from 'react'

// Splash screen in-app mostrato all'avvio della PWA (soprattutto iOS, dove il
// launch screen nativo mostra SOLO un colore solido senza icona).
// - Sfondo = var(--background) → adattivo al tema (chiaro #f0f7fc / scuro #0a0a0a),
//   identico allo sfondo dell'app: transizione seamless dal launch nativo iOS.
// - Logo = icon-512.png (trasparente, logo grigio centrato) → visibile su entrambi i temi.
// - Sfuma via dopo il primo paint + window load (min ~900ms), massimo 5s di sicurezza.
const MIN_SHOW_MS = 900
const FADE_MS = 450
const MAX_SHOW_MS = 5000

export function BootSplash() {
  const [fading, setFading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    const start = Date.now()
    let loadTimer: ReturnType<typeof setTimeout> | undefined
    let fadeTimer: ReturnType<typeof setTimeout> | undefined

    const beginFade = () => {
      if (done.current) return
      done.current = true
      setFading(true)
      fadeTimer = setTimeout(() => setHidden(true), FADE_MS)
    }

    const scheduleFade = () => {
      const remaining = Math.max(0, MIN_SHOW_MS - (Date.now() - start))
      loadTimer = setTimeout(beginFade, remaining)
    }

    if (document.readyState === 'complete') {
      scheduleFade()
    } else {
      window.addEventListener('load', scheduleFade, { once: true })
    }

    // Sicurezza: mai lasciare lo splash oltre MAX_SHOW_MS
    const safety = setTimeout(beginFade, MAX_SHOW_MS)

    return () => {
      window.removeEventListener('load', scheduleFade)
      clearTimeout(loadTimer)
      clearTimeout(fadeTimer)
      clearTimeout(safety)
    }
  }, [])

  if (hidden) return null

  return (
    <div
      aria-hidden="true"
      className="boot-splash"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-512.png"
        alt=""
        width={132}
        height={132}
        className="boot-splash-logo"
      />
    </div>
  )
}
