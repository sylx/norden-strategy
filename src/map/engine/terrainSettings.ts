export interface TerrainSettings {
  segments: number
  lodFactor: number
  flatSimplify: number
  plainsRelief: number
  mountainRelief: number
}

export const TERRAIN_DEFAULTS: TerrainSettings = {
  segments: 32, lodFactor: 1.9, flatSimplify: 0.85, plainsRelief: 0.6, mountainRelief: 0.17,
}

/** The mesh before adjustable terrain, for comparison */
export const TERRAIN_LEGACY: TerrainSettings = {
  segments: 32, lodFactor: 2.2, flatSimplify: 0, plainsRelief: 1, mountainRelief: 1,
}

export const TERRAIN_SLIDERS = [
  { key: 'segments', label: 'タイルの分割数', min: 8, max: 64, step: 4, digits: 0 },
  { key: 'lodFactor', label: '詳細化する距離', min: 1, max: 3.5, step: 0.05, digits: 2 },
  { key: 'flatSimplify', label: '平地・海の簡略化', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'plainsRelief', label: '平地の起伏', min: 0, max: 1.5, step: 0.01, digits: 2 },
  { key: 'mountainRelief', label: '山地の起伏', min: 0, max: 1.5, step: 0.01, digits: 2 },
] as const

const STORAGE_KEY = 'norden-strategy.terrain.v1'

export function normalizeTerrainSettings(value: unknown): TerrainSettings {
  const result = { ...TERRAIN_DEFAULTS }
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  for (const { key, min, max } of TERRAIN_SLIDERS) {
    const n = input[key]
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.min(max, Math.max(min, n))
  }
  result.segments = Math.round(result.segments)
  return result
}

export function readTerrainSettings(): TerrainSettings {
  try { return normalizeTerrainSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')) }
  catch { return { ...TERRAIN_DEFAULTS } }
}

export function saveTerrainSettings(settings: TerrainSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Storage may be disabled. */ }
}
