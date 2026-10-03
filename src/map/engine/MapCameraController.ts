import * as THREE from 'three'
import type { Heightfield } from '../world/Heightfield'

export interface CameraLimits {
  minDistance: number
  maxDistance: number
  /** Elevation angle (deg) when fully zoomed in / out */
  minPitch: number
  maxPitch: number
  /** Allowed rectangle for the look-at point, world x/z */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/** Time constant (ms) of the zoom easing */
const ZOOM_TAU_MS = 90
/** Time constant (ms) of the height following of the look-at point */
const HEIGHT_TAU_MS = 160
const WHEEL_SENSITIVITY = 0.0015
/** Velocity decay (per second) of the pan inertia after releasing a drag */
const INERTIA_DAMPING = 6

/**
 * Strategy-map camera: looks north at a point on the terrain, drag pans,
 * wheel / pinch zooms towards the cursor. The camera tilts down as it zooms
 * out so the whole island reads as a map, and towards the horizon when close.
 */
export class MapCameraController {
  readonly target = new THREE.Vector3()
  private distance: number
  private targetDistance: number
  private readonly limits: CameraLimits
  private readonly camera: THREE.PerspectiveCamera
  private readonly dom: HTMLElement
  private readonly heights: Heightfield
  private readonly heightScale: number

  /** Ground point that stays under the cursor while a zoom eases */
  private zoomAnchor: { world: THREE.Vector3; ndc: THREE.Vector2 } | null = null
  private drag: { pointerId: number; world: THREE.Vector3 } | null = null
  private readonly pointers = new Map<number, THREE.Vector2>()
  private pinchDistance = 0
  private readonly velocity = new THREE.Vector2()
  private lastDragTime = 0

  private readonly raycaster = new THREE.Raycaster()
  private readonly tmpNdc = new THREE.Vector2()
  private readonly tmpVec = new THREE.Vector3()

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    heights: Heightfield,
    heightScale: number,
    limits: CameraLimits,
  ) {
    this.camera = camera
    this.dom = dom
    this.heights = heights
    this.heightScale = heightScale
    this.limits = limits
    this.distance = this.targetDistance = limits.maxDistance * 0.6

    dom.addEventListener('pointerdown', this.onPointerDown)
    dom.addEventListener('pointermove', this.onPointerMove)
    dom.addEventListener('pointerup', this.onPointerUp)
    dom.addEventListener('pointercancel', this.onPointerUp)
    dom.addEventListener('wheel', this.onWheel, { passive: false })
    dom.style.touchAction = 'none'
  }

  /** Jump to a view instantly */
  setView(x: number, z: number, distance: number) {
    this.target.set(x, this.groundHeight(x, z), z)
    this.distance = this.targetDistance = this.clampDistance(distance)
    this.zoomAnchor = null
    this.velocity.set(0, 0)
    this.clampTarget()
    this.applyCamera()
  }

  getView() {
    return { x: this.target.x, z: this.target.z, distance: this.distance }
  }

  update(dtMs: number) {
    // Zoom easing
    const k = 1 - Math.exp(-dtMs / ZOOM_TAU_MS)
    if (Math.abs(this.targetDistance - this.distance) > this.distance * 1e-4) {
      this.distance += (this.targetDistance - this.distance) * k
    } else {
      this.distance = this.targetDistance
    }

    // Pan inertia
    if (!this.drag && this.velocity.lengthSq() > 1e-6) {
      const dt = dtMs / 1000
      this.target.x += this.velocity.x * dt
      this.target.z += this.velocity.y * dt
      this.velocity.multiplyScalar(Math.exp(-INERTIA_DAMPING * dt))
    }

    // Follow the terrain smoothly so the camera never dips into mountains
    const ground = this.groundHeight(this.target.x, this.target.z)
    this.target.y += (ground - this.target.y) * (1 - Math.exp(-dtMs / HEIGHT_TAU_MS))

    this.applyCamera()

    if (this.zoomAnchor) {
      // Shift so the anchored ground point is back under the cursor
      const hit = this.intersectPlane(this.zoomAnchor.ndc, this.zoomAnchor.world.y)
      if (hit) {
        this.target.x += this.zoomAnchor.world.x - hit.x
        this.target.z += this.zoomAnchor.world.z - hit.z
        this.clampTarget()
        this.applyCamera()
      }
      if (this.distance === this.targetDistance) this.zoomAnchor = null
    }
  }

  private applyCamera() {
    const { minDistance, maxDistance, minPitch, maxPitch } = this.limits
    const t = Math.log(this.distance / minDistance) / Math.log(maxDistance / minDistance)
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(minPitch, maxPitch, THREE.MathUtils.smoothstep(t, 0, 1)))
    const cam = this.camera
    cam.position.set(
      this.target.x,
      this.target.y + Math.sin(pitch) * this.distance,
      this.target.z + Math.cos(pitch) * this.distance,
    )
    // Keep clear of the terrain right under the camera
    const floor = this.groundHeight(cam.position.x, cam.position.z) + 2
    if (cam.position.y < floor) cam.position.y = floor
    cam.lookAt(this.target)
    cam.updateMatrixWorld()
  }

  private groundHeight(x: number, z: number) {
    return this.heights.surfaceAt(x, z) * this.heightScale
  }

  private clampDistance(d: number) {
    return THREE.MathUtils.clamp(d, this.limits.minDistance, this.limits.maxDistance)
  }

  private clampTarget() {
    const b = this.limits.bounds
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.minX, b.maxX)
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.minZ, b.maxZ)
  }

  private toNdc(clientX: number, clientY: number, out: THREE.Vector2) {
    const rect = this.dom.getBoundingClientRect()
    return out.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  }

  private intersectPlane(ndc: THREE.Vector2, y: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera)
    const { origin, direction } = this.raycaster.ray
    if (Math.abs(direction.y) < 1e-6) return null
    const t = (y - origin.y) / direction.y
    if (t <= 0) return null
    return this.tmpVec.copy(direction).multiplyScalar(t).add(origin).clone()
  }

  /** First hit of a ray from the cursor with the terrain (march + refine) */
  pickGround(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera)
    const { origin, direction } = this.raycaster.ray
    const step = Math.max(0.25, this.distance / 400)
    const p = new THREE.Vector3()
    let prevT = 0
    for (let t = 0; t < this.distance * 6; t += step) {
      p.copy(direction).multiplyScalar(t).add(origin)
      if (p.y <= this.groundHeight(p.x, p.z)) {
        // Bisect between the last point above ground and this one
        let lo = prevT
        let hi = t
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2
          p.copy(direction).multiplyScalar(mid).add(origin)
          if (p.y <= this.groundHeight(p.x, p.z)) hi = mid
          else lo = mid
        }
        return p.copy(direction).multiplyScalar(hi).add(origin)
      }
      prevT = t
    }
    return this.intersectPlane(ndc, 0)
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dom.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY))
    this.velocity.set(0, 0)
    this.zoomAnchor = null
    if (this.pointers.size === 1) {
      const world = this.pickGround(this.toNdc(e.clientX, e.clientY, this.tmpNdc))
      this.drag = world ? { pointerId: e.pointerId, world } : null
      this.lastDragTime = performance.now()
    } else if (this.pointers.size === 2) {
      this.drag = null
      const [a, b] = [...this.pointers.values()]
      this.pinchDistance = a.distanceTo(b)
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    const pt = this.pointers.get(e.pointerId)
    if (!pt) return
    pt.set(e.clientX, e.clientY)

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const d = a.distanceTo(b)
      if (this.pinchDistance > 0 && d > 0) {
        const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2)
        this.zoomBy(this.pinchDistance / d, mid.x, mid.y)
      }
      this.pinchDistance = d
      return
    }

    if (!this.drag || this.drag.pointerId !== e.pointerId) return
    const hit = this.intersectPlane(this.toNdc(e.clientX, e.clientY, this.tmpNdc), this.drag.world.y)
    if (!hit) return
    const dx = this.drag.world.x - hit.x
    const dz = this.drag.world.z - hit.z
    const before = this.target.clone()
    this.target.x += dx
    this.target.z += dz
    this.clampTarget()
    this.applyCamera()

    const now = performance.now()
    const dt = Math.max(1, now - this.lastDragTime) / 1000
    const vx = (this.target.x - before.x) / dt
    const vz = (this.target.z - before.z) / dt
    // Low-pass the release velocity so a final jitter does not fling the map
    this.velocity.set(this.velocity.x * 0.6 + vx * 0.4, this.velocity.y * 0.6 + vz * 0.4)
    this.lastDragTime = now
  }

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId)
    if (this.drag?.pointerId === e.pointerId) {
      this.drag = null
      // A pause before releasing means the user wanted to stop there
      if (performance.now() - this.lastDragTime > 80) this.velocity.set(0, 0)
    }
    if (this.pointers.size < 2) this.pinchDistance = 0
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 40 : e.deltaY
    this.zoomBy(Math.exp(delta * WHEEL_SENSITIVITY), e.clientX, e.clientY)
  }

  private zoomBy(factor: number, clientX: number, clientY: number) {
    this.targetDistance = this.clampDistance(this.targetDistance * factor)
    const ndc = this.toNdc(clientX, clientY, new THREE.Vector2())
    const world = this.pickGround(ndc)
    this.zoomAnchor = world ? { world, ndc } : null
    this.velocity.set(0, 0)
  }

  dispose() {
    const dom = this.dom
    dom.removeEventListener('pointerdown', this.onPointerDown)
    dom.removeEventListener('pointermove', this.onPointerMove)
    dom.removeEventListener('pointerup', this.onPointerUp)
    dom.removeEventListener('pointercancel', this.onPointerUp)
    dom.removeEventListener('wheel', this.onWheel)
  }
}
