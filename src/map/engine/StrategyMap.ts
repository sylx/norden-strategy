import * as THREE from 'three'
import type { WorldData } from '../world/generateWorld'
import { Heightfield } from '../world/Heightfield'
import { MapCameraController } from './MapCameraController'
import { TerrainQuadtree } from './TerrainQuadtree'
import { Forest, type ForestTextureStatus } from './Forest'
import { Crystals } from './Crystals'
import { normalizeForestSettings, FOREST_DEFAULTS, type ForestSettings } from './forestSettings'
import { ParchmentEffect } from './ParchmentEffect'
import { PARCHMENT_DEFAULTS, type ParchmentSettings } from './parchmentSettings'
import { normalizeTerrainSettings, TERRAIN_DEFAULTS, type TerrainSettings } from './terrainSettings'
import { MAX_PIXEL_RATIO, normalizeRenderSettings, RENDER_DEFAULTS, type RenderSettings } from './renderSettings'
import { placesOf, type MapCity, type Place, type PlaceType } from '../world/placeLayout'
import { IMAGE_TO_WORLD } from '../world/islandDesign'
import { Roads } from './Roads'
import { Cities } from './Cities'
import { PlaceLabels } from './PlaceLabels'
import { normalizePlaceSettings, PLACE_DEFAULTS, type PlaceSettings } from './placeSettings'
import { OverlayUniforms } from './overlayUniforms'
import { RoadNetwork } from './roadNetwork'
import { RoadHighlights, type RoadHighlight } from './RoadHighlights'
import { RoadOverview } from './RoadOverview'
import { CityHighlights, type CityHighlight } from './CityHighlights'
import { MarchMarkers, type MarchOrder } from './MarchMarkers'
import { SEASON_FADE, seasonWeights, type MapSeason } from './season'
import { Snowfall } from './Snowfall'

/** Vertical exaggeration of the macro elevation */
const HEIGHT_SCALE = 1.4
/** Root tile size: the map plus a wide band of open sea */
const TERRAIN_EXTENT = 4096
/** Hit radius of a city against the on-screen size of its card or emblem */
const PICK_RADIUS = 0.4
/** focusPlaces spreads the cities over 1 / FOCUS_MARGIN of the view, leaving room for the UI around */
const FOCUS_MARGIN = 3
/** Room (CSS px) focusPlaces keeps around the cities' points for their pictures, clear of the inset */
const FOCUS_PAD_PX = 60
/** Share of the view focusPlaces fits the cities into however much the insets cover */
const FOCUS_MIN_ROOM = 0.2

/**
 * The least shift (px) of a span `half` either side of the centre of a view `size` wide that keeps it clear of
 * the `start` and `end` covered; the middle of the room left when it does not fit
 */
function shiftIntoRoom(half: number, size: number, start: number, end: number) {
  const lo = start - size / 2 + half
  const hi = size / 2 - end - half
  return lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(0, lo, hi)
}

/** The room the UI covers at each edge of the map's view (CSS px), for focusPlaces */
export interface FocusInset {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

export interface FocusOptions {
  instant?: boolean
  /** The cities are spread over 1 / margin of the room (FOCUS_MARGIN) */
  margin?: number
  inset?: FocusInset
}

export interface MapStats {
  fps: number
  tiles: number
  vertices: number
  distance: number
  trees: number
  forestTexture: ForestTextureStatus
  /** Size of the scene capture in device pixels (render resolution) */
  width: number
  height: number
}

/** A march along the roads through these cities (neighbours on the road network) */
export interface MarchCommand extends Omit<MarchOrder, 'path'> {
  route: readonly string[]
}

export interface MapSettings {
  forest?: ForestSettings
  parchment?: ParchmentSettings
  terrain?: TerrainSettings
  render?: RenderSettings
  places?: PlaceSettings
  season?: MapSeason
}

/** Owns the three.js scene of the strategy map */
export class StrategyMap {
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  readonly controls: MapCameraController
  readonly network: RoadNetwork
  private readonly scene = new THREE.Scene()
  /** Drawn after the post-processing, at full resolution whatever the render resolution (cities, emblems) */
  private readonly overlay = new THREE.Scene()
  private readonly terrain: TerrainQuadtree
  private readonly forest: Forest
  private readonly crystals: Crystals
  private readonly roads: Roads
  private readonly cities: Cities
  private readonly labels: PlaceLabels
  private readonly overlayUniforms: OverlayUniforms
  private readonly roadOverview: RoadOverview
  private readonly roadHighlights: RoadHighlights
  private readonly cityHighlights: CityHighlights
  private cityHighlightList: readonly CityHighlight[] = []
  /** The cities drawn, with their pictures and factions as they are now */
  private placeList: Place[]
  private readonly marches: MarchMarkers
  private readonly heights: Heightfield
  private readonly parchment: ParchmentEffect
  private readonly snowfall = new Snowfall()
  /** The terrain's season weights, fading from `seasonFrom` to `seasonTo` as `seasonFade` runs 0 to 1 */
  private readonly season: THREE.Vector4
  private readonly seasonFrom = new THREE.Vector4()
  private readonly seasonTo = new THREE.Vector4()
  private seasonFade = 1
  private readonly macro: THREE.DataTexture
  private readonly flow: THREE.DataTexture
  private readonly resizeObserver: ResizeObserver
  private readonly container: HTMLElement
  private lastTime = performance.now()
  private frames = 0
  private fpsTime = performance.now()
  private fps = 0
  private renderSettings = { ...RENDER_DEFAULTS }
  /** CSS px per world unit at view depth 1 */
  private pxScale = 1
  private viewSize = { width: 1, height: 1 }
  onStats?: (stats: MapStats) => void
  private readonly arrivalListeners = new Set<(id: string) => void>()

  /** `cities`: those drawn (the ones with a position); later changes to their pictures and factions come by setCities */
  constructor(container: HTMLElement, world: WorldData, cities: readonly MapCity[], settings: MapSettings = {}) {
    this.container = container
    this.placeList = placesOf(cities)
    // Antialiasing comes from the multisampled scene target (ParchmentEffect)
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x10264a)
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 6000)

    this.macro = createWorldTexture(this.renderer, world.macro, world.resolution)
    this.flow = createWorldTexture(this.renderer, world.flow, world.resolution)
    let maxElevation = 0
    for (let k = 0; k < world.macro.length; k += 4) maxElevation = Math.max(maxElevation, world.macro[k])

    const heights = new Heightfield(world)
    this.heights = heights
    const maxHeight = (maxElevation + 9) * HEIGHT_SCALE
    this.terrain = new TerrainQuadtree({
      world,
      settings: normalizeTerrainSettings(settings.terrain ?? TERRAIN_DEFAULTS),
      macro: this.macro,
      flow: this.flow,
      worldSize: world.worldSize,
      extent: TERRAIN_EXTENT,
      heightScale: HEIGHT_SCALE,
      // Noise detail and tree canopies rise a few units above the macro peaks
      maxHeight,
    })
    this.scene.add(this.terrain.mesh)
    this.season = this.terrain.material.uniforms.uSeason.value
    this.forest = new Forest(world, this.terrain.material, HEIGHT_SCALE, this.renderer.capabilities.getMaxAnisotropy())
    this.forest.applySettings(normalizeForestSettings(settings.forest ?? FOREST_DEFAULTS))
    this.scene.add(this.forest.group)
    this.crystals = new Crystals(world, this.terrain.material, HEIGHT_SCALE)
    this.scene.add(this.crystals.mesh)
    this.roads = new Roads(world.roads, this.terrain.material, maxHeight)
    this.scene.add(this.roads.mesh)
    this.cities = new Cities(this.placeList, this.terrain.material, heights, HEIGHT_SCALE,
      this.renderer.capabilities.getMaxAnisotropy())
    this.overlay.add(this.cities.group)
    this.labels = new PlaceLabels(container, this.placeList, heights, HEIGHT_SCALE)
    this.network = new RoadNetwork(world.roads)
    this.overlayUniforms = new OverlayUniforms(this.terrain.material)
    this.roadOverview = new RoadOverview(world.roads, this.overlayUniforms)
    this.roadHighlights = new RoadHighlights(this.network, this.overlayUniforms)
    this.cityHighlights = new CityHighlights(this.placeList, this.overlayUniforms)
    this.marches = new MarchMarkers(container, this.overlayUniforms, heights, HEIGHT_SCALE,
      this.renderer.capabilities.getMaxAnisotropy())
    this.marches.onArrive = (id) => { for (const listener of this.arrivalListeners) listener(id) }
    this.overlay.add(this.roadOverview.mesh, this.roadHighlights.group, this.cityHighlights.group, this.marches.group)
    this.parchment = new ParchmentEffect(this.renderer)
    this.parchment.applySettings(settings.parchment ?? PARCHMENT_DEFAULTS)
    this.parchment.setWorld(this.flow, world.worldSize)
    this.setSeason(settings.season ?? 'summer', true)

    const s = world.worldSize
    this.controls = new MapCameraController(this.camera, this.renderer.domElement, heights, HEIGHT_SCALE, {
      minDistance: 127,
      maxDistance: 1500,
      minPitch: 34,
      maxPitch: 62,
      pitchDistances: [14, 1500],
      bounds: { minX: s * 0.06, maxX: s * 0.94, minZ: s * 0.1, maxZ: s * 0.94 },
    })
    this.controls.setView(s * 0.52, s * 0.55, 1400)
    this.setPlaceSettings(settings.places ?? PLACE_DEFAULTS)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.setRenderSettings(settings.render ?? RENDER_DEFAULTS)
    this.renderer.setAnimationLoop(this.frame)
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    // The canvas is always at full resolution; the scene capture is scaled down
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setSize(w, h)
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.parchment.setSize(size.x, size.y, this.renderer.getPixelRatio(), this.renderSettings.resolution)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.viewSize = { width: w, height: h }
    this.pxScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2))
    this.roads.setPixelScale(this.pxScale)
    this.cities.setPixelScale(this.pxScale)
    this.overlayUniforms.setPixelScale(this.pxScale)
    this.controls.setZoomGap(this.cities.fadeDistances())
  }

  setForestSettings(settings: ForestSettings) {
    this.forest.applySettings(normalizeForestSettings(settings))
  }

  setTerrainSettings(settings: TerrainSettings) {
    this.terrain.applySettings(normalizeTerrainSettings(settings))
  }

  setRenderSettings(value: RenderSettings) {
    const settings = normalizeRenderSettings(value)
    this.renderSettings = settings
    this.terrain.material.uniforms.uMaxOctaves.value = settings.detailOctaves
    this.parchment.setMultisample(settings.msaa)
    this.forest.setMultisample(settings.msaa)
    this.resize()
  }

  /** Ground point under a client position, in the image space of islandDesign / placeLayout */
  pickImagePoint(clientX: number, clientY: number): [number, number] | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    const p = this.controls.pickGround(ndc)
    return p ? [Math.round(p.x / IMAGE_TO_WORLD), Math.round(p.z / IMAGE_TO_WORLD)] : null
  }

  setPlaceSettings(value: PlaceSettings) {
    const settings = normalizePlaceSettings(value)
    this.roads.applySettings(settings)
    this.roadOverview.setStrength(settings.roadOverview)
    this.cities.applySettings(settings)
    this.cityHighlights.applySettings(settings)
    this.labels.applySettings(settings)
    this.controls.setZoomGap(this.cities.fadeDistances())
  }

  /** The cities drawn, as they are now */
  get places(): readonly Place[] {
    return this.placeList
  }

  /**
   * Changes the cities' factions (their emblems on the map and beside their names; undefined is neutral)
   * and pictures (e.g. a larger one as the city grows, with its name and selection ring). Cities not listed
   * keep theirs, and cities not drawn from the start are not added; the ground under them stays as it was generated
   */
  setCities(cities: readonly MapCity[]) {
    const byId = new Map(cities.map((city) => [city.id, city]))
    const owners: Record<string, string | undefined> = {}
    const types: Record<string, PlaceType> = {}
    this.placeList = this.placeList.map((place) => {
      const city = byId.get(place.id)
      if (!city || (city.belongTo === place.belongTo && city.type === place.type)) return place
      if (city.belongTo !== place.belongTo) owners[place.id] = city.belongTo
      if (city.type !== place.type) types[place.id] = city.type
      return { ...place, belongTo: city.belongTo, type: city.type }
    })
    if (Object.keys(owners).length > 0) {
      this.cities.setOwners(owners)
      this.labels.setOwners(owners)
    }
    if (Object.keys(types).length > 0) {
      this.cities.setTypes(types)
      this.labels.setTypes(types)
      this.cityHighlights.setTypes(types)
      this.cityHighlights.set(this.cityHighlightList)
    }
  }

  /** Selection rings under these cities (and their names drawn as selected) */
  setCityHighlights(highlights: readonly CityHighlight[]) {
    this.cityHighlightList = highlights
    this.cityHighlights.set(highlights)
    this.labels.setHighlighted(new Set(highlights.map((h) => h.id)))
  }

  /** Highlighted roads between neighbouring cities. Returns those not on the road network. */
  setRoadHighlights(highlights: readonly RoadHighlight[]): RoadHighlight[] {
    return this.roadHighlights.set(highlights)
  }

  /** Starts a march along a route of neighbouring cities; false when the roads do not join them */
  march(command: MarchCommand): boolean {
    const { route, ...order } = command
    const path = this.network.routePath(route)
    if (!path) return false
    this.marches.march({ ...order, path })
    return true
  }

  stopMarch(id: string) {
    this.marches.remove(id)
  }

  clearMarches() {
    this.marches.clear()
  }

  /** Calls the listener when a march reaches its goal; returns the unsubscribe function */
  onMarchArrive(listener: (id: string) => void): () => void {
    this.arrivalListeners.add(listener)
    return () => { this.arrivalListeners.delete(listener) }
  }

  get marchCount() {
    return this.marches.count
  }

  /**
   * The city whose card or emblem is nearest to a client position. Each one
   * is hit within a circle around its drawn centre that follows its on-screen
   * size, and never smaller than minPx in radius.
   */
  pickPlace(clientX: number, clientY: number, minPx = 36): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const p = new THREE.Vector3()
    let best: string | null = null
    let bestD = Infinity
    for (const place of this.placeList) {
      p.set(place.x, this.heights.surfaceAt(place.x, place.z) * HEIGHT_SCALE, place.z)
      const depth = -p.clone().applyMatrix4(this.camera.matrixWorldInverse).z
      if (depth <= 0) continue
      p.project(this.camera)
      const { size, lift } = this.cities.screenSize(place, depth)
      // The drawn art fills a little less than its square card
      const radius = Math.max(minPx, size * PICK_RADIUS)
      const x = rect.left + (p.x * 0.5 + 0.5) * rect.width
      const y = rect.top + (0.5 - p.y * 0.5) * rect.height - lift
      const d = Math.hypot(x - clientX, y - clientY)
      if (d < radius && d < bestD) { bestD = d; best = place.id }
    }
    return best
  }

  /** Moves the camera over a city, keeping the zoom; glides there unless `instant` */
  focusPlace(id: string, instant = false) {
    const place = this.placeList.find((p) => p.id === id)
    if (!place) return
    if (instant) this.controls.setView(place.x, place.z, this.controls.getView().distance)
    else this.controls.panTo(place.x, place.z)
  }

  /**
   * Moves the camera over several cities (e.g. both ends of a route) and zooms so that all of them are in view,
   * spread over 1 / `margin` of it; glides there unless `instant`. `inset` is the room the UI covers at the edges
   * of the view (CSS px, half of it at most from an edge): the cities are fitted into the rest, and kept in the middle of the view unless that would
   * hide them (or their pictures, FOCUS_PAD_PX) under it, then shifted only as far as it takes. A single city keeps
   * the zoom
   */
  focusPlaces(ids: readonly string[], { instant = false, margin = FOCUS_MARGIN, inset = {} }: FocusOptions = {}) {
    const places = this.placeList.filter((p) => ids.includes(p.id))
    if (places.length === 0) return
    const { width, height } = this.viewSize
    // The UI never covers more than half of the view from an edge
    const edge = (px: number | undefined, size: number) => THREE.MathUtils.clamp(px ?? 0, 0, size / 2)
    const left = edge(inset.left, width)
    const right = edge(inset.right, width)
    const top = edge(inset.top, height)
    const bottom = edge(inset.bottom, height)
    const room = (size: number, start: number, end: number) => Math.max(size - start - end, size * FOCUS_MIN_ROOM)
    const xs = places.map((p) => p.x)
    const zs = places.map((p) => p.z)
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
    const distance = places.length === 1
      ? this.controls.getView().distance
      : this.controls.distanceToFit(
        ((maxX - minX) / 2) * margin * (width / room(width, left, right)),
        ((maxZ - minZ) / 2) * margin * (height / room(height, top, bottom)),
      )
    // The cities' half size on screen (px) at that distance, with room for their pictures
    const perPx = this.controls.groundOffset(distance, 1, 1, height)
    const halfPx = { x: (maxX - minX) / 2 / perPx.x + FOCUS_PAD_PX, y: (maxZ - minZ) / 2 / perPx.z + FOCUS_PAD_PX }
    // The look-at point is off the cities' centre by as much as it takes to keep them clear of the UI
    const offset = this.controls.groundOffset(distance,
      shiftIntoRoom(halfPx.x, width, left, right), shiftIntoRoom(halfPx.y, height, top, bottom), height)
    const x = (minX + maxX) / 2 - offset.x
    const z = (minZ + maxZ) / 2 - offset.z
    if (instant) this.controls.setView(x, z, distance)
    else this.controls.glideTo(x, z, distance)
  }

  setParchmentSettings(settings: ParchmentSettings) {
    this.parchment.applySettings(settings)
  }

  /** Changes the look of the land to a season; it fades in unless `instant` */
  setSeason(season: MapSeason, instant = false) {
    seasonWeights(season, this.seasonTo)
    if (instant) {
      this.season.copy(this.seasonTo)
      this.seasonFade = 1
    } else if (!this.season.equals(this.seasonTo)) {
      this.seasonFrom.copy(this.season)
      this.seasonFade = 0
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(100, now - this.lastTime)
    this.lastTime = now
    this.controls.update(dt)
    this.terrain.update(this.camera)
    this.terrain.material.uniforms.uTime.value = now / 1000
    if (this.seasonFade < 1) {
      this.seasonFade = Math.min(1, this.seasonFade + dt / (SEASON_FADE * 1000))
      const t = THREE.MathUtils.smoothstep(this.seasonFade, 0, 1)
      this.season.lerpVectors(this.seasonFrom, this.seasonTo, t)
    }
    const view = this.controls.getView()
    const viewDistance = view.distance
    const art = this.cities.update(viewDistance)
    this.labels.update(this.camera, this.viewSize.width, this.viewSize.height, this.pxScale, art)
    this.overlayUniforms.update(viewDistance)
    this.roadOverview.update(art)
    this.roadHighlights.update(dt)
    this.cityHighlights.update(dt, art)
    this.marches.update(dt, this.camera, this.viewSize.width, this.viewSize.height, this.pxScale)
    // Heat shimmer over the desert in summer, stronger as the camera comes down
    const zoom = 1 - THREE.MathUtils.clamp(Math.log(viewDistance / 40) / Math.log(1500 / 40), 0, 1)
    this.parchment.setHeat(this.season.y, now / 1000, zoom)
    this.parchment.render(this.renderer, this.scene, this.camera)
    this.renderer.autoClear = false
    const groundHeight = 2 * viewDistance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    this.snowfall.update(now / 1000, this.season.w,
      this.renderer.getPixelRatio(), this.camera, view, groundHeight * this.camera.aspect, groundHeight)
    if (this.snowfall.visible) this.renderer.render(this.snowfall.scene, this.camera)
    this.renderer.render(this.overlay, this.camera)
    this.renderer.autoClear = true

    this.frames++
    if (now - this.fpsTime >= 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsTime)
      this.frames = 0
      this.fpsTime = now
      this.onStats?.({ fps: this.fps, tiles: this.terrain.tileCount,
        vertices: this.terrain.vertexCount, distance: this.controls.getView().distance,
        trees: this.forest.count, forestTexture: this.forest.status,
        ...this.parchment.sceneSize })
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.terrain.dispose()
    this.forest.dispose()
    this.crystals.dispose()
    this.roads.dispose()
    this.cities.dispose()
    this.labels.dispose()
    this.roadOverview.dispose()
    this.roadHighlights.dispose()
    this.cityHighlights.dispose()
    this.marches.dispose()
    this.parchment.dispose()
    this.snowfall.dispose()
    this.macro.dispose()
    this.flow.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

function createWorldTexture(renderer: THREE.WebGLRenderer, data: Float32Array, res: number): THREE.DataTexture {
  // Linear filtering of 32-bit float textures is an extension; fall back to half floats
  const floatLinear = renderer.extensions.has('OES_texture_float_linear')
  const tex = floatLinear
    ? new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.FloatType)
    : new THREE.DataTexture(
        Uint16Array.from(data, (v) => THREE.DataUtils.toHalfFloat(v)),
        res,
        res,
        THREE.RGBAFormat,
        THREE.HalfFloatType,
      )
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}
