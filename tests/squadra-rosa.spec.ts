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
}

async function rosa(): Promise<{ membri: Membro[]; teorie: Map<string, string[]> } | null> {
  const sb = adminClient()
  if (!sb) return null
  const [{ data: membri, error: e1 }, { data: schedule }] = await Promise.all([
    sb.from('shift_team_members').select('id,full_name,pattern').eq('team_id', SQUADRA_ROSA).order('sort_order'),
    sb.from('sala_schedule').select('month,schedule').order('month'),
  ])
  expect(e1, `lettura dei membri fallita: ${e1?.message ?? ''}`).toBeNull()
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
    membri: (membri ?? []).map(m => ({ id: m.id, full_name: m.full_name, pattern: (m.pattern ?? []).map(String) })),
    teorie,
  }
}

test.describe('Squadra rosa: la rotazione teorica di ROTONDO', () => {
  test.skip(!adminEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')

  test('84 giorni di rotazione, non una serie di G', async () => {
    const dati = await rosa()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rotondo = dati!.membri.find(m => m.id === ROTONDO)
    expect(rotondo, 'ROTONDO non è nella Squadra rosa').toBeTruthy()
    const p = rotondo!.pattern

    expect(p.length, 'il pattern deve coprire un ciclo intero (84 giorni)').toBe(84)
    expect(p.filter(t => t === 'G').length, 'nessun «G»: i G non sono rotazione').toBe(0)
    expect(p.filter(isSection).length, '8 giorni di lavoro su 12 → 56 turni di sezione su 84').toBe(56)
    // niente buchi (un '' = persona che sparisce dal teorico quel giorno)
    expect(p.filter(t => !t).length, 'nessuna classe vuota').toBe(0)

    // riposi negli STESSI giorni dei compagni che ruotano
    const riposi = (pat: string[]) => pat.map((t, i) => (isSection(t) ? -1 : i)).filter(i => i >= 0).join(',')
    const compagni = dati!.membri.filter(m => m.pattern.filter(isSection).length >= 14)
    expect(compagni.length, 'i quattro che ruotano (il quinto fa DCIF/PDCIF)').toBe(4)
    for (const c of compagni) {
      expect(riposi(c.pattern), `${c.full_name}: i riposi non coincidono con quelli di ROTONDO`).toBe(riposi(p))
    }
  })

  test('la griglia di 12 giorni copre 4/6/7/10, ogni giorno di lavoro', async () => {
    const dati = await rosa()
    expect(dati, 'client service-role non disponibile').not.toBeNull()
    const rotanti = dati!.membri.filter(m => m.pattern.filter(isSection).length >= 14)
    expect(rotanti.length).toBe(4)

    let giorniLavoro = 0
    for (let r = 0; r < 12; r++) {
      // tutti gli indici con la stessa classe di resto: il pattern si ripete ogni 12
      for (let i = r; i < 84; i += 12) {
        const per: Record<string, string[]> = { M: [], P: [] }
        for (const m of rotanti) {
          const t = m.pattern[i]
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
