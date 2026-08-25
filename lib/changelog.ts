export interface ChangelogEntry {
  version: number
  date: string
  title: string
  changes: string[]
}

export interface ChangelogData {
  entries: ChangelogEntry[]
  lastSeenVersion: number
}

// Fetch di entry + ultima versione vista dell'utente (server-side, tabella
// changelog_reads). Il popup mostra le entry con version > lastSeenVersion.
export async function fetchChangelog(): Promise<ChangelogData> {
  const res = await fetch('/api/changelog', { cache: 'no-store' })
  if (!res.ok) throw new Error('changelog fetch failed')
  const data = (await res.json()) as ChangelogData
  return { entries: data.entries ?? [], lastSeenVersion: data.lastSeenVersion ?? 0 }
}

// Marca la versione corrente come vista (persistita per utente su server).
// Solo il pulsante "Continua" del popup deve chiamarla: un dismiss del dialog
// NON deve segnare la versione come vista (il popup riappare al prossimo avvio).
export async function markChangelogSeen(version: number): Promise<void> {
  const res = await fetch('/api/changelog/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
  if (!res.ok) throw new Error('changelog mark seen failed')
}
