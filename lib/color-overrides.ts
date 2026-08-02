export type ColorOverrides = {
  light?: Record<string, string>
  dark?: Record<string, string>
}

export function buildStyleString(overrides: ColorOverrides): string {
  const lightVars = Object.entries(overrides.light ?? {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  const darkVars = Object.entries(overrides.dark ?? {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  const parts: string[] = []
  if (lightVars) parts.push(`:root {\n${lightVars}\n}`)
  if (darkVars) parts.push(`.dark {\n${darkVars}\n}`)
  return parts.join('\n')
}

// ── Cookie-safe serialization (RFC 6265) ──────────────────────────────────────
// Raw CSS contains newlines and ';', which are invalid in cookie values, and raw
// JSON contains '"', ',' and spaces, which are also not cookie-octets. Base64 is
// safe everywhere. btoa/atob are globals in browsers and Node ≥ 18 (Vercel).

export function encodeColorOverrides(overrides: ColorOverrides): string {
  try {
    return btoa(JSON.stringify(overrides))
  } catch {
    return ''
  }
}

export function decodeColorOverrides(encoded: string | null | undefined): ColorOverrides {
  if (!encoded) return {}
  try {
    const parsed = JSON.parse(atob(encoded))
    if (parsed && typeof parsed === 'object') return parsed as ColorOverrides
    return {}
  } catch {
    return {}
  }
}

let styleEl: HTMLStyleElement | null = null

export function applyColorOverrides(overrides: ColorOverrides) {
  if (typeof document === 'undefined') return
  if (!styleEl) {
    styleEl = document.getElementById('custom-color-overrides') as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'custom-color-overrides'
      document.head.appendChild(styleEl)
    }
  }
  styleEl.textContent = buildStyleString(overrides)
}

