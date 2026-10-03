import * as THREE from 'three'
import type { WorldData } from '../world/generateWorld'
import { terrainFragmentShader, terrainVertexShader } from './terrainShader'
import { TERRAIN_DEFAULTS, type TerrainSettings } from './terrainSettings'

const MAX_DEPTH = 10
/** Deepest level with its own roughness entry; deeper tiles use their parent's */
const ROUGHNESS_DEPTH = 9
const MAX_TILES = 2048
/** Distance / vertex spacing the detail level was tuned for (32 segments, LoD 2.2) */
const DETAIL_DISTANCE_PER_LOD = 45 / (32 * 2.2)
/** Shortest split distance of completely flat tiles at full simplification */
const FLAT_SPLIT_MIN = 0.2

export interface TerrainOptions {
  world: WorldData
  macro: THREE.Texture
  /** River flow direction, aridity, river size */
  flow: THREE.Texture
  worldSize: number
  /** Area covered by the root tile, centred on the map (includes open sea) */
  extent: number
  heightScale: number
  /** Highest point after scaling, for culling bounds */
  maxHeight: number
  settings?: TerrainSettings
}

/**
 * Terrain made of square tiles chosen from a quadtree around the camera.
 * All tiles share one grid and are drawn in a single instanced call; the
 * vertex shader lifts the grid from the macro texture plus noise detail.
 * Tiles over flat ground (plains, open sea) split later than rough ones.
 */
export class TerrainQuadtree {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  private geometry: THREE.InstancedBufferGeometry
  private readonly tiles: THREE.InstancedBufferAttribute
  private readonly root: { x: number; z: number; size: number }
  private readonly maxHeight: number
  private readonly roughness: Float32Array[]
  private readonly frustum = new THREE.Frustum()
  private readonly projView = new THREE.Matrix4()
  private readonly box = new THREE.Box3()
  private settings = { ...TERRAIN_DEFAULTS }
  private count = 0

  constructor(options: TerrainOptions) {
    const half = options.extent / 2
    const c = options.worldSize / 2
    this.root = { x: c - half, z: c - half, size: options.extent }
    this.maxHeight = options.maxHeight
    this.roughness = buildRoughness(options.world, this.root)

    this.tiles = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TILES * 4), 4)
    this.tiles.setUsage(THREE.DynamicDrawUsage)
    this.geometry = this.createGeometry(this.settings.segments)

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: {
        uMacro: { value: options.macro },
        uFlow: { value: options.flow },
        uWorldSize: { value: options.worldSize },
        uHeightScale: { value: options.heightScale },
        uDetailDistance: { value: 45 },
        uPlainsRelief: { value: 1 },
        uMountainRelief: { value: 1 },
        uMaxOctaves: { value: 10 },
        uTime: { value: 0 },
        uTexturedForest: { value: 0 },
        uForestDensity: { value: 0.85 },
        uForestShade: { value: 0.55 },
        uSunDir: { value: new THREE.Vector3(-0.55, 0.7, -0.45) },
        uFogColor: { value: new THREE.Color(0x10264a) },
        uFogNear: { value: 1900 },
        uFogFar: { value: 3400 },
      },
    })

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
    this.applySettings(options.settings ?? TERRAIN_DEFAULTS)
  }

  get tileCount() {
    return this.count
  }

  /** Vertices submitted per frame, skirts included */
  get vertexCount() {
    const n = this.settings.segments
    return this.count * ((n + 1) * (n + 1) + n * 4)
  }

  applySettings(settings: TerrainSettings) {
    if (settings.segments !== this.settings.segments) {
      this.geometry.dispose()
      this.geometry = this.createGeometry(settings.segments)
      this.mesh.geometry = this.geometry
    }
    this.settings = { ...settings }
    const u = this.material.uniforms
    // Keep the noise detail per vertex as it was tuned, whatever the grid
    u.uDetailDistance.value = DETAIL_DISTANCE_PER_LOD * settings.segments * settings.lodFactor
    u.uPlainsRelief.value = settings.plainsRelief
    u.uMountainRelief.value = settings.mountainRelief
  }

  private createGeometry(segments: number) {
    const geometry = createTileGeometry(segments)
    geometry.setAttribute('aTile', this.tiles)
    geometry.instanceCount = this.count
    return geometry
  }

  /** Re-select tiles for the camera. Cheap enough to run every frame. */
  update(camera: THREE.PerspectiveCamera) {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projView)
    this.count = 0
    this.select(camera.position, this.root.x, this.root.z, this.root.size, 0)
    this.geometry.instanceCount = this.count
    this.tiles.clearUpdateRanges()
    this.tiles.addUpdateRange(0, this.count * 4)
    this.tiles.needsUpdate = true
  }

  private select(eye: THREE.Vector3, x: number, z: number, size: number, depth: number) {
    this.box.min.set(x, -1, z)
    this.box.max.set(x + size, this.maxHeight, z + size)
    if (!this.frustum.intersectsBox(this.box)) return

    const dist = this.box.distanceToPoint(eye)
    const { lodFactor, flatSimplify, segments } = this.settings
    const flat = 1 - this.roughnessAt(x, z, size, depth)
    const split = size * lodFactor * (1 - flat * flatSimplify * (1 - FLAT_SPLIT_MIN))
    if (depth < MAX_DEPTH && dist < split && this.count + 4 <= MAX_TILES) {
      const h = size / 2
      this.select(eye, x, z, h, depth + 1)
      this.select(eye, x + h, z, h, depth + 1)
      this.select(eye, x, z + h, h, depth + 1)
      this.select(eye, x + h, z + h, h, depth + 1)
      return
    }
    if (this.count >= MAX_TILES) return
    const a = this.tiles.array as Float32Array
    const k = this.count * 4
    a[k] = x
    a[k + 1] = z
    a[k + 2] = size
    a[k + 3] = size / segments
    this.count++
  }

  private roughnessAt(x: number, z: number, size: number, depth: number) {
    const level = Math.min(depth, ROUGHNESS_DEPTH)
    const cell = this.root.size / (1 << level)
    const n = 1 << level
    // Sample the tile centre so a deeper tile finds its ancestor's cell
    const i = Math.floor((x + size / 2 - this.root.x) / cell)
    const j = Math.floor((z + size / 2 - this.root.z) / cell)
    return this.roughness[level][j * n + i]
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * How much each quadtree cell needs vertices (0 flat .. 1 rough): the maximum
 * over the cell of a per-texel estimate. Open sea is drawn flat at y = 0 and
 * gets 0; the coastal band, mountains, steep slopes and dunes get more.
 * Returns one row-major grid per depth, finest at ROUGHNESS_DEPTH.
 */
function buildRoughness(world: WorldData, root: { x: number; z: number; size: number }): Float32Array[] {
  const { resolution: res, worldSize, macro, flow } = world
  const n = 1 << ROUGHNESS_DEPTH
  const cell = root.size / n
  const texel = worldSize / res
  const finest = new Float32Array(n * n)
  const smooth = (e0: number, e1: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const k = (j * res + i) * 4
      const e = macro[k]
      let r = 0
      if (e > -2.5) {
        const ex = macro[(j * res + Math.min(res - 1, i + 1)) * 4] - macro[(j * res + Math.max(0, i - 1)) * 4]
        const ez = macro[(Math.min(res - 1, j + 1) * res + i) * 4] - macro[(Math.max(0, j - 1) * res + i) * 4]
        const slope = Math.hypot(ex, ez) / (2 * texel)
        const coast = 1 - smooth(1.5, 3, e)
        const mountain = smooth(0.08, 0.5, macro[k + 2])
        const dunes = smooth(0.35, 0.7, flow[k + 2]) * 0.7
        r = Math.max(coast, mountain, dunes, smooth(0.25, 1.2, slope))
      }
      const ci = Math.floor(((i + 0.5) * texel - root.x) / cell)
      const cj = Math.floor(((j + 0.5) * texel - root.z) / cell)
      if (ci < 0 || cj < 0 || ci >= n || cj >= n) continue
      const c = cj * n + ci
      if (r > finest[c]) finest[c] = r
    }
  }
  const levels: Float32Array[] = [finest]
  for (let size = n / 2; size >= 1; size /= 2) {
    const child = levels[0]
    const parent = new Float32Array(size * size)
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = 2 * j * 2 * size + 2 * i
        parent[j * size + i] = Math.max(child[k], child[k + 1], child[k + 2 * size], child[k + 2 * size + 1])
      }
    }
    levels.unshift(parent)
  }
  return levels
}

/**
 * Unit grid in x/z with a skirt around the border. position.y is 0 for the
 * surface and 1 for skirt vertices, which the shader pushes downwards.
 */
function createTileGeometry(segments: number): THREE.InstancedBufferGeometry {
  const n = segments + 1
  const positions: number[] = []
  const indices: number[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) positions.push(i / segments, 0, j / segments)
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  // Border loop (counter-clockwise seen from above) and its skirt copy
  const border: number[] = []
  for (let i = 0; i < segments; i++) border.push(i)
  for (let j = 0; j < segments; j++) border.push(j * n + segments)
  for (let i = segments; i > 0; i--) border.push(segments * n + i)
  for (let j = segments; j > 0; j--) border.push(j * n)
  const skirtStart = positions.length / 3
  for (const v of border) positions.push(positions[v * 3], 1, positions[v * 3 + 2])
  for (let s = 0; s < border.length; s++) {
    const a = border[s]
    const b = border[(s + 1) % border.length]
    const sa = skirtStart + s
    const sb = skirtStart + ((s + 1) % border.length)
    // Double-sided so winding does not matter
    indices.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb)
  }

  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}
