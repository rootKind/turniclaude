// Genera le icone PWA «DEV» (icon-192-dev.png, icon-512-dev.png, apple-icon-dev.png)
// a partire dalle icone di produzione, aggiungendo in basso una banda
// gialla/nera a strisce diagonali — il segnale classico «lavori in corso».
// Codec PNG scritto a mano (decode → compositing → encode): il progetto non ha
// dipendenze immagini. Rilanciare se il logo cambia: node scripts/make-dev-icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// ── CRC32 (tabella standard PNG) ─────────────────────────────────────────────
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

// ── PNG decode (bit depth 8, non interlacciato, gray/RGB/RGBA) ───────────────
function decodePNG(bytes) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('non è un PNG')
  let off = 8
  let w = 0, h = 0, colorType = 0
  const idat = []
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off)
    const type = bytes.toString('ascii', off + 4, off + 8)
    const data = bytes.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error('bit depth ' + data[8] + ' non supportato')
      colorType = data[9]
      if (data[12] !== 0) throw new Error('interlacciato non supportato')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (!channels) throw new Error('color type ' + colorType + ' non supportato')
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const out = Buffer.alloc(h * stride)
  let pos = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = x >= channels && prev ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v = (v + a) & 0xff
      else if (filter === 2) v = (v + b) & 0xff
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      cur[x] = v
    }
  }
  return { w, h, channels, data: out }
}

// ── PNG encode (filtro 0, deflate) ───────────────────────────────────────────
function encodePNG(w, h, channels, data) {
  const stride = w * channels
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filtro None
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })
  const colorType = channels === 4 ? 6 : channels === 3 ? 2 : 0
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  const chunks = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]
  const chunk = (type, payload) => {
    const t = Buffer.from(type, 'ascii')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(payload.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([t, payload])))
    chunks.push(len, t, payload, crc)
  }
  chunk('IHDR', ihdr)
  chunk('IDAT', compressed)
  chunk('IEND', Buffer.alloc(0))
  return Buffer.concat(chunks)
}

// ── Banda «lavori in corso» ──────────────────────────────────────────────────
const YELLOW = [250, 204, 21]  // amber-400
const BLACK = [23, 23, 23]     // neutral-900

function addRibbon(img) {
  const { w, h, channels, data } = img
  const ribbonH = Math.max(6, Math.round(h * 0.16))
  const stripeW = Math.max(6, Math.round(h / 10))
  const edgeH = Math.max(1, Math.round(h * 0.006)) // bordino scuro sopra la banda
  const top = h - ribbonH
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels
      let col
      if (y < top + edgeH) {
        col = BLACK // bordino di separazione dal logo
      } else {
        const stripe = Math.floor((x + y) / stripeW) % 2
        col = stripe === 0 ? YELLOW : BLACK
      }
      data[i] = col[0]
      data[i + 1] = col[1]
      data[i + 2] = col[2]
      if (channels === 4) data[i + 3] = 255
    }
  }
}

// ── Esecuzione + self-check ──────────────────────────────────────────────────
const dir = path.join(process.cwd(), 'public', 'icons')
const jobs = [
  ['icon-192.png', 'icon-192-dev.png'],
  ['icon-512.png', 'icon-512-dev.png'],
  ['apple-icon.png', 'apple-icon-dev.png'],
]
for (const [src, dst] of jobs) {
  const img = decodePNG(fs.readFileSync(path.join(dir, src)))
  addRibbon(img)
  const out = encodePNG(img.w, img.h, img.channels, img.data)
  fs.writeFileSync(path.join(dir, dst), out)

  // verifica: rilegge il file generato e controlla dimensioni e pixel della banda
  const check = decodePNG(fs.readFileSync(path.join(dir, dst)))
  const px = (x, y) => {
    const i = (y * check.w + x) * check.channels
    return [check.data[i], check.data[i + 1], check.data[i + 2]]
  }
  const ribbonY = check.h - 2
  const samples = [px(0, ribbonY), px(Math.floor(check.w / 2), ribbonY), px(check.w - 1, ribbonY)]
  const okSize = check.w === img.w && check.h === img.h
  const okRibbon = samples.every(s =>
    (Math.abs(s[0] - 250) < 8 && Math.abs(s[1] - 204) < 8) || (Math.abs(s[0] - 23) < 8 && Math.abs(s[1] - 23) < 8),
  )
  const logoArea = px(Math.floor(check.w / 2), Math.floor(check.h / 3))
  console.log(
    dst, check.w + 'x' + check.h, (out.length / 1024).toFixed(1) + 'KB',
    '| size:' + (okSize ? 'OK' : 'FAIL'),
    '| ribbon:' + (okRibbon ? 'OK' : 'FAIL ' + JSON.stringify(samples)),
    '| logo:' + JSON.stringify(logoArea),
  )
  if (!okSize || !okRibbon) process.exitCode = 1
}
