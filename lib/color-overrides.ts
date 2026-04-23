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

export function clearColorOverrides() {
  if (typeof document === 'undefined') return
  const el = document.getElementById('custom-color-overrides')
  if (el) el.textContent = ''
  styleEl = null
}
