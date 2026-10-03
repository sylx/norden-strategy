import type { RoadPath } from '../world/roads'

export interface PathSample {
  x: number
  z: number
  /** Unit tangent */
  dx: number
  dz: number
}

/** A route on the ground (x / z pairs in world units) that can be sampled by distance */
export class Polyline {
  readonly points: Float32Array
  /** Distance from the start to each point */
  readonly distances: Float32Array
  readonly length: number

  constructor(points: Float32Array) {
    this.points = points
    const n = points.length / 2
    this.distances = new Float32Array(n)
    for (let i = 1; i < n; i++) {
      this.distances[i] = this.distances[i - 1]
        + Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1])
    }
    this.length = n > 0 ? this.distances[n - 1] : 0
  }

  /** Point and direction at a distance along, clamped to the ends */
  sample(distance: number, out: PathSample = { x: 0, z: 0, dx: 1, dz: 0 }): PathSample {
    const { points: p, distances: d } = this
    const n = d.length
    if (n === 0) return out
    if (n === 1) {
      out.x = p[0]
      out.z = p[1]
      return out
    }
    const t = Math.min(this.length, Math.max(0, distance))
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (d[mid] <= t) lo = mid
      else hi = mid
    }
    const seg = d[hi] - d[lo]
    const f = seg > 0 ? (t - d[lo]) / seg : 0
    const dx = p[hi * 2] - p[lo * 2]
    const dz = p[hi * 2 + 1] - p[lo * 2 + 1]
    const len = Math.hypot(dx, dz) || 1
    out.x = p[lo * 2] + dx * f
    out.z = p[lo * 2 + 1] + dz * f
    out.dx = dx / len
    out.dz = dz / len
    return out
  }
}

interface Edge {
  to: string
  road: RoadPath
  length: number
}

/** The routed roads as a graph between the cities */
export class RoadNetwork {
  private readonly edges = new Map<string, Edge[]>()

  constructor(roads: readonly RoadPath[]) {
    for (const road of roads) {
      const length = new Polyline(road.points).length
      this.edgesOf(road.from).push({ to: road.to, road, length })
      this.edgesOf(road.to).push({ to: road.from, road, length })
    }
  }

  private edgesOf(id: string): Edge[] {
    let list = this.edges.get(id)
    if (!list) this.edges.set(id, (list = []))
    return list
  }

  neighbours(id: string): string[] {
    return (this.edges.get(id) ?? []).map((e) => e.to)
  }

  /** Points of the road between two neighbouring cities, running from → to */
  road(from: string, to: string): Float32Array | null {
    const edge = this.edges.get(from)?.find((e) => e.to === to)
    if (!edge) return null
    return edge.road.from === from ? edge.road.points : reversePoints(edge.road.points)
  }

  /** Shortest route over the roads, both ends included; null when unreachable */
  findRoute(from: string, to: string): string[] | null {
    if (from === to) return this.edges.has(from) ? [from] : null
    const cost = new Map<string, number>([[from, 0]])
    const prev = new Map<string, string>()
    const open = new Set([from])
    while (open.size > 0) {
      let current = ''
      let best = Infinity
      for (const id of open) {
        const c = cost.get(id)!
        if (c < best) { best = c; current = id }
      }
      if (current === to) break
      open.delete(current)
      for (const edge of this.edges.get(current) ?? []) {
        const c = best + edge.length
        if (c < (cost.get(edge.to) ?? Infinity)) {
          cost.set(edge.to, c)
          prev.set(edge.to, current)
          open.add(edge.to)
        }
      }
    }
    if (!prev.has(to)) return null
    const route = [to]
    for (let id = to; id !== from;) route.push((id = prev.get(id)!))
    return route.reverse()
  }

  /** The roads along a route of neighbouring cities, joined into one path */
  routePath(route: readonly string[]): Polyline | null {
    if (route.length < 2) return null
    const out: number[] = []
    for (let i = 1; i < route.length; i++) {
      const points = this.road(route[i - 1], route[i])
      if (!points) return null
      // Each road starts where the previous one ended
      for (let k = i === 1 ? 0 : 2; k < points.length; k++) out.push(points[k])
    }
    return new Polyline(new Float32Array(out))
  }
}

function reversePoints(points: Float32Array): Float32Array {
  const n = points.length / 2
  const out = new Float32Array(points.length)
  for (let i = 0; i < n; i++) {
    out[i * 2] = points[(n - 1 - i) * 2]
    out[i * 2 + 1] = points[(n - 1 - i) * 2 + 1]
  }
  return out
}
