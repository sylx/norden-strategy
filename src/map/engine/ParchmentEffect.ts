/** Adapted from norden-battle/map-runtime/src/render/parchment.ts. */
import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { normalizeParchmentSettings, PARCHMENT_DEFAULTS, type ParchmentSettings } from './parchmentSettings'

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform float uExposure;
uniform float uSaturation;
uniform float uSepia;
uniform float uPaper;
uniform float uPaperScale;
uniform float uFade;
uniform float uVignette;
uniform bool uGrade;
varying vec2 vUv;

// Grading and ink/paper colours are in display space, as in battle's effect.
const vec3 PAPER = vec3(0.95, 0.89, 0.76);
const vec3 INK = vec3(0.22, 0.15, 0.09);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    // Suppress unresolved grain instead of letting it sparkle during zoom.
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    v += a * mix(vnoise(p), 0.5, smoothstep(0.4, 1.2, footprint));
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v / 0.9375;
}

// Stains are anchored to the map plane; only fine fibres use screen pixels.
vec2 groundXZ(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 a = uInvProjection * vec4(ndc, -1, 1);
  vec4 b = uInvProjection * vec4(ndc, 1, 1);
  vec3 p0 = (uCameraWorld * vec4(a.xyz / a.w, 1)).xyz;
  vec3 p1 = (uCameraWorld * vec4(b.xyz / b.w, 1)).xyz;
  float dy = p1.y - p0.y;
  float t = dy < -1e-5 ? clamp(-p0.y / dy, 0.0, 1.0) : 1.0;
  return mix(p0, p1, t).xz;
}

void main() {
  if (!uGrade) {
    gl_FragColor = linearToOutputTexel(vec4(texture2D(tColor, vUv).rgb, 1));
    return;
  }
  // The map is already lit; no second ACES tone map is applied here.
  vec3 base = clamp(linearToOutputTexel(vec4(texture2D(tColor, vUv).rgb * uExposure, 1)).rgb, 0.0, 1.0);
  float l = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 col = mix(vec3(l), base, uSaturation);
  col = mix(col, mix(INK, PAPER, smoothstep(0.02, 0.95, l)), uSepia);

  vec2 w = groundXZ(vUv) / uPaperScale;
  float stain = fbm(w * 0.35);
  float blotch = fbm(w * 1.7 + 40.0);
  vec2 pixel = gl_FragCoord.xy / uPixelRatio;
  float fiber = vnoise(pixel * vec2(0.9, 0.25)) * 0.5 + vnoise(pixel * 0.6 + 7.0) * 0.5;
  float paperV = 0.9 + 0.12 * stain + 0.05 * (blotch - 0.5) + 0.05 * (fiber - 0.5);
  paperV -= 0.08 * smoothstep(0.62, 0.8, stain);
  vec3 paperTint = vec3(1.0, 0.965, 0.9) * paperV;
  col *= mix(vec3(1), paperTint, uPaper);
  // The paper slider also controls grain in faded ink; zero fully removes it.
  col = mix(col, PAPER * mix(vec3(1), paperTint, uPaper), uFade);

  // Normalize by the screen diagonal so ultra-wide views don't burn entire sides.
  vec2 q = (vUv - 0.5) * uResolution / length(uResolution) * 2.0;
  float r = length(q) + (stain - 0.5) * 0.06;
  float burn = smoothstep(0.5, 1.0, r) * uVignette;
  col *= mix(vec3(1), vec3(0.72, 0.56, 0.38), burn);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1);
}
`

/**
 * One multisampled scene capture and one full-screen pass. The capture also
 * provides the map's antialiasing, so it runs with the effect turned off too.
 *
 * The scene is captured at the reduced render resolution and the pass writes
 * the full-resolution output, so whatever is drawn after it stays sharp.
 */
export class ParchmentEffect {
  private readonly maxSamples: number
  private readonly target: THREE.WebGLRenderTarget
  private readonly material: THREE.ShaderMaterial
  private readonly quad: FullScreenQuad

  constructor(renderer: THREE.WebGLRenderer) {
    this.maxSamples = Math.min(4, renderer.capabilities.maxSamples)
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
      // Forest alpha-to-coverage requires MSAA on the scene target too.
      samples: this.maxSamples,
      // Keep depth testing for trees/terrain, but no depth sampling or resolve.
      depthBuffer: true,
      resolveDepthBuffer: false,
    })
    this.target.texture.name = 'parchment-scene-linear'
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        tColor: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(1, 1) }, uPixelRatio: { value: 1 },
        uInvProjection: { value: new THREE.Matrix4() }, uCameraWorld: { value: new THREE.Matrix4() },
        uExposure: { value: 1 }, uSaturation: { value: 1 }, uSepia: { value: 0 },
        uPaper: { value: 0 }, uPaperScale: { value: 48 }, uFade: { value: 0 },
        uVignette: { value: 0 }, uGrade: { value: true },
      },
    })
    this.quad = new FullScreenQuad(this.material)
    this.applySettings(PARCHMENT_DEFAULTS)
  }

  applySettings(value: ParchmentSettings) {
    const settings = normalizeParchmentSettings(value)
    const u = this.material.uniforms
    u.uGrade.value = settings.enabled
    u.uExposure.value = settings.exposure
    u.uSaturation.value = settings.saturation
    u.uSepia.value = settings.sepia
    u.uPaper.value = settings.paper
    u.uPaperScale.value = settings.paperScale
    u.uFade.value = settings.fade
    u.uVignette.value = settings.vignette
  }

  setMultisample(enabled: boolean) {
    const samples = enabled ? this.maxSamples : 0
    if (samples === this.target.samples) return
    this.target.samples = samples
    // Reallocated with the new sample count on the next render
    this.target.dispose()
  }

  /** width / height: full drawing buffer; resolution: scale of the scene capture */
  setSize(width: number, height: number, pixelRatio: number, resolution: number) {
    this.target.setSize(Math.max(1, Math.round(width * resolution)), Math.max(1, Math.round(height * resolution)))
    this.material.uniforms.uResolution.value.set(width, height)
    this.material.uniforms.uPixelRatio.value = pixelRatio
  }

  /** Size of the scene capture in device pixels */
  get sceneSize() {
    return { width: this.target.width, height: this.target.height }
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const previous = renderer.getRenderTarget()
    try {
      renderer.setRenderTarget(this.target)
      renderer.render(scene, camera)
    } finally {
      renderer.setRenderTarget(previous)
    }
    const u = this.material.uniforms
    u.uInvProjection.value.copy(camera.projectionMatrixInverse)
    u.uCameraWorld.value.copy(camera.matrixWorld)
    this.quad.render(renderer)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}
