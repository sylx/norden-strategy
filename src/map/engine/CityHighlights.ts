import * as THREE from 'three'
import type { Place } from '../world/placeLayout'
import { PLACE_KINDS } from '../world/placeLayout'
import type { OverlayUniforms } from './overlayUniforms'
import { PLACE_DEFAULTS, type PlaceSettings } from './placeSettings'
import { terrainCommon } from './terrainShader'

export interface CityHighlight {
  id: string
  color?: THREE.ColorRepresentation
}

export const CITY_HIGHLIGHT_COLOR = '#ffd45a'

/** Ring radius against the card width (art) and the emblem size (zoomed out) */
const CARD_RADIUS = 0.46
const EMBLEM_RADIUS = 0.62
/** The quad reaches beyond the ring for the ticks and the ripple */
const EXTENT = 1.45
/** Time (ms) of the ring's shrink-in when a city is selected */
const INTRO_MS = 320

const vertexShader = /* glsl */ `
${terrainCommon}
uniform vec2 uCenter;
uniform float uSize;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uRatio;
uniform float uEmblemPx;
// 1 while the city art is shown, 0 for the emblems (Cities.update)
uniform float uArt;
uniform float uScale;
uniform float uPxScale;
out vec2 vLocal;
out float vFront;
out float vRadiusPx;
void main() {
  float spacing = distance(cameraPosition, vec3(uCenter.x, 0.0, uCenter.y)) / uDetailDistance;
  vec4 center = viewMatrix * vec4(uCenter.x, groundHeight(uCenter, spacing), uCenter.y, 1.0);
  float depth = max(-center.z, 1e-3);
  // Same card size as the Cities shader
  float cardPx = clamp(uSize * uPxScale / depth, uMinPx, uMaxPx) * uRatio;
  float radiusPx = mix(uEmblemPx * ${EMBLEM_RADIUS.toFixed(3)}, cardPx * ${CARD_RADIUS.toFixed(3)}, uArt) * uScale;
  float r = radiusPx * depth / uPxScale;
  vec2 q = (uv * 2.0 - 1.0) * ${EXTENT.toFixed(3)};
  // Facing the camera; around the city art it is flattened like a ring lying on the ground
  float flatten = abs((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).z);
  center.xy += vec2(q.x, q.y * mix(1.0, flatten, uArt)) * r;
  gl_Position = projectionMatrix * center;
  vLocal = q;
  // The lower half on screen is the front
  vFront = -q.y * uArt;
  vRadiusPx = radiusPx;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uInk;
uniform float uOpacity;
// -1: the half behind the city, +1: the half in front of it
uniform float uHalf;
uniform float uTime;
in vec2 vLocal;
in float vFront;
in float vRadiusPx;
out vec4 fragColor;

float line(float d, float halfWidth, float aa) {
  return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(d));
}

void main() {
  // The ring is split so that the city art stands inside it
  if (uHalf > 0.0 ? vFront <= 0.0 : vFront > 0.0) discard;
  float r = length(vLocal);
  float aa = max(fwidth(r), 1e-4);
  float angle = atan(vLocal.y, vLocal.x) / 6.28318;

  // Line widths in ring radii, but never thinner than a couple of CSS px
  float px = 1.0 / max(vRadiusPx, 1.0);
  float width = max(0.045, 1.6 * px);
  float ring = line(r - 1.0, width, aa);
  float ink = line(r - 1.0, width + max(0.04, 1.2 * px), aa);
  // Twelve dashes turning slowly on an outer ring
  float tickR = 1.0 + max(0.17, 6.0 * px);
  float dash = step(fract(angle * 12.0 + uTime * 0.08), 0.55);
  float ticks = line(r - tickR, max(0.028, 1.0 * px), aa) * dash;
  float tickInk = line(r - tickR, max(0.055, 2.0 * px), aa) * dash;
  // A ripple running outwards
  float p = fract(uTime * 0.55);
  float ripple = line(r - (1.0 + p * 0.42), max(0.03, 1.0 * px) + aa, aa) * (1.0 - p) * 0.8;
  float fill = (1.0 - smoothstep(0.8, 1.0, r)) * 0.16;

  float bright = max(max(ring, ticks), ripple);
  float dark = max(ink, tickInk) * 0.85;
  float alpha = max(max(bright, dark), fill);
  if (alpha < 0.004) discard;
  vec3 col = mix(uColor, uInk, clamp(dark - bright, 0.0, 1.0));
  fragColor = vec4(col, alpha * uOpacity);
  #if defined(TONE_MAPPING)
    fragColor.rgb = toneMapping(fragColor.rgb);
  #endif
  fragColor = linearToOutputTexel(fragColor);
}
`

interface Entry {
  key: string
  meshes: THREE.Mesh[]
  materials: THREE.ShaderMaterial[]
  uniforms: { uOpacity: THREE.IUniform<number>; uScale: THREE.IUniform<number> }
  age: number
}

/**
 * Selection rings under cities. The half behind the city is drawn before the
 * city cards and the half in front after them, so the art stands in the ring.
 * Meant for the overlay scene.
 */
export class CityHighlights {
  readonly group = new THREE.Group()
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly places: Map<string, Place>
  private readonly overlay: OverlayUniforms
  private readonly shared = {
    uSize: { value: PLACE_DEFAULTS.citySize },
    uMinPx: { value: PLACE_DEFAULTS.cityMinPx },
    uMaxPx: { value: PLACE_DEFAULTS.cityMaxPx },
    uEmblemPx: { value: PLACE_DEFAULTS.emblemPx },
    uArt: { value: 1 },
  }
  private entries: Entry[] = []

  constructor(places: readonly Place[], overlay: OverlayUniforms) {
    this.places = new Map(places.map((p) => [p.id, p]))
    this.overlay = overlay
    this.group.name = 'city-highlights'
  }

  applySettings(settings: PlaceSettings) {
    this.shared.uSize.value = settings.citySize
    this.shared.uMinPx.value = settings.cityMinPx
    this.shared.uMaxPx.value = settings.cityMaxPx
    this.shared.uEmblemPx.value = settings.emblemPx
  }

  /** Replaces the highlighted cities; unchanged ones keep their state */
  set(highlights: readonly CityHighlight[]) {
    const previous = new Map(this.entries.map((e) => [e.key, e]))
    const next: Entry[] = []
    for (const h of highlights) {
      const place = this.places.get(h.id)
      if (!place) continue
      const color = new THREE.Color(h.color ?? CITY_HIGHLIGHT_COLOR)
      const key = `${h.id}:${color.getHexString()}`
      const kept = previous.get(key)
      if (kept) {
        previous.delete(key)
        next.push(kept)
        continue
      }
      next.push(this.create(place, color, key))
    }
    for (const entry of previous.values()) this.disposeEntry(entry)
    this.entries = next
  }

  private create(place: Place, color: THREE.Color, key: string): Entry {
    const uniforms = { uOpacity: { value: 0 }, uScale: { value: 1 } }
    const meshes: THREE.Mesh[] = []
    const materials: THREE.ShaderMaterial[] = []
    for (const half of [-1, 1]) {
      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: {
          ...this.overlay.common(),
          ...this.shared,
          ...uniforms,
          uCenter: { value: new THREE.Vector2(place.x, place.z) },
          uRatio: { value: PLACE_KINDS[place.type].size },
          uColor: { value: color },
          uInk: { value: new THREE.Color('#2a1a10') },
          uHalf: { value: half },
        },
      })
      const mesh = new THREE.Mesh(this.geometry, material)
      mesh.frustumCulled = false
      // Around the city cards (renderOrder 3)
      mesh.renderOrder = half < 0 ? 2.5 : 3.5
      mesh.name = `city-highlight-${place.id}`
      this.group.add(mesh)
      meshes.push(mesh)
      materials.push(material)
    }
    return { key, meshes, materials, uniforms, age: 0 }
  }

  /** art: visibility of the city art against the emblems (Cities.update) */
  update(dtMs: number, art: number) {
    this.shared.uArt.value = art
    for (const entry of this.entries) {
      if (entry.age >= INTRO_MS) continue
      entry.age = Math.min(INTRO_MS, entry.age + dtMs)
      const t = entry.age / INTRO_MS
      entry.uniforms.uOpacity.value = t
      // Shrinks onto the city
      entry.uniforms.uScale.value = 1 + 0.6 * (1 - t) * (1 - t)
    }
  }

  private disposeEntry(entry: Entry) {
    for (const mesh of entry.meshes) mesh.removeFromParent()
    for (const material of entry.materials) material.dispose()
  }

  dispose() {
    for (const entry of this.entries) this.disposeEntry(entry)
    this.entries = []
    this.geometry.dispose()
  }
}
