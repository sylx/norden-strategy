import * as THREE from 'three'

export type MapSeason = 'spring' | 'summer' | 'autumn' | 'winter'

export const MAP_SEASONS: readonly { id: MapSeason, label: string }[] = [
  { id: 'spring', label: '春' },
  { id: 'summer', label: '夏' },
  { id: 'autumn', label: '秋' },
  { id: 'winter', label: '冬' },
]

/** Seconds a change of season takes to fade in */
export const SEASON_FADE = 1.2

/**
 * Colour helpers shared by the terrain and the tree cards. They need
 * `uniform vec4 uSeason` (x spring, y summer, z autumn, w winter).
 */
export const seasonGlsl = /* glsl */ `
vec3 seasonRgb(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Another hue at the same brightness, so painted shading survives the change
vec3 recolor(vec3 c, vec3 hue) { return hue * (luma(c) / max(luma(hue), 1e-4)); }
// Autumn leaves from red through orange and yellow to a few still green (id 0..1)
vec3 autumnLeaf(float id) {
  vec3 c = mix(seasonRgb(150.0, 46.0, 26.0), seasonRgb(196.0, 98.0, 30.0), smoothstep(0.15, 0.45, id));
  c = mix(c, seasonRgb(204.0, 160.0, 44.0), smoothstep(0.5, 0.75, id));
  return mix(c, seasonRgb(76.0, 108.0, 36.0), smoothstep(0.86, 0.97, id));
}
// Broadleaf foliage through the year; 'id' picks a tree's autumn colour
vec3 foliage(vec3 green, float id) {
  vec3 spring = mix(green, recolor(green, seasonRgb(120.0, 184.0, 58.0)) * 1.1, 0.7);
  vec3 autumn = recolor(green, autumnLeaf(id)) * 1.15;
  vec3 winter = recolor(green, seasonRgb(104.0, 90.0, 76.0)) * 0.85;
  return spring * uSeason.x + green * uSeason.y + autumn * uSeason.z + winter * uSeason.w;
}
`

/** Shader weights of the seasons (x spring, y summer, z autumn, w winter; they sum to 1) */
export function seasonWeights(season: MapSeason, target = new THREE.Vector4()): THREE.Vector4 {
  return target.set(
    season === 'spring' ? 1 : 0,
    season === 'summer' ? 1 : 0,
    season === 'autumn' ? 1 : 0,
    season === 'winter' ? 1 : 0,
  )
}
