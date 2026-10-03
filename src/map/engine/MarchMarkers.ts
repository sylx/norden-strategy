import * as THREE from 'three'
import envoyUrl from '../../assets/marches/envoy.svg'
import transportUrl from '../../assets/marches/transport.svg'
import type { Heightfield } from '../world/Heightfield'
import type { OverlayUniforms } from './overlayUniforms'
import type { PathSample, Polyline } from './roadNetwork'
import { terrainCommon } from './terrainShader'
import './MarchMarkers.css'

export type MarchKind = 'army' | 'transport' | 'envoy'

/**
 * What can move along the roads. An army is a 凸 marker turned to its
 * heading; the others are an icon (drawn facing right, mirrored when moving
 * left) on a plate of their colour. `size` scales the marker.
 */
export const MARCH_KINDS: Readonly<Record<MarchKind, { name: string; icon?: string; size: number }>> = {
  army: { name: '軍団', size: 1 },
  transport: { name: '輸送部隊', icon: transportUrl, size: 0.85 },
  envoy: { name: '使者', icon: envoyUrl, size: 0.75 },
}

export interface MarchOrder {
  /** A march with the same id replaces the previous one */
  id: string
  path: Polyline
  kind: MarchKind
  color: THREE.ColorRepresentation
  label?: string
  /** World units per second */
  speed: number
  /** Start again from the beginning after arriving */
  loop?: boolean
}

/** World width of an army's marker, and its on-screen limits (CSS px) */
const MARKER_SIZE = 16
const MARKER_MIN_PX = 28
const MARKER_MAX_PX = 84
/** Half size of the quad in marker widths (room for the shadow) */
const EXTENT = 0.75
/** Distance from the centre to the top of the marker in marker widths, for placing the label */
const MARKER_TOP = 0.5
const FADE_MS = 250
/** Time (ms) to reach full speed, and the distance (s of travel) over which it slows into the goal */
const ACCEL_MS = 600
const DECEL_S = 0.6
/** Pause (ms) at the goal before a looping march starts again */
const LOOP_PAUSE_MS = 1500
/** Smoothing time (ms) of the marker turning to the road's direction */
const TURN_MS = 140
/** Distance either side of the marker over which the road's direction is measured */
const HEADING_SPAN = 1.5
/** Sideways share of the on-screen heading needed to mirror an icon (hysteresis) */
const MIRROR_THRESHOLD = 0.2

const vertexShader = /* glsl */ `
${terrainCommon}
uniform vec2 uCenter;
// Heading on the ground (unit vector in x / z)
uniform vec2 uDir;
uniform float uSize;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uPxScale;
// 1: an upright icon, 0: the 凸 turned to the heading
uniform float uIcon;
out vec2 vLocal;
out float vPx;
out vec2 vShadow;
void main() {
  float spacing = distance(cameraPosition, vec3(uCenter.x, 0.0, uCenter.y)) / uDetailDistance;
  vec3 ground = vec3(uCenter.x, groundHeight(uCenter, spacing), uCenter.y);
  vec4 center = viewMatrix * vec4(ground, 1.0);
  float depth = max(-center.z, 1e-3);
  float px = clamp(uSize * uPxScale / depth, uMinPx, uMaxPx);
  // The heading as seen on screen: the marker is a flat map symbol facing the camera
  vec4 ahead = viewMatrix * vec4(ground + vec3(uDir.x, 0.0, uDir.y), 1.0);
  vec2 f = ahead.xy / max(-ahead.z, 1e-3) - center.xy / depth;
  f = uIcon < 0.5 && length(f) > 1e-6 ? normalize(f) : vec2(0.0, 1.0);
  vec2 right = vec2(f.y, -f.x);
  vec2 q = (uv * 2.0 - 1.0) * ${EXTENT.toFixed(3)};
  center.xy += (right * q.x + f * q.y) * px * depth / uPxScale;
  gl_Position = projectionMatrix * center;
  vLocal = q;
  vPx = px;
  // Screen-down in the marker's own frame, for the drop shadow
  vShadow = vec2(-right.y, -f.y);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uInk;
uniform float uOpacity;
uniform float uIcon;
// -1 draws the icon mirrored
uniform float uMirror;
uniform sampler2D uMap;
in vec2 vLocal;
in float vPx;
in vec2 vShadow;
out vec4 fragColor;

float roundBox(vec2 p, vec2 c, vec2 h, float r) {
  vec2 d = abs(p - c) - h + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float smoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// One rounded silhouette: the 凸 with its raised side to the front (+y), or the icon's plate
float shape(vec2 p) {
  if (uIcon > 0.5) return length(p) - 0.46;
  float body = roundBox(p, vec2(0.0, -0.06), vec2(0.5, 0.26), 0.1);
  float front = roundBox(p, vec2(0.0, 0.27), vec2(0.19, 0.15), 0.07);
  return smoothUnion(body, front, 0.08);
}

void main() {
  vec2 p = vLocal;
  float d = shape(p);
  float aa = max(fwidth(d), 1e-4);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float shadow = (1.0 - smoothstep(-0.04, 0.12, shape(p - vShadow * 0.06))) * 0.45;

  // A rim in a darker shade of the same colour, and a little relief
  float rimWidth = max(0.04, 1.4 / vPx);
  float rim = smoothstep(-rimWidth - aa, -rimWidth + aa, d);
  float light = uIcon > 0.5 ? 1.0 : 0.9 + 0.2 * smoothstep(-0.35, 0.4, p.y);
  vec3 col = mix(uColor * light, mix(uColor * 0.4, uInk, 0.35), rim);
  if (uIcon > 0.5) {
    vec2 t = vec2(p.x * uMirror, p.y) / 0.78 + 0.5;
    vec4 icon = texture(uMap, t);
    float inBox = step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0);
    col = mix(col, icon.rgb, icon.a * inBox * (1.0 - rim));
  }

  // Marker over its shadow
  float alpha = inside + shadow * (1.0 - inside);
  if (alpha < 0.004) discard;
  col = col * inside / alpha;
  fragColor = vec4(col, alpha * uOpacity);
  #if defined(TONE_MAPPING)
    fragColor.rgb = toneMapping(fragColor.rgb);
  #endif
  fragColor = linearToOutputTexel(fragColor);
}
`

interface March {
  order: MarchOrder
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  label: HTMLDivElement
  labelTransform: string
  labelVisible: boolean
  size: number
  distance: number
  /** ms since the march (or its loop) started */
  elapsed: number
  age: number
  heading: THREE.Vector2
  arrived: boolean
  wait: number
}

/**
 * Armies, supply trains and envoys moving along the roads, drawn as symbols
 * on a military map with their name above. Meant for the overlay scene.
 */
export class MarchMarkers {
  readonly group = new THREE.Group()
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly marches = new Map<string, March>()
  private readonly textures = new Map<string, THREE.Texture>()
  private readonly layer = document.createElement('div')
  private readonly overlay: OverlayUniforms
  private readonly heights: Heightfield
  private readonly heightScale: number
  private readonly anisotropy: number
  private readonly sample: PathSample = { x: 0, z: 0, dx: 1, dz: 0 }
  private readonly ahead: PathSample = { x: 0, z: 0, dx: 1, dz: 0 }
  private readonly behind: PathSample = { x: 0, z: 0, dx: 1, dz: 0 }
  private readonly ground = new THREE.Vector3()
  private readonly view = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  /** Called once each time a march reaches its goal */
  onArrive?: (id: string) => void

  constructor(container: HTMLElement, overlay: OverlayUniforms, heights: Heightfield, heightScale: number,
    anisotropy: number) {
    this.overlay = overlay
    this.heights = heights
    this.heightScale = heightScale
    this.anisotropy = anisotropy
    this.group.name = 'march-markers'
    this.layer.className = 'march-labels'
    container.append(this.layer)
  }

  get count() {
    return this.marches.size
  }

  private texture(url: string): THREE.Texture {
    let texture = this.textures.get(url)
    if (!texture) {
      texture = new THREE.TextureLoader().load(url)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(8, this.anisotropy)
      this.textures.set(url, texture)
    }
    return texture
  }

  march(order: MarchOrder) {
    this.remove(order.id)
    const kind = MARCH_KINDS[order.kind]
    const color = new THREE.Color(order.color)
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        ...this.overlay.common(),
        uCenter: { value: new THREE.Vector2() },
        uDir: { value: new THREE.Vector2(0, 1) },
        uSize: { value: MARKER_SIZE * kind.size },
        uMinPx: { value: MARKER_MIN_PX * kind.size },
        uMaxPx: { value: MARKER_MAX_PX * kind.size },
        uIcon: { value: kind.icon ? 1 : 0 },
        uMirror: { value: 1 },
        uMap: { value: kind.icon ? this.texture(kind.icon) : null },
        uColor: { value: color },
        uInk: { value: new THREE.Color('#2a1a10') },
        uOpacity: { value: 0 },
      },
    })
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false
    // Over the city cards (renderOrder 3) and their highlights
    mesh.renderOrder = 4
    mesh.name = `march-${order.id}`
    this.group.add(mesh)

    const label = document.createElement('div')
    label.className = 'march-label'
    label.style.setProperty('--march-color', `#${color.getHexString()}`)
    label.textContent = order.label ?? ''
    this.layer.append(label)

    const start = order.path.sample(HEADING_SPAN, this.sample)
    this.marches.set(order.id, {
      order, mesh, material, label, labelTransform: '', labelVisible: true, size: kind.size,
      distance: 0, elapsed: 0, age: 0, heading: new THREE.Vector2(start.dx, start.dz), arrived: false, wait: 0,
    })
  }

  remove(id: string) {
    const march = this.marches.get(id)
    if (!march) return
    march.mesh.removeFromParent()
    march.material.dispose()
    march.label.remove()
    this.marches.delete(id)
  }

  clear() {
    for (const id of [...this.marches.keys()]) this.remove(id)
  }

  /** pxScale: CSS px per world unit at view depth 1 */
  update(dtMs: number, camera: THREE.PerspectiveCamera, width: number, height: number, pxScale: number) {
    for (const march of this.marches.values()) {
      this.advance(march, dtMs)
      this.updateScreen(march, camera, width, height, pxScale)
    }
  }

  private advance(march: March, dtMs: number) {
    const { order } = march
    const length = order.path.length
    march.age += dtMs
    march.material.uniforms.uOpacity.value = Math.min(1, march.age / FADE_MS)

    if (march.arrived) {
      if (order.loop) {
        march.wait += dtMs
        if (march.wait >= LOOP_PAUSE_MS) {
          march.arrived = false
          march.wait = 0
          march.distance = 0
          march.elapsed = 0
        }
      }
    } else {
      march.elapsed += dtMs
      // Sets off gradually and slows into the goal
      const accel = Math.min(1, march.elapsed / ACCEL_MS)
      const decel = Math.min(1, (length - march.distance) / (order.speed * DECEL_S))
      const speed = order.speed * Math.max(0.15, Math.min(accel, decel))
      march.distance = Math.min(length, march.distance + (speed * dtMs) / 1000)
      if (march.distance >= length) {
        march.arrived = true
        this.onArrive?.(order.id)
      }
    }

    const p = order.path.sample(march.distance, this.sample)
    const ahead = order.path.sample(Math.min(length, march.distance + HEADING_SPAN), this.ahead)
    const behind = order.path.sample(Math.max(0, march.distance - HEADING_SPAN), this.behind)
    const dx = ahead.x - behind.x
    const dz = ahead.z - behind.z
    const len = Math.hypot(dx, dz)
    if (len > 1e-4) {
      const k = 1 - Math.exp(-dtMs / TURN_MS)
      march.heading.x += (dx / len - march.heading.x) * k
      march.heading.y += (dz / len - march.heading.y) * k
      march.heading.normalize()
    }
    const u = march.material.uniforms
    u.uCenter.value.set(p.x, p.z)
    u.uDir.value.copy(march.heading)
  }

  /** Places the label and mirrors an icon to the on-screen heading */
  private updateScreen(march: March, camera: THREE.PerspectiveCamera, width: number, height: number,
    pxScale: number) {
    const u = march.material.uniforms
    const center = u.uCenter.value as THREE.Vector2
    const ground = this.ground.set(center.x, this.heights.surfaceAt(center.x, center.y) * this.heightScale, center.y)
    const depth = -this.view.copy(ground).applyMatrix4(camera.matrixWorldInverse).z
    let visible = depth > camera.near
    let transform = march.labelTransform
    if (visible) {
      const forward = this.forward.set(ground.x + march.heading.x, ground.y, ground.z + march.heading.y).project(camera)
      const ndc = ground.project(camera)
      const sx = (forward.x - ndc.x) * width
      const sy = (forward.y - ndc.y) * height
      const side = sx / (Math.hypot(sx, sy) || 1)
      if (side > MIRROR_THRESHOLD) u.uMirror.value = 1
      else if (side < -MIRROR_THRESHOLD) u.uMirror.value = -1

      const s = march.size
      const px = THREE.MathUtils.clamp((MARKER_SIZE * s * pxScale) / depth, MARKER_MIN_PX * s, MARKER_MAX_PX * s)
      const x = (ndc.x * 0.5 + 0.5) * width
      const y = (0.5 - ndc.y * 0.5) * height - px * MARKER_TOP - 2
      visible = x > -200 && x < width + 200 && y > -100 && y < height + 100
      transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    }
    visible &&= march.label.textContent !== ''
    if (visible !== march.labelVisible) {
      march.labelVisible = visible
      march.label.hidden = !visible
    }
    if (visible && transform !== march.labelTransform) {
      march.labelTransform = transform
      march.label.style.transform = transform
    }
  }

  dispose() {
    this.clear()
    this.geometry.dispose()
    for (const texture of this.textures.values()) texture.dispose()
    this.layer.remove()
  }
}
