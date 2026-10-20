import type { WorldData } from './generateWorld'

/** The macro terrain at one point (the channels of generateWorld.ts' output) */
export interface WorldSample {
  /** World units, < 0 is sea */
  elevation: number
  /** Inland water coverage (rivers / lakes) 0..1, 0.5 marks the shoreline */
  water: number
  /** Under a lake (still water) rather than a river */
  lake: boolean
  /** River size 0..1 (0 off rivers) */
  river: number
  mountain: number
  forest: number
  aridity: number
}

/** Reads the macro terrain at world positions (bilinear, clamped to the world) */
export class WorldSampler {
  private readonly res: number
  private readonly scale: number
  private readonly macro: Float32Array
  private readonly flow: Float32Array

  constructor(world: WorldData) {
    this.res = world.resolution
    this.scale = world.resolution / world.worldSize
    this.macro = world.macro
    this.flow = world.flow
  }

  sample(x: number, z: number): WorldSample {
    const { res } = this
    const u = Math.min(res - 1.001, Math.max(0, x * this.scale - 0.5))
    const v = Math.min(res - 1.001, Math.max(0, z * this.scale - 0.5))
    const i = Math.floor(u)
    const j = Math.floor(v)
    const fu = u - i
    const fv = v - j
    const k00 = (j * res + i) * 4
    const k10 = k00 + 4
    const k01 = k00 + res * 4
    const k11 = k01 + 4
    const bl = (f: Float32Array, ch: number) => {
      const a = f[k00 + ch] + (f[k10 + ch] - f[k00 + ch]) * fu
      const b = f[k01 + ch] + (f[k11 + ch] - f[k01 + ch]) * fu
      return a + (b - a) * fv
    }
    // Nearest cell for the flags: lakes have no flow direction
    const kn = (Math.round(v) * res + Math.round(u)) * 4
    const water = bl(this.macro, 1)
    return {
      elevation: bl(this.macro, 0),
      water,
      lake: this.macro[kn + 1] > 0.5 && this.flow[kn] === 0 && this.flow[kn + 1] === 0,
      river: bl(this.flow, 3),
      mountain: bl(this.macro, 2),
      forest: bl(this.macro, 3),
      aridity: bl(this.flow, 2),
    }
  }
}
