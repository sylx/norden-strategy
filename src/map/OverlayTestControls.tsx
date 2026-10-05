import { useEffect, useRef, useState } from 'react'
import type { StrategyMap } from './engine/StrategyMap'
import type { CityHighlight } from './engine/CityHighlights'
import type { RoadHighlight } from './engine/RoadHighlights'
import { MARCH_KINDS, type MarchKind } from './engine/MarchMarkers'
import { PLACES, ROAD_LINKS } from './world/placeLayout'
import { FACTION_LIST } from '../data/faction'

/** Test colours per faction until the faction data carries its own */
const FACTION_COLORS: Readonly<Record<string, string>> = {
  valhardt: '#3d5fa8',
  dracken: '#b0342c',
  leonis: '#d0a326',
  carta: '#4f8a63',
  aqua: '#2f93ad',
  rosalia: '#b24c80',
  taurus: '#8a6238',
  sede: '#e6dfc8',
}
const NEUTRAL_COLOR = '#8a8a80'
const NEIGHBOUR_COLOR = '#7fc4ff'
const ROAD_COLOR = '#ff8a4a'

const PLACE_NAMES = new Map(PLACES.map((p) => [p.id, p.name]))
const placeName = (id: string) => `${id} ${PLACE_NAMES.get(id) ?? ''}`
const factionColor = (id: string) => FACTION_COLORS[PLACES.find((p) => p.id === id)?.belongTo ?? ''] ?? NEUTRAL_COLOR

interface Props {
  map: StrategyMap | null
  selected: string
  onSelect: (id: string) => void
}

/** Test panel for the selection, road highlight and march overlays */
export function OverlayTestControls({ map, selected, onSelect }: Props) {
  const [neighbours, setNeighbours] = useState(false)
  const [cityRoads, setCityRoads] = useState(false)
  const [road, setRoad] = useState('')
  const [reverse, setReverse] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<MarchKind>('army')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('')
  const [speed, setSpeed] = useState(18)
  const [loop, setLoop] = useState(false)
  const [status, setStatus] = useState('')
  const [marching, setMarching] = useState(0)
  const serial = useRef(0)

  useEffect(() => {
    if (!map) return
    const cities: CityHighlight[] = []
    const roads: RoadHighlight[] = []
    if (selected) {
      cities.push({ id: selected })
      for (const id of map.network.neighbours(selected)) {
        if (neighbours) cities.push({ id, color: NEIGHBOUR_COLOR })
        if (cityRoads) roads.push({ from: selected, to: id })
      }
    }
    if (road) {
      const [a, b] = road.split('-')
      roads.push(reverse ? { from: b, to: a, color: ROAD_COLOR } : { from: a, to: b, color: ROAD_COLOR })
    }
    map.setCityHighlights(cities)
    const missing = map.setRoadHighlights(roads)
    if (missing.length > 0) console.warn('街道が見つかりません', missing)
  }, [map, selected, neighbours, cityRoads, road, reverse])

  useEffect(() => {
    return map?.onMarchArrive((id) => setStatus(`${id} が目標に到着しました`))
  }, [map])

  const startMarch = (start: string, goal: string, options: { kind: MarchKind; label: string; color: string;
    loop: boolean }): boolean => {
    if (!map) return false
    const route = map.network.findRoute(start, goal)
    if (!route || route.length < 2) return false
    const n = ++serial.current
    const ok = map.march({
      id: `march-${n}`, route, speed, ...options, label: options.label || `${MARCH_KINDS[options.kind].name} ${n}`,
    })
    setMarching(map.marchCount)
    return ok
  }

  const march = () => {
    const start = from || selected
    if (!start || !to || start === to) {
      setStatus('出発地と目標を選んでください')
      return
    }
    const ok = startMarch(start, to, { kind, label: label.trim(), color: color || factionColor(start), loop })
    setStatus(ok ? `${placeName(start)} → ${placeName(to)} へ進撃` : `${placeName(start)} から ${placeName(to)} への街道がありません`)
  }

  const marchRandom = () => {
    const ids = PLACES.map((p) => p.id)
    const kinds = Object.keys(MARCH_KINDS) as MarchKind[]
    const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
    let started = 0
    for (let tries = 0; started < 5 && tries < 50; tries++) {
      const start = pick(ids)
      const goal = pick(ids)
      if (start === goal) continue
      if (startMarch(start, goal, { kind: pick(kinds), label: '', color: factionColor(start), loop: true })) {
        started++
      }
    }
    setStatus(`${started} 部隊をループ進撃させました`)
  }

  const clear = () => {
    map?.clearMarches()
    setMarching(0)
    setStatus('全部隊を消去しました')
  }

  const cityOptions = PLACES.map((p) => <option key={p.id} value={p.id}>{placeName(p.id)}</option>)

  return (
    <details className="map-controls__panel" name="map-appearance">
      <summary>演出テスト <span>強調・進撃</span></summary>
      <div className="map-controls__body">
        <h3 className="map-controls__heading">都市の強調</h3>
        <label className="map-controls__field">
          <span>選択中の都市（地図上のクリックでも選択）</span>
          <select value={selected} onChange={e => onSelect(e.target.value)}>
            <option value="">（なし）</option>
            {cityOptions}
          </select>
        </label>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={neighbours} onChange={e => setNeighbours(e.target.checked)} />
          隣接都市も強調
        </label>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={cityRoads} onChange={e => setCityRoads(e.target.checked)} />
          選択都市から出る街道を強調
        </label>
        <div className="map-controls__presets">
          <button type="button" disabled={!selected} onClick={() => selected && map?.focusPlace(selected)}>
            選択都市へ移動
          </button>
        </div>

        <h3 className="map-controls__heading">街道の強調</h3>
        <label className="map-controls__field">
          <span>個別の街道</span>
          <select value={road} onChange={e => setRoad(e.target.value)}>
            <option value="">（なし）</option>
            {ROAD_LINKS.map(([a, b]) => (
              <option key={`${a}-${b}`} value={`${a}-${b}`}>{PLACE_NAMES.get(a)} – {PLACE_NAMES.get(b)}</option>
            ))}
          </select>
        </label>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={reverse} onChange={e => setReverse(e.target.checked)} />
          向きを逆にする
        </label>

        <h3 className="map-controls__heading">進撃</h3>
        <label className="map-controls__field">
          <span>出発地</span>
          <select value={from} onChange={e => setFrom(e.target.value)}>
            <option value="">選択中の都市{selected ? `（${PLACE_NAMES.get(selected)}）` : ''}</option>
            {cityOptions}
          </select>
        </label>
        <label className="map-controls__field">
          <span>目標（街道の最短経路を進む）</span>
          <select value={to} onChange={e => setTo(e.target.value)}>
            <option value="">（選択）</option>
            {cityOptions}
          </select>
        </label>
        <div className="map-controls__row">
          <label className="map-controls__field">
            <span>種類</span>
            <select value={kind} onChange={e => setKind(e.target.value as MarchKind)}>
              {Object.entries(MARCH_KINDS).map(([key, k]) => <option key={key} value={key}>{k.name}</option>)}
            </select>
          </label>
          <label className="map-controls__field">
            <span>名前</span>
            <input type="text" value={label} placeholder="空欄なら連番"
              onChange={e => setLabel(e.target.value)} />
          </label>
        </div>
        <label className="map-controls__field">
          <span>色</span>
          <select value={color} onChange={e => setColor(e.target.value)}>
            <option value="">出発地の勢力</option>
            {FACTION_LIST.map((f) => <option key={f.id} value={FACTION_COLORS[f.id]}>{f.name}</option>)}
            <option value={NEUTRAL_COLOR}>中立</option>
          </select>
        </label>
        <label className="map-controls__slider">
          <span>速度（ワールド単位/秒）<output>{speed}</output></span>
          <input type="range" min={4} max={80} step={1} value={speed} onChange={e => setSpeed(Number(e.target.value))} />
        </label>
        <label className="map-controls__toggle">
          <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />
          到着後に繰り返す
        </label>
        <div className="map-controls__presets">
          <button type="button" onClick={march} disabled={!map}>進撃開始</button>
          <button type="button" onClick={marchRandom} disabled={!map}>ランダム×5</button>
          <button type="button" onClick={clear} disabled={!map || marching === 0}>消去</button>
        </div>
        <p className="map-controls__note" role="status">
          {status || '軍団は凸の突き出た側が進行方向です。輸送部隊と使者のアイコンは仮の画像です（src/assets/marches/）。名前が空なら連番を付けます。'}
          {marching > 0 && ` （表示中 ${marching} 部隊）`}
        </p>
      </div>
    </details>
  )
}
