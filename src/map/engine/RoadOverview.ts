import type { RoadPath } from '../world/roads'
import type { OverlayUniforms } from './overlayUniforms'
import { Polyline } from './roadNetwork'
import { RouteRibbon } from './RouteRibbon'

/**
 * Every road as a plain inked line over the map, fading in as the cities
 * turn into emblems so the connections stay readable. Quieter than the
 * road highlights (no glow, no chevrons) and drawn under them.
 */
export class RoadOverview {
  private readonly ribbon: RouteRibbon
  private strength = 0

  constructor(roads: readonly RoadPath[], overlay: OverlayUniforms) {
    const paths = roads.filter((road) => road.points.length >= 4).map((road) => new Polyline(road.points))
    this.ribbon = new RouteRibbon(paths, overlay, { color: '#efe0b6', edge: '#3a2818', widthPx: 5 })
    this.ribbon.mesh.name = 'road-overview'
    // Under the road highlights (1) and the cities (3)
    this.ribbon.mesh.renderOrder = 0.5
    this.ribbon.mesh.visible = false
  }

  get mesh() {
    return this.ribbon.mesh
  }

  /** 0..1, PlaceSettings.roadOverview */
  setStrength(strength: number) {
    this.strength = strength
  }

  /** art: visibility of the city art against the emblems (Cities.update) */
  update(art: number) {
    const opacity = (1 - art) * this.strength
    this.ribbon.setOpacity(opacity)
    this.ribbon.mesh.visible = opacity > 0.004
  }

  dispose() {
    this.ribbon.dispose()
  }
}
