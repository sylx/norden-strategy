import * as THREE from 'three'
import type { WorldData } from '../world/generateWorld'
import { groundObjectDepth, terrainCommon } from './terrainShader'
import { CRYSTAL_ZONES, crystalDistance } from './crystalZones'
import { random, sampleMacro } from './Forest'

const SPACING = 2.4
/** Clear ground around the great crystal at each zone's centre */
const SPIRE_CLEARING = 3.5

const vertexShader = /* glsl */ `
${terrainCommon}
${groundObjectDepth}
in vec4 aCrystal; // x, z, scale, seed
in vec2 aFacet;   // height along the prism 0..1, prism seed
out vec3 vWorld;
out vec3 vNormal;
out vec2 vFacet;
out float vSeed;
out float vScale;
void main() {
  vec2 p = aCrystal.xy;
  float spacing = distance(cameraPosition, vec3(p.x, 0.0, p.y)) / uDetailDistance;
  float ground = groundHeight(p, spacing);
  float yaw = aCrystal.w * 6.2832;
  float stretch = mix(0.85, 1.25, fract(aCrystal.w * 13.7));
  mat2 R = mat2(cos(yaw), sin(yaw), -sin(yaw), cos(yaw));
  vec3 local = position * vec3(1.0, stretch, 1.0);
  local.xz = R * local.xz;
  vec3 n = normal * vec3(1.0, 1.0 / stretch, 1.0);
  n.xz = R * n.xz;
  vWorld = vec3(p.x, ground, p.y) + local * aCrystal.z;
  vNormal = normalize(n);
  vFacet = aFacet;
  vSeed = aCrystal.w;
  vScale = aCrystal.z;
  vec4 viewPos = viewMatrix * vec4(vWorld, 1.0);
  gl_Position = projectionMatrix * viewPos;
  gl_Position.z = groundObjectDepth(viewPos.xyz, gl_Position);
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vFacet;
in float vSeed;
in float vScale;
out vec4 fragColor;

vec3 srgb(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);
  // Clusters drift between ice blue and violet; each prism a little apart
  float hue = fract(vSeed * 3.7 + vFacet.y * 0.35);
  vec3 deep = mix(srgb(20.0, 60.0, 160.0), srgb(84.0, 30.0, 160.0), hue);
  vec3 bright = mix(srgb(110.0, 236.0, 255.0), srgb(210.0, 150.0, 255.0), hue);
  vec3 col = mix(deep, bright, smoothstep(0.0, 1.0, vFacet.x));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 48.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  // Light pulses up each prism towards its tip
  float pulse = 0.65 + 0.35 * sin(uTime * 1.3 + vSeed * 6.2832 - vFacet.x * 2.5);
  // The great crystals glow brighter than the undergrowth
  float glow = mix(0.45, 0.95, smoothstep(1.5, 4.0, vScale));
  vec3 c = col * (0.3 + 0.55 * diff)
    + bright * glow * pulse * (0.25 + 0.75 * vFacet.x)
    + vec3(1.0) * spec * 0.9
    + bright * fresnel * 0.6;
  c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)));
  fragColor = linearToOutputTexel(vec4(c, 1.0));
}
`

/** Instanced crystal clusters filling the crystal forests, one draw call */
export class Crystals {
  readonly mesh: THREE.Mesh
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly material: THREE.ShaderMaterial

  constructor(world: WorldData, terrain: THREE.ShaderMaterial, heightScale: number) {
    const u = terrain.uniforms
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
      uniforms: {
        uMacro: u.uMacro, uFlow: u.uFlow, uWorldSize: u.uWorldSize,
        uHeightScale: u.uHeightScale, uTime: u.uTime, uDetailDistance: u.uDetailDistance,
        uPlainsRelief: u.uPlainsRelief, uMountainRelief: u.uMountainRelief, uMaxOctaves: u.uMaxOctaves,
        uTexturedForest: u.uTexturedForest, uForestDensity: u.uForestDensity, uForestShade: u.uForestShade,
        uSunDir: u.uSunDir, uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar,
      },
    })

    const instances: number[] = []
    const bounds = new THREE.Box3()
    const add = (x: number, z: number, scale: number, seed: number) => {
      instances.push(x, z, scale, seed)
      bounds.expandByPoint(new THREE.Vector3(x, sampleMacro(world, x, z, 0) * heightScale, z))
    }
    const isGround = (x: number, z: number) => sampleMacro(world, x, z, 0) > 0.8 && sampleMacro(world, x, z, 1) < 0.1
    CRYSTAL_ZONES.forEach((zone, zi) => {
      const seed = 9001 + zi * 7919
      if (isGround(zone.x, zone.z)) {
        // The great crystal and a ring of lesser ones around it
        add(zone.x, zone.z, 4.2, random(seed))
        for (let k = 0; k < 6; k++) {
          const a = (k / 6 + random(seed + k) * 0.1) * Math.PI * 2
          const r = 2.4 + random(seed + k + 50) * 1.4
          add(zone.x + Math.cos(a) * r, zone.z + Math.sin(a) * r, 1.6 + random(seed + k + 99) * 0.8, random(seed + k + 7))
        }
      }
      // The lobed outline reaches 1.3 radii
      const extent = zone.radius * 1.3
      const cells = Math.ceil(extent * 2 / SPACING)
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const id = seed + (j * cells + i) * 5
          const x = zone.x - extent + (i + 0.15 + random(id) * 0.7) * SPACING
          const z = zone.z - extent + (j + 0.15 + random(id + 1) * 0.7) * SPACING
          const q = crystalDistance(x, z) + (random(id + 2) - 0.5) * 0.15
          if (Math.hypot(x - zone.x, z - zone.z) < SPIRE_CLEARING || random(id + 3) > 1 - THREE.MathUtils.smoothstep(q, 0.55, 0.95)
            || !isGround(x, z)) continue
          // Taller near the heart of the wood
          add(x, z, (0.7 + random(id + 4) * 0.8) * (1 - 0.4 * q), random(id + 5))
        }
      }
    })

    this.geometry = createClusterGeometry()
    this.geometry.setAttribute('aCrystal', new THREE.InstancedBufferAttribute(new Float32Array(instances), 4))
    this.geometry.instanceCount = instances.length / 4
    // Tallest cluster: 3.5 units at scale 1, stretched up to 1.25x
    bounds.expandByScalar(4.2 * 3.5 * 1.25)
    this.geometry.boundingBox = bounds
    this.geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere())
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.name = 'crystal-forest'
    this.mesh.visible = instances.length > 0
  }

  get count() {
    return this.geometry.instanceCount
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/** [offset x, offset z, radius, shaft height, outward tilt (rad)] */
const PRISMS: readonly [number, number, number, number, number][] = [
  [0, 0, 0.32, 2.3, 0.05],
  [0.36, 0.1, 0.22, 1.5, 0.45],
  [-0.2, 0.32, 0.18, 1.2, 0.55],
  [-0.34, -0.16, 0.24, 1.7, 0.4],
  [0.1, -0.38, 0.16, 0.9, 0.65],
  [0.3, -0.24, 0.13, 0.7, 0.75],
]

/**
 * One cluster of hexagonal prisms with pointed tips, flat shaded. The bases
 * reach below y = 0 so clusters sit into slopes without floating.
 */
function createClusterGeometry(): THREE.InstancedBufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const facets: number[] = []
  const SIDES = 6
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const n = new THREE.Vector3(), out = new THREE.Vector3(), tmp = new THREE.Vector3()

  PRISMS.forEach(([ox, oz, radius, height, tilt], pi) => {
    const tip = radius * 1.7
    const top = height + tip
    const ring = (y: number, r: number) => Array.from({ length: SIDES }, (_, k) => {
      const t = (k / SIDES + pi * 0.07) * Math.PI * 2
      return new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r)
    })
    const base = ring(-0.4, radius)
    const shoulder = ring(height, radius * 0.88)
    const apex = new THREE.Vector3(0, top, 0)
    const len = Math.hypot(ox, oz)
    const axis = len > 0 ? new THREE.Vector3(oz / len, 0, -ox / len) : new THREE.Vector3(1, 0, 0)
    const transform = new THREE.Matrix4().makeRotationAxis(axis, tilt).setPosition(ox, 0, oz)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform)
    const shade = pi / PRISMS.length

    const tri = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3) => {
      a.copy(p0); b.copy(p1); c.copy(p2)
      n.subVectors(b, a).cross(tmp.subVectors(c, a)).normalize()
      // Face outward from the prism axis
      out.addVectors(a, b).add(c).divideScalar(3).setY(0)
      if (n.dot(out) < 0) { const swap = b.clone(); b.copy(c); c.copy(swap); n.negate() }
      n.applyMatrix3(normalMatrix).normalize()
      for (const v of [a, b, c]) {
        const h = Math.max(0, v.y) / top
        v.applyMatrix4(transform)
        positions.push(v.x, v.y, v.z)
        normals.push(n.x, n.y, n.z)
        facets.push(h, shade)
      }
    }
    for (let k = 0; k < SIDES; k++) {
      const k1 = (k + 1) % SIDES
      tri(base[k], shoulder[k], shoulder[k1])
      tri(base[k], shoulder[k1], base[k1])
      tri(shoulder[k], apex, shoulder[k1])
    }
  })

  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('aFacet', new THREE.Float32BufferAttribute(facets, 2))
  return geometry
}
