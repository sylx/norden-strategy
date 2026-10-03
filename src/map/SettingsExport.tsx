import { useState } from 'react'
import type { ForestSettings } from './engine/forestSettings'
import type { ParchmentSettings } from './engine/parchmentSettings'

interface Props {
  forest: ForestSettings
  parchment: ParchmentSettings
}

function selectJson(node: HTMLTextAreaElement | null) {
  if (node) { node.focus(); node.select() }
}

export function SettingsExport({ forest, parchment }: Props) {
  const json = JSON.stringify({ forest, parchment }, null, 2)
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
          : copiedJson === json ? '森と羊皮紙の設定をコピーしました。'
            : '森と羊皮紙の現在の設定をまとめてコピーします。'}
      </p>
      {manualCopy && (
        <textarea aria-label="現在の描画設定JSON" readOnly value={json} rows={8}
          ref={selectJson}
          onFocus={e => e.currentTarget.select()} />
      )}
    </div>
  )
}
