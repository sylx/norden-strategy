import { generateWorld, type GenerateOptions } from './generateWorld'

self.onmessage = (event: MessageEvent<GenerateOptions>) => {
  const world = generateWorld(event.data)
  self.postMessage(world, { transfer: [world.macro.buffer, world.flow.buffer] })
}
