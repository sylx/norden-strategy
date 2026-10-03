import * as THREE from 'three'
import type { RoadPath } from '../world/roads'
import { groundObjectDepth, terrainCommon } from './terrainShader'
import { PLACE_DEFAULTS, type PlaceSettings } from './placeSettings'

const vertexShader = /* glsl */ `
${terrainCommon}
${groundObjectDepth}
in vec2 aCenter; // point on the road centre line, world x / z
in vec2 aDir;    // unit tangent of the road
in vec2 aSide;   // x: -1 / +1 across the road, y: distance along it
uniform float uWidth;
uniform float uMinPx;
// CSS px per world unit at a view depth of 1
uniform float uPxScale;
out float vSide;
out float vPx;
out float vDistance;
void main() {
  float spacing = distance(cameraPosition, vec3(aCenter.x, 0.0, aCenter.y)) / uDetailDistance;
  float depth = max(-(viewMatrix * vec4(aCenter.x, groundHeight(aCenter, spacing), aCenter.y, 1.0)).z, 1e-3);
  // Keep a minimum on-screen width when zoomed out
  float width = max(uWidth, uMinPx * depth / uPxScale);
  // Each side of the ribbon samples the ground itself, so it drapes over the slope
  vec2 p = aCenter + vec2(-aDir.y, aDir.x) * aSide.x * width * 0.5;
  vec4 viewPos = viewMatrix * vec4(p.x, groundHeight(p, spacing) + 0.03, p.y, 1.0);
  gl_Position = projectionMatrix * viewPos;
  gl_Position.z = groundObjectDepth(viewPos.xyz, gl_Position);
  vSide = aSide.x;
  vPx = width * uPxScale / depth;
  vDistance = length(viewPos.xyz);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uEdge;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in float vSide;
in float vPx;
in float vDistance;
out vec4 fragColor;
void main() {
  float s = abs(vSide);
  float aa = max(fwidth(vSide), 1e-4);
  float alpha = 1.0 - smoothstep(1.0 - aa * 1.5, 1.0, s);
  // Dark border of at least one pixel; thin roads become dark lines
  float border = max(0.3, 2.0 / max(vPx, 1.0));
  vec3 fill = uFill * mix(1.05, 0.9, s);
  vec3 col = mix(fill, uEdge, smoothstep(1.0 - border - aa, 1.0 - border + aa, s));
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDistance));
  fragColor = vec4(col, alpha);
  #if defined(TONE_MAPPING)
    fragColor.rgb = toneMapping(fragColor.rgb);
  #endif
  fragColor = linearToOutputTexel(fragColor);
}
`

/** All roads in one ribbon mesh, laid on the displaced terrain in the vertex shader */
export class Roads {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial

  /** maxY: highest point of the scaled terrain, for culling bounds */
  constructor(roads: readonly RoadPath[], terrain: THREE.ShaderMaterial, maxY: number) {
    const u = terrain.uniforms
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
      transparent: true, depthWrite: false,
      uniforms: {
        uMacro: u.uMacro, uFlow: u.uFlow, uWorldSize: u.uWorldSize,
        uHeightScale: u.uHeightScale, uTime: u.uTime, uDetailDistance: u.uDetailDistance,
        uPlainsRelief: u.uPlainsRelief, uMountainRelief: u.uMountainRelief, uMaxOctaves: u.uMaxOctaves,
        uTexturedForest: u.uTexturedForest, uForestDensity: u.uForestDensity, uForestShade: u.uForestShade,
        uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar,
        uWidth: { value: PLACE_DEFAULTS.roadWidth }, uMinPx: { value: PLACE_DEFAULTS.roadMinPx },
        uPxScale: { value: 1 },
        uFill: { value: new THREE.Color('#d8c08c') }, uEdge: { value: new THREE.Color('#4a3420') },
      },
    })

    const centers: number[] = []
    const dirs: number[] = []
    const sides: number[] = []
    const index: number[] = []
    const bounds = new THREE.Box3()
    for (const road of roads) {
      const pts = road.points
      const n = pts.length / 2
      if (n < 2) continue
      const base = centers.length / 2
      let along = 0
      for (let i = 0; i < n; i++) {
        const prev = Math.max(0, i - 1)
        const next = Math.min(n - 1, i + 1)
        const dx = pts[next * 2] - pts[prev * 2]
        const dz = pts[next * 2 + 1] - pts[prev * 2 + 1]
        const len = Math.hypot(dx, dz) || 1
        if (i > 0) along += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1])
        for (const side of [-1, 1]) {
          centers.push(pts[i * 2], pts[i * 2 + 1])
          dirs.push(dx / len, dz / len)
          sides.push(side, along)
        }
        if (i > 0) {
          const a = base + (i - 1) * 2
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
        bounds.expandByPoint(new THREE.Vector3(pts[i * 2], 0, pts[i * 2 + 1]))
      }
    }
    // The vertex shader builds the positions; this attribute only sets the count
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((centers.length / 2) * 3), 3))
    this.geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 2))
    this.geometry.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 2))
    this.geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 2))
    this.geometry.setIndex(index)
    // Widened roads (min px) reach a few units beyond the centre lines
    bounds.max.y = maxY
    bounds.expandByScalar(8)
    this.geometry.boundingBox = bounds
    this.geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere())

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.name = 'roads'
    this.mesh.renderOrder = 2
    this.mesh.visible = index.length > 0
  }

  applySettings(settings: PlaceSettings) {
    this.material.uniforms.uWidth.value = settings.roadWidth
    this.material.uniforms.uMinPx.value = settings.roadMinPx
  }

  /** CSS px per world unit at view depth 1 */
  setPixelScale(scale: number) {
    this.material.uniforms.uPxScale.value = scale
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
