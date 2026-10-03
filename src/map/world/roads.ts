/**
 * Road network: each linked pair of cities is joined by the cheapest path
 * over the macro terrain (A* on the generation grid). Slopes, mountains and
 * water are expensive and the sea and lakes impassable, so roads follow
 * valleys and cross rivers where they have to. Cells already used by a road
 * are cheaper, so later roads join existing ones into trunk routes.
 */
import type { Place } from './placeLayout'

export interface RoadPath {
  from: string
  to: string
  /** x, z pairs in world units, evenly spaced */
  points: Float32Array
}

export interface RoadTerrain {
  resolution: number
  /** World units per cell */
  cell: number
  /** Elevation in world units (<= 0 is sea) */
  elev: Float32Array
  /** River / lake coverage 0..1 */
  water: Float32Array
  /** 1 where the cell is under a lake */
  lake: Uint8Array
  mountain: Float32Array
}

/** Extra cost per unit of length for the squared gradient */
const SLOPE_COST = 60
const MOUNTAIN_COST = 4
/** Cost per unit of length while on a river */
const WATER_COST = 3
/** One-off cost of stepping onto a river (a ford or a bridge) */
const CROSSING_COST = 12
/** Cost factor on cells that already carry a road */
const REUSE = 0.8
/** Land lower than this counts as shore and cannot carry a road */
const MIN_ELEVATION = 0.2
/** Radius (cells) searched for dry ground when a city stands on water */
const SNAP_RADIUS = 12
/** Half window (cells) of the moving average that rounds the grid path off */
const SMOOTH_RADIUS = 4
const SMOOTH_PASSES = 2
/** Spacing (world units) of the output points */
const SPACING = 0.5

const DX = [1, -1, 0, 0, 1, 1, -1, -1]
const DY = [0, 0, 1, -1, 1, -1, 1, -1]
const DL = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]

export function planRoads(
  terrain: RoadTerrain,
  places: readonly Place[],
  links: readonly (readonly [string, string])[],
): { roads: RoadPath[]; warnings: string[] } {
  const { resolution: RES, cell } = terrain
  const N = RES * RES
  const passable = new Uint8Array(N)
  for (let k = 0; k < N; k++) passable[k] = terrain.elev[k] > MIN_ELEVATION && !terrain.lake[k] ? 1 : 0

  const warnings: string[] = []
  const byId = new Map(places.map((p) => [p.id, p]))
  const endpoint = new Map<string, number>()
  for (const p of places) {
    const k = snapToLand(passable, RES, Math.floor(p.x / cell), Math.floor(p.z / cell))
    if (k < 0) warnings.push(`${p.id} ${p.name}: 周囲に陸地がなく、街道をつなげません`)
    else {
      endpoint.set(p.id, k)
      const i = Math.floor(p.x / cell), j = Math.floor(p.z / cell)
      if (k !== j * RES + i) warnings.push(`${p.id} ${p.name}: 水上または海岸にあります（近くの陸地から街道を出します）`)
    }
  }

  // Short links first, so the long ones can reuse them
  const ordered = links
    .map(([a, b]) => ({ a, b, pa: byId.get(a), pb: byId.get(b) }))
    .filter(({ a, b, pa, pb }) => {
      if (pa && pb) return true
      warnings.push(`街道 ${a}-${b}: 位置のない都市を含みます`)
      return false
    })
    .sort((l, r) => Math.hypot(l.pa!.x - l.pb!.x, l.pa!.z - l.pb!.z) - Math.hypot(r.pa!.x - r.pb!.x, r.pa!.z - r.pb!.z))

  const search = new PathSearch(terrain, passable)
  const roads: RoadPath[] = []
  for (const { a, b } of ordered) {
    const start = endpoint.get(a)
    const goal = endpoint.get(b)
    if (start === undefined || goal === undefined) continue
    const cells = search.find(start, goal)
    if (!cells) {
      warnings.push(`街道 ${a}-${b}: 陸路が見つかりません`)
      continue
    }
    search.markUsed(cells)
    const pa = byId.get(a)!, pb = byId.get(b)!
    const raw: [number, number][] = cells.map((k) => [((k % RES) + 0.5) * cell, (((k / RES) | 0) + 0.5) * cell])
    // Run from the city centres themselves, not the centre of their cells
    raw[0] = [pa.x, pa.z]
    raw[raw.length - 1] = [pb.x, pb.z]
    roads.push({ from: a, to: b, points: resample(smooth(raw), SPACING) })
  }
  return { roads, warnings }
}

function snapToLand(passable: Uint8Array, RES: number, i: number, j: number): number {
  let best = -1
  let bestD = Infinity
  for (let y = j - SNAP_RADIUS; y <= j + SNAP_RADIUS; y++) {
    for (let x = i - SNAP_RADIUS; x <= i + SNAP_RADIUS; x++) {
      if (x < 0 || y < 0 || x >= RES || y >= RES || !passable[y * RES + x]) continue
      const d = (x - i) ** 2 + (y - j) ** 2
      if (d < bestD) { bestD = d; best = y * RES + x }
    }
  }
  return bestD <= SNAP_RADIUS * SNAP_RADIUS ? best : -1
}

/** A* over the grid; buffers are reused between searches */
class PathSearch {
  private readonly cost: Float32Array
  private readonly from: Int32Array
  private readonly closed: Uint8Array
  private readonly used: Uint8Array
  private readonly heap = new PairHeap()
  private readonly terrain: RoadTerrain
  private readonly passable: Uint8Array

  constructor(terrain: RoadTerrain, passable: Uint8Array) {
    const N = terrain.resolution * terrain.resolution
    this.terrain = terrain
    this.passable = passable
    this.cost = new Float32Array(N)
    this.from = new Int32Array(N)
    this.closed = new Uint8Array(N)
    this.used = new Uint8Array(N)
  }

  find(start: number, goal: number): number[] | null {
    const { resolution: RES, cell, elev, water, mountain } = this.terrain
    const { cost, from, closed, used, passable, heap } = this
    cost.fill(Infinity)
    closed.fill(0)
    heap.clear()
    const gi = goal % RES
    const gj = (goal / RES) | 0
    const heuristic = (k: number) => {
      const dx = Math.abs((k % RES) - gi)
      const dy = Math.abs(((k / RES) | 0) - gj)
      return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * cell * REUSE
    }
    cost[start] = 0
    from[start] = -1
    heap.push(heuristic(start), start)

    while (heap.size > 0) {
      const c = heap.pop()
      if (closed[c]) continue
      if (c === goal) break
      closed[c] = 1
      const ci = c % RES
      const cj = (c / RES) | 0
      const onRiver = water[c] > 0.5
      for (let d = 0; d < 8; d++) {
        const x = ci + DX[d]
        const y = cj + DY[d]
        if (x < 0 || y < 0 || x >= RES || y >= RES) continue
        const n = y * RES + x
        if (closed[n] || !passable[n]) continue
        const len = DL[d] * cell
        const slope = (elev[n] - elev[c]) / len
        let step = len * (1 + SLOPE_COST * slope * slope + MOUNTAIN_COST * mountain[n] + WATER_COST * water[n])
        if (water[n] > 0.5 && !onRiver) step += CROSSING_COST
        if (used[n]) step *= REUSE
        const g = cost[c] + step
        if (g < cost[n]) {
          cost[n] = g
          from[n] = c
          heap.push(g + heuristic(n), n)
        }
      }
    }
    if (cost[goal] === Infinity) return null
    const path: number[] = []
    for (let k = goal; k >= 0; k = from[k]) path.push(k)
    return path.reverse()
  }

  markUsed(cells: readonly number[]) {
    for (const k of cells) this.used[k] = 1
  }
}

/** Min-heap of (key, cell) pairs; stale entries are skipped by the caller */
class PairHeap {
  private keys = new Float64Array(1024)
  private cells = new Int32Array(1024)
  size = 0

  clear() {
    this.size = 0
  }

  push(key: number, cell: number) {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2)
      keys.set(this.keys)
      this.keys = keys
      const cells = new Int32Array(this.size * 2)
      cells.set(this.cells)
      this.cells = cells
    }
    const { keys, cells } = this
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent] <= key) break
      keys[i] = keys[parent]
      cells[i] = cells[parent]
      i = parent
    }
    keys[i] = key
    cells[i] = cell
  }

  pop(): number {
    const { keys, cells } = this
    const top = cells[0]
    const n = --this.size
    const key = keys[n]
    const cell = cells[n]
    let i = 0
    for (;;) {
      let child = i * 2 + 1
      if (child >= n) break
      if (child + 1 < n && keys[child + 1] < keys[child]) child++
      if (keys[child] >= key) break
      keys[i] = keys[child]
      cells[i] = cells[child]
      i = child
    }
    keys[i] = key
    cells[i] = cell
    return top
  }
}

/** Moving average with the ends pinned; the window shrinks towards the ends */
function smooth(points: [number, number][]): [number, number][] {
  let pts = points
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next = pts.map((p) => [p[0], p[1]] as [number, number])
    for (let i = 1; i < pts.length - 1; i++) {
      const r = Math.min(SMOOTH_RADIUS, i, pts.length - 1 - i)
      let sx = 0, sz = 0
      for (let k = i - r; k <= i + r; k++) { sx += pts[k][0]; sz += pts[k][1] }
      next[i] = [sx / (2 * r + 1), sz / (2 * r + 1)]
    }
    pts = next
  }
  return pts
}

function resample(points: [number, number][], spacing: number): Float32Array {
  const out: number[] = [points[0][0], points[0][1]]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]
    const [bx, bz] = points[i]
    const len = Math.hypot(bx - ax, bz - az)
    let t = spacing - carry
    while (t <= len) {
      out.push(ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len)
      t += spacing
    }
    carry = len - (t - spacing)
  }
  const last = points[points.length - 1]
  if (carry > spacing * 0.25) out.push(last[0], last[1])
  else { out[out.length - 2] = last[0]; out[out.length - 1] = last[1] }
  return new Float32Array(out)
}
