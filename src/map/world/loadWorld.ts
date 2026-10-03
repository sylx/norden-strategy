import type { GenerateOptions, WorldData } from './generateWorld'

/** Generates the macro terrain off the main thread */
export function loadWorld(options: GenerateOptions = {}): { promise: Promise<WorldData>; cancel: () => void } {
  const worker = new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' })
  const promise = new Promise<WorldData>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorldData>) => {
      resolve(event.data)
      worker.terminate()
    }
    worker.onerror = (event) => {
      reject(new Error(event.message))
      worker.terminate()
    }
  })
  worker.postMessage(options)
  return { promise, cancel: () => worker.terminate() }
}
