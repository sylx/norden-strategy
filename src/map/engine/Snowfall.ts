import * as THREE from 'three'
import { random } from './Forest'
import { SNOW_PATCHY_Z } from './season'

const FLAKES = 1500

const vertexShader = /* glsl */ `
attribute vec4 aFlake; // x, y (screen 0..1), layer (0 far .. 1 near), seed
uniform float uTime;
uniform vec2 uOffset;
uniform float uPixelRatio;
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
varying float vAlpha;

// z of the ground (sea level) seen through a point of the screen
float groundZ(vec2 ndc) {
  vec4 a = uInvProjection * vec4(ndc, -1.0, 1.0);
  vec4 b = uInvProjection * vec4(ndc, 1.0, 1.0);
  vec3 o = (uCameraWorld * vec4(a.xyz / a.w, 1.0)).xyz;
  vec3 d = (uCameraWorld * vec4(b.xyz / b.w, 1.0)).xyz - o;
  return d.y < -1e-5 ? o.z - d.z * o.y / d.y : -1e9;
}

void main() {
  float layer = aFlake.z;
  float seed = aFlake.w;
  // Screen heights per second; nearer flakes are larger, faster and sway more
  float fall = uTime * mix(0.03, 0.1, layer);
  float sway = sin(uTime * mix(0.5, 1.2, seed) + seed * 40.0) * mix(0.006, 0.025, layer);
  vec2 pos = aFlake.xy + vec2(sway + uTime * 0.008 * layer, -fall) + uOffset * mix(0.4, 1.3, layer);
  vec2 ndc = fract(pos) * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = mix(1.6, 4.8, layer) * uPixelRatio;
  // Only over the snowy north, ending with the patches on the ground
  float z = groundZ(ndc) + sin(seed * 91.0) * 10.0;
  vAlpha = mix(0.4, 0.9, layer) * (1.0 - smoothstep(${SNOW_PATCHY_Z.toFixed(1)} - 20.0, ${SNOW_PATCHY_Z.toFixed(1)}, z));
}
`

const fragmentShader = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d) * vAlpha * uOpacity;
  gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), a);
}
`

/**
 * Snow drifting across the screen in winter over the snowy north, drawn over
 * the finished map (under the cities). The flakes move in screen space and
 * shift with the camera's pan, nearer layers more, so they seem to hang
 * between eye and land.
 */
export class Snowfall {
  readonly scene = new THREE.Scene()
  private readonly material: THREE.ShaderMaterial
  private readonly geometry = new THREE.BufferGeometry()
  private readonly offset = new THREE.Vector2()
  private lastView: { x: number, z: number } | null = null

  constructor() {
    const flakes = new Float32Array(FLAKES * 4)
    for (let i = 0; i < FLAKES; i++) {
      const r = random(i * 5 + 11)
      flakes.set([random(i * 5 + 12), random(i * 5 + 13), r * r, random(i * 5 + 14)], i * 4)
    }
    // Positions come from aFlake; 'position' is only there for three.js's draw count
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAKES * 3), 3))
    this.geometry.setAttribute('aFlake', new THREE.BufferAttribute(flakes, 4))
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOffset: { value: this.offset },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 0 },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
      },
    })
    const points = new THREE.Points(this.geometry, this.material)
    points.frustumCulled = false
    this.scene.add(points)
  }

  /** opacity: 0 hides the snow; view: look-at point; viewWidth/Height: ground span on screen */
  update(time: number, opacity: number, pixelRatio: number, camera: THREE.Camera,
    view: { x: number, z: number }, viewWidth: number, viewHeight: number) {
    const u = this.material.uniforms
    u.uInvProjection.value.copy(camera.projectionMatrixInverse)
    u.uCameraWorld.value.copy(camera.matrixWorld)
    u.uTime.value = time
    u.uOpacity.value = opacity
    u.uPixelRatio.value = pixelRatio
    // Accumulate the pan as a fraction of the screen, so zooming never jumps the flakes
    if (this.lastView) {
      this.offset.x = (this.offset.x - (view.x - this.lastView.x) / viewWidth) % 1
      this.offset.y = (this.offset.y + (view.z - this.lastView.z) / viewHeight) % 1
    }
    this.lastView = { x: view.x, z: view.z }
  }

  get visible() {
    return this.material.uniforms.uOpacity.value > 0.001
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
