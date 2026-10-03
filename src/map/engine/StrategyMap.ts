import * as THREE from 'three'
import type { WorldData } from '../world/generateWorld'
import { Heightfield } from '../world/Heightfield'
import { MapCameraController } from './MapCameraController'
import { TerrainQuadtree } from './TerrainQuadtree'

/** Vertical exaggeration of the macro elevation */
const HEIGHT_SCALE = 1.4
/** Root tile size: the map plus a wide band of open sea */
const TERRAIN_EXTENT = 4096

export interface MapStats {
  fps: number
  tiles: number
  distance: number
}

/** Owns the three.js scene of the strategy map */
export class StrategyMap {
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  readonly controls: MapCameraController
  private readonly scene = new THREE.Scene()
  private readonly terrain: TerrainQuadtree
  private readonly macro: THREE.DataTexture
  private readonly flow: THREE.DataTexture
  private readonly resizeObserver: ResizeObserver
  private readonly container: HTMLElement
  private lastTime = performance.now()
  private frames = 0
  private fpsTime = performance.now()
  private fps = 0
  onStats?: (stats: MapStats) => void

  constructor(container: HTMLElement, world: WorldData) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x10264a)
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 6000)

    this.macro = createWorldTexture(this.renderer, world.macro, world.resolution)
    this.flow = createWorldTexture(this.renderer, world.flow, world.resolution)
    let maxElevation = 0
    for (let k = 0; k < world.macro.length; k += 4) maxElevation = Math.max(maxElevation, world.macro[k])

    this.terrain = new TerrainQuadtree({
      macro: this.macro,
      flow: this.flow,
      worldSize: world.worldSize,
      extent: TERRAIN_EXTENT,
      heightScale: HEIGHT_SCALE,
      // Noise detail and tree canopies rise a few units above the macro peaks
      maxHeight: (maxElevation + 9) * HEIGHT_SCALE,
    })
    this.scene.add(this.terrain.mesh)

    const s = world.worldSize
    this.controls = new MapCameraController(this.camera, this.renderer.domElement, new Heightfield(world), HEIGHT_SCALE, {
      minDistance: 14,
      maxDistance: 1500,
      minPitch: 34,
      maxPitch: 62,
      bounds: { minX: s * 0.06, maxX: s * 0.94, minZ: s * 0.1, maxZ: s * 0.94 },
    })
    this.controls.setView(s * 0.52, s * 0.55, 1400)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.renderer.setAnimationLoop(this.frame)
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private frame = (now: number) => {
    const dt = Math.min(100, now - this.lastTime)
    this.lastTime = now
    this.controls.update(dt)
    this.terrain.update(this.camera)
    this.terrain.material.uniforms.uTime.value = now / 1000
    this.renderer.render(this.scene, this.camera)

    this.frames++
    if (now - this.fpsTime >= 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsTime)
      this.frames = 0
      this.fpsTime = now
      this.onStats?.({ fps: this.fps, tiles: this.terrain.tileCount, distance: this.controls.getView().distance })
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.terrain.dispose()
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
