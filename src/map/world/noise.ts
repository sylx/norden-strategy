/** Deterministic 2D gradient noise for the CPU side of terrain generation. */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Noise2D {
  /** Gradient noise, roughly in [-1, 1] */
  noise(x: number, y: number): number
  /** Fractal sum normalised to roughly [-1, 1] */
  fbm(x: number, y: number, octaves: number): number
  /** Ridged multifractal in [0, 1], sharp crests at 1 */
  ridged(x: number, y: number, octaves: number): number
}

export function createNoise2D(seed: number): Noise2D {
  const rand = mulberry32(seed)
  const perm = new Uint8Array(512)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  const gx = new Float32Array(256)
  const gy = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const a = rand() * Math.PI * 2
    gx[i] = Math.cos(a)
    gy[i] = Math.sin(a)
  }

  const noise = (x: number, y: number) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const fx = x - xf
    const fy = y - yf
    const xi = xf & 255
    const yi = yf & 255
    const h00 = perm[perm[xi] + yi]
    const h10 = perm[perm[xi + 1] + yi]
    const h01 = perm[perm[xi] + yi + 1]
    const h11 = perm[perm[xi + 1] + yi + 1]
    const n00 = gx[h00] * fx + gy[h00] * fy
    const n10 = gx[h10] * (fx - 1) + gy[h10] * fy
    const n01 = gx[h01] * fx + gy[h01] * (fy - 1)
    const n11 = gx[h11] * (fx - 1) + gy[h11] * (fy - 1)
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const nx0 = n00 + u * (n10 - n00)
    const nx1 = n01 + u * (n11 - n01)
    return (nx0 + v * (nx1 - nx0)) * 1.41
  }

  const fbm = (x: number, y: number, octaves: number) => {
    let sum = 0
    let amp = 1
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += noise(x, y) * amp
      norm += amp
      amp *= 0.5
      // Rotate between octaves to hide grid alignment
      const nx = x * 1.6 - y * 1.2 + 17.3
      y = x * 1.2 + y * 1.6 - 9.1
      x = nx
    }
    return sum / norm
  }

  const ridged = (x: number, y: number, octaves: number) => {
    let sum = 0
    let amp = 1
    let norm = 0
    let weight = 1
    for (let i = 0; i < octaves; i++) {
      let r = 1 - Math.abs(noise(x, y))
      r *= r
      r *= weight
      weight = Math.min(1, r * 1.8)
      sum += r * amp
      norm += amp
      amp *= 0.5
      const nx = x * 1.6 - y * 1.2 + 31.7
      y = x * 1.2 + y * 1.6 + 5.3
      x = nx
    }
    return sum / norm
  }

  return { noise, fbm, ridged }
}
