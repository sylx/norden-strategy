import * as THREE from 'three'
import cityUrl from '../../assets/places/place_city.webp'
import fortress1Url from '../../assets/places/place_fortress1.webp'
import fortress2Url from '../../assets/places/place_fortress2.webp'
import metropoliceUrl from '../../assets/places/place_metropolice.webp'
import templeUrl from '../../assets/places/place_temple.webp'
import townUrl from '../../assets/places/place_town.webp'
import { FACTION_MAP } from '../../data/faction'
import type { Heightfield } from '../world/Heightfield'
import { PLACE_KINDS, type Place, type PlaceType } from '../world/placeLayout'
import { terrainCommon } from './terrainShader'
import { PLACE_DEFAULTS, type PlaceSettings } from './placeSettings'

/**
 * Card art per kind of place (512px square, isometric). `anchor` is the card
 * uv standing on the city's position: the centre of the drawn footprint.
 * `bottom` is the v of the lowest opaque pixel, where the name label goes.
 */
export const PLACE_ART: Readonly<Record<PlaceType, { url: string; anchor: readonly [number, number]; bottom: number }>> = {
  town: { url: townUrl, anchor: [0.5, 0.45], bottom: 0.064 },
  city: { url: cityUrl, anchor: [0.5, 0.47], bottom: 0.148 },
  metropolice: { url: metropoliceUrl, anchor: [0.5, 0.46], bottom: 0.221 },
  fortress1: { url: fortress1Url, anchor: [0.5, 0.46], bottom: 0.229 },
  fortress2: { url: fortress2Url, anchor: [0.5, 0.41], bottom: 0.135 },
  temple: { url: templeUrl, anchor: [0.5, 0.45], bottom: 0.16 },
}

const EMBLEMS = import.meta.glob<string>('../../assets/emblems/emblem_*.png', { eager: true, import: 'default' })

export function emblemUrl(factionId?: string): string | undefined {
  const emblem = factionId ? FACTION_MAP[factionId]?.emblem : undefined
  return emblem ? EMBLEMS[`../../assets/emblems/emblem_${String(emblem).padStart(2, '0')}.png`] : undefined
}

/** On-screen width (CSS px) of a town's card at a view depth */
function townPixels(depth: number, pxScale: number, settings: PlaceSettings) {
  return THREE.MathUtils.clamp((settings.citySize * pxScale) / depth, settings.cityMinPx, settings.cityMaxPx)
}

/** On-screen width (CSS px) of a card of this kind at a view depth */
export function cardPixels(type: PlaceType, depth: number, pxScale: number, settings: PlaceSettings) {
  return townPixels(depth, pxScale, settings) * PLACE_KINDS[type].size
}

/**
 * 1 while the city art is shown, 0 once zoomed out to emblems, crossfading in
 * between. Decided at the camera's look-at point so that all cities switch together.
 */
export function artVisibility(viewDistance: number, pxScale: number, settings: PlaceSettings) {
  const s = settings.emblemSwitchPx
  if (s <= 0) return 1
  return THREE.MathUtils.smoothstep(townPixels(viewDistance, pxScale, settings), s * 0.85, s * 1.15)
}

const vertexShader = /* glsl */ `
${terrainCommon}
uniform float uSize;
uniform float uMinPx;
uniform float uMaxPx;
// CSS px per world unit at a view depth of 1
uniform float uPxScale;
uniform float uRatio;
// > 0: constant on-screen size in CSS px (emblems)
uniform float uFixedPx;
uniform vec2 uAnchor;
out vec2 vUv;
out float vDistance;
void main() {
  // The mesh position carries the city's ground point
  vec2 p = vec2(modelMatrix[3][0], modelMatrix[3][2]);
  float spacing = distance(cameraPosition, vec3(p.x, 0.0, p.y)) / uDetailDistance;
  vec4 center = viewMatrix * vec4(p.x, groundHeight(p, spacing), p.y, 1.0);
  float depth = max(-center.z, 1e-3);
  // Same as cardPixels(): a world size, held between a minimum and maximum on screen
  float px = uFixedPx > 0.0 ? uFixedPx : clamp(uSize * uPxScale / depth, uMinPx, uMaxPx) * uRatio;
  vec4 corner = center;
  corner.xy += (uv - uAnchor) * px * depth / uPxScale;
  gl_Position = projectionMatrix * corner;
  vUv = uv;
  vDistance = length(center.xyz);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uAlpha;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in vec2 vUv;
in float vDistance;
out vec4 fragColor;
void main() {
  vec4 texel = texture(uMap, vUv);
  texel.a *= uAlpha;
  if (texel.a < 0.01) discard;
  // Only a touch of fog: the cities are game pieces and should stay legible
  vec3 col = mix(texel.rgb, uFogColor, smoothstep(uFogNear, uFogFar, vDistance) * 0.5);
  fragColor = vec4(col, texel.a);
  #if defined(TONE_MAPPING)
    fragColor.rgb = toneMapping(fragColor.rgb);
  #endif
  fragColor = linearToOutputTexel(fragColor);
}
`

/**
 * Cities as camera-facing cards of their isometric art, standing on the
 * displaced terrain; zoomed out they turn into their faction's emblem. They
 * are drawn over the terrain, roads and trees without depth testing, sorted
 * back to front, so hills never cut them. Meant for the overlay scene drawn
 * after the post-processing.
 */
export class Cities {
  readonly group = new THREE.Group()
  private readonly cards = new THREE.Group()
  private readonly emblems = new THREE.Group()
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly materials: THREE.ShaderMaterial[] = []
  private readonly textures: THREE.Texture[] = []
  /** Uniforms shared by every kind */
  private readonly shared = {
    uSize: { value: PLACE_DEFAULTS.citySize },
    uMinPx: { value: PLACE_DEFAULTS.cityMinPx },
    uMaxPx: { value: PLACE_DEFAULTS.cityMaxPx },
    uPxScale: { value: 1 },
  }
  private readonly artAlpha = { value: 1 }
  private readonly emblemAlpha = { value: 0 }
  private readonly emblemPx = { value: PLACE_DEFAULTS.emblemPx }
  private settings = { ...PLACE_DEFAULTS }

  constructor(places: readonly Place[], terrain: THREE.ShaderMaterial, heights: Heightfield, heightScale: number,
    anisotropy: number) {
    const u = terrain.uniforms
    const loader = new THREE.TextureLoader()
    const createMaterial = (url: string, extra: Record<string, THREE.IUniform>) => {
      const texture = loader.load(url)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(8, anisotropy)
      this.textures.push(texture)
      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: {
          uMacro: u.uMacro, uFlow: u.uFlow, uWorldSize: u.uWorldSize,
          uHeightScale: u.uHeightScale, uTime: u.uTime, uDetailDistance: u.uDetailDistance,
          uPlainsRelief: u.uPlainsRelief, uMountainRelief: u.uMountainRelief, uMaxOctaves: u.uMaxOctaves,
          uTexturedForest: u.uTexturedForest, uForestDensity: u.uForestDensity, uForestShade: u.uForestShade,
          uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar,
          ...this.shared,
          uMap: { value: texture },
          ...extra,
        },
      })
      this.materials.push(material)
      return material
    }
    const cardMaterials = new Map<string, THREE.ShaderMaterial>()
    const emblemMaterials = new Map<string, THREE.ShaderMaterial>()
    /** fading: the card gives way to an emblem when zoomed out */
    const cardMaterial = (type: PlaceType, fading: boolean) => {
      const key = `${type}:${fading}`
      let material = cardMaterials.get(key)
      if (!material) {
        const art = PLACE_ART[type]
        material = createMaterial(art.url, {
          uRatio: { value: PLACE_KINDS[type].size }, uFixedPx: { value: 0 },
          uAnchor: { value: new THREE.Vector2(...art.anchor) }, uAlpha: fading ? this.artAlpha : { value: 1 },
        })
        cardMaterials.set(key, material)
      }
      return material
    }
    const emblemMaterial = (url: string) => {
      let material = emblemMaterials.get(url)
      if (!material) {
        material = createMaterial(url, {
          uRatio: { value: 1 }, uFixedPx: this.emblemPx,
          uAnchor: { value: new THREE.Vector2(0.5, 0.5) }, uAlpha: this.emblemAlpha,
        })
        emblemMaterials.set(url, material)
      }
      return material
    }
    const addMesh = (group: THREE.Group, material: THREE.ShaderMaterial, place: Place, y: number, name: string) => {
      const mesh = new THREE.Mesh(this.geometry, material)
      // The shader places the card; the position also orders the cards by depth
      mesh.position.set(place.x, y, place.z)
      mesh.frustumCulled = false
      mesh.renderOrder = 3
      mesh.name = name
      group.add(mesh)
    }

    for (const place of places) {
      const y = heights.surfaceAt(place.x, place.z) * heightScale
      const emblem = emblemUrl(place.belongTo)
      // Without an emblem the art stays, as on the 2D map
      addMesh(emblem ? this.cards : this.group, cardMaterial(place.type, Boolean(emblem)), place, y, place.id)
      if (emblem) addMesh(this.emblems, emblemMaterial(emblem), place, y, `${place.id}-emblem`)
    }
    this.cards.name = 'city-cards'
    this.emblems.name = 'city-emblems'
    this.group.add(this.cards, this.emblems)
    this.group.name = 'cities'
  }

  applySettings(settings: PlaceSettings) {
    this.settings = { ...settings }
    this.shared.uSize.value = settings.citySize
    this.shared.uMinPx.value = settings.cityMinPx
    this.shared.uMaxPx.value = settings.cityMaxPx
    this.emblemPx.value = settings.emblemPx
  }

  /**
   * Crossfades between the art and the emblems for the camera's distance to
   * its look-at point. Returns the art's visibility (1 = art, 0 = emblems).
   */
  update(viewDistance: number): number {
    const art = artVisibility(viewDistance, this.shared.uPxScale.value, this.settings)
    this.artAlpha.value = art
    this.emblemAlpha.value = 1 - art
    this.cards.visible = art > 0.001
    this.emblems.visible = art < 0.999
    return art
  }

  /** CSS px per world unit at view depth 1 */
  setPixelScale(scale: number) {
    this.shared.uPxScale.value = scale
  }

  dispose() {
    this.geometry.dispose()
    for (const material of this.materials) material.dispose()
    for (const texture of this.textures) texture.dispose()
    this.group.clear()
  }
}
