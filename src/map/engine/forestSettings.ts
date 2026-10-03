export interface ForestSettings {
  mode: 'textured' | 'procedural'
  density: number
  size: number
  variation: number
  conifers: number
  brightness: number
  warmth: number
  shade: number
}

export const FOREST_DEFAULTS: ForestSettings = {
  mode: 'textured', density: 0.85, size: 4.4, variation: 0.65,
  conifers: 0.16, brightness: 0.95, warmth: 0.25, shade: 0.55,
}

export const FOREST_SLIDERS = [
  { key: 'density', label: '木の密度', min: 0, max: 1, step: 0.01 },
  { key: 'size', label: '樹冠の大きさ', min: 1.5, max: 7, step: 0.1 },
  { key: 'variation', label: '大きさ・濃淡のばらつき', min: 0, max: 1, step: 0.01 },
  { key: 'conifers', label: '針葉樹の割合', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: '葉の明るさ', min: 0.45, max: 1.5, step: 0.01 },
  { key: 'warmth', label: '色味（深緑 → 黄緑）', min: 0, max: 1, step: 0.01 },
  { key: 'shade', label: '林床・樹冠の陰影', min: 0, max: 1, step: 0.01 },
] as const

const STORAGE_KEY = 'norden-strategy.forest.v1'

export function normalizeForestSettings(value: Partial<ForestSettings>): ForestSettings {
  const settings = { ...FOREST_DEFAULTS }
  if (value.mode === 'textured' || value.mode === 'procedural') settings.mode = value.mode
  for (const { key, min, max } of FOREST_SLIDERS) {
    const n = value[key]
    if (typeof n === 'number' && Number.isFinite(n)) settings[key] = Math.min(max, Math.max(min, n))
  }
  return settings
}

export function readForestSettings(): ForestSettings {
  try {
    return normalizeForestSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {})
  } catch {
    return { ...FOREST_DEFAULTS }
  }
}

export function saveForestSettings(settings: ForestSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Storage may be disabled. */ }
}
