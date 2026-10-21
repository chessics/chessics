import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

const PORT = Number(process.argv[2] ?? 8317)
const ENGINE_BIN = process.env.STOCKFISH_BIN ?? 'stockfish'

const engine = spawn(ENGINE_BIN, [], { stdio: ['pipe', 'pipe', 'inherit'] })
engine.on('exit', (code) => {
  console.error(`[shim] stockfish exited (${code}) — shutting down`)
  process.exit(1)
})

let buffer = ''
let lineHandler = null
engine.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (lineHandler) lineHandler(line)
  }
})

function send(cmd) {
  engine.stdin.write(cmd + '\n')
}

function waitFor(predicate, onLine) {
  return new Promise((resolve) => {
    lineHandler = (line) => {
      if (onLine) onLine(line)
      if (predicate(line)) {
        lineHandler = null
        resolve(line)
      }
    }
  })
}

async function init() {
  send('uci')
  let engineId = 'unknown engine'
  await waitFor(
    (l) => l === 'uciok',
    (l) => {
      if (l.startsWith('id name ')) engineId = l.slice('id name '.length)
    }
  )
  send(`setoption name Threads value ${Number(process.env.STOCKFISH_THREADS ?? 4)}`)
  send('setoption name Hash value 256')
  send('isready')
  await waitFor((l) => l === 'readyok')
  console.log(`[shim] stockfish ready: ${engineId}, threads ${Number(process.env.STOCKFISH_THREADS ?? 4)}`)
}

let queue = Promise.resolve()

function mateCp(mateWhite, whiteToMove) {
  return mateWhite > 0 ? 10000 : mateWhite < 0 ? -10000 : (whiteToMove ? -10000 : 10000)
}

function lineResult(score, depth, pv, move, whiteToMove) {
  const sign = whiteToMove ? 1 : -1
  if (score?.unit === 'mate') {
    const mateWhite = score.value * sign
    const cp = mateCp(mateWhite, whiteToMove)
    return { centipawns: String(cp), eval: cp / 100, move, type: 'mate', mate: mateWhite, depth, continuationArr: pv }
  }
  const cp = (score?.value ?? 0) * sign
  return { centipawns: String(cp), eval: cp / 100, move, type: 'cp', mate: null, depth, continuationArr: pv }
}

function parseInfoLine(l) {
  const m = l.match(/\bscore (cp|mate) (-?\d+)/)
  if (!m) return null
  const d = l.match(/\bdepth (\d+)/)
  const k = l.match(/\bmultipv (\d+)/)
  const pv = l.match(/\bpv (.+)$/)
  return {
    index: k ? parseInt(k[1], 10) : 1,
    score: { unit: m[1], value: parseInt(m[2], 10) },
    depth: d ? parseInt(d[1], 10) : null,
    pv: pv ? pv[1].trim().split(/\s+/) : [],
  }
}

function evaluate(fen, depth, multiPv = 1) {
  const run = async () => {
    send('ucinewgame')
    send(`setoption name MultiPV value ${multiPv}`)
    send('isready')
    await waitFor((l) => l === 'readyok')
    send(`position fen ${fen}`)

    const last = new Map()
    const bestmoveLine = await new Promise((resolve) => {
      send(`go depth ${depth}`)
      waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const info = parseInfoLine(l)
          if (info) last.set(info.index, info)
        }
      ).then(resolve)
    })

    const bestmove = bestmoveLine.split(/\s+/)[1] ?? ''
    const whiteToMove = fen.split(' ')[1] !== 'b'
    const first = last.get(1)
    const result = lineResult(
      first?.score ?? null,
      first?.depth ?? null,
      first?.pv ?? [],
      bestmove === '(none)' ? '' : bestmove,
      whiteToMove
    )
    if (multiPv > 1) {
      result.lines = [...last.keys()]
        .sort((a, b) => a - b)
        .map((k) => {
          const info = last.get(k)
          return lineResult(info.score, info.depth, info.pv, info.pv[0] ?? '', whiteToMove)
        })
    }
    return result
  }

  const result = queue.then(run)
  queue = result.catch(() => {})
  return result
}

const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end()
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    try {
      const { fen, depth = 15, multiPv = 1 } = JSON.parse(body)
      if (!fen || typeof fen !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'fen required' }))
        return
      }
      const lines = Number.isInteger(multiPv) ? Math.min(Math.max(multiPv, 1), 5) : 1
      const result = await evaluate(fen, Math.min(Math.max(depth, 1), 20), lines)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  })
})

await init()
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[shim] listening on http://127.0.0.1:${PORT}`)
})
