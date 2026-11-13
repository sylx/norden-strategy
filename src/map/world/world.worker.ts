import { generateWorld, type GenerateOptions, type WorldData } from './generateWorld'

/** What the worker sends back: progress while it generates (0 to 1), then the world */
export type WorldWorkerMessage = { type: 'progress'; fraction: number } | { type: 'done'; world: WorldData }

self.onmessage = (event: MessageEvent<GenerateOptions>) => {
  // Report at most every percent so the messages stay few
  let last = -1
  const world = generateWorld(event.data, (fraction) => {
    const percent = Math.floor(fraction * 100)
    if (percent === last) return
    last = percent
    self.postMessage({ type: 'progress', fraction } satisfies WorldWorkerMessage)
  })
  self.postMessage({ type: 'done', world } satisfies WorldWorkerMessage, {
    transfer: [world.macro.buffer, world.flow.buffer, ...world.roads.map((road) => road.points.buffer)],
  })
}
