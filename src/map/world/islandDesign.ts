/**
 * Hand-authored layout of the island.
 *
 * All coordinates are in the 8192px "image space" of the former 2D strategy
 * map (nordencult-old map_strategy.webp / map_overlay.svg), so places and
 * routes from the old overlay can be reused as-is. The generator converts
 * them to world units with IMAGE_TO_WORLD.
 *
 * This is only the coarse design: noise breaks up every line given here.
 */

export type Vec2 = readonly [number, number]

/** Image space size (px) of the original strategy map */
export const IMAGE_SIZE = 8192
/** World units covered by the map (square, origin at the top-left) */
export const WORLD_SIZE = 1024
export const IMAGE_TO_WORLD = WORLD_SIZE / IMAGE_SIZE

/** Main coastline, from the eastern cape westward along the north coast */
export const COASTLINE: readonly Vec2[] = [
  [7712, 2112], [7104, 1888], [6848, 1664], [6496, 1568], [6208, 1280],
  [5760, 1120], [4640, 1184], [4416, 1312], [3776, 1440], [3456, 1664],
  [3776, 1824], [3712, 1920], [3296, 2144], [2976, 2112], [2432, 2304],
  [2368, 2400], [2592, 2464], [2688, 2624], [2944, 2656], [2976, 2784],
  [2368, 2944], [1984, 3232], [1504, 3360], [1152, 3648], [1312, 3840],
  [1792, 3968], [1792, 4288], [2112, 4288], [2176, 4352], [2080, 4608],
  [2368, 4960], [1984, 5216], [1440, 5856], [1024, 6016], [800, 6208],
  [1184, 6208], [1408, 6080], [1696, 6144], [1312, 6560], [832, 6752],
  [1056, 6944], [1664, 6944], [1824, 7072], [2048, 7072], [2368, 6880],
  [3136, 7264], [3488, 6976], [3648, 7072], [4096, 7072], [4544, 6880],
  [4992, 6816], [5312, 6880], [5472, 6784], [6336, 6720], [6880, 6496],
  [6912, 6336], [7168, 6176], [6944, 5952], [6944, 5728], [7040, 5536],
  [7392, 5248], [7008, 4864], [7232, 4512], [7168, 4256], [7264, 4032],
  [7168, 3520], [7008, 3328], [7008, 3040], [7168, 2848], [7136, 2688],
  [7232, 2528], [7840, 2336],
]

export interface MountainRange {
  /** Ridge line */
  path: readonly Vec2[]
  /** Relative height (1 = tallest peaks) */
  height: number
  /** Half width of the range (px) */
  width: number
}

export const MOUNTAIN_RANGES: readonly MountainRange[] = [
  // Northern highlands
  { path: [[4500, 1400], [5100, 1250], [5800, 1300], [6250, 1550]], height: 1.0, width: 380 },
  // North-east ridge running down to the cape
  { path: [[5600, 1750], [6200, 2100], [6700, 2350]], height: 0.75, width: 300 },
  { path: [[3700, 1950], [4100, 2050]], height: 0.6, width: 260 },
  // Central spine
  { path: [[4700, 2100], [5100, 2650], [5500, 3000], [5900, 3300]], height: 0.7, width: 300 },
  // Eastern hills
  { path: [[5650, 3550], [6200, 3350], [6700, 3250]], height: 0.75, width: 280 },
  // West-central
  { path: [[3100, 3650], [3500, 3400], [4000, 3300]], height: 0.55, width: 300 },
  // Heart of the island
  { path: [[4200, 4250], [4700, 4550], [5200, 4950]], height: 0.6, width: 260 },
  // Southern massif
  { path: [[3200, 5750], [3800, 5900], [4300, 6000], [4650, 6150]], height: 0.95, width: 360 },
  // South-west
  { path: [[2400, 5950], [2900, 6250], [3300, 6450]], height: 0.6, width: 280 },
  // South-east
  { path: [[5700, 5150], [6150, 4950]], height: 0.5, width: 260 },
]

/** Areas where the coast shatters into inlets and islets */
export interface ArchipelagoZone {
  center: Vec2
  radius: number
  /** 0..1 */
  strength: number
}

export const ARCHIPELAGO_ZONES: readonly ArchipelagoZone[] = [
  { center: [1400, 3700], radius: 1300, strength: 1.0 },
  { center: [1600, 4400], radius: 900, strength: 0.8 },
  { center: [1300, 6400], radius: 1400, strength: 1.0 },
  { center: [2800, 2300], radius: 1000, strength: 0.9 },
  { center: [4400, 7050], radius: 1300, strength: 0.7 },
  { center: [6400, 6700], radius: 900, strength: 0.6 },
  { center: [7300, 4600], radius: 700, strength: 0.5 },
  { center: [7500, 2250], radius: 600, strength: 0.4 },
]

export interface Lake {
  center: Vec2
  radius: number
}

export const LAKES: readonly Lake[] = [
  { center: [5300, 4280], radius: 150 },
  { center: [3820, 5420], radius: 90 },
]

/** Arid areas: no forests, little rain, sand dunes */
export interface Desert {
  center: Vec2
  radius: number
}

export const DESERTS: readonly Desert[] = [
  { center: [5700, 6050], radius: 1050 },
  { center: [4900, 6500], radius: 650 },
]

/** Woods turned to crystal: glowing ground and crystal clusters instead of trees */
export interface CrystalForest {
  center: Vec2
  radius: number
}

export const CRYSTAL_FORESTS: readonly CrystalForest[] = [
  // The lone wood on the north-eastern cape
  { center: [7240, 2328], radius: 50 },
]
