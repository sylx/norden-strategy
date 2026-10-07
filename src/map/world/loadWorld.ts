import type { GenerateOptions, WorldData } from './generateWorld'

interface Job {
  key: string
  promise: Promise<WorldData>
  worker: Worker | null
  /** Callers waiting on a job still running; it is stopped when the last one cancels */
  waiting: number
}

/**
 * The last generated world (or the one being generated). Remounting a map
 * with the same options, e.g. coming back to the strategy scene, reuses it
 * instead of generating the terrain again. Nothing writes to the arrays.
 */
let current: Job | null = null

/** Generates the macro terrain off the main thread, or returns the one already generated with the same options */
export function loadWorld(options: GenerateOptions = {}): { promise: Promise<WorldData>; cancel: () => void } {
  const key = JSON.stringify(options)
  if (current?.key !== key) {
    current?.worker?.terminate()
    current = startJob(key, options)
  }
  const job = current
  job.waiting++
  let cancelled = false
  return {
    promise: job.promise,
    cancel: () => {
      if (cancelled) return
      cancelled = true
      job.waiting--
      // A world still being generated that nobody waits for any more is dropped
      if (job.waiting === 0 && job.worker) {
        job.worker.terminate()
        if (current === job) current = null
      }
    },
  }
}

function startJob(key: string, options: GenerateOptions): Job {
  const worker = new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' })
  const promise = new Promise<WorldData>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorldData>) => {
      job.worker = null
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = (event) => {
      job.worker = null
      worker.terminate()
      if (current === job) current = null
      reject(new Error(event.message))
    }
  })
  const job: Job = { key, promise, worker, waiting: 0 }
  worker.postMessage(options)
  return job
}
