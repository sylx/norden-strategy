export interface RenderSettings {
  resolution: number
  detailOctaves: number
  msaa: boolean
}

export const RENDER_DEFAULTS: RenderSettings = { resolution: 0.8, detailOctaves: 3, msaa: true }

/** Full resolution and detail, as before the quality settings */
export const RENDER_HIGH: RenderSettings = { resolution: 1, detailOctaves: 10, msaa: true }

export const RENDER_SLIDERS = [
  { key: 'resolution', label: '描画解像度', min: 0.4, max: 1, step: 0.05, digits: 2 },
  { key: 'detailOctaves', label: '地形の細部（ノイズ段数）', min: 0, max: 10, step: 1, digits: 0 },
] as const

/** Device pixels per CSS pixel are capped here before the resolution scale */
export const MAX_PIXEL_RATIO = 2

const STORAGE_KEY = 'norden-strategy.render.v1'

export function normalizeRenderSettings(value: unknown): RenderSettings {
  const result = { ...RENDER_DEFAULTS }
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  if (typeof input.msaa === 'boolean') result.msaa = input.msaa
  for (const { key, min, max } of RENDER_SLIDERS) {
    const n = input[key]
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.min(max, Math.max(min, n))
  }
  result.detailOctaves = Math.round(result.detailOctaves)
  return result
}

export function readRenderSettings(): RenderSettings {
  try { return normalizeRenderSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')) }
  catch { return { ...RENDER_DEFAULTS } }
}

export function saveRenderSettings(settings: RenderSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Storage may be disabled. */ }
}
