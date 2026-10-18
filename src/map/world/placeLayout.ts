/**
 * Hand-authored placement of the cities and the road network.
 *
 * Coordinates use the same 8192px image space as islandDesign.ts. Move a
 * city by editing its position here: the ground under it is levelled and its
 * roads are routed again over the terrain when the world is generated.
 *
 * What the cities are (names, pictures, factions) is not kept here: the app
 * embedding the map gives them (MapView's `cities`), the map on its own uses SAMPLE_CITIES.
 */
import { IMAGE_TO_WORLD, type Vec2 } from './islandDesign'

export type PlaceType = 'town' | 'city' | 'metropolice' | 'fortress1' | 'fortress2' | 'temple'

/** Position of each city (image space px). Initial values come from the 2D map. */
export const PLACE_POSITIONS: Readonly<Record<string, Vec2>> = {
  P000: [5281, 2917],
  P001: [2068, 6393],
  P002: [2732, 5742],
  P003: [3931, 5499],
  P004: [3268, 4739],
  P005: [4023, 5042],
  P006: [5113, 6773],
  P007: [5916, 6569],
  P008: [5389, 5513],
  P009: [6858, 4907],
  P010: [4665, 4547],
  P011: [5520, 4272],
  P012: [2160, 4623],
  P013: [4073, 2636],
  P014: [2819, 3319],
  P015: [3391, 3869],
  P016: [2979, 2763],
  P017: [6999, 2805],
  P018: [5988, 2885],
  P019: [7083, 2275],
  P020: [5658, 1535],
  P021: [4031, 1494],
  P022: [7150, 3826],
  P023: [3917, 4130],
  P024: [5985, 3548],
  P025: [4333, 3391],
  P026: [2110, 3821],
  P027: [5412, 2060],
  P028: [3426, 2061],
  P029: [4882, 2121],
  P030: [1690, 5567],
}

/** Pairs of cities joined by a road. The route itself is searched over the terrain. */
export const ROAD_LINKS: readonly (readonly [string, string])[] = [
  ['P000', 'P013'], ['P000', 'P018'], ['P001', 'P002'],['P001', 'P030'], ['P002', 'P004'],
  ['P002', 'P030'], ['P003', 'P005'], ['P003', 'P008'], ['P004', 'P005'],
  ['P004', 'P012'], ['P005', 'P010'], ['P006', 'P007'], ['P007', 'P008'], ['P008', 'P009'],
  ['P008', 'P011'], ['P009', 'P011'], ['P009', 'P022'], ['P010', 'P011'], ['P010', 'P023'],
  ['P011', 'P024'], ['P012', 'P026'], ['P013', 'P025'], ['P013', 'P028'], ['P021', 'P029'],['P014', 'P026'],
  ['P014', 'P015'], ['P015', 'P026'], ['P015', 'P023'], ['P016', 'P028'], ['P017', 'P019'],
  ['P018', 'P024'], ['P018', 'P017'],['P018', 'P027'], ['P019', 'P020'], ['P020', 'P027'], ['P023', 'P025'],
  ['P022', 'P024'], ['P021', 'P028'], ['P027', 'P029'],
]

/**
 * Footprint of each kind of place. `size` is the width of the drawn card
 * relative to a town (proportions of the 2D map); `radius` is the ground
 * levelled and cleared of trees around the city, in world units.
 */
export const PLACE_KINDS: Readonly<Record<PlaceType, { size: number; radius: number }>> = {
  town: { size: 1, radius: 5 },
  city: { size: 1.54, radius: 6.5 },
  metropolice: { size: 2.59, radius: 11 },
  fortress1: { size: 1.34, radius: 6 },
  fortress2: { size: 1.21, radius: 5.5 },
  temple: { size: 2, radius: 8 },
}

/** A city as the app embedding the map gives it: its name, its picture and the faction holding it (its emblem) */
export interface MapCity {
  /** One of PLACE_POSITIONS' ids; a city without a position is not drawn */
  id: string
  name: string
  type: PlaceType
  /** Omitted: neutral */
  belongTo?: string
}

/** A city placed on the map */
export interface Place extends MapCity {
  /** World units */
  x: number
  z: number
}

/** Position of each city in world units */
export const PLACE_POINTS: Readonly<Record<string, { x: number; z: number }>> = Object.fromEntries(
  Object.entries(PLACE_POSITIONS).map(([id, [x, z]]) => [id, { x: x * IMAGE_TO_WORLD, z: z * IMAGE_TO_WORLD }]),
)

/** The cities that have a position, placed (the others are left out) */
export function placesOf(cities: readonly MapCity[]): Place[] {
  return cities.flatMap((city) => {
    const point = PLACE_POINTS[city.id]
    return point ? [{ ...city, ...point }] : []
  })
}

/** Stand-ins for the map on its own: every position, named by its id, showing each kind of picture in turn */
export const SAMPLE_CITIES: readonly MapCity[] = Object.keys(PLACE_POSITIONS).map((id, i) => {
  const types = Object.keys(PLACE_KINDS) as PlaceType[]
  return { id, name: id, type: types[i % types.length] }
})
