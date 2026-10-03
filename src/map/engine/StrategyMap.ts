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
import { PLACES } from '../world/placeLayout'
import { IMAGE_TO_WORLD } from '../world/islandDesign'
import { Roads } from './Roads'
import { Cities } from './Cities'
import { PlaceLabels } from './PlaceLabels'
import { normalizePlaceSettings, PLACE_DEFAULTS, type PlaceSettings } from './placeSettings'

/** Vertical exaggeration of the macro elevation */
const HEIGHT_SCALE = 1.4
/** Root tile size: the map plus a wide band of open sea */
const TERRAIN_EXTENT = 4096

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

export interface MapSettings {
  forest?: ForestSettings
  parchment?: ParchmentSettings
  terrain?: TerrainSettings
  render?: RenderSettings
  places?: PlaceSettings
}

/** Owns the three.js scene of the strategy map */
export class StrategyMap {
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  readonly controls: MapCameraController
  private readonly scene = new THREE.Scene()
  /** Drawn after the post-processing, at full resolution whatever the render resolution (cities, emblems) */
  private readonly overlay = new THREE.Scene()
  private readonly terrain: TerrainQuadtree
  private readonly forest: Forest
  private readonly crystals: Crystals
  private readonly roads: Roads
  private readonly cities: Cities
  private readonly labels: PlaceLabels
  private readonly parchment: ParchmentEffect
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

  constructor(container: HTMLElement, world: WorldData, settings: MapSettings = {}) {
    this.container = container
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
    this.forest = new Forest(world, this.terrain.material, HEIGHT_SCALE, this.renderer.capabilities.getMaxAnisotropy())
    this.forest.applySettings(normalizeForestSettings(settings.forest ?? FOREST_DEFAULTS))
    this.scene.add(this.forest.group)
    this.crystals = new Crystals(world, this.terrain.material, HEIGHT_SCALE)
    this.scene.add(this.crystals.mesh)
    this.roads = new Roads(world.roads, this.terrain.material, maxHeight)
    this.scene.add(this.roads.mesh)
    this.cities = new Cities(PLACES, this.terrain.material, heights, HEIGHT_SCALE,
      this.renderer.capabilities.getMaxAnisotropy())
    this.overlay.add(this.cities.group)
    this.labels = new PlaceLabels(container, PLACES, heights, HEIGHT_SCALE)
    this.setPlaceSettings(settings.places ?? PLACE_DEFAULTS)
    this.parchment = new ParchmentEffect(this.renderer)
    this.parchment.applySettings(settings.parchment ?? PARCHMENT_DEFAULTS)

    const s = world.worldSize
    this.controls = new MapCameraController(this.camera, this.renderer.domElement, heights, HEIGHT_SCALE, {
      minDistance: 14,
      maxDistance: 1500,
      minPitch: 34,
      maxPitch: 62,
      bounds: { minX: s * 0.06, maxX: s * 0.94, minZ: s * 0.1, maxZ: s * 0.94 },
    })
    this.controls.setView(s * 0.52, s * 0.55, 1400)

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
    this.cities.applySettings(settings)
    this.labels.applySettings(settings)
  }

  setParchmentSettings(settings: ParchmentSettings) {
    this.parchment.applySettings(settings)
  }

  private frame = (now: number) => {
    const dt = Math.min(100, now - this.lastTime)
    this.lastTime = now
    this.controls.update(dt)
    this.terrain.update(this.camera)
    this.terrain.material.uniforms.uTime.value = now / 1000
    const art = this.cities.update(this.controls.getView().distance)
    this.labels.update(this.camera, this.viewSize.width, this.viewSize.height, this.pxScale, art)
    this.parchment.render(this.renderer, this.scene, this.camera)
    this.renderer.autoClear = false
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
    this.parchment.dispose()
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
