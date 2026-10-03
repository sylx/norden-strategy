import { RENDER_DEFAULTS, RENDER_HIGH, RENDER_SLIDERS, type RenderSettings } from './engine/renderSettings'

interface Props {
  settings: RenderSettings
  onChange: (settings: RenderSettings) => void
  width?: number
  height?: number
  fps?: number
}

export function RenderControls({ settings, onChange, width, height, fps }: Props) {
  return (
    <details className="map-controls__panel" name="map-appearance">
      <summary>描画品質 <span>調整</span></summary>
      <div className="map-controls__body">
        <label className="map-controls__toggle">
          <input type="checkbox" checked={settings.msaa}
            onChange={e => onChange({ ...settings, msaa: e.target.checked })} />
          MSAA（輪郭のギザギザ消し）
        </label>
        <div className="map-controls__presets" aria-label="描画品質のプリセット">
          <button type="button" onClick={() => onChange({ ...RENDER_DEFAULTS })}>標準</button>
          <button type="button" onClick={() => onChange({ ...RENDER_HIGH })}>高品質</button>
          <button type="button" onClick={() => onChange({ resolution: 0.6, detailOctaves: 2, msaa: false })}>軽量</button>
        </div>
        {RENDER_SLIDERS.map(({ key, label, min, max, step, digits }) => (
          <label className="map-controls__slider" key={key}>
            <span>{label}<output>{settings[key].toFixed(digits)}</output></span>
            <input type="range" min={min} max={max} step={step} value={settings[key]}
              onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })} />
          </label>
        ))}
        <p className="map-controls__note" role="status">
          {width && height ? `描画 ${width}×${height}px` : ''}
          {fps !== undefined ? ` / ${fps.toFixed(0)} fps。` : ''}
          解像度は画面の画素密度（最大2倍）に対する割合です。
        </p>
      </div>
    </details>
  )
}
