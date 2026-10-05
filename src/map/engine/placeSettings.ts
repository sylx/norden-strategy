export interface PlaceSettings {
  /** World width of a town's card; the other kinds scale from it */
  citySize: number
  /** On-screen width (CSS px) of a town's card when zoomed out / in */
  cityMinPx: number
  cityMaxPx: number
  /** Below this on-screen town width (CSS px) the cities turn into emblems */
  emblemSwitchPx: number
  /** On-screen size (CSS px) of the emblems */
  emblemPx: number
  /** Size (CSS px) of the emblem beside the name while the city art is shown */
  labelEmblemPx: number
  roadWidth: number
  /** Narrowest on-screen road width (CSS px) */
  roadMinPx: number
  /** Opacity of the road lines drawn over the map while the cities are emblems (0 = off) */
  roadOverview: number
  labels: boolean
}

export const PLACE_DEFAULTS: PlaceSettings = {
  citySize: 19, cityMinPx: 10, cityMaxPx: 240, emblemSwitchPx: 34, emblemPx: 60, labelEmblemPx: 52,
  roadWidth: 3, roadMinPx: 3, roadOverview: 0.8, labels: true,
}

export const PLACE_SLIDERS = [
  { key: 'citySize', label: '都市の大きさ（町の幅）', min: 4, max: 40, step: 0.5, digits: 1 },
  { key: 'cityMinPx', label: '引いた時の最小サイズ（px）', min: 10, max: 120, step: 1, digits: 0 },
  { key: 'cityMaxPx', label: '寄った時の最大サイズ（px）', min: 80, max: 600, step: 5, digits: 0 },
  { key: 'emblemSwitchPx', label: '紋章に切り替える大きさ（px）', min: 0, max: 200, step: 1, digits: 0 },
  { key: 'emblemPx', label: '紋章の大きさ（px）', min: 12, max: 96, step: 1, digits: 0 },
  { key: 'labelEmblemPx', label: '都市表示時の紋章の大きさ（px）', min: 8, max: 64, step: 1, digits: 0 },
  { key: 'roadWidth', label: '街道の幅', min: 0.3, max: 4, step: 0.1, digits: 1 },
  { key: 'roadMinPx', label: '街道の最小幅（px）', min: 1, max: 6, step: 0.1, digits: 1 },
  { key: 'roadOverview', label: '紋章表示時の街道の強調', min: 0, max: 1, step: 0.05, digits: 2 },
] as const

const STORAGE_KEY = 'norden-strategy.places.v1'

export function normalizePlaceSettings(value: unknown): PlaceSettings {
  const result = { ...PLACE_DEFAULTS }
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  if (typeof input.labels === 'boolean') result.labels = input.labels
  for (const { key, min, max } of PLACE_SLIDERS) {
    const n = input[key]
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.min(max, Math.max(min, n))
  }
  result.cityMaxPx = Math.max(result.cityMaxPx, result.cityMinPx)
  return result
}

export function readPlaceSettings(): PlaceSettings {
  try { return normalizePlaceSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')) }
  catch { return { ...PLACE_DEFAULTS } }
}

export function savePlaceSettings(settings: PlaceSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Storage may be disabled. */ }
}
