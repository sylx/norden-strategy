import type { GenerateOptions, WorldData } from './generateWorld'
import type { WorldWorkerMessage } from './world.worker'

interface Job {
  key: string
  promise: Promise<WorldData>
  worker: Worker | null
  /** Callers waiting on a job still running; it is stopped when the last one cancels */
  waiting: number
  /** How far the generation has got (0 to 1; 1 once done) */
  progress: number
  /** Callers told about the progress */
  listeners: Set<(fraction: number) => void>
}

/**
 * The last generated world (or the one being generated). Remounting a map
 * with the same options, e.g. coming back to the strategy scene, reuses it
 * instead of generating the terrain again. Nothing writes to the arrays.
 */
let current: Job | null = null

/**
 * Generates the macro terrain off the main thread, or returns the one already generated with the same options.
 * onProgress hears how far it has got (0 to 1), at once with the progress so far and then as it goes on
 */
export function loadWorld(
  options: GenerateOptions = {}, onProgress?: (fraction: number) => void,
): { promise: Promise<WorldData>; cancel: () => void } {
  const key = JSON.stringify(options)
  if (current?.key !== key) {
    current?.worker?.terminate()
    current = startJob(key, options)
  }
  const job = current
  job.waiting++
  if (onProgress) {
    job.listeners.add(onProgress)
    onProgress(job.progress)
  }
  let cancelled = false
  return {
    promise: job.promise,
    cancel: () => {
      if (cancelled) return
      cancelled = true
      if (onProgress) job.listeners.delete(onProgress)
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
    worker.onmessage = (event: MessageEvent<WorldWorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        job.progress = message.fraction
        for (const listener of job.listeners) listener(message.fraction)
        return
      }
      job.worker = null
      job.progress = 1
      job.listeners.clear()
      worker.terminate()
      resolve(message.world)
    }
    worker.onerror = (event) => {
      job.worker = null
      worker.terminate()
      if (current === job) current = null
      reject(new Error(event.message))
    }
  })
  const job: Job = { key, promise, worker, waiting: 0, progress: 0, listeners: new Set() }
  worker.postMessage(options)
  return job
}
