export interface ParchmentSettings {
  enabled: boolean
  exposure: number
  saturation: number
  sepia: number
  paper: number
  paperScale: number
  fade: number
  vignette: number
}

export const PARCHMENT_DEFAULTS: ParchmentSettings = {
  enabled: true, exposure: 0.92, saturation: 0.68, sepia: 0.1,
  paper: 0.8, paperScale: 73, fade: 0.06, vignette: 0.88,
}

export const PARCHMENT_SLIDERS = [
  { key: 'exposure', label: '明るさ', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'saturation', label: '彩度', min: 0, max: 1, step: 0.01 },
  { key: 'sepia', label: 'セピア', min: 0, max: 1, step: 0.01 },
  { key: 'paper', label: '紙の地合い・繊維', min: 0, max: 1.5, step: 0.01 },
  { key: 'paperScale', label: '染みの大きさ', min: 10, max: 160, step: 1 },
  { key: 'fade', label: 'インクの色あせ', min: 0, max: 0.5, step: 0.01 },
  { key: 'vignette', label: '周縁の焼け', min: 0, max: 1, step: 0.01 },
] as const

const STORAGE_KEY = 'norden-strategy.parchment.v1'

export function normalizeParchmentSettings(value: unknown): ParchmentSettings {
  const result = { ...PARCHMENT_DEFAULTS }
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  if (typeof input.enabled === 'boolean') result.enabled = input.enabled
  for (const { key, min, max } of PARCHMENT_SLIDERS) {
    const n = input[key]
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.min(max, Math.max(min, n))
  }
  return result
}

export function readParchmentSettings(): ParchmentSettings {
  try { return normalizeParchmentSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')) }
  catch { return { ...PARCHMENT_DEFAULTS } }
}

export function saveParchmentSettings(settings: ParchmentSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Storage may be disabled. */ }
}
