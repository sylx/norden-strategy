// The macro terrain generation without the map engine (no three.js, no DOM): for tools that read the geography, e.g. building battle maps of the roads
export { generateWorld, type GenerateOptions, type WorldData, type WorldPlace } from './map/world/generateWorld'
export { WorldSampler, type WorldSample } from './map/world/sampleWorld'
export type { RoadPath } from './map/world/roads'
export { PLACE_KINDS, PLACE_POINTS, ROAD_LINKS, type PlaceType } from './map/world/placeLayout'
