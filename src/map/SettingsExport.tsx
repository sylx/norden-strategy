import { useState } from 'react'
import type { ForestSettings } from './engine/forestSettings'
import type { ParchmentSettings } from './engine/parchmentSettings'
import type { TerrainSettings } from './engine/terrainSettings'
import type { RenderSettings } from './engine/renderSettings'
import type { PlaceSettings } from './engine/placeSettings'

interface Props {
  forest: ForestSettings
  parchment: ParchmentSettings
  terrain: TerrainSettings
  render: RenderSettings
  places: PlaceSettings
}

function selectJson(node: HTMLTextAreaElement | null) {
  if (node) { node.focus(); node.select() }
}

export function SettingsExport({ forest, parchment, terrain, render, places }: Props) {
  const json = JSON.stringify({ forest, parchment, terrain, render, places }, null, 2)
  const [copiedJson, setCopiedJson] = useState<string | null>(null)
  const [manualCopy, setManualCopy] = useState(false)

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(json)
      setCopiedJson(json)
      setManualCopy(false)
    } catch {
      setCopiedJson(null)
      setManualCopy(true)
    }
  }

  return (
    <div className="map-controls__panel map-controls__export">
      <button type="button" onClick={copy}>設定JSONをコピー</button>
      <p className="map-controls__note" role="status">
        {manualCopy ? '自動コピーできませんでした。下のJSONを選択してコピーしてください。'
          : copiedJson === json ? 'すべての描画設定をコピーしました。'
            : '森・羊皮紙・地形・描画品質・都市と街道の設定をまとめてコピーします。'}
      </p>
      {manualCopy && (
        <textarea aria-label="現在の描画設定JSON" readOnly value={json} rows={8}
          ref={selectJson}
          onFocus={e => e.currentTarget.select()} />
      )}
    </div>
  )
}
