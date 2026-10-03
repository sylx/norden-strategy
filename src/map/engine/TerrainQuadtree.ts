import * as THREE from 'three'
import { terrainFragmentShader, terrainVertexShader } from './terrainShader'

/** Grid segments per tile edge */
const TILE_SEGMENTS = 32
/** A tile splits while the camera is closer than size * LOD_FACTOR */
const LOD_FACTOR = 2.2
const MAX_DEPTH = 10
const MAX_TILES = 2048

export interface TerrainOptions {
  macro: THREE.Texture
  /** River flow direction, aridity, river size */
  flow: THREE.Texture
  worldSize: number
  /** Area covered by the root tile, centred on the map (includes open sea) */
  extent: number
  heightScale: number
  /** Highest point after scaling, for culling bounds */
  maxHeight: number
}

/**
 * Terrain made of square tiles chosen from a quadtree around the camera.
 * All tiles share one grid and are drawn in a single instanced call; the
 * vertex shader lifts the grid from the macro texture plus noise detail.
 */
export class TerrainQuadtree {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly tiles: THREE.InstancedBufferAttribute
  private readonly root: { x: number; z: number; size: number }
  private readonly maxHeight: number
  private readonly frustum = new THREE.Frustum()
  private readonly projView = new THREE.Matrix4()
  private readonly box = new THREE.Box3()
  private count = 0

  constructor(options: TerrainOptions) {
    const half = options.extent / 2
    const c = options.worldSize / 2
    this.root = { x: c - half, z: c - half, size: options.extent }
    this.maxHeight = options.maxHeight

    this.geometry = createTileGeometry(TILE_SEGMENTS)
    this.tiles = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TILES * 4), 4)
    this.tiles.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('aTile', this.tiles)
    this.geometry.instanceCount = 0

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: {
        uMacro: { value: options.macro },
        uFlow: { value: options.flow },
        uWorldSize: { value: options.worldSize },
        uHeightScale: { value: options.heightScale },
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
  }

  get tileCount() {
    return this.count
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
    if (depth < MAX_DEPTH && dist < size * LOD_FACTOR && this.count + 4 <= MAX_TILES) {
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
    a[k + 3] = size / TILE_SEGMENTS
    this.count++
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
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
