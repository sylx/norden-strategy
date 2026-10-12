import { MAP_SEASONS, type MapSeason } from './engine/season'

interface Props {
  season: MapSeason
  onChange: (season: MapSeason) => void
}

export function SeasonControls({ season, onChange }: Props) {
  return (
    <details className="map-controls__panel" name="map-appearance">
      <summary>季節 <span>{MAP_SEASONS.find((s) => s.id === season)?.label}</span></summary>
      <div className="map-controls__body">
        <div className="map-controls__presets" role="group" aria-label="季節">
          {MAP_SEASONS.map(({ id, label }) => (
            <button type="button" key={id} aria-pressed={id === season} onClick={() => onChange(id)}>{label}</button>
          ))}
        </div>
        <p className="map-controls__note">ゲームではターンの月から決まります。ここでの切り替えは確認用で、保存しません。</p>
      </div>
    </details>
  )
}
