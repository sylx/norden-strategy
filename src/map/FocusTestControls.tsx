import { useState } from 'react'
import type { FocusInset, StrategyMap } from './engine/StrategyMap'

interface Props {
  map: StrategyMap | null
  selected: string
  /** The room the test UI is to cover at the edges (drawn over the map while shown); null hides it */
  inset: FocusInset | null
  onInsetChange: (inset: FocusInset | null) => void
}

const EDGES = [
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
  { key: 'top', label: '上' },
  { key: 'bottom', label: '下' },
] as const

/** Test panel for focusPlaces: several cities in view, fitted into the room the UI leaves */
export function FocusTestControls({ map, selected, inset, onInsetChange }: Props) {
  const [ids, setIds] = useState<readonly string[]>([])
  const [addOnSelect, setAddOnSelect] = useState(true)
  const [margin, setMargin] = useState(3)
  const [instant, setInstant] = useState(false)
  const [edges, setEdges] = useState<Required<FocusInset>>({ left: 360, right: 200, top: 0, bottom: 0 })
  const places = map?.places ?? []
  const placeName = (id: string) => `${id} ${places.find((p) => p.id === id)?.name ?? ''}`
  const add = (id: string) => setIds((current) => (id && !current.includes(id) ? [...current, id] : current))

  // A city picked on the map joins the list
  const [seen, setSeen] = useState(selected)
  if (selected !== seen) {
    setSeen(selected)
    if (addOnSelect) add(selected)
  }

  const changeEdge = (key: keyof FocusInset, value: number) => {
    const next = { ...edges, [key]: value }
    setEdges(next)
    if (inset) onInsetChange(next)
  }

  return (
    <details className="map-controls__panel" name="map-appearance">
      <summary>フォーカス <span>複数の都市</span></summary>
      <div className="map-controls__body">
        <h3 className="map-controls__heading">映す都市</h3>
        {ids.length === 0
          ? <p className="map-controls__note">都市を2つ以上加えると、全部が入るように寄せてズームします。</p>
          : (
            <ul className="map-controls__chips">
              {ids.map((id) => (
                <li key={id}>
                  {placeName(id)}
                  <button type="button" aria-label={`${placeName(id)}を外す`} onClick={() => setIds(ids.filter((item) => item !== id))}>×</button>
                </li>
              ))}
            </ul>
          )}
        <label className="map-controls__field">
          <span>都市を加える</span>
          <select value="" onChange={(e) => add(e.target.value)}>
            <option value="">（選択）</option>
            {places.filter((p) => !ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{placeName(p.id)}</option>)}
          </select>
        </label>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={addOnSelect} onChange={(e) => setAddOnSelect(e.target.checked)} />
          地図で選んだ都市を加える
        </label>

        <h3 className="map-controls__heading">UIが覆う範囲（inset）</h3>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={inset !== null} onChange={(e) => onInsetChange(e.target.checked ? edges : null)} />
          使う（地図の上に範囲を出す）
        </label>
        <fieldset disabled={inset === null}>
          {EDGES.map(({ key, label }) => (
            <label key={key} className="map-controls__slider">
              <span>{label}<output>{edges[key]}px</output></span>
              <input type="range" min={0} max={800} step={10} value={edges[key]} onChange={(e) => changeEdge(key, Number(e.target.value))} />
            </label>
          ))}
        </fieldset>
        <label className="map-controls__slider">
          <span>余白（margin）<output>{margin.toFixed(1)}</output></span>
          <input type="range" min={1} max={3} step={0.1} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
        </label>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} />
          瞬時に切り替える（instant）
        </label>
        <div className="map-controls__presets">
          <button type="button" disabled={!map || ids.length === 0}
            onClick={() => map?.focusPlaces(ids, { margin, instant, inset: inset ?? undefined })}>
            映す
          </button>
          <button type="button" disabled={ids.length === 0} onClick={() => setIds([])}>クリア</button>
        </div>
        <p className="map-controls__note">
          focusPlaces: 都市が全部入るように中心へ寄せ、ズームも合わせます。inset の範囲はUIに隠れるとみなし、残りの範囲に収めます。都市が隠れない限り画面の真ん中に映し、隠れるときは隠れないぶんだけずらします。都市が1つならズームはそのままです。
        </p>
      </div>
    </details>
  )
}
