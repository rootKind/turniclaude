// Test contrattuale della cache IndexedDB di /turnisala (20/09/2026).
// Esercita lib/sala-schedule-cache.ts con un IndexedDB FAKE in-memory
// (Node non ha IndexedDB): roundtrip write/read, scoping per utente,
// delete mirato, eviction (prune) con finestra teorica, wipe totale e
// tolleranza agli errori (privacy/quota → null, mai crash).
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// ── Fake IndexedDB minimo ma fedele (richieste async, tx, clone dei valori) ──
class FakeRequest {
  constructor() { this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = null }
  _ok(value) { queueMicrotask(() => { this.result = value; this.onsuccess?.({ target: this }) }) }
  _ko(err) { queueMicrotask(() => { this.error = err; this.onerror?.({ target: this }) }) }
}

class FakeTx {
  constructor(db, mode) { this.db = db; this.mode = mode; this.oncomplete = null; this.onerror = null; this.onabort = null }
  objectStore(name) {
    const tx = this
    const map = () => tx.db.stores.get(name)
    // La tx completa in un MACROtask: tutte le microtask delle request
    // (che leggono req.result) sono già girate, come nel IndexedDB reale.
    queueMicrotask(() => setTimeout(() => tx.oncomplete?.(), 0))
    return {
      get(key) { const r = new FakeRequest(); const v = map().get(key); r._ok(v === undefined ? undefined : JSON.parse(JSON.stringify(v))); return r },
      put(value, key) {
        const r = new FakeRequest()
        if (tx.mode === 'readonly') { r._ko(new Error('readonly')); return r }
        map().set(key, JSON.parse(JSON.stringify(value))); r._ok(key); return r
      },
      delete(key) { const r = new FakeRequest(); if (tx.mode === 'readonly') { r._ko(new Error('readonly')); return r } map().delete(key); r._ok(undefined); return r },
      clear() { const r = new FakeRequest(); if (tx.mode === 'readonly') { r._ko(new Error('readonly')); return r } map().clear(); r._ok(undefined); return r },
      getAllKeys() { const r = new FakeRequest(); r._ok([...map().keys()]); return r },
    }
  }
}

const dbs = new Map() // nome → { stores: Map<storeName, Map<key, value>> }

function fakeOpen(name /* , version */) {
  const req = new FakeRequest()
  const db = dbs.get(name) ?? { stores: new Map() }
  dbs.set(name, db)
  req.result = {
    objectStoreNames: { contains: n => db.stores.has(n) },
    createObjectStore: n => { db.stores.set(n, new Map()) },
    transaction: (_names, mode) => new FakeTx(db, mode),
    close() { },
  }
  // Come nel IndexedDB reale, gli eventi open arrivano SEMPRE in un task
  // successivo: il chiamante fa `const req = open(); req.onupgradeneeded = …`
  // e gli handler devono già esserci quando l'evento parte.
  queueMicrotask(() => {
    if (!db.stores.has('months')) req.onupgradeneeded?.({ target: req })
    req.onsuccess?.({ target: req })
  })
  return req
}

let broken = false
globalThis.indexedDB = {
  open(name, version) {
    if (broken) {
      const req = new FakeRequest()
      req._ko(new Error('simulated privacy/quota failure'))
      return req
    }
    return fakeOpen(name, version)
  },
}

// ── Carica il modulo (transpilato, come dagli altri script di contratto) ─────
const dir = mkdtempSync(join(tmpdir(), 'sala-cache-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  const cache = transpile(readFileSync('lib/sala-schedule-cache.ts', 'utf8'))
  writeFileSync(join(dir, 'sala-schedule-cache.js'), cache) // import type → eraso
  const {
    readCachedSchedule, writeCachedSchedule, deleteCachedSchedule,
    pruneSalaScheduleCache, wipeSalaScheduleCache,
  } = await import(pathToFileURL(join(dir, 'sala-schedule-cache.js')).href)

  const month = (y, m) => `${y}-${String(m).padStart(2, '0')}`
  const sched = (y, m) => ({
    month: month(y, m),
    schedule: { 1: { surname: 'ROSSI', shift: 'M4' } },
    uploaded_at: '2026-09-20T10:00:00Z',
    data: { v: 2, days: 30, codes: [], names: [], rows: [] },
  })

  // ── roundtrip write/read ────────────────────────────────────────────────────
  await writeCachedSchedule('userA', sched(2026, 9))
  const got = await readCachedSchedule('userA', '2026-09')
  assert.deepEqual(got, sched(2026, 9), 'roundtrip restituisce lo schedule identico')
  assert.notEqual(got, null, 'mese in cache letto')

  // ── scoping per utente ──────────────────────────────────────────────────────
  assert.equal(await readCachedSchedule('userB', '2026-09'), null, 'altro utente: cache NON visibile')
  await writeCachedSchedule('userB', sched(2026, 9))
  await writeCachedSchedule('userB', sched(2026, 10))

  // ── delete mirato ───────────────────────────────────────────────────────────
  await deleteCachedSchedule('userB', '2026-09')
  assert.equal(await readCachedSchedule('userB', '2026-09'), null, 'delete: mese userB rimosso')
  assert.notEqual(await readCachedSchedule('userA', '2026-09'), null, 'delete: mese userA intatto')
  assert.notEqual(await readCachedSchedule('userB', '2026-10'), null, 'delete: altro mese intatto')

  // ── eviction: 24 mesi max, tiene uploaded + finestra mese−1..+12 ────────────
  // userB ora ha 2026-10 (+48 mesi teorici 2020–2023) → ben oltre il limite.
  // NB: userB:sala-2026-09 è stato cancellato nel passo «delete mirato».
  for (let y = 2020; y <= 2023; y++) for (let m = 1; m <= 12; m++) await writeCachedSchedule('userB', sched(y, m))
  const before = await readCachedSchedule('userB', '2020-06')
  assert.notEqual(before, null, 'pre-prune: mese 2020 in cache')
  await pruneSalaScheduleCache('userB', ['2026-10'])
  assert.equal(await readCachedSchedule('userB', '2020-06'), null, 'post-prune: mese fuori finestra eliminato')
  assert.notEqual(await readCachedSchedule('userB', '2026-10'), null, 'post-prune: mese caricato tenuto')
  const now = new Date()
  const inWindow = month(now.getFullYear(), (now.getMonth() + 3) % 12 + 1) // +3 → dentro −1..+12
  await writeCachedSchedule('userB', sched(Number(inWindow.slice(0, 4)), Number(inWindow.slice(5))))
  await pruneSalaScheduleCache('userB', ['2026-09'])
  assert.notEqual(await readCachedSchedule('userB', inWindow), null, 'post-prune: mese nella finestra teorica tenuto')

  // ── wipe totale (logout) ────────────────────────────────────────────────────
  await wipeSalaScheduleCache()
  assert.equal(await readCachedSchedule('userA', '2026-09'), null, 'wipe: userA svuotato')
  assert.equal(await readCachedSchedule('userB', inWindow), null, 'wipe: userB svuotato')

  // ── tolleranza ai guasti (privacy mode / quota) ─────────────────────────────
  broken = true
  assert.equal(await readCachedSchedule('userA', '2026-09'), null, 'guasto: read → null, non crash')
  await writeCachedSchedule('userA', sched(2026, 9))   // no-throw
  await deleteCachedSchedule('userA', '2026-09')       // no-throw
  await pruneSalaScheduleCache('userA', ['2026-09'])   // no-throw
  await wipeSalaScheduleCache()                        // no-throw
  broken = false

  console.log('ok: sala-schedule-cache (roundtrip, scoping utenti, delete, prune, wipe, guasti)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
