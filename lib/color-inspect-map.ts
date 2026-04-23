export interface VarInfo {
  label: string
  type: 'bg' | 'text' | 'border'
}

export const VAR_LABELS: Record<string, VarInfo> = {
  // Base UI
  '--background':               { label: 'Sfondo app',                    type: 'bg' },
  '--foreground':               { label: 'Testo principale',              type: 'text' },
  '--card':                     { label: 'Sfondo card',                   type: 'bg' },
  '--card-foreground':          { label: 'Testo card',                    type: 'text' },
  '--primary':                  { label: 'Colore primario',               type: 'bg' },
  '--primary-foreground':       { label: 'Testo su primario',             type: 'text' },
  '--secondary':                { label: 'Sfondo secondario',             type: 'bg' },
  '--secondary-foreground':     { label: 'Testo secondario',              type: 'text' },
  '--muted':                    { label: 'Sfondo muted',                  type: 'bg' },
  '--muted-foreground':         { label: 'Testo muted',                   type: 'text' },
  '--accent':                   { label: 'Sfondo accent',                 type: 'bg' },
  '--accent-foreground':        { label: 'Testo accent',                  type: 'text' },
  '--destructive':              { label: 'Colore distruttivo',            type: 'bg' },
  '--border':                   { label: 'Colore bordi',                  type: 'border' },
  '--input':                    { label: 'Bordo input',                   type: 'border' },
  // Shift states
  '--shift-others-bg':          { label: 'Turni altrui — sfondo',        type: 'bg' },
  '--shift-others-date-bg':     { label: 'Turni altrui — data',          type: 'bg' },
  '--shift-others-date-border': { label: 'Turni altrui — bordo',         type: 'border' },
  '--shift-own-empty-bg':       { label: 'Turno proprio — sfondo',       type: 'bg' },
  '--shift-own-empty-date-bg':  { label: 'Turno proprio — data',         type: 'bg' },
  '--shift-own-empty-border':   { label: 'Turno proprio — bordo',        type: 'border' },
  '--shift-own-interest-bg':    { label: 'Interesse — sfondo',           type: 'bg' },
  '--shift-own-interest-date-bg':{ label: 'Interesse — data',            type: 'bg' },
  '--shift-own-interest-border':{ label: 'Interesse — bordo',            type: 'border' },
  '--shift-highlight-bg':       { label: 'Highlight — sfondo',           type: 'bg' },
  '--shift-highlight-date-bg':  { label: 'Highlight — data',             type: 'bg' },
  // Shift pills
  '--pill-mattina-bg':          { label: 'Pill mattina — sfondo',        type: 'bg' },
  '--pill-mattina-text':        { label: 'Pill mattina — testo',         type: 'text' },
  '--pill-pomeriggio-bg':       { label: 'Pill pomeriggio — sfondo',     type: 'bg' },
  '--pill-pomeriggio-text':     { label: 'Pill pomeriggio — testo',      type: 'text' },
  '--pill-notte-bg':            { label: 'Pill notte — sfondo',          type: 'bg' },
  '--pill-notte-text':          { label: 'Pill notte — testo',           type: 'text' },
  // Banner
  '--banner-impersonate-bg':    { label: 'Banner impersona — sfondo',    type: 'bg' },
  '--banner-impersonate-text':  { label: 'Banner impersona — testo',     type: 'text' },
  // Match panel
  '--match-panel-bg':           { label: 'Match panel — sfondo',         type: 'bg' },
  '--match-panel-border':       { label: 'Match panel — bordo',          type: 'border' },
  '--match-text':               { label: 'Match — testo',                type: 'text' },
  '--match-badge-bg':           { label: 'Match badge — sfondo',         type: 'bg' },
  '--match-action-bg':          { label: 'Match pulsante — sfondo',      type: 'bg' },
  '--match-action-text':        { label: 'Match pulsante — testo',       type: 'text' },
  '--match-count-text':         { label: 'Match contatore — testo',      type: 'text' },
  '--match-pos-text':           { label: 'Match posizione — testo',      type: 'text' },
  '--match-none-text':          { label: 'Match vuoto — testo',          type: 'text' },
  // Chain panel
  '--chain-panel-bg':           { label: 'Catena panel — sfondo',        type: 'bg' },
  '--chain-panel-border':       { label: 'Catena panel — bordo',         type: 'border' },
  '--chain-text':               { label: 'Catena — testo',               type: 'text' },
  '--chain-badge-bg':           { label: 'Catena badge — sfondo',        type: 'bg' },
  '--chain-action-bg':          { label: 'Catena pulsante — sfondo',     type: 'bg' },
  '--chain-action-text':        { label: 'Catena pulsante — testo',      type: 'text' },
  '--chain-node-text':          { label: 'Catena nodo — testo',          type: 'text' },
  // Chip
  '--chip-selected-bg':         { label: 'Chip selezionato — sfondo',    type: 'bg' },
  '--chip-selected-text':       { label: 'Chip selezionato — testo',     type: 'text' },
  '--chip-selected-border':     { label: 'Chip selezionato — bordo',     type: 'border' },
  // Offered box
  '--offered-box-bg':           { label: 'Box offerto — sfondo',         type: 'bg' },
  '--offered-box-border':       { label: 'Box offerto — bordo',          type: 'border' },
  '--offered-box-label':        { label: 'Box offerto — etichetta',      type: 'text' },
  '--offered-box-value':        { label: 'Box offerto — valore',         type: 'text' },
  // My period
  '--my-period-border':         { label: 'Mio periodo — bordo',          type: 'border' },
  '--my-period-header-bg':      { label: 'Mio periodo — header',         type: 'bg' },
  '--my-period-content-bg':     { label: 'Mio periodo — contenuto',      type: 'bg' },
  '--my-period-text':           { label: 'Mio periodo — testo',          type: 'text' },
  '--my-period-dot':            { label: 'Mio periodo — punto',          type: 'bg' },
  // Period pills 1-6
  '--period-1-pill-bg':         { label: 'Periodo 1 pill — sfondo',      type: 'bg' },
  '--period-1-pill-text':       { label: 'Periodo 1 pill — testo',       type: 'text' },
  '--period-2-pill-bg':         { label: 'Periodo 2 pill — sfondo',      type: 'bg' },
  '--period-2-pill-text':       { label: 'Periodo 2 pill — testo',       type: 'text' },
  '--period-3-pill-bg':         { label: 'Periodo 3 pill — sfondo',      type: 'bg' },
  '--period-3-pill-text':       { label: 'Periodo 3 pill — testo',       type: 'text' },
  '--period-4-pill-bg':         { label: 'Periodo 4 pill — sfondo',      type: 'bg' },
  '--period-4-pill-text':       { label: 'Periodo 4 pill — testo',       type: 'text' },
  '--period-5-pill-bg':         { label: 'Periodo 5 pill — sfondo',      type: 'bg' },
  '--period-5-pill-text':       { label: 'Periodo 5 pill — testo',       type: 'text' },
  '--period-6-pill-bg':         { label: 'Periodo 6 pill — sfondo',      type: 'bg' },
  '--period-6-pill-text':       { label: 'Periodo 6 pill — testo',       type: 'text' },
  // Period cards 1-6
  '--period-1-card-border':     { label: 'Periodo 1 card — bordo',       type: 'border' },
  '--period-1-card-header':     { label: 'Periodo 1 card — header',      type: 'bg' },
  '--period-1-card-content':    { label: 'Periodo 1 card — contenuto',   type: 'bg' },
  '--period-2-card-border':     { label: 'Periodo 2 card — bordo',       type: 'border' },
  '--period-2-card-header':     { label: 'Periodo 2 card — header',      type: 'bg' },
  '--period-2-card-content':    { label: 'Periodo 2 card — contenuto',   type: 'bg' },
  '--period-3-card-border':     { label: 'Periodo 3 card — bordo',       type: 'border' },
  '--period-3-card-header':     { label: 'Periodo 3 card — header',      type: 'bg' },
  '--period-3-card-content':    { label: 'Periodo 3 card — contenuto',   type: 'bg' },
  '--period-4-card-border':     { label: 'Periodo 4 card — bordo',       type: 'border' },
  '--period-4-card-header':     { label: 'Periodo 4 card — header',      type: 'bg' },
  '--period-4-card-content':    { label: 'Periodo 4 card — contenuto',   type: 'bg' },
  '--period-5-card-border':     { label: 'Periodo 5 card — bordo',       type: 'border' },
  '--period-5-card-header':     { label: 'Periodo 5 card — header',      type: 'bg' },
  '--period-5-card-content':    { label: 'Periodo 5 card — contenuto',   type: 'bg' },
  '--period-6-card-border':     { label: 'Periodo 6 card — bordo',       type: 'border' },
  '--period-6-card-header':     { label: 'Periodo 6 card — header',      type: 'bg' },
  '--period-6-card-content':    { label: 'Periodo 6 card — contenuto',   type: 'bg' },
  // Dialog pills
  '--dialog-pill-mattina-border':       { label: 'Dialog M bordo',               type: 'border' },
  '--dialog-pill-mattina-active-bg':    { label: 'Dialog M attivo — sfondo',     type: 'bg' },
  '--dialog-pill-mattina-active-border':{ label: 'Dialog M attivo — bordo',      type: 'border' },
  '--dialog-pill-pomeriggio-border':       { label: 'Dialog P bordo',            type: 'border' },
  '--dialog-pill-pomeriggio-active-bg':    { label: 'Dialog P attivo — sfondo',  type: 'bg' },
  '--dialog-pill-pomeriggio-active-border':{ label: 'Dialog P attivo — bordo',   type: 'border' },
  '--dialog-pill-notte-border':            { label: 'Dialog N bordo',            type: 'border' },
  '--dialog-pill-notte-active-bg':         { label: 'Dialog N attivo — sfondo',  type: 'bg' },
  '--dialog-pill-notte-active-border':     { label: 'Dialog N attivo — bordo',   type: 'border' },
  // Badges
  '--badge-noni-bg':            { label: 'Badge Noni — sfondo',           type: 'bg' },
  '--badge-noni-text':          { label: 'Badge Noni — testo',            type: 'text' },
  '--badge-dco-bg':             { label: 'Badge DCO — sfondo',            type: 'bg' },
  '--badge-dco-text':           { label: 'Badge DCO — testo',             type: 'text' },
  // Misc
  '--interest-date-color':      { label: 'Data interesse — colore',       type: 'text' },
  '--own-name-color':           { label: 'Nome proprio — colore',         type: 'text' },
  '--interest-btn-bg':          { label: 'Pulsante interesse — sfondo',   type: 'bg' },
  '--feedback-check-color':     { label: 'Feedback check — colore',       type: 'text' },
  '--desk-schedule-border':     { label: 'Sala schedule — bordo',         type: 'border' },
}

const CLASS_MAP: Array<{ match: string; vars: string[] }> = [
  // Base Tailwind
  { match: 'bg-background',              vars: ['--background'] },
  { match: 'bg-card',                    vars: ['--card'] },
  { match: 'bg-primary',                 vars: ['--primary'] },
  { match: 'bg-secondary',              vars: ['--secondary'] },
  { match: 'bg-muted',                   vars: ['--muted'] },
  { match: 'bg-accent',                  vars: ['--accent'] },
  { match: 'bg-destructive',             vars: ['--destructive'] },
  { match: 'text-foreground',            vars: ['--foreground'] },
  { match: 'text-card-foreground',       vars: ['--card-foreground'] },
  { match: 'text-primary-foreground',    vars: ['--primary-foreground'] },
  { match: 'text-primary',              vars: ['--primary'] },
  { match: 'text-muted-foreground',      vars: ['--muted-foreground'] },
  { match: 'text-secondary-foreground',  vars: ['--secondary-foreground'] },
  { match: 'text-accent-foreground',     vars: ['--accent-foreground'] },
  { match: 'text-destructive',           vars: ['--destructive'] },
  { match: 'border-border',              vars: ['--border'] },
  { match: 'border-input',              vars: ['--input'] },
  // Shift states
  { match: 'shift-state-others',         vars: ['--shift-others-bg'] },
  { match: 'shift-date-others',          vars: ['--shift-others-date-bg', '--shift-others-date-border'] },
  { match: 'shift-state-own-empty',      vars: ['--shift-own-empty-bg', '--shift-own-empty-border'] },
  { match: 'shift-date-own-empty',       vars: ['--shift-own-empty-date-bg', '--shift-own-empty-border'] },
  { match: 'shift-state-own-interest',   vars: ['--shift-own-interest-bg', '--shift-own-interest-border'] },
  { match: 'shift-date-own-interest',    vars: ['--shift-own-interest-date-bg', '--shift-own-interest-border'] },
  { match: 'shift-state-highlight',      vars: ['--shift-highlight-bg'] },
  { match: 'shift-date-highlight',       vars: ['--shift-highlight-date-bg'] },
  // Shift pills
  { match: 'pill-mattina',               vars: ['--pill-mattina-bg', '--pill-mattina-text'] },
  { match: 'pill-pomeriggio',            vars: ['--pill-pomeriggio-bg', '--pill-pomeriggio-text'] },
  { match: 'pill-notte',                 vars: ['--pill-notte-bg', '--pill-notte-text'] },
  // Banner
  { match: 'banner-impersonate',         vars: ['--banner-impersonate-bg', '--banner-impersonate-text'] },
  // Match
  { match: 'panel-match',                vars: ['--match-panel-bg', '--match-panel-border'] },
  { match: 'text-match-count',           vars: ['--match-count-text'] },
  { match: 'text-match-pos',             vars: ['--match-pos-text'] },
  { match: 'text-match-none',            vars: ['--match-none-text'] },
  { match: 'text-match',                 vars: ['--match-text'] },
  { match: 'badge-match',                vars: ['--match-badge-bg', '--match-text'] },
  { match: 'btn-match-action',           vars: ['--match-action-bg', '--match-action-text'] },
  // Chain
  { match: 'panel-chain',                vars: ['--chain-panel-bg', '--chain-panel-border'] },
  { match: 'text-chain-node',            vars: ['--chain-node-text'] },
  { match: 'text-chain',                 vars: ['--chain-text'] },
  { match: 'badge-chain',                vars: ['--chain-badge-bg', '--chain-text'] },
  { match: 'btn-chain-action',           vars: ['--chain-action-bg', '--chain-action-text'] },
  // Chip
  { match: 'chip-selected',             vars: ['--chip-selected-bg', '--chip-selected-text', '--chip-selected-border'] },
  // Offered
  { match: 'offered-box',               vars: ['--offered-box-bg', '--offered-box-border'] },
  { match: 'text-offered-label',        vars: ['--offered-box-label'] },
  { match: 'text-offered-value',        vars: ['--offered-box-value'] },
  // My period
  { match: 'my-period-border',          vars: ['--my-period-border'] },
  { match: 'my-period-header',          vars: ['--my-period-header-bg'] },
  { match: 'my-period-content',         vars: ['--my-period-content-bg'] },
  { match: 'text-my-period',            vars: ['--my-period-text'] },
  { match: 'my-period-dot',             vars: ['--my-period-dot'] },
  // Period pills
  { match: 'p1-pill',                   vars: ['--period-1-pill-bg', '--period-1-pill-text'] },
  { match: 'p2-pill',                   vars: ['--period-2-pill-bg', '--period-2-pill-text'] },
  { match: 'p3-pill',                   vars: ['--period-3-pill-bg', '--period-3-pill-text'] },
  { match: 'p4-pill',                   vars: ['--period-4-pill-bg', '--period-4-pill-text'] },
  { match: 'p5-pill',                   vars: ['--period-5-pill-bg', '--period-5-pill-text'] },
  { match: 'p6-pill',                   vars: ['--period-6-pill-bg', '--period-6-pill-text'] },
  // Dialog pills
  { match: 'dialog-pill-m',             vars: ['--dialog-pill-mattina-border', '--dialog-pill-mattina-active-bg', '--dialog-pill-mattina-active-border', '--pill-mattina-text'] },
  { match: 'dialog-pill-p',             vars: ['--dialog-pill-pomeriggio-border', '--dialog-pill-pomeriggio-active-bg', '--dialog-pill-pomeriggio-active-border', '--pill-pomeriggio-text'] },
  { match: 'dialog-pill-n',             vars: ['--dialog-pill-notte-border', '--dialog-pill-notte-active-bg', '--dialog-pill-notte-active-border', '--pill-notte-text'] },
  // Badges
  { match: 'badge-noni',                vars: ['--badge-noni-bg', '--badge-noni-text'] },
  { match: 'badge-dco',                 vars: ['--badge-dco-bg', '--badge-dco-text'] },
  // Misc
  { match: 'btn-interest-on',           vars: ['--interest-btn-bg'] },
  { match: 'text-interest-date',        vars: ['--interest-date-color'] },
  { match: 'text-own-name',             vars: ['--own-name-color'] },
  { match: 'text-feedback-check',       vars: ['--feedback-check-color'] },
  { match: 'desk-schedule-border',      vars: ['--desk-schedule-border'] },
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
