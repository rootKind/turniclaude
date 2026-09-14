// Test contrattuale della persistenza react-query su IndexedDB (fase 2
// cache-first, 20/09/2026). Esercita lib/query-idb-cache.ts con un IDB FAKE
// in-memory: whitelist delle query persistibili, snapshot roundtrip con
// timestamp (restore fedele della freschezza), rimozione per prefisso
// (realtime) e wipe totale (logout).
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// ── Fake IndexedDB (stesso schema di check-sala-schedule-cache.mjs) ──────────
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
      getAll() { const r = new FakeRequest(); r._ok([...map().values()].map(v => JSON.parse(JSON.stringify(v)))); return r },
      getAllKeys() { const r = new FakeRequest(); r._ok([...map().keys()]); return r },
      openCursor(range) {
        const r = new FakeRequest()
        const hits = [...map().keys()].filter(k => range.includes(k))
        let i = 0
        const step = () => {
          if (i >= hits.length) { r._ok(undefined); return }
          const key = hits[i++]
          r._ok({
            key,
            value: JSON.parse(JSON.stringify(map().get(key))),
            delete: () => map().delete(key),
            continue: step,
          })
        }
        step()
        return r
      },
    }
  }
}

const dbs = new Map()
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
  // Eventi open ASINCRONI come nel IndexedDB reale (il chiamante assegna gli
  // handler DOPO open()): la lezione di check-sala-schedule-cache.mjs.
  queueMicrotask(() => {
    if (!db.stores.has('kv')) req.onupgradeneeded?.({ target: req })
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
// Node non ha il globale IDBKeyRange (esiste solo nel browser): stub minimo
// con `includes`, usato dal fake openCursor per il range del prefisso.
globalThis.IDBKeyRange = {
  bound(lower, upper, lowerOpen = false, upperOpen = false) {
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
    return {
      lower, upper, lowerOpen, upperOpen,
      includes(k) {
        if (cmp(k, lower) < 0 || (lowerOpen && cmp(k, lower) === 0)) return false
        if (cmp(k, upper) > 0 || (upperOpen && cmp(k, upper) === 0)) return false
        return true
      },
    }
  },
}

// ── Carica il modulo (import type → cancellati dal transpile) ────────────────
const dir = mkdtempSync(join(tmpdir(), 'query-idb-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
  writeFileSync(join(dir, 'query-idb-cache.js'), transpile(readFileSync('lib/query-idb-cache.ts', 'utf8')))
  const {
    isPersistableQuery, writeQueryCache, readAllQueryCache,
    removeQueryCacheByPrefix, wipeQueryCache,
  } = await import(pathToFileURL(join(dir, 'query-idb-cache.js')).href)

  // ── whitelist: SOLO anagrafiche ─────────────────────────────────────────────
  const q = queryKey => ({ queryKey })
  assert.ok(isPersistableQuery(q(['users', 'all'])), 'users persistibile')
  assert.ok(isPersistableQuery(q(['users', false])), 'users per-gruppo persistibile')
  assert.ok(isPersistableQuery(q(['shift-team-tree'])), 'albero squadre persistibile')
  assert.equal(isPersistableQuery(q(['shifts', false])), false, 'shifts NON persistibile (UI ottimistica)')
  assert.equal(isPersistableQuery(q(['vacation-requests'])), false, 'vacanze NON persistibili')
  assert.equal(isPersistableQuery(q(['tuoturno-schedule', '2026-09'])), false, 'mesi tuoturno NON in whitelist')

  // ── write + snapshot completo (chiave, dati, timestamp) ─────────────────────
  const users = [{ id: 'u1', cognome: 'ROSSI', nome: 'Mario' }]
  const tree = { types: [], adjustments: [] }
  await writeQueryCache(['users', 'all'], users, 1_000)
  await writeQueryCache(['shift-team-tree'], tree, 2_000)
  const entries = await readAllQueryCache()
  assert.equal(entries.length, 2, 'snapshot: due voci')
  const byKey = new Map(entries.map(e => [e.key, e]))
  assert.deepEqual(byKey.get(JSON.stringify(['users', 'all'])).data, users, 'utenti intacti')
  assert.equal(byKey.get(JSON.stringify(['users', 'all'])).at, 1_000, 'timestamp preservato (freschezza al restore)')
  assert.deepEqual(byKey.get(JSON.stringify(['shift-team-tree'])).data, tree, 'albero intatto')

  // ── sovrascrittura (fetch più recente) ──────────────────────────────────────
  await writeQueryCache(['users', 'all'], [{ id: 'u2' }], 3_000)
  const again = await readAllQueryCache()
  assert.equal(again.length, 2, 'sovrascrittura: nessuna voce duplicata')
  const usersEntry = again.find(e => e.key === JSON.stringify(['users', 'all']))
  assert.equal(usersEntry.data[0].id, 'u2', 'dato aggiornato')
  assert.equal(usersEntry.at, 3_000, 'timestamp aggiornato')

  // ── rimozione per prefisso (realtime) ───────────────────────────────────────
  await removeQueryCacheByPrefix(['users'])
  const afterPrefix = await readAllQueryCache()
  assert.equal(afterPrefix.length, 1, 'prefisso users: voce rimossa')
  assert.equal(afterPrefix[0].key, JSON.stringify(['shift-team-tree']), 'prefisso users: albero intatto')

  // ── wipe totale (logout) ────────────────────────────────────────────────────
  await writeQueryCache(['users', 'all'], users, 4_000)
  await wipeQueryCache()
  assert.equal((await readAllQueryCache()).length, 0, 'wipe: tutto svuotato')

  // ── tolleranza ai guasti (privacy/quota) ────────────────────────────────────
  broken = true
  assert.deepEqual(await readAllQueryCache(), [], 'guasto: snapshot → [], non crash')
  await writeQueryCache(['users', 'all'], users)  // no-throw
  await removeQueryCacheByPrefix(['users'])       // no-throw
  await wipeQueryCache()                          // no-throw
  broken = false

  console.log('ok: query-idb-cache (whitelist, snapshot+timestamp, prefissi, wipe, guasti)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
