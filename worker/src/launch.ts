import type { Readable } from 'node:stream'
import { join } from 'node:path'

export const DEBIAN_STOCKFISH = '/usr/games/stockfish'
export const DEFAULT_SHIM_PORT = 8317

export type LaunchPlan =
  | {
      ok: true
      port: number
      shimScript: string
      workerScript: string
      shimEnv: NodeJS.ProcessEnv
      workerEnv: NodeJS.ProcessEnv
    }
  | { ok: false; reason: string }

export function launchPlan(
  env: NodeJS.ProcessEnv,
  distDir: string,
  exists: (path: string) => boolean
): LaunchPlan {
  if (env.STOCKFISH_API_URL) {
    return {
      ok: false,
      reason:
        'STOCKFISH_API_URL is set. It selects my server, which this container cannot reach, and the worker deliberately has no fallback, so every game would fail. Unset it.',
    }
  }
  if (!env.ENGINE_LABEL?.trim()) {
    return {
      ok: false,
      reason:
        "ENGINE_LABEL is required. Every training position's receipt names its engine; without it the receipt shows the shim's localhost URL, which does not say which Stockfish ran. Set it from the shim's startup line, e.g. \"stockfish-16 railway\".",
    }
  }

  const port = Number(env.SHIM_PORT ?? DEFAULT_SHIM_PORT)
  if (!Number.isInteger(port) || port <= 0) return { ok: false, reason: `SHIM_PORT is not a port: ${env.SHIM_PORT}` }
  const shimUrl = `http://127.0.0.1:${port}`
  if (env.STOCKFISH_URL && env.STOCKFISH_URL !== shimUrl) {
    return {
      ok: false,
      reason: `STOCKFISH_URL is ${env.STOCKFISH_URL}, but this launcher runs Stockfish at ${shimUrl}. Unset STOCKFISH_URL or set it to that.`,
    }
  }

  const bin = env.STOCKFISH_BIN || (exists(DEBIAN_STOCKFISH) ? DEBIAN_STOCKFISH : 'stockfish')

  return {
    ok: true,
    port,
    shimScript: join(distDir, '..', 'scripts', 'stockfish-local-server.mjs'),
    workerScript: join(distDir, 'index.js'),
    shimEnv: { ...env, STOCKFISH_BIN: bin, STOCKFISH_THREADS: env.STOCKFISH_THREADS ?? '1' },
    workerEnv: { ...env, STOCKFISH_URL: shimUrl },
  }
}

export function waitForLine(stream: Readable, match: (line: string) => boolean, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const done = (fn: () => void) => {
      clearTimeout(timer)
      stream.off('data', onData)
      stream.off('end', onEnd)
      fn()
    }
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let i: number
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (match(line)) return done(() => resolve(line))
      }
    }
    const onEnd = () => done(() => reject(new Error('stream ended before the line appeared')))
    const timer = setTimeout(() => done(() => reject(new Error(`no matching line within ${timeoutMs} ms`))), timeoutMs)
    stream.on('data', onData)
    stream.on('end', onEnd)
  })
}
