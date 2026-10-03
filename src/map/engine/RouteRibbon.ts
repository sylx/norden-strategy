import * as THREE from 'three'
import type { OverlayUniforms } from './overlayUniforms'
import type { Polyline } from './roadNetwork'
import { terrainCommon } from './terrainShader'

const vertexShader = /* glsl */ `
${terrainCommon}
in vec2 aCenter; // point on the centre line, world x / z
in vec2 aDir;    // unit tangent
in vec2 aSide;   // x: -1 / +1 across, y: distance along
uniform float uWidthPx;
uniform float uGlowPx;
// CSS px per world unit at a view depth of 1
uniform float uPxScale;
out float vSide;
out float vAlong;
void main() {
  float spacing = distance(cameraPosition, vec3(aCenter.x, 0.0, aCenter.y)) / uDetailDistance;
  float depth = max(-(viewMatrix * vec4(aCenter.x, groundHeight(aCenter, spacing), aCenter.y, 1.0)).z, 1e-3);
  // Constant on-screen width, glow included
  float width = (uWidthPx + 2.0 * uGlowPx) * depth / uPxScale;
  vec2 p = aCenter + vec2(-aDir.y, aDir.x) * aSide.x * width * 0.5;
  vec4 viewPos = viewMatrix * vec4(p.x, groundHeight(p, spacing) + 0.05, p.y, 1.0);
  gl_Position = projectionMatrix * viewPos;
  vSide = aSide.x;
  vAlong = aSide.y;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uEdge;
uniform float uOpacity;
uniform float uWidthPx;
uniform float uGlowPx;
uniform float uGlow;
uniform float uStripes;
// Speed of the stripes, CSS px per second
uniform float uFlowPx;
uniform float uUnitLevel;
uniform float uTime;
in float vSide;
in float vAlong;
out vec4 fragColor;

float band(float x, float duty) {
  float f = fract(x);
  float w = max(fwidth(x), 1e-4);
  return smoothstep(0.0, w, f) * (1.0 - smoothstep(duty - w, duty, f));
}

// A pattern along the ribbon with a period in CSS px. The world period is a
// power of two crossfaded with the next one, so it does not slide while zooming.
float pattern(float periodPx, float offsetPx, float duty) {
  float level = floor(uUnitLevel);
  float t = uUnitLevel - level;
  float a = band((vAlong / exp2(level) + offsetPx) / periodPx, duty);
  float b = band((vAlong / exp2(level + 1.0) + offsetPx) / periodPx, duty);
  return mix(a, b, t);
}

void main() {
  float total = uWidthPx + 2.0 * uGlowPx;
  // CSS px from the centre line
  float px = abs(vSide) * total * 0.5;
  float aa = max(fwidth(px), 1e-3) * 0.75;
  float halfWidth = uWidthPx * 0.5;

  float core = 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, px);
  float edge = smoothstep(halfWidth - 1.6 - aa, halfWidth - 1.6 + aa, px);
  vec3 col = mix(uColor, uEdge, edge);
  if (uStripes > 0.0) {
    // Chevrons pointing along the route: the edges trail behind the centre
    float chevrons = pattern(16.0, px - uFlowPx * uTime, 0.38);
    col = mix(col, mix(uColor, vec3(1.0), 0.6), chevrons * uStripes * (1.0 - edge));
  }

  float glow = 0.0;
  if (uGlowPx > 0.0) {
    float g = 1.0 - smoothstep(halfWidth, halfWidth + uGlowPx, px);
    glow = g * g * uGlow * (0.8 + 0.2 * sin(uTime * 4.0));
  }
  // Core over glow
  float alpha = core + glow * (1.0 - core);
  if (alpha < 0.004) discard;
  vec3 rgb = (col * core + uColor * glow * (1.0 - core)) / alpha;
  fragColor = vec4(rgb, alpha * uOpacity);
  #if defined(TONE_MAPPING)
    fragColor.rgb = toneMapping(fragColor.rgb);
  #endif
  fragColor = linearToOutputTexel(fragColor);
}
`

export interface RibbonStyle {
  color: THREE.ColorRepresentation
  /** Ink border */
  edge?: THREE.ColorRepresentation
  /** On-screen width of the solid part (CSS px) */
  widthPx: number
  /** Soft halo around it (CSS px) */
  glowPx?: number
  /** Halo strength 0..1 */
  glow?: number
  /** Strength of the chevron stripes 0..1 */
  stripes?: number
  /** Speed of the chevrons (CSS px per second); they run from the start to the end */
  flowPx?: number
}

/**
 * A ribbon of constant on-screen width along a route, draped on the terrain.
 * Meant for the overlay scene: it is drawn over hills and trees.
 */
export class RouteRibbon {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial

  constructor(path: Polyline, overlay: OverlayUniforms, style: RibbonStyle) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        ...overlay.common(),
        uColor: { value: new THREE.Color(style.color) },
        uEdge: { value: new THREE.Color(style.edge ?? '#2a1a10') },
        uOpacity: { value: 1 },
        uWidthPx: { value: style.widthPx },
        uGlowPx: { value: style.glowPx ?? 0 },
        uGlow: { value: style.glow ?? 0 },
        uStripes: { value: style.stripes ?? 0 },
        uFlowPx: { value: style.flowPx ?? 0 },
      },
    })

    const pts = path.points
    const n = pts.length / 2
    const centers = new Float32Array(n * 4)
    const dirs = new Float32Array(n * 4)
    const sides = new Float32Array(n * 4)
    const index: number[] = []
    for (let i = 0; i < n; i++) {
      const prev = Math.max(0, i - 1)
      const next = Math.min(n - 1, i + 1)
      const dx = pts[next * 2] - pts[prev * 2]
      const dz = pts[next * 2 + 1] - pts[prev * 2 + 1]
      const len = Math.hypot(dx, dz) || 1
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 2
        centers[k] = pts[i * 2]
        centers[k + 1] = pts[i * 2 + 1]
        dirs[k] = dx / len
        dirs[k + 1] = dz / len
        sides[k] = s === 0 ? -1 : 1
        sides[k + 1] = path.distances[i]
      }
      if (i > 0) {
        const a = (i - 1) * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    // The vertex shader builds the positions; this attribute only sets the count
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 2 * 3), 3))
    this.geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 2))
    this.geometry.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 2))
    this.geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 2))
    this.geometry.setIndex(index)

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
  }

  setOpacity(opacity: number) {
    this.material.uniforms.uOpacity.value = opacity
  }

  dispose() {
    this.mesh.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
