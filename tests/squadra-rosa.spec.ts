import { test, expect } from '@playwright/test'
import { decodeSalaMonth } from '../lib/sala-month'
import type { SalaMonthData } from '../types/database'
import { adminClient, adminEnabled } from './supabase-admin'

/**
 * LA ROTAZIONE DELLA SQUADRA ROSA — il caso ROTONDO (16/09/2026).
 *
 * Il problema non era nella pagina: il suo pattern TEORICO nel DB aveva 84
 * giorni con **46 «G»** e un solo passaggio sulle sezioni, mentre i compagni
 * girano su 4/6/7/10. La causa: `scripts/apply-super-cycle.mjs` derivava il
 * pattern per MAGGIORANZA per classe di resto dalla storia dei PDF, senza
 * distinguere i codici che non dicono niente sulla rotazione — e da maggio il
 * teorico di ROTONDO è una serie di G, che ha vinto la maggioranza in 46 classi
 * su 84. Da lì la card «scoperta» ogni volta che la sua sezione restava vuota
 * (lavoro precedente sui minimi) e il teorico di /turnisala che non lo metteva
 * mai in sezione.
 *
 * Questi test difendono i TRE invarianti che rendono la rotazione una rotazione.
 * Girano sui dati VERI (service-role), non su fixture: è l'unico modo di
 * accorgersi se un'altra passata di `apply-super-cycle.mjs --apply` rifà il
 * danno. Senza chiavi si saltano, come gli altri test che hanno bisogno del DB.
 *
 *  1. «84 turni, non una serie di G»: 56 turni di sezione su 84 (8 su 12 è il
 *     ritmo della squadra: 4 sezioni × M/P) e ZERO G.
 *  2. «la griglia di 12 giorni regge»: in ogni giorno di LAVORO del ciclo le
 *     quattro sezioni 4/6/7/10 sono coperte una volta sola (chi lavora, chi
 *     riposa e in che sezione lo dice la griglia).
 *  3. «il pattern riproduce il teorico dei PDF»: giorno per giorno, per tutto il
 *     periodo in cui l'ufficio lo pianificava ancora sulla rotazione (dal 1/3 al
 *     primo «G», 10/5/2026): 71 giorni, zero scarti. È la prova che il pattern
 *     ricostruito non è un'invenzione dell'app.
 */

const SQUADRA_ROSA = '20000000-0000-4000-8000-000000000007'
const ROTONDO = '30000000-0000-4000-8000-000000000059'
/** Primo giorno coperto dai PDF: da qui partono i cicli (pattern_start). */
const ANCHOR = '2026-03-01'
const SEZIONI_SQUADRA = ['4', '6', '7', '10']

const isSection = (t: string | null | undefined): boolean => /^[MNP]\d/.test(t ?? '')
const dayKey = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

interface Membro {
  id: string
  full_name: string
  pattern: string[]
  patterns: { from_date: string; pattern: string[] }[]
}

interface Rosa {
  membri: Membro[]
  teorie: Map<string, string[]>
  /** Il ciclo del membro IN VIGORE in quella data (migration 037): la squadra
   *  rosa ha due assetti, quattro che ruotano fino al 30/09 e cinque da
   *  ottobre. Misurare il ciclo di base metterebbe i due insieme. */
  ciclo: (m: Membro, dataISO: string) => string[]
}

async function rosa(): Promise<Rosa | null> {
  const sb = adminClient()
  if (!sb) return null
  const [{ data: membri, error: e1 }, { data: schedule }, { data: storico }] = await Promise.all([
    sb.from('shift_team_members').select('id,full_name,pattern').eq('team_id', SQUADRA_ROSA).order('sort_order'),
    sb.from('sala_schedule').select('month,schedule').order('month'),
    sb.from('shift_member_patterns').select('member_id,from_date,pattern'),
  ])
  expect(e1, `lettura dei membri fallita: ${e1?.message ?? ''}`).toBeNull()
  const perMembro = new Map<string, { from_date: string; pattern: string[] }[]>()
  for (const r of (storico ?? []) as { member_id: string; from_date: string; pattern: string[] }[]) {
    if (!perMembro.has(r.member_id)) perMembro.set(r.member_id, [])
    perMembro.get(r.member_id)!.push({ from_date: String(r.from_date).slice(0, 10), pattern: (r.pattern ?? []).map(String) })
  }
  // teorico di ROTONDO per data ISO, dai mesi PDF caricati (v2)
  const teorie = new Map<string, string[]>()
  for (const row of schedule ?? []) {
    const raw = row.schedule as unknown as SalaMonthData | null
    if (!raw || raw.v !== 2) continue
    const p = decodeSalaMonth(raw).find(x => x.name.toUpperCase().includes('ROTONDO'))
    if (!p) continue
    for (let d = 1; d <= raw.days; d++) {
      const iso = `${row.month}-${String(d).padStart(2, '0')}`
      teorie.set(iso, [p.teorico[d - 1] ?? '', p.days[d - 1] ?? ''])
    }
  }
  return {
    membri: (membri ?? []).map(m => ({
      id: m.id,
      full_name: m.full_name,
      pattern: (m.pattern ?? []).map(String),
      patterns: perMembro.get(m.id) ?? [],
    })),
    teorie,
    ciclo: (m, dataISO) => {
      const righe = [...(m.patterns ?? [])].filter(r => r.from_date <= dataISO).sort((a, b) => a.from_date.localeCompare(b.from_date))
      return (righe.pop()?.pattern ?? m.pattern) as string[]
    },
  }
}

/** Chi ruota sulla griglia di 12 giorni: cicli da 84 token con almeno 14 turni
 *  di sezione. Un ciclo di 252 (LONI nelle scorte fino al 30/09) ha decine di
 *  turni di sezione ma non gira sulla griglia della rosa. */
const ruotano = (membri: Membro[], ciclo: (m: Membro, d: string) => string[], data: string) =>
  membri.filter(m => {
    const p = ciclo(m, data)
    return p.length === 84 && p.filter(isSection).length >= 14
  })

test.describe('Squadra rosa: la rotazione teorica di ROTONDO', () => {
  test.skip(!adminEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')

  test('84 giorni di rotazione, non una serie di G', async () => {
    const dati = await rosa()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rotondo = dati!.membri.find(m => m.id === ROTONDO)
    expect(rotondo, 'ROTONDO non è nella Squadra rosa').toBeTruthy()
    // l'assetto di questo test è quello fino al 30/09: quattro che ruotano più
    // il caposquadra. Dal 1° ottobre sono cinque (c'è anche LONI dalla rosa) e
    // lo verifica il test dopo.
    const p = dati!.ciclo(rotondo!, '2026-09-30')

    expect(p.length, 'il pattern deve coprire un ciclo intero (84 giorni)').toBe(84)
    expect(p.filter(t => t === 'G').length, 'nessun «G»: i G non sono rotazione').toBe(0)
    expect(p.filter(isSection).length, '8 giorni di lavoro su 12 → 56 turni di sezione su 84').toBe(56)
    // niente buchi (un '' = persona che sparisce dal teorico quel giorno)
    expect(p.filter(t => !t).length, 'nessuna classe vuota').toBe(0)

    // riposi negli STESSI giorni dei compagni che ruotano
    const riposi = (pat: string[]) => pat.map((t, i) => (isSection(t) ? -1 : i)).filter(i => i >= 0).join(',')
    const compagni = ruotano(dati!.membri, dati!.ciclo, '2026-09-30')
    expect(compagni.length, 'i quattro che ruotano (il quinto fa DCIF/PDCIF)').toBe(4)
    for (const c of compagni) {
      expect(riposi(dati!.ciclo(c, '2026-09-30')), `${c.full_name}: i riposi non coincidono con quelli di ROTONDO`).toBe(riposi(p))
    }
  })

  test('la griglia di 12 giorni copre 4/6/7/10, ogni giorno di lavoro', async () => {
    const dati = await rosa()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rotanti = ruotano(dati!.membri, dati!.ciclo, '2026-09-30')
    expect(rotanti.length).toBe(4)

    let giorniLavoro = 0
    for (let r = 0; r < 12; r++) {
      // tutti gli indici con la stessa classe di resto: il pattern si ripete ogni 12
      for (let i = r; i < 84; i += 12) {
        const per: Record<string, string[]> = { M: [], P: [] }
        for (const m of rotanti) {
          const t = dati!.ciclo(m, '2026-09-30')[i]
          if (isSection(t)) per[t[0]].push(t.replace(/[TS]$/, '').slice(1))
        }
        const sezioneVuota = per.M.length === 0 && per.P.length === 0
        if (sezioneVuota) continue
        giorniLavoro++
        for (const turno of ['M', 'P'] as const) {
          if (per[turno].length === 0) continue
          expect(
            per[turno].slice().sort((a, b) => Number(a) - Number(b)),
            `giorno ${i} (classe ${r}) turno ${turno}: le quattro sezioni devono essere coperte una volta sola`,
          ).toEqual(SEZIONI_SQUADRA)
        }
      }
    }
    expect(giorniLavoro, 'giorni di lavoro nel ciclo (8 su 12)').toBe(56)
  })

  test('dal 1° ottobre la rosa ha cinque righe e copre 4/5/6/7/10 in un turno solo', async () => {
    const dati = await rosa()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rotanti = ruotano(dati!.membri, dati!.ciclo, '2026-10-15')
    expect(rotanti.length, 'dal 1° ottobre ruotano in cinque (LONI prende la quinta riga)').toBe(5)
    // cinque persone diverse: due sullo stesso indice non sarebbero due righe
    const nomi = rotanti.map(m => m.full_name).sort()
    expect(new Set(nomi).size, `ripetizioni fra chi ruota: ${nomi.join(', ')}`).toBe(5)

    // L'assetto di ottobre NON è quello di prima: la squadra copre le cinque
    // sezioni 4/5/6/7/10 (la 5 è la JOLLY) e tutte quante nello STESSO turno,
    // mentre prima erano quattro sezioni in mattina e quattro in pomeriggio.
    const SEZIONI_OTTOBRE = ['4', '5', '6', '7', '10']
    const problemi: string[] = []
    let giorniLavoro = 0
    for (let i = 0; i < 84; i++) {
      const per: Record<string, string[]> = { M: [], P: [] }
      for (const m of rotanti) {
        const t = dati!.ciclo(m, '2026-10-15')[i]
        if (isSection(t)) per[t[0]].push(t.replace(/[TS]$/, '').slice(1))
      }
      if (per.M.length === 0 && per.P.length === 0) continue
      giorniLavoro++
      const m = [...per.M].sort((a, b) => Number(a) - Number(b)).join(',')
      const p = [...per.P].sort((a, b) => Number(a) - Number(b)).join(',')
      const atteso = SEZIONI_OTTOBRE.join(',')
      if (!((m === atteso && p === '') || (p === atteso && m === ''))) {
        problemi.push(`giorno ${i}: M ${m || 'vuoto'} · P ${p || 'vuoto'}`)
      }
    }
    expect(problemi.slice(0, 6), `la rosa di ottobre non copre 4/5/6/7/10 una volta sola in un turno:\n${problemi.slice(0, 12).join('\n')}`).toEqual([])
    expect(giorniLavoro, 'giorni di lavoro nel ciclo').toBeGreaterThan(0)
  })

  test('il pattern riproduce il teorico dei PDF di ROTONDO', async () => {
    const dati = await rosa()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rotondo = dati!.membri.find(m => m.id === ROTONDO)!
    const previsto = (iso: string) => {
      const i = ((dayKey(iso) - dayKey(ANCHOR)) % 84 + 84) % 84
      return rotondo.pattern[i]
    }

    // Dal 1/3 fino al primo «G» del teorico: lì l'ufficio lo pianificava ancora
    // sulla rotazione e il PDF è la verità contro cui misurarsi.
    const date = [...dati!.teorie.keys()].sort()
    const scarti: string[] = []
    let confrontati = 0
    for (const iso of date) {
      const [teorico] = dati!.teorie.get(iso)!
      if (teorico === 'G') break
      if (!/^[MNP]\d/.test(teorico) && !/^(RI|RC|RM|D)$/.test(teorico)) continue
      confrontati++
      if (previsto(iso) !== teorico) scarti.push(`${iso}: PDF ${teorico} vs pattern ${previsto(iso)}`)
    }
    expect(confrontati, 'giorni di rotazione confrontati (1/3 → 10/5/2026)').toBeGreaterThanOrEqual(60)
    expect(scarti, `il pattern non riproduce il teorico del PDF:\n${scarti.slice(0, 12).join('\n')}`).toEqual([])
  })
})

/**
 * GLI INVARIANTI DEL RILIEVO E DELLO SCAMBIO LONI ↔ MAROTTA (27/09/2026).
 *
 * Sono qui perché stanotte sono falliti due modi diversi, e nessuno dei due si
 * vedeva dalla UI: la riga di storico «ombreggia» la colonna, e un ciclo può
 * essere più corto o più lungo del `cycle_days` della tipologia.
 *
 *  1. **La riga col `from_date` = `pattern_start` deve coincidere con la
 *     colonna.** Il backfill della migration 037 l'ha creata copiando la
 *     colonna, e se le due divergono vince la riga: correggere il ciclo di base
 *     senza la riga non cambia nessun turno, e sembra un salvataggio riuscito.
 *  2. **Ogni persona del rilievo ha il super-ciclo da 252 dal 1° ottobre**, e
 *     9 persone in 9 slot diversi: due sullo stesso slot non sarebbero due
 *     rotazioni diverse, sarebbero la stessa persona due volte.
 *  3. **MAROTTA sta nella squadra di NEVANO** e dal 1°October ha lo slot 16,
 *     che era di LONI (è l'unico dei 252 sfalsamenti che riproduce i turni di
 *     LONI nel PDF di luglio–settembre, 31/31, 31/31, 30/30).
 */
test.describe('Rilievo: super-ciclo e scambio LONI ↔ MAROTTA', () => {
  test.skip(!adminEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')

  interface MembroDb {
    id: string
    full_name: string
    team_id: string
    pattern: string[]
  }
  interface RigaStorico {
    member_id: string
    from_date: string
    pattern: string[]
  }

  async function carica(): Promise<{ membri: MembroDb[]; righe: RigaStorico[]; squadre: Map<string, string> } | null> {
    const sb = adminClient()
    if (!sb) return null
    const [{ data: membri, error: e1 }, { data: righe, error: e2 }, { data: squadre }] = await Promise.all([
      sb.from('shift_team_members').select('id,full_name,team_id,pattern'),
      sb.from('shift_member_patterns').select('member_id,from_date,pattern'),
      sb.from('shift_teams').select('id,name'),
    ])
    expect(e1, `lettura dei membri fallita: ${e1?.message ?? ''}`).toBeNull()
    expect(e2, `lettura dello storico fallita: ${e2?.message ?? ''}`).toBeNull()
    return {
      membri: (membri ?? []) as unknown as MembroDb[],
      righe: (righe ?? []) as RigaStorico[],
      squadre: new Map(((squadre ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name])),
    }
  }

  const stessi = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i])

  test('la riga di storico del pattern_start coincide con la colonna', async () => {
    const dati = await carica()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const disallineati: string[] = []
    let confrontate = 0
    for (const m of dati!.membri) {
      const righeMembro = dati!.righe.filter(r => r.member_id === m.id)
      const riga = righeMembro.find(r => r.from_date === ANCHOR)
      if (!riga) {
        // Niente riga al pattern_start è lecito SOLO per chi è entrato DOPO:
        // il subentro (COPPOLA in ASTER dal 01/09/2026) ha la colonna vuota e
        // il primo storico più avanti. Con la colonna valorizzata la riga al
        // pattern_start deve esserci, altrimenti la colonna non è ombreggiata.
        const prima = righeMembro.map(r => r.from_date).sort()[0]
        if ((m.pattern ?? []).length > 0 || !prima || prima <= ANCHOR) {
          disallineati.push(`${m.full_name}: nessuna riga al ${ANCHOR} (primo storico ${prima ?? '—'}, colonna ${(m.pattern ?? []).length} token)`)
        }
        continue
      }
      confrontate++
      if (!stessi((riga.pattern ?? []).map(String), (m.pattern ?? []).map(String))) {
        disallineati.push(`${m.full_name}: colonna ${m.pattern.length} token, riga ${riga.pattern.length} — la riga vince`)
      }
    }
    expect(confrontate, 'membri con storico').toBeGreaterThan(0)
    expect(disallineati, `riga di storico e colonna divergono:\n${disallineati.join('\n')}`).toEqual([])
  })

  test('i 9 del rilievo hanno 9 slot diversi sul ciclo da 252', async () => {
    const dati = await carica()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rilievo = dati!.membri
      .filter(m => /^Rilievo [A-D]$/.test(dati!.squadre.get(m.team_id) ?? ''))
      .filter(m => dati!.righe.some(r => r.member_id === m.id && r.from_date === '2026-10-01'))
    expect(rilievo.length, 'persone con il ciclo da 252 dal 1° ottobre').toBe(9)

    const impronte = new Map<string, string>()
    for (const m of rilievo) {
      const ciclo = dati!.righe.find(r => r.member_id === m.id && r.from_date === '2026-10-01')!.pattern.map(String)
      expect(ciclo.length, `${m.full_name}: il ciclo di ottobre dev'essere da 252`).toBe(252)
      // i 4 jolly del ciclo generico diventano turni J: senza questo, il
      // super-ciclo si porterebbe dietro il significato vecchio del jolly
      expect(ciclo.filter(t => /J$/.test(t)).length, `${m.full_name}: jolly di ottobre`).toBe(4)
      // impronta in ORDINE: due rotazioni diverse hanno gli stessi token, solo
      // in posizioni diverse
      impronte.set(m.full_name, ciclo.join(' '))
    }
    const distinti = new Set(impronte.values())
    expect(distinti.size, `due persone sullo stesso slot:\n${[...impronte.keys()].join(', ')}`).toBe(9)
  })

  test('MAROTTA è nella squadra di NEVANO e prende lo slot 16', async () => {
    const dati = await carica()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const marotta = dati!.membri.find(m => m.full_name === 'MAROTTA')
    const nevano = dati!.membri.find(m => m.full_name.startsWith('NEVANO'))
    expect(marotta, 'MAROTTA non è tra i membri').toBeTruthy()
    expect(nevano, 'NEVANO non è tra i membri').toBeTruthy()
    expect(marotta!.team_id, 'MAROTTA deve stare nella squadra di NEVANO').toBe(nevano!.team_id)

    // lo slot 16 è il ciclo di MAROTTA da ottobre; lo slot di NEVANO è un altro
    const slotDi = (m: MembroDb): string[] =>
      dati!.righe.find(r => r.member_id === m.id && r.from_date === '2026-10-01')!.pattern.map(String)
    expect(slotDi(marotta!).length, 'il ciclo di ottobre di MAROTTA').toBe(252)
    expect(stessi(slotDi(marotta!), slotDi(nevano!)), 'MAROTTA e NEVANO non possono avere lo stesso slot').toBe(false)

    // Anche il ciclo di BASE di MAROTTA è il super-ciclo, non un suo ciclo corto
    // da 28: è una persona che sta nella squadra delle scorte, e «oggi il
    // teorico mostrerebbe già novembre» (utente, 27/09/2026). Il prezzo è noto:
    // i suoi turni di luglio–settembre non combaciano più con quei PDF, perché
    // la rotazione di allora era un'altra (il gruppo rilievo scende dal 100% al
    // ~92% su quei tre mesi, e solo per le sue celle).
    const base = dati!.righe.find(r => r.member_id === marotta!.id && r.from_date === ANCHOR)!.pattern.map(String)
    expect(base.length, 'il ciclo di base di MAROTTA è il super-ciclo da 252').toBe(252)
    // e coincide con quello di ottobre, a jolly vecchio: stessa rotazione
    const a = base.filter(t => /J$/.test(t)).length
    const b = slotDi(marotta!).filter(t => /J$/.test(t)).length
    expect(a, 'nel ciclo di base il jolly è ancora M5T, non MJ').toBe(0)
    expect(b, 'da ottobre il jolly è MJ').toBe(4)
  })
})
