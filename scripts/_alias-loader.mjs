// Loader NODE per le sonde: risolve l'alias `@/…` (tsconfig paths) come
// file .ts/.tsx della radice del progetto. Serve a importare il codice REALE
// (lib/turni-teorici.ts e amici) da uno script .mjs, senza duplicarlo.
//
//   PROBE_ROOT=<radice> node --import ... scripts/sonda-x.mjs
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.PROBE_ROOT ?? process.cwd()

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const abs = path.resolve(ROOT, specifier.slice(2))
    for (const cand of [abs, `${abs}.ts`, `${abs}.tsx`, path.join(abs, 'index.ts')]) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return { url: pathToFileURL(cand).href, shortCircuit: true }
      }
    }
  }
  return next(specifier, context)
}
