import type { WorldData } from './generateWorld'

/** CPU-side access to the macro elevation, for camera and picking */
export class Heightfield {
  private readonly res: number
  private readonly size: number
  private readonly data: Float32Array

  constructor(world: WorldData) {
    this.res = world.resolution
    this.size = world.worldSize
    this.data = world.macro
  }

  /** Raw macro elevation (negative in the sea), bilinear */
  elevationAt(x: number, z: number): number {
    const { res, data } = this
    const u = Math.min(res - 1.001, Math.max(0, (x / this.size) * res - 0.5))
    const v = Math.min(res - 1.001, Math.max(0, (z / this.size) * res - 0.5))
    const i = Math.floor(u)
    const j = Math.floor(v)
    const fu = u - i
    const fv = v - j
    const k = (j * res + i) * 4
    const k2 = k + res * 4
    const a = data[k] + (data[k + 4] - data[k]) * fu
    const b = data[k2] + (data[k2 + 4] - data[k2]) * fu
    return a + (b - a) * fv
  }

  /** Height of the rendered surface (sea is flat at 0) before vertical scaling */
  surfaceAt(x: number, z: number): number {
    return Math.max(0, this.elevationAt(x, z))
  }
}
