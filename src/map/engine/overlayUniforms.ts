import type * as THREE from 'three'

/**
 * Uniforms shared by the overlay pieces (highlights, march markers): the
 * terrain's height function inputs plus the per-frame screen scale.
 */
export class OverlayUniforms {
  /** Everything terrainCommon's groundHeight() reads, shared with the terrain material */
  readonly ground: Record<string, THREE.IUniform>
  /** CSS px per world unit at view depth 1 */
  readonly uPxScale = { value: 1 }
  /** log2 of the world units per CSS px at the camera's look-at point (for on-screen patterns) */
  readonly uUnitLevel = { value: 0 }
  readonly uTime: THREE.IUniform<number>

  constructor(terrain: THREE.ShaderMaterial) {
    const u = terrain.uniforms
    this.uTime = u.uTime
    this.ground = {
      uMacro: u.uMacro, uFlow: u.uFlow, uWorldSize: u.uWorldSize,
      uHeightScale: u.uHeightScale, uTime: u.uTime, uDetailDistance: u.uDetailDistance,
      uPlainsRelief: u.uPlainsRelief, uMountainRelief: u.uMountainRelief, uMaxOctaves: u.uMaxOctaves,
      uTexturedForest: u.uTexturedForest, uForestDensity: u.uForestDensity, uForestShade: u.uForestShade,
    }
  }

  /** Uniforms for a new overlay material */
  common(): Record<string, THREE.IUniform> {
    return { ...this.ground, uPxScale: this.uPxScale, uUnitLevel: this.uUnitLevel }
  }

  get pxScale() {
    return this.uPxScale.value
  }

  setPixelScale(scale: number) {
    this.uPxScale.value = scale
  }

  update(viewDistance: number) {
    this.uUnitLevel.value = Math.log2(Math.max(1e-3, viewDistance / this.uPxScale.value))
  }
}
