'use client'

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { PLATFORM_ATTR, isPlatform, readPlatformOverride, type Platform } from '@/lib/platform'

/**
 * PIATTAFORMA — il contesto (20/09/2026).
 *
 * Il server passa qui la piattaforma dedotta dallo User-Agent della richiesta, e
 * l'attributo `data-platform` è già scritto nell'HTML: i token CSS sono quelli
 * giusti prima del primo paint, senza script inline e senza flash.
 *
 * L'unica cosa che succede sul client è l'OVERRIDE di QA (`?platform=ios` o
 * localStorage), e succede scrivendo un attributo nel DOM + emettendo un evento:
 * nessun `setState` in un effect (il lint di questo repo lo vieta) e nessuno
 * stato duplicato che possa divergere da quello che il CSS legge davvero.
 * Lo snapshot è letto DAL DOM — come `nav-lastpage` in `bottom-nav.tsx` — che è
 * l'unica verità: la stringa è primitiva, quindi `useSyncExternalStore` non entra
 * nel ciclo «getSnapshot should be cached».
 */

const PlatformContext = createContext<Platform>('desktop')

const PLATFORM_EVENT = 'platform-change'

function subscribe(onChange: () => void) {
  window.addEventListener(PLATFORM_EVENT, onChange)
  return () => window.removeEventListener(PLATFORM_EVENT, onChange)
}

function readAttribute(): Platform | null {
  const value = document.documentElement.getAttribute(PLATFORM_ATTR)
  return isPlatform(value) ? value : null
}

export function PlatformProvider({
  platform,
  children,
}: {
  platform: Platform
  children: ReactNode
}) {
  useEffect(() => {
    const override = readPlatformOverride()
    if (!override || override === platform) return
    document.documentElement.setAttribute(PLATFORM_ATTR, override)
    window.dispatchEvent(new Event(PLATFORM_EVENT))
  }, [platform])

  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

/**
 * La piattaforma corrente. Fuori dal provider, o prima dell'idratazione,
 * risponde la piattaforma decisa dal server (mai `undefined`: una skin a caso è
 * peggio di quella di default).
 */
export function usePlatform(): Platform {
  const server = useContext(PlatformContext)
  return useSyncExternalStore(subscribe, () => readAttribute() ?? server, () => server)
}
