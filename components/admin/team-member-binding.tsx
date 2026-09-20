'use client'
/**
 * Legame membro ↔ utente + iniziale degli omonimi (caso NEVANO, 14/09/2026).
 *
 * Il membro di squadra legato via shift_team_members.user_id è il «bare owner»
 * del cognome: le righe PDF con il solo cognome (es. «NEVANO») gli appartengono,
 * mentre l'omonimo matcha solo con l'iniziale («NEVANO G.»). Per questo il
 * full_name del membro legato DEVE portare l'iniziale: qui l'admin può
 * impostare il legame e, se il cognome è omonimo fra gli utenti e il nome è
 * senza iniziale, rinominare con un clic («NEVANO» → «NEVANO P.»).
 */
import { useMemo, useState } from 'react'
import { UserPlus, UserX } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildDuplicateCognomi } from '@/lib/utils'
import { cognomeKeyOf, formatSurnameInitial } from '@/lib/shift-teams-matching'
import type { UserProfile } from '@/types/database'

type MinimalUser = Pick<UserProfile, 'id' | 'nome' | 'cognome'>

/** Dato membro minimale (sottoinsieme di ShiftTeamMember) per i suggerimenti. */
export interface MemberLike {
  id: string
  full_name: string
  user_id: string | null
  is_active: boolean
}

/** Cognomi omonimi fra gli utenti, come chiavi normalizzate («nevano»). */
export function homonymCognomeKeys(users: MinimalUser[]): Set<string> {
  const dup = buildDuplicateCognomi(users)
  const keys = new Set<string>()
  for (const k of dup) keys.add(k.toLowerCase())
  return keys
}

/** Hint di omonimia per un membro. */
export interface HomonymHint {
  /** Il cognome del membro è omonimo fra gli utenti. */
  isHomonym: boolean
  /** Iniziale consigliata dal nome dell'utente legato («P»), '' se non deducibile. */
  suggestedInitial: string
  /** Nome completo consigliato («NEVANO P.»), null se non serve/illegibile. */
  suggestedName: string | null
}

export function homonymHintFor(
  member: MemberLike,
  users: MinimalUser[],
  homonymKeys: Set<string>,
): HomonymHint {
  const key = cognomeKeyOf(member.full_name)
  const isHomonym = !!key && homonymKeys.has(key)
  if (!isHomonym) return { isHomonym: false, suggestedInitial: '', suggestedName: null }
  const bound = member.user_id ? users.find(u => u.id === member.user_id) : undefined
  const initial = (bound?.nome ?? '').trim().charAt(0).toUpperCase()
  // nome consigliato solo se il full_name non ha già un'iniziale finale
  const tail = member.full_name.trim().split(/\s+/).pop() ?? ''
  const hasInitial = tail.length <= 2 && /^[A-Za-z]\.?$/.test(tail)
  const suggestedName = !hasInitial && initial ? formatSurnameInitial(key.charAt(0).toUpperCase() + key.slice(1), bound?.nome ?? '', true) : null
  return { isHomonym: true, suggestedInitial: initial, suggestedName }
}

/** PUT del legame verso l'API squadre (user_id null = scollega). */
export async function putMemberBinding(memberId: string, userId: string | null): Promise<void> {
  const res = await fetch('/api/admin/shift-teams', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'member', id: memberId, user_id: userId }),
  })
  const b = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(b.error || 'Errore')
}

/** Select del legame membro → utente. null = nessun legame. */
export function UserBindingSelect({ member, users, boundUserIds, run }: {
  member: MemberLike
  users: MinimalUser[]
  /** user_id GIÀ legati ad altri membri: non selezionabili. */
  boundUserIds: Set<string>
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const boundUser = member.user_id ? users.find(u => u.id === member.user_id) : undefined

  // un utente già legato a un ALTRO membro non è selezionabile
  const takenElsewhere = useMemo(() => {
    const ids = new Set(boundUserIds)
    ids.delete(member.user_id ?? '')
    return ids
  }, [boundUserIds, member.user_id])

  const setBinding = (userId: string) =>
    run(async () => {
      await putMemberBinding(member.id, userId || null)
    }, userId ? 'Utente legato al membro' : 'Legame rimosso')

  return (
    <div className="flex items-center gap-1.5">
      <UserPlus size={13} className="text-muted-foreground shrink-0" />
      <Select
        value={member.user_id ?? ''}
        onValueChange={v => setBinding(v ?? '')}
        items={[
          { value: '', label: '— Senza legame —' },
          ...users.map(u => ({ value: u.id, label: `${u.cognome} ${u.nome}` })),
        ]}
      >
        <SelectTrigger size="sm" className="h-7 flex-1 min-w-0 text-xs">
          <SelectValue placeholder="Legami a un utente…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">— Senza legame —</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={u.id} disabled={takenElsewhere.has(u.id)}>
              {`${u.cognome} ${u.nome}`}
              {takenElsewhere.has(u.id) ? ' (già legato)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {member.user_id && !boundUser && (
        <button
          title="L'utente legato non esiste più: rimuovi il legame"
          onClick={() => setBinding('')}
          className="p-1 rounded text-destructive hover:bg-destructive/10 shrink-0"
        >
          <UserX size={13} />
        </button>
      )}
    </div>
  )
}

/**
 * Riga di gestione per un membro: select del legame +, se il cognome è omonimo
 * fra gli utenti e il full_name è senza iniziale, suggerimento di rinomina
 * («NEVANO» → «NEVANO P.») applicabile con un clic (con conferma).
 *
 * LA RINOMINA È UN TASK, NON UNA DOMANDA (M4 del design system, 20/09/2026):
 * prima era `window.prompt` — la finestra del BROWSER, che in una PWA installata
 * su iOS compare come avviso di sistema in inglese, scollegato dall'app, e che
 * né HIG né Material riconoscono come controllo. Un input di testo è un TASK:
 * su iOS va in un foglio, su Android in un dialog centrato — cioè la forma che
 * `DialogContent` (M3) dà da solo con `shape="auto"`. Il valore parte
 * precompilato col suggerimento (era il secondo argomento del prompt), e
 * «Annulla» chiude senza toccare niente.
 */
export function MemberBindingRow({ member, users, boundUserIds, run }: {
  member: MemberLike
  users: MinimalUser[]
  boundUserIds: Set<string>
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const hint = homonymHintFor(member, users, homonymCognomeKeys(users))
  const [rinominaAperta, setRinominaAperta] = useState(false)
  const [nomeBozza, setNomeBozza] = useState('')

  const rinomina = (name: string) => {
    setRinominaAperta(false)
    if (!name || name === member.full_name) return
    void run(async () => {
      const res = await fetch('/api/admin/shift-teams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'member', id: member.id, full_name: name }),
      })
      const b = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(b.error || 'Errore')
    }, 'Membro rinominato')
  }

  return (
    <div className="space-y-1">
      <UserBindingSelect member={member} users={users} boundUserIds={boundUserIds} run={run} />
      {hint.isHomonym && hint.suggestedName && member.is_active && (
        <button
          type="button"
          onClick={() => { setNomeBozza(hint.suggestedName ?? ''); setRinominaAperta(true) }}
          className="text-left text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
        >
          Cognome omonimo fra gli utenti: aggiungi l&apos;iniziale (es. «{hint.suggestedName}»)
        </button>
      )}
      {hint.isHomonym && !hint.suggestedName && member.user_id && (
        <p className="text-[11px] text-muted-foreground">
          L&apos;iniziale è già presente: il bare «{cognomeKeyOf(member.full_name).toUpperCase()}» appartiene a questo membro.
        </p>
      )}

      {/* Il foglio della rinomina (dialog su Android/desktop): `shape="auto"` è
          tutto ciò che serve — la forma la decide la piattaforma, come per gli
          altri task. Il campo è precompilato col suggerimento; Enter conferma. */}
      <Dialog open={rinominaAperta} onOpenChange={setRinominaAperta}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Rinomina il membro</DialogTitle>
            <DialogDescription>
              Aggiungi l&apos;iniziale per disambiguare l&apos;omonimo: il cognome nudo
              appartiene alle righe PDF senza iniziale.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nomeBozza}
            onChange={e => setNomeBozza(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nomeBozza.trim()) rinomina(nomeBozza.trim()) }}
            aria-label="Nome del membro"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRinominaAperta(false)}>
              Annulla
            </Button>
            <Button size="sm" disabled={!nomeBozza.trim() || nomeBozza.trim() === member.full_name} onClick={() => rinomina(nomeBozza.trim())}>
              Rinomina
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
