import { CRYSTAL_FORESTS, IMAGE_TO_WORLD } from '../world/islandDesign'

export interface CrystalZone { x: number; z: number; radius: number }

/** Crystal forests in world units */
export const CRYSTAL_ZONES: readonly CrystalZone[] = CRYSTAL_FORESTS.map(({ center, radius }) => ({
  x: center[0] * IMAGE_TO_WORLD, z: center[1] * IMAGE_TO_WORLD, radius: radius * IMAGE_TO_WORLD,
}))

/** Lobed outline so the woods are not circles; mirrored by crystalMask() */
function outline(angle: number, index: number) {
  const s = index * 1.7 + 0.4
  return 1 + 0.16 * Math.sin(3 * angle + s) + 0.09 * Math.sin(5 * angle + 2 * s) + 0.05 * Math.sin(8 * angle + 3 * s)
}

/** Distance to the nearest crystal forest relative to its outline (< 1 inside) */
export function crystalDistance(x: number, z: number): number {
  let d = Infinity
  CRYSTAL_ZONES.forEach((c, i) => {
    const dx = x - c.x, dz = z - c.z
    d = Math.min(d, Math.hypot(dx, dz) / (c.radius * outline(Math.atan2(dz, dx), i)))
  })
  return d
}

/** GLSL constants and crystalMask(p) for the terrain shader; needs noised() */
export function crystalGlsl(): string {
  const f = (v: number) => v.toFixed(3)
  const zones = CRYSTAL_ZONES.map(c => `vec3(${f(c.x)}, ${f(c.z)}, ${f(c.radius)})`).join(', ')
  return /* glsl */ `
#define CRYSTAL_COUNT ${CRYSTAL_ZONES.length}
#if CRYSTAL_COUNT > 0
const vec3 CRYSTAL_ZONES[CRYSTAL_COUNT] = vec3[](${zones});
#endif
// 1 inside a crystal forest, fading out over a frayed rim
float crystalMask(vec2 p) {
  float c = 0.0;
#if CRYSTAL_COUNT > 0
  for (int i = 0; i < CRYSTAL_COUNT; i++) {
    vec3 z = CRYSTAL_ZONES[i];
    vec2 v = p - z.xy;
    float d = length(v);
    if (d > z.z * 1.55) continue;
    float a = atan(v.y, v.x);
    float s = float(i) * 1.7 + 0.4;
    float r = z.z * (1.0 + 0.16 * sin(3.0 * a + s) + 0.09 * sin(5.0 * a + 2.0 * s) + 0.05 * sin(8.0 * a + 3.0 * s));
    d += noised(p * 0.22 + float(i) * 13.0).x * r * 0.14;
    c = max(c, smoothstep(r, r * 0.78, d));
  }
#endif
  return c;
}
`
}
