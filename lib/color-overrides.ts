export type ColorOverrides = {
  light?: Record<string, string>
  dark?: Record<string, string>
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
  const lightVars = Object.entries(overrides.light ?? {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  const darkVars = Object.entries(overrides.dark ?? {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  const parts: string[] = []
  if (lightVars) parts.push(`:root {\n${lightVars}\n}`)
  if (darkVars) parts.push(`.dark {\n${darkVars}\n}`)
  styleEl.textContent = parts.join('\n')
}

export function clearColorOverrides() {
  if (typeof document === 'undefined') return
  const el = document.getElementById('custom-color-overrides')
  if (el) el.textContent = ''
  styleEl = null
}
