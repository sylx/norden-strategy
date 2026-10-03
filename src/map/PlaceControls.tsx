import { PLACE_DEFAULTS, PLACE_SLIDERS, type PlaceSettings } from './engine/placeSettings'

interface Props {
  settings: PlaceSettings
  onChange: (settings: PlaceSettings) => void
  warnings?: readonly string[]
}

export function PlaceControls({ settings, onChange, warnings }: Props) {
  return (
    <details className="map-controls__panel" name="map-appearance">
      <summary>都市と街道 <span>調整</span></summary>
      <div className="map-controls__body">
        <label className="map-controls__toggle">
          <input type="checkbox" checked={settings.labels}
            onChange={e => onChange({ ...settings, labels: e.target.checked })} />
          都市名を表示
        </label>
        <div className="map-controls__presets" aria-label="都市と街道のプリセット">
          <button type="button" onClick={() => onChange({ ...PLACE_DEFAULTS })}>標準</button>
        </div>
        {PLACE_SLIDERS.map(({ key, label, min, max, step, digits }) => (
          <label className="map-controls__slider" key={key}>
            <span>{label}<output>{settings[key].toFixed(digits)}</output></span>
            <input type="range" min={min} max={max} step={step} value={settings[key]}
              onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })} />
          </label>
        ))}
        <p className="map-controls__note" role="status">
          {warnings && warnings.length > 0
            ? `配置の問題: ${warnings.join(' / ')}`
            : '町の画像が「紋章に切り替える大きさ」より小さくなると紋章で表示します（0で切り替えない）。街道の最小幅は、引いた時に街道が細くなりすぎないよう保つ画面上の太さです。都市の位置と街道のつながりは placeLayout.ts で編集します。'}
        </p>
      </div>
    </details>
  )
}
