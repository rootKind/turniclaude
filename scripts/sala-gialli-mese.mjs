// QUANTO È RICCO IL MESE CARICATO (16/09/2026).
//
// `node scripts/sala-gialli-mese.mjs [YYYY-MM]`
//
// I test dei gialli (`tests/chip-gialle.spec.ts`, `tests/dipendente.spec.ts`) sono
// tarati su un mese con MOLTE celle gialle: se in /turnisala si ricarica il PDF
// vero del mese, le loro guardie («la prova passerebbe a vuoto») diventano rosse.
// Questa sonda dice in un colpo se è cambiato il DATO invece del codice: righe con
// `y` non vuoto, celle gialle per mese, e per il mese scelto i giorni in cui i
// gialli cadono con le persone.
//
// Lettura sola, service-role da `.env.local` (la riga `sala_schedule` è protetta).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const voluto = process.argv[2]
const { data, error } = await sb.from('sala_schedule').select('month, schedule, uploaded_at')
if (error) throw error

for (const r of [...data].sort((a, b) => a.month.localeCompare(b.month))) {
  const rows = r.schedule.rows ?? []
  const conY = rows.filter(p => (p.y ?? []).length)
  const celle = rows.reduce((n, p) => n + (p.y ?? []).length, 0)
  const giorni = [...new Set(rows.flatMap(p => p.y ?? []))].sort((a, b) => a - b)
  console.log(
    `${r.month}  caricato ${r.uploaded_at}  righe=${rows.length}  persone con gialli=${conY.length}` +
    `  celle gialle=${celle}  giorni con gialli=${giorni.join(',') || '—'}`,
  )
}

const mese = voluto ?? '2026-09'
const row = data.find(r => r.month === mese)
if (!row) {
  console.log(`\n${mese}: mese non caricato`)
} else {
  const rows = row.schedule.rows ?? []
  const names = row.schedule.names ?? []
  console.log(`\n${mese}: persone con celle gialle (riga → giorni)`)
  for (const p of rows) {
    if (!(p.y ?? []).length) continue
    const nome = names[rows.indexOf(p)] ?? `riga ${rows.indexOf(p)}`
    console.log(`  ${String(nome).padEnd(18)} ${p.y.join(', ')}`)
  }
}
