import { FOREST_DEFAULTS, FOREST_SLIDERS, type ForestSettings } from './engine/forestSettings'
import type { ForestTextureStatus } from './engine/Forest'

interface Props {
  settings: ForestSettings
  onChange: (settings: ForestSettings) => void
  textureStatus?: ForestTextureStatus
}

export function ForestControls({ settings, onChange, textureStatus }: Props) {
  const procedural = settings.mode === 'procedural'
  return (
    <details className="forest-controls" open>
      <summary>森の表現 <span>調整</span></summary>
      <div className="forest-controls__body">
        <label className="forest-controls__mode">
          描画方式
          <select value={settings.mode} onChange={e => onChange({ ...settings, mode: e.target.value as ForestSettings['mode'] })}>
            <option value="textured">生成テクスチャ</option>
            <option value="procedural">従来のシェーダー（比較）</option>
          </select>
        </label>
        <div className="forest-controls__presets" aria-label="森のプリセット">
          <button type="button" onClick={() => onChange({ ...FOREST_DEFAULTS })}>標準</button>
          <button type="button" onClick={() => onChange({ ...FOREST_DEFAULTS, density: 0.55, size: 3, shade: 0.35 })}>疎林</button>
          <button type="button" onClick={() => onChange({ ...FOREST_DEFAULTS, density: 1, size: 4.8, brightness: 0.8, shade: 0.7 })}>深い森</button>
        </div>
        <fieldset disabled={procedural}>
          <legend className="forest-controls__sr-only">テクスチャの調整</legend>
          {FOREST_SLIDERS.map(({ key, label, min, max, step }) => (
            <label className="forest-controls__slider" key={key}>
              <span>{label}<output>{settings[key].toFixed(key === 'size' ? 1 : 2)}</output></span>
              <input type="range" min={min} max={max} step={step} value={settings[key]}
                onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })} />
            </label>
          ))}
        </fieldset>
        <p className="forest-controls__note" role="status">
          {textureStatus === 'error' ? '画像を読み込めませんでした。従来の描画で表示しています。再読み込みで再試行できます。'
            : textureStatus !== 'ready' ? 'テクスチャを読み込み中…'
              : procedural ? '従来の丸い樹冠と比較できます。' : '変更はすぐに反映され、このブラウザに保存されます。'}
        </p>
      </div>
    </details>
  )
}
