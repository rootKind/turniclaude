export interface VarInfo {
  label: string
  type: 'bg' | 'text' | 'border'
}

export const VAR_LABELS: Record<string, VarInfo> = {
  '--background':               { label: 'Sfondo app',              type: 'bg' },
  '--foreground':               { label: 'Testo principale',        type: 'text' },
  '--card':                     { label: 'Sfondo card',             type: 'bg' },
  '--card-foreground':          { label: 'Testo card',              type: 'text' },
  '--primary':                  { label: 'Colore primario',         type: 'bg' },
  '--primary-foreground':       { label: 'Testo su primario',       type: 'text' },
  '--secondary':                { label: 'Sfondo secondario',       type: 'bg' },
  '--secondary-foreground':     { label: 'Testo secondario',        type: 'text' },
  '--muted':                    { label: 'Sfondo muted',            type: 'bg' },
  '--muted-foreground':         { label: 'Testo muted',             type: 'text' },
  '--accent':                   { label: 'Sfondo accent',           type: 'bg' },
  '--accent-foreground':        { label: 'Testo accent',            type: 'text' },
  '--destructive':              { label: 'Colore distruttivo',      type: 'bg' },
  '--border':                   { label: 'Colore bordi',            type: 'border' },
  '--input':                    { label: 'Bordo input',             type: 'border' },
  '--shift-others-bg':          { label: 'Turni altrui — sfondo',   type: 'bg' },
  '--shift-others-date-bg':     { label: 'Turni altrui — data',     type: 'bg' },
  '--shift-others-date-border': { label: 'Turni altrui — bordo',    type: 'border' },
  '--shift-own-empty-bg':       { label: 'Turno proprio — sfondo',  type: 'bg' },
  '--shift-own-empty-date-bg':  { label: 'Turno proprio — data',    type: 'bg' },
  '--shift-own-empty-border':   { label: 'Turno proprio — bordo',   type: 'border' },
  '--shift-own-interest-bg':    { label: 'Interesse — sfondo',      type: 'bg' },
  '--shift-own-interest-date-bg':{ label: 'Interesse — data',       type: 'bg' },
  '--shift-own-interest-border':{ label: 'Interesse — bordo',       type: 'border' },
  '--shift-highlight-bg':       { label: 'Highlight — sfondo',      type: 'bg' },
  '--shift-highlight-date-bg':  { label: 'Highlight — data',        type: 'bg' },
  '--pill-mattina-bg':          { label: 'Pill mattina — sfondo',   type: 'bg' },
  '--pill-mattina-text':        { label: 'Pill mattina — testo',    type: 'text' },
  '--pill-pomeriggio-bg':       { label: 'Pill pomeriggio — sfondo',type: 'bg' },
  '--pill-pomeriggio-text':     { label: 'Pill pomeriggio — testo', type: 'text' },
  '--pill-notte-bg':            { label: 'Pill notte — sfondo',     type: 'bg' },
  '--pill-notte-text':          { label: 'Pill notte — testo',      type: 'text' },
}

// Map from CSS class substring → list of CSS variable names it controls
const CLASS_MAP: Array<{ match: string; vars: string[] }> = [
  { match: 'bg-background',           vars: ['--background'] },
  { match: 'bg-card',                 vars: ['--card'] },
  { match: 'bg-primary',              vars: ['--primary'] },
  { match: 'bg-secondary',            vars: ['--secondary'] },
  { match: 'bg-muted',                vars: ['--muted'] },
  { match: 'bg-accent',               vars: ['--accent'] },
  { match: 'bg-destructive',          vars: ['--destructive'] },
  { match: 'text-foreground',         vars: ['--foreground'] },
  { match: 'text-card-foreground',    vars: ['--card-foreground'] },
  { match: 'text-primary-foreground', vars: ['--primary-foreground'] },
  { match: 'text-primary',            vars: ['--primary'] },
  { match: 'text-muted-foreground',   vars: ['--muted-foreground'] },
  { match: 'text-secondary-foreground', vars: ['--secondary-foreground'] },
  { match: 'text-accent-foreground',  vars: ['--accent-foreground'] },
  { match: 'text-destructive',        vars: ['--destructive'] },
  { match: 'border-border',           vars: ['--border'] },
  { match: 'border-input',            vars: ['--input'] },
  // Custom shift/pill classes
  { match: 'shift-state-others',      vars: ['--shift-others-bg'] },
  { match: 'shift-date-others',       vars: ['--shift-others-date-bg', '--shift-others-date-border'] },
  { match: 'shift-state-own-empty',   vars: ['--shift-own-empty-bg', '--shift-own-empty-border'] },
  { match: 'shift-date-own-empty',    vars: ['--shift-own-empty-date-bg', '--shift-own-empty-border'] },
  { match: 'shift-state-own-interest',vars: ['--shift-own-interest-bg', '--shift-own-interest-border'] },
  { match: 'shift-date-own-interest', vars: ['--shift-own-interest-date-bg', '--shift-own-interest-border'] },
  { match: 'shift-state-highlight',   vars: ['--shift-highlight-bg'] },
  { match: 'shift-date-highlight',    vars: ['--shift-highlight-date-bg'] },
  { match: 'pill-mattina',            vars: ['--pill-mattina-bg', '--pill-mattina-text'] },
  { match: 'pill-pomeriggio',         vars: ['--pill-pomeriggio-bg', '--pill-pomeriggio-text'] },
  { match: 'pill-notte',              vars: ['--pill-notte-bg', '--pill-notte-text'] },
]

export function getVarsForElement(el: HTMLElement): string[] {
  const found = new Set<string>()
  let current: HTMLElement | null = el

  for (let depth = 0; depth < 12 && current && current !== document.body; depth++) {
    const classList = Array.from(current.classList)
    for (const cls of classList) {
      for (const entry of CLASS_MAP) {
        if (cls === entry.match || cls.startsWith(entry.match)) {
          entry.vars.forEach(v => found.add(v))
        }
      }
    }
    current = current.parentElement
  }

  return Array.from(found)
}
