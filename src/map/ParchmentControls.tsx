import { PARCHMENT_DEFAULTS, PARCHMENT_SLIDERS, type ParchmentSettings } from './engine/parchmentSettings'

interface Props {
  settings: ParchmentSettings
  onChange: (settings: ParchmentSettings) => void
}

export function ParchmentControls({ settings, onChange }: Props) {
  return (
    <details className="map-controls__panel" name="map-appearance" open>
      <summary>地図の色・羊皮紙 <span>調整</span></summary>
      <div className="map-controls__body">
        <label className="map-controls__toggle">
          <input type="checkbox" checked={settings.enabled}
            onChange={e => onChange({ ...settings, enabled: e.target.checked })} />
          羊皮紙の効果を有効にする
        </label>
        <div className="map-controls__presets" aria-label="羊皮紙のプリセット">
          <button type="button" onClick={() => onChange({ ...PARCHMENT_DEFAULTS })}>標準</button>
          <button type="button" onClick={() => onChange({ ...PARCHMENT_DEFAULTS,
            saturation: 0.75, sepia: 0.1, paper: 0.45, fade: 0.08, vignette: 0.15 })}>淡い水彩</button>
          <button type="button" onClick={() => onChange({ ...PARCHMENT_DEFAULTS,
            saturation: 0.35, sepia: 0.6, paper: 1.2, fade: 0.2, vignette: 0.65 })}>古地図</button>
        </div>
        <fieldset disabled={!settings.enabled}>
          <legend className="map-controls__sr-only">地図全体の色と紙の質感</legend>
          {PARCHMENT_SLIDERS.map(({ key, label, min, max, step }) => (
            <label className="map-controls__slider" key={key}>
              <span>{label}<output>{settings[key].toFixed(key === 'paperScale' ? 0 : 2)}</output></span>
              <input type="range" min={min} max={max} step={step} value={settings[key]}
                onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })} />
            </label>
          ))}
        </fieldset>
        <p className="map-controls__note">
          {settings.enabled ? '地図全体に反映し、このブラウザに保存します。効果をオフにすると元の描画と比較できます。'
            : '元の描画を表示中。調整値はそのまま保持しています。'}
        </p>
      </div>
    </details>
  )
}
