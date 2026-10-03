/**
 * Macro terrain generation.
 *
 * Builds the coarse, gameplay-relevant shape of the island (coastline,
 * mountains, rivers, lakes, forests) on a RES x RES grid. Everything finer
 * than one cell is added procedurally on the GPU (see terrainShader.ts).
 *
 * Output channels per cell (RGBA float):
 *   macro.R: elevation in world units (< 0 is sea)
 *   macro.G: inland water coverage (rivers / lakes), 0.5 marks the shoreline
 *   macro.B: mountain factor 0..1 (rockiness, detail amplitude)
 *   macro.A: forest density 0..1
 *   flow.RG: downstream direction of rivers (unit vector, 0 on lakes)
 *   flow.B:  aridity 0..1 (deserts)
 *   flow.A:  river size 0..1
 */
import { createNoise2D } from './noise'
import {
  ARCHIPELAGO_ZONES,
  COASTLINE,
  DESERTS,
  IMAGE_TO_WORLD,
  LAKES,
  MOUNTAIN_RANGES,
  WORLD_SIZE,
  type Vec2,
} from './islandDesign'

export interface WorldData {
  resolution: number
  worldSize: number
  /** RGBA, row-major, row = z */
  macro: Float32Array
  /** RGBA, same layout as macro */
  flow: Float32Array
}

export interface GenerateOptions {
  resolution?: number
  seed?: number
}

const SEA_FLOOR = -40

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const toWorld = (v: Vec2): [number, number] => [v[0] * IMAGE_TO_WORLD, v[1] * IMAGE_TO_WORLD]

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  const ex = px - (ax + dx * t)
  const ey = py - (ay + dy * t)
  return Math.sqrt(ex * ex + ey * ey)
}

/** Signed distance to a closed polygon, positive inside */
function polygonSdf(px: number, py: number, poly: readonly [number, number][]) {
  let d = Infinity
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[j]
    d = Math.min(d, distToSegment(px, py, ax, ay, bx, by))
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside ? d : -d
}

function polylineDist(px: number, py: number, path: readonly [number, number][]) {
  let d = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    d = Math.min(d, distToSegment(px, py, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]))
  }
  return d
}

/** Min-heap of cell indices keyed by a float array */
class CellHeap {
  private items: Int32Array
  private size = 0
  private readonly key: Float32Array
  constructor(capacity: number, key: Float32Array) {
    this.items = new Int32Array(capacity)
    this.key = key
  }
  get length() {
    return this.size
  }
  push(cell: number) {
    const { items, key } = this
    let i = this.size++
    const k = key[cell]
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (key[items[parent]] <= k) break
      items[i] = items[parent]
      i = parent
    }
    items[i] = cell
  }
  pop() {
    const { items, key } = this
    const top = items[0]
    const last = items[--this.size]
    const k = key[last]
    let i = 0
    for (;;) {
      let child = i * 2 + 1
      if (child >= this.size) break
      if (child + 1 < this.size && key[items[child + 1]] < key[items[child]]) child++
      if (key[items[child]] >= k) break
      items[i] = items[child]
      i = child
    }
    items[i] = last
    return top
  }
}

export function generateWorld({ resolution = 1024, seed = 1337 }: GenerateOptions = {}): WorldData {
  const RES = resolution
  const cell = WORLD_SIZE / RES
  const n = createNoise2D(seed)
  const n2 = createNoise2D(seed + 101)

  const coast = COASTLINE.map(toWorld)
  const ranges = MOUNTAIN_RANGES.map((r) => ({
    path: r.path.map(toWorld),
    height: r.height,
    width: r.width * IMAGE_TO_WORLD,
  }))
  const zones = ARCHIPELAGO_ZONES.map((z) => ({
    c: toWorld(z.center),
    r: z.radius * IMAGE_TO_WORLD,
    s: z.strength,
  }))
  const lakes = LAKES.map((l) => ({ c: toWorld(l.center), r: l.radius * IMAGE_TO_WORLD }))
  const deserts = DESERTS.map((d) => ({ c: toWorld(d.center), r: d.radius * IMAGE_TO_WORLD }))

  // --- 1. Smooth fields on a coarse lattice (cheap, upsampled bilinearly) ----
  const C = 256
  const CS = C + 1
  const cSdf = new Float32Array(CS * CS)
  const cMount = new Float32Array(CS * CS)
  const cArch = new Float32Array(CS * CS)
  const cArid = new Float32Array(CS * CS)
  for (let j = 0; j < CS; j++) {
    for (let i = 0; i < CS; i++) {
      const px = (i / C) * WORLD_SIZE
      const py = (j / C) * WORLD_SIZE
      // Large-scale domain warp gives the coast its bays and capes
      const wx = px + n.fbm(px * 0.006, py * 0.006, 4) * 26
      const wy = py + n.fbm(px * 0.006 + 41.7, py * 0.006 - 13.2, 4) * 26
      const k = j * CS + i
      cSdf[k] = polygonSdf(wx, wy, coast)

      let m = 0
      for (const r of ranges) {
        const d = polylineDist(wx, wy, r.path) / r.width
        m = Math.max(m, r.height * Math.exp(-d * d * 1.6))
      }
      cMount[k] = m

      let a = 0
      for (const z of zones) {
        const d = Math.hypot(px - z.c[0], py - z.c[1]) / z.r
        a = Math.max(a, z.s * smoothstep(1, 0.2, d))
      }
      cArch[k] = a

      let arid = 0
      for (const d of deserts) {
        const q = Math.hypot(wx - d.c[0], wy - d.c[1]) / d.r
        arid = Math.max(arid, smoothstep(1, 0.45, q + n2.fbm(px * 0.015, py * 0.015, 3) * 0.35))
      }
      cArid[k] = arid
    }
  }
  const sampleCoarse = (f: Float32Array, px: number, py: number) => {
    const x = Math.min(C - 1e-3, Math.max(0, (px / WORLD_SIZE) * C))
    const y = Math.min(C - 1e-3, Math.max(0, (py / WORLD_SIZE) * C))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const k = y0 * CS + x0
    const a = f[k] + (f[k + 1] - f[k]) * fx
    const b = f[k + CS] + (f[k + CS + 1] - f[k + CS]) * fx
    return a + (b - a) * fy
  }

  // --- 2. Elevation at full resolution ---------------------------------------
  const N = RES * RES
  const elev = new Float32Array(N)
  const mountain = new Float32Array(N)
  const forest = new Float32Array(N)
  const coastDist = new Float32Array(N)
  const aridity = new Float32Array(N)

  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const px = (i + 0.5) * cell
      const py = (j + 0.5) * cell
      const k = j * RES + i
      const arch = sampleCoarse(cArch, px, py)

      let d = sampleCoarse(cSdf, px, py)
      d += n.fbm(px * 0.03, py * 0.03, 5) * (9 + 50 * arch)
      d += n2.fbm(px * 0.1, py * 0.1, 3) * (3 + 16 * arch)
      coastDist[k] = d

      let e: number
      if (d >= 0) {
        const inland = smoothstep(0, 30, d)
        const hills =
          (n2.fbm(px * 0.012, py * 0.012, 4) * 0.5 + 0.5) * 4.5 +
          n.fbm(px * 0.05 + 7.1, py * 0.05, 3) * 0.9
        const mMask = sampleCoarse(cMount, px, py)
        const ridge = n.ridged(px * 0.016, py * 0.016, 6)
        const mtn = mMask * (2 + 18 * ridge) * smoothstep(0.08, 0.5, mMask)
        e = 0.35 * Math.min(d / 2, 1) + 1.6 * (1 - Math.exp(-d / 20)) + (hills + mtn) * inland
        mountain[k] = Math.min(1, (mMask * ridge * 1.6 + Math.max(0, mtn - 2) * 0.04) * inland)

        for (const l of lakes) {
          const q = Math.hypot(px - l.c[0], py - l.c[1]) / l.r + n2.noise(px * 0.08, py * 0.08) * 0.35
          e -= 4 * smoothstep(1.4, 0.6, q)
        }
      } else {
        e = Math.max(d * 0.15 - 8 * (1 - Math.exp(d / 10)), SEA_FLOOR)
      }
      elev[k] = e

      const f = n2.fbm(px * 0.011 + 90, py * 0.011 - 30, 5) * 0.5 + 0.5
      const arid = sampleCoarse(cArid, px, py)
      aridity[k] = arid
      forest[k] = f - Math.max(0, e - 9) * 0.03 - mountain[k] * 0.25 - arid * 0.8
    }
  }

  // --- 3. Drainage: priority-flood from the sea ------------------------------
  // The flood tree doubles as the flow network: every land cell drains into
  // the neighbour that reached it.
  // Routing uses a slightly roughened surface so rivers meander on plains
  // instead of running in straight lines across filled flats.
  const filled = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    const px = ((k % RES) + 0.5) * cell
    const py = (((k / RES) | 0) + 0.5) * cell
    filled[k] = elev[k] > 0 ? elev[k] + (n2.fbm(px * 0.07, py * 0.07, 4) + 0.6) * 1.6 : elev[k]
  }
  const routed = Float32Array.from(filled)
  const parent = new Int32Array(N).fill(-1)
  const visited = new Uint8Array(N)
  const order = new Int32Array(N)
  let orderLen = 0
  const heap = new CellHeap(N, filled)
  const DX = [1, -1, 0, 0, 1, 1, -1, -1]
  const DY = [0, 0, 1, -1, 1, -1, 1, -1]
  const DL = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]

  for (let k = 0; k < N; k++) {
    if (elev[k] > 0) continue
    visited[k] = 1
    const i = k % RES
    const j = (k / RES) | 0
    for (let d = 0; d < 8; d++) {
      const x = i + DX[d]
      const y = j + DY[d]
      if (x < 0 || y < 0 || x >= RES || y >= RES) continue
      if (elev[y * RES + x] > 0) {
        heap.push(k)
        break
      }
    }
  }
  while (heap.length > 0) {
    const c = heap.pop()
    const ci = c % RES
    const cj = (c / RES) | 0
    for (let d = 0; d < 8; d++) {
      const x = ci + DX[d]
      const y = cj + DY[d]
      if (x < 0 || y < 0 || x >= RES || y >= RES) continue
      const nk = y * RES + x
      if (visited[nk]) continue
      visited[nk] = 1
      filled[nk] = Math.max(routed[nk], filled[c] + 1e-3 * DL[d])
      parent[nk] = c
      order[orderLen++] = nk
      heap.push(nk)
    }
  }

  const acc = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    if (elev[k] > 0) acc[k] = (0.6 + Math.max(0, forest[k])) * (1 - 0.9 * aridity[k])
  }
  for (let o = orderLen - 1; o >= 0; o--) {
    const k = order[o]
    const p = parent[k]
    if (p >= 0 && elev[p] > 0) acc[p] += acc[k]
  }

  // --- 4. Rivers and lakes ---------------------------------------------------
  const water = new Float32Array(N)
  const flowX = new Float32Array(N)
  const flowY = new Float32Array(N)
  const riverSize = new Float32Array(N)
  const RIVER_MIN_ACC = 1400 / (cell * cell)
  const LAKE_DEPTH = 1.6
  const isRiver = (k: number) => elev[k] > 0 && acc[k] >= RIVER_MIN_ACC

  // Main upstream branch of every river cell, to walk paths in both directions
  const mainChild = new Int32Array(N).fill(-1)
  for (let k = 0; k < N; k++) {
    const p = parent[k]
    if (p < 0 || !isRiver(k)) continue
    if (mainChild[p] < 0 || acc[k] > acc[mainChild[p]]) mainChild[p] = k
  }

  // D8 paths zigzag in 45° steps; averaging positions along the path turns
  // them into smooth curves before rasterising.
  const SMOOTH_STEPS = 5
  const smoothX = new Float32Array(N)
  const smoothY = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    if (!isRiver(k)) continue
    let sx = k % RES
    let sy = (k / RES) | 0
    let count = 1
    for (let dir = 0; dir < 2; dir++) {
      let c = k
      for (let s = 0; s < SMOOTH_STEPS; s++) {
        c = dir === 0 ? parent[c] : mainChild[c]
        if (c < 0) break
        sx += c % RES
        sy += (c / RES) | 0
        count++
      }
    }
    smoothX[k] = sx / count
    smoothY[k] = sy / count
  }

  for (let k = 0; k < N; k++) {
    if (elev[k] <= 0) continue
    if (filled[k] - routed[k] > LAKE_DEPTH) {
      water[k] = 1
      continue
    }
    if (!isRiver(k)) continue
    const s = Math.min(1, Math.log(acc[k] / RIVER_MIN_ACC) / Math.log(40))
    const r = (0.45 + 1.6 * s) / cell
    const p = parent[k]
    const ax = smoothX[k]
    const ay = smoothY[k]
    // Rivers reaching the sea run on to the parent cell itself
    const bx = p >= 0 ? (isRiver(p) ? smoothX[p] : p % RES) : ax
    const by = p >= 0 ? (isRiver(p) ? smoothY[p] : (p / RES) | 0) : ay
    const segLen = Math.hypot(bx - ax, by - ay) || 1
    const dirX = (bx - ax) / segLen
    const dirY = (by - ay) / segLen
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1))
    const x1 = Math.min(RES - 1, Math.ceil(Math.max(ax, bx) + r + 1))
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1))
    const y1 = Math.min(RES - 1, Math.ceil(Math.max(ay, by) + r + 1))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = Math.min(1, Math.max(0, 0.5 + (r - distToSegment(x, y, ax, ay, bx, by)) * 0.5))
        const nk = y * RES + x
        if (v > water[nk]) {
          water[nk] = v
          flowX[nk] = dirX
          flowY[nk] = dirY
          riverSize[nk] = s
        }
      }
    }
  }

  // --- 5. Pack ---------------------------------------------------------------
  const macro = new Float32Array(N * 4)
  const flow = new Float32Array(N * 4)
  for (let k = 0; k < N; k++) {
    let e = elev[k]
    const w = water[k]
    if (e > 0) {
      // Lakes become flat water surfaces; rivers cut a shallow bed
      if (filled[k] - routed[k] > LAKE_DEPTH) e = filled[k] - 0.9
      else e = Math.max(0.05, e - w * 0.35)
    }
    macro[k * 4] = e
    macro[k * 4 + 1] = e > 0 ? w : 0
    macro[k * 4 + 2] = mountain[k]
    macro[k * 4 + 3] = smoothstep(0.5, 0.64, forest[k]) * smoothstep(1, 6, coastDist[k]) * (1 - w)
    const lake = filled[k] - routed[k] > LAKE_DEPTH
    flow[k * 4] = lake ? 0 : flowX[k]
    flow[k * 4 + 1] = lake ? 0 : flowY[k]
    flow[k * 4 + 2] = aridity[k]
    flow[k * 4 + 3] = riverSize[k]
  }

  return { resolution: RES, worldSize: WORLD_SIZE, macro, flow }
}
