import { TERRAIN_DEFAULTS, TERRAIN_LEGACY, TERRAIN_SLIDERS, type TerrainSettings } from './engine/terrainSettings'

interface Props {
  settings: TerrainSettings
  onChange: (settings: TerrainSettings) => void
  vertices?: number
  tiles?: number
}

export function TerrainControls({ settings, onChange, vertices, tiles }: Props) {
  return (
    <details className="map-controls__panel" name="map-appearance">
      <summary>地形の起伏・頂点数 <span>調整</span></summary>
      <div className="map-controls__body">
        <div className="map-controls__presets" aria-label="地形のプリセット">
          <button type="button" onClick={() => onChange({ ...TERRAIN_DEFAULTS })}>標準</button>
          <button type="button" onClick={() => onChange({ ...TERRAIN_DEFAULTS,
            lodFactor: 1.5, flatSimplify: 1 })}>軽量</button>
          <button type="button" onClick={() => onChange({ ...TERRAIN_LEGACY })}>従来</button>
        </div>
        {TERRAIN_SLIDERS.map(({ key, label, min, max, step, digits }) => (
          <label className="map-controls__slider" key={key}>
            <span>{label}<output>{settings[key].toFixed(digits)}</output></span>
            <input type="range" min={min} max={max} step={step} value={settings[key]}
              onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })} />
          </label>
        ))}
        <p className="map-controls__note" role="status">
          {vertices !== undefined && tiles !== undefined
            ? `描画中: ${tiles.toLocaleString()} タイル / ${(vertices / 10000).toFixed(1)} 万頂点。`
            : ''}
          海岸線はピクセル単位で描くため、分割を減らしても形は変わりません。
        </p>
      </div>
    </details>
  )
}
