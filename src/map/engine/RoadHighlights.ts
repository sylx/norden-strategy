import * as THREE from 'three'
import type { OverlayUniforms } from './overlayUniforms'
import { Polyline, type RoadNetwork } from './roadNetwork'
import { RouteRibbon } from './RouteRibbon'

export interface RoadHighlight {
  /** The chevrons run from → to */
  from: string
  to: string
  color?: THREE.ColorRepresentation
  /** false: no direction shown */
  flow?: boolean
}

export const ROAD_HIGHLIGHT_COLOR = '#ffd45a'

/** Time (ms) a highlight takes to fade in */
const FADE_MS = 250

interface Entry {
  key: string
  ribbon: RouteRibbon
  age: number
}

/** Highlighted roads, drawn over the terrain with a glow and running chevrons */
export class RoadHighlights {
  readonly group = new THREE.Group()
  private entries: Entry[] = []
  private readonly network: RoadNetwork
  private readonly overlay: OverlayUniforms

  constructor(network: RoadNetwork, overlay: OverlayUniforms) {
    this.network = network
    this.overlay = overlay
    this.group.name = 'road-highlights'
  }

  /** Replaces the highlighted roads; unchanged ones keep their state. Returns the roads not found. */
  set(highlights: readonly RoadHighlight[]): RoadHighlight[] {
    const missing: RoadHighlight[] = []
    const previous = new Map(this.entries.map((e) => [e.key, e]))
    const next: Entry[] = []
    for (const h of highlights) {
      const color = new THREE.Color(h.color ?? ROAD_HIGHLIGHT_COLOR)
      const flow = h.flow ?? true
      const key = `${h.from}>${h.to}:${color.getHexString()}:${flow}`
      const kept = previous.get(key)
      if (kept) {
        previous.delete(key)
        next.push(kept)
        continue
      }
      const points = this.network.road(h.from, h.to)
      if (!points) {
        missing.push(h)
        continue
      }
      const ribbon = new RouteRibbon(new Polyline(points), this.overlay, {
        color, widthPx: 7, glowPx: 7, glow: 0.55, stripes: flow ? 0.55 : 0, flowPx: flow ? 26 : 0,
      })
      ribbon.setOpacity(0)
      ribbon.mesh.name = `road-highlight-${h.from}-${h.to}`
      this.group.add(ribbon.mesh)
      next.push({ key, ribbon, age: 0 })
    }
    for (const entry of previous.values()) entry.ribbon.dispose()
    this.entries = next
    return missing
  }

  update(dtMs: number) {
    for (const entry of this.entries) {
      if (entry.age >= FADE_MS) continue
      entry.age = Math.min(FADE_MS, entry.age + dtMs)
      entry.ribbon.setOpacity(entry.age / FADE_MS)
    }
  }

  dispose() {
    for (const entry of this.entries) entry.ribbon.dispose()
    this.entries = []
  }
}
