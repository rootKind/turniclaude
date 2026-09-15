// Analisi celle GIALLE nel PDF (row.y): chi è giallo, con che codice reale/teorico,
// e se i gialli dello stesso giorno formano coppie (richiedente + sostituto).
import fs from 'node:fs'
import path from 'node:path'
const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const base = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const get = async (table, qs) => {
  const r = await fetch(`${base}/rest/v1/${table}?${qs}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  return r.json()
}
const months = await get('sala_schedule', 'select=month,schedule&order=month.asc')
let totalYellow = 0
const byCode = {}
const dayClusters = []
for (const { month, schedule: data } of months) {
  
  const code = i => data.codes[i ?? 0] ?? ''
  const yellows = []
  data.names.forEach((n, r) => {
    for (const d of (data.rows[r]?.y ?? [])) yellows.push({ name: n, day: d, real: code(data.rows[r]?.d?.[d-1]), teo: code(data.rows[r]?.t?.[d-1]) })
  })
  totalYellow += yellows.length
  const byDay = {}
  for (const y of yellows) (byDay[y.day] ??= []).push(y)
  for (const [d, group] of Object.entries(byDay)) {
    if (group.length >= 2) dayClusters.push({ month, day: +d, people: group.map(g => `${g.name}(${g.real || '·'}/${g.teo || '·'})`) })
    for (const g of group) {
      const k = g.real || 'VUOTA'
      byCode[k] = (byCode[k] ?? 0) + 1
    }
  }
  if (yellows.length) console.log(`${month}: ${yellows.length} gialli — es: ${yellows.slice(0, 4).map(g => `${g.name} g${g.day} reale=${g.real || '·'} teo=${g.teo || '·'}`).join(' | ')}`)
}
console.log(`\nTOTALE gialli: ${totalYellow}`)
console.log('Codice REALE nei giorni gialli:', JSON.stringify(byCode))
console.log(`\nCluster stessi-giorno (>=2 gialli): ${dayClusters.length}`)
dayClusters.slice(0, 12).forEach(c => console.log(`  ${c.month} g${c.day}: ${c.people.join(' + ')}`))
