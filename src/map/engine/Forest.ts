import * as THREE from 'three'
import atlasUrl from '../../assets/forest/woodland-atlas.png'
import type { WorldData } from '../world/generateWorld'
import { groundObjectDepth, terrainCommon } from './terrainShader'
import { FOREST_DEFAULTS, type ForestSettings } from './forestSettings'
import { crystalDistance } from './crystalZones'

const SPACING = 1.85
const CHUNK_SIZE = 64

const vertexShader = /* glsl */ `
${terrainCommon}
${groundObjectDepth}
in vec4 aTree; // x, z, size seed, species seed
uniform float uSize;
uniform float uVariation;
uniform float uConifers;
out vec2 vUv;
out float vTone;
out float vDistance;
void main() {
  vec2 p = aTree.xy;
  float spacing = distance(cameraPosition, vec3(p.x, 0.0, p.y)) / uDetailDistance;
  float h = groundHeight(p, spacing);
  float size = uSize * mix(1.0, 0.65 + aTree.z * 0.7, uVariation);
  float species = aTree.w < uConifers ? 3.0 : floor(fract(aTree.w * 17.31) * 3.0);
  vec2 cardUv = uv;
  // The upper-left oak spills into the upper-right cell through atlas x=646.
  // Start the beech card at x~705, inside the clear gutter before its leaves
  // (x=757). Crop the geometry together with the UVs to preserve size/position.
  if (species == 1.0) cardUv.x = mix(0.12, 1.0, uv.x);
  // Camera-facing cards, like battle's impostors, but continuously follow pitch.
  // The atlas has its trunk bases about 9% above the bottom of each cell.
  vec4 center = viewMatrix * vec4(p.x, h + 0.04, p.y, 1.0);
  center.xy += vec2(cardUv.x - 0.5, cardUv.y - 0.09) * size;
  gl_Position = projectionMatrix * center;
  gl_Position.z = groundObjectDepth(center.xyz, gl_Position);
  vec2 cell = vec2(mod(species, 2.0), 1.0 - floor(species / 2.0));
  // Inset from cell boundaries to prevent neighbouring sprites bleeding in.
  vUv = (cell + mix(vec2(0.006), vec2(0.994), cardUv)) * 0.5;
  vTone = mix(1.0, 0.78 + aTree.z * 0.4, uVariation);
  vDistance = length(center.xyz);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uBrightness;
uniform float uWarmth;
uniform float uShade;
uniform float uAlphaCut;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in vec2 vUv;
in float vTone;
in float vDistance;
out vec4 fragColor;
void main() {
  vec4 texel = texture(uAtlas, vUv);
  // Opaque depth-writing cutouts need no per-tree transparency sorting.
  float width = max(fwidth(texel.a), 0.025);
  float alpha = smoothstep(0.3 - width, 0.3 + width, texel.a);
  if (alpha < uAlphaCut) discard;
  vec3 tint = mix(vec3(0.52, 1.0, 0.90), vec3(1.12, 1.0, 0.64), uWarmth);
  vec3 col = texel.rgb * tint * uBrightness * vTone;
  float crownHeight = fract(vUv.y * 2.0);
  col *= mix(1.0 - uShade * 0.5, 1.0, smoothstep(0.12, 0.7, crownHeight));
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDistance));
  fragColor = vec4(col, alpha);
  #if defined(TONE_MAPPING)
    fragColor.rgb = toneMapping(fragColor.rgb);
  #endif
  fragColor = linearToOutputTexel(fragColor);
}
`

interface Candidate { x: number; z: number; height: number; size: number; species: number; rank: number }
interface Chunk { geometry: THREE.InstancedBufferGeometry; capacity: number }
export type ForestTextureStatus = 'loading' | 'ready' | 'error'

/** Deterministic, chunk-culled instancing: four vertices per tree, one atlas. */
export class Forest {
  readonly group = new THREE.Group()
  private readonly material: THREE.ShaderMaterial
  private readonly texture: THREE.Texture
  private readonly chunks: Chunk[] = []
  private settings = { ...FOREST_DEFAULTS }
  private disposed = false
  status: ForestTextureStatus = 'loading'
  count = 0

  constructor(world: WorldData, terrain: THREE.ShaderMaterial, heightScale: number, anisotropy: number) {
    const u = terrain.uniforms
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
      alphaToCoverage: true,
      uniforms: {
        uMacro: u.uMacro, uFlow: u.uFlow, uWorldSize: u.uWorldSize,
        uHeightScale: u.uHeightScale, uTime: u.uTime, uDetailDistance: u.uDetailDistance,
        uPlainsRelief: u.uPlainsRelief, uMountainRelief: u.uMountainRelief, uMaxOctaves: u.uMaxOctaves,
        uTexturedForest: u.uTexturedForest, uForestDensity: u.uForestDensity, uForestShade: u.uForestShade,
        uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar,
        uAtlas: { value: null }, uSize: { value: this.settings.size },
        uVariation: { value: this.settings.variation }, uConifers: { value: this.settings.conifers },
        uBrightness: { value: this.settings.brightness }, uWarmth: { value: this.settings.warmth },
        uShade: { value: this.settings.shade }, uAlphaCut: { value: 0.01 },
      },
    })
    this.group.name = 'painted-woodland'
    this.group.visible = false
    this.texture = new THREE.TextureLoader().load(atlasUrl, (texture) => {
      if (this.disposed) { texture.dispose(); return }
      this.status = 'ready'
      this.applySettings(this.settings)
    }, undefined, () => {
      if (!this.disposed) {
        this.status = 'error'
        this.applySettings(this.settings)
      }
    })
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = Math.min(8, anisotropy)
    this.material.uniforms.uAtlas.value = this.texture

    const buckets = new Map<string, Candidate[]>()
    const cells = Math.ceil(world.worldSize / SPACING)
    const sample = (x: number, z: number, channel: number) => sampleMacro(world, x, z, channel)
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const id = iz * cells + ix
        const x = (ix + 0.12 + random(id * 7) * 0.76) * SPACING
        const z = (iz + 0.12 + random(id * 7 + 1) * 0.76) * SPACING
        const h = sample(x, z, 0)
        const coverage = THREE.MathUtils.smoothstep(sample(x, z, 3), 0.28, 0.82)
        if (h < 1.2 || h > 13 || sample(x, z, 1) > 0.15 || sample(x, z, 2) > 0.65
          || random(id * 7 + 2) > coverage || crystalDistance(x, z) < 0.95) continue
        // Keep banks open and avoid steep rock. Probe around the root as well.
        const slope = Math.hypot(sample(x + 1, z, 0) - sample(x - 1, z, 0), sample(x, z + 1, 0) - sample(x, z - 1, 0)) / 2
        if (slope > 0.85 || sample(x + 1, z, 1) > 0.3 || sample(x - 1, z, 1) > 0.3
          || sample(x, z + 1, 1) > 0.3 || sample(x, z - 1, 1) > 0.3) continue
        const key = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`
        let list = buckets.get(key)
        if (!list) { list = []; buckets.set(key, list) }
        list.push({ x, z, height: h, size: random(id * 7 + 3), species: random(id * 7 + 4), rank: random(id * 7 + 5) })
      }
    }
    const plane = new THREE.PlaneGeometry(1, 1)
    for (const list of buckets.values()) {
      // Prefix selection lets density change instantly without reshuffling trees.
      list.sort((a, b) => a.rank - b.rank)
      const geometry = new THREE.InstancedBufferGeometry()
      geometry.setIndex(plane.index!.clone())
      geometry.setAttribute('position', plane.getAttribute('position').clone())
      geometry.setAttribute('uv', plane.getAttribute('uv').clone())
      geometry.setAttribute('aTree', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap(t => [t.x, t.z, t.size, t.species])), 4))
      const bounds = new THREE.Box3()
      for (const t of list) bounds.expandByPoint(new THREE.Vector3(t.x, t.height * heightScale, t.z))
      // Enclose all allowed sizes, shader displacement and camera-facing tilt.
      bounds.expandByScalar(16)
      geometry.boundingBox = bounds
      geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere())
      const mesh = new THREE.Mesh(geometry, this.material)
      mesh.renderOrder = 1
      this.group.add(mesh)
      this.chunks.push({ geometry, capacity: list.length })
    }
    plane.dispose()
    this.applySettings(this.settings)
  }

  /** Without MSAA alpha-to-coverage does nothing, so cut the cards at half alpha */
  setMultisample(enabled: boolean) {
    this.material.alphaToCoverage = enabled
    this.material.uniforms.uAlphaCut.value = enabled ? 0.01 : 0.5
  }

  applySettings(settings: ForestSettings) {
    this.settings = { ...settings }
    const active = settings.mode === 'textured' && this.status === 'ready'
    this.group.visible = active
    const u = this.material.uniforms
    u.uTexturedForest.value = active ? 1 : 0
    u.uForestDensity.value = settings.density
    u.uForestShade.value = settings.shade
    u.uSize.value = settings.size
    u.uVariation.value = settings.variation
    u.uConifers.value = settings.conifers
    u.uBrightness.value = settings.brightness
    u.uWarmth.value = settings.warmth
    u.uShade.value = settings.shade
    this.count = 0
    for (const chunk of this.chunks) {
      chunk.geometry.instanceCount = Math.floor(chunk.capacity * settings.density)
      if (active) this.count += chunk.geometry.instanceCount
    }
  }

  dispose() {
    this.disposed = true
    for (const chunk of this.chunks) chunk.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
    this.group.clear()
  }
}

export function random(seed: number) {
  let n = Math.imul(seed + 1, 747796405) + 2891336453
  n = Math.imul(n ^ (n >>> ((n >>> 28) + 4)), 277803737)
  return ((n ^ (n >>> 22)) >>> 0) / 4294967296
}

export function sampleMacro(world: WorldData, x: number, z: number, channel: number) {
  const { resolution: res, worldSize, macro } = world
  const u = Math.max(0, Math.min(res - 1.001, x / worldSize * res - 0.5))
  const v = Math.max(0, Math.min(res - 1.001, z / worldSize * res - 0.5))
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
  const k = (j * res + i) * 4 + channel
  const a = THREE.MathUtils.lerp(macro[k], macro[k + 4], fu)
  const b = THREE.MathUtils.lerp(macro[k + res * 4], macro[k + res * 4 + 4], fu)
  return THREE.MathUtils.lerp(a, b, fv)
}
