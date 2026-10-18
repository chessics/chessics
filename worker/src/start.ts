import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { launchPlan, waitForLine } from './launch.js'

const SHIM_READY_TIMEOUT_MS = 30_000

async function main(): Promise<void> {
  const plan = launchPlan(process.env, __dirname, existsSync)
  if (!plan.ok) {
    console.error(`[start] refusing to start: ${plan.reason}`)
    process.exit(1)
  }

  const shim = spawn(process.execPath, [plan.shimScript, String(plan.port)], {
    env: plan.shimEnv,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  shim.stdout!.on('data', chunk => process.stdout.write(chunk))

  let worker: ChildProcess | null = null
  const stopAll = (code: number) => {
    for (const child of [shim, worker]) if (child && child.exitCode === null) child.kill('SIGTERM')
    process.exit(code)
  }
  shim.on('exit', code => {
    console.error(`[start] stockfish shim exited (${code}); stopping`)
    stopAll(code ?? 1)
  })
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => stopAll(0))

  try {
    await waitForLine(shim.stdout!, line => line.includes('[shim] listening'), SHIM_READY_TIMEOUT_MS)
  } catch (err) {
    console.error(`[start] stockfish shim never became ready: ${err instanceof Error ? err.message : err}`)
    stopAll(1)
  }

  worker = spawn(process.execPath, [plan.workerScript], { env: plan.workerEnv, stdio: 'inherit' })
  worker.on('exit', code => {
    console.error(`[start] worker exited (${code}); stopping`)
    stopAll(code ?? 1)
  })
}

main()
