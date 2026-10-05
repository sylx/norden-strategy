import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { StrategyMap, type MapStats } from './engine/StrategyMap'
import { loadWorld } from './world/loadWorld'
import { ForestControls } from './ForestControls'
import { readForestSettings, saveForestSettings, type ForestSettings } from './engine/forestSettings'
import { ParchmentControls } from './ParchmentControls'
import { readParchmentSettings, saveParchmentSettings, type ParchmentSettings } from './engine/parchmentSettings'
import { TerrainControls } from './TerrainControls'
import { readTerrainSettings, saveTerrainSettings, type TerrainSettings } from './engine/terrainSettings'
import { RenderControls } from './RenderControls'
import { readRenderSettings, saveRenderSettings, type RenderSettings } from './engine/renderSettings'
import { PlaceControls } from './PlaceControls'
import { readPlaceSettings, savePlaceSettings, type PlaceSettings } from './engine/placeSettings'
import { SettingsExport } from './SettingsExport'
import { OverlayTestControls } from './OverlayTestControls'
import { PLACE_POSITIONS, PLACES } from './world/placeLayout'
import './MapView.css'

declare global {
  interface Window {
    /** Dev builds expose the map for debugging from the console */
    __strategyMap?: StrategyMap
  }
}

export interface MapViewProps {
  /** Selected city id ('' for none). Omit to let the view keep its own selection */
  selectedPlace?: string
  /** A click on the map selected a city ('' for a click on empty ground) */
  onSelectPlace?: (id: string) => void
  /** Show the tuning panels (default true). Without them nothing highlights the selection */
  showControls?: boolean
  /** The map once the world is generated, and null when it is disposed */
  onMapChange?: (map: StrategyMap | null) => void
}

export default function MapView({ selectedPlace: selectedProp, onSelectPlace, showControls = true, onMapChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<StrategyMap | null>(null)
  const [map, setMap] = useState<StrategyMap | null>(null)
  const [ownSelectedPlace, setOwnSelectedPlace] = useState('')
  const selectedPlace = selectedProp ?? ownSelectedPlace
  const setSelectedPlace = (id: string) => {
    setOwnSelectedPlace(id)
    onSelectPlace?.(id)
  }
  const selectPlace = useEffectEvent(setSelectedPlace)
  const notifyMap = useEffectEvent((value: StrategyMap | null) => onMapChange?.(value))
  const [forestSettings, setForestSettings] = useState(readForestSettings)
  const forestSettingsRef = useRef(forestSettings)
  const [parchmentSettings, setParchmentSettings] = useState(readParchmentSettings)
  const parchmentSettingsRef = useRef(parchmentSettings)
  const [terrainSettings, setTerrainSettings] = useState(readTerrainSettings)
  const terrainSettingsRef = useRef(terrainSettings)
  const [renderSettings, setRenderSettings] = useState(readRenderSettings)
  const renderSettingsRef = useRef(renderSettings)
  const [placeSettings, setPlaceSettings] = useState(readPlaceSettings)
  const placeSettingsRef = useRef(placeSettings)
  const [warnings, setWarnings] = useState<string[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<MapStats | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let map: StrategyMap | null = null
    let cancelled = false
    const job = loadWorld()
    job.promise.then((world) => {
      if (cancelled) return
      for (const warning of world.warnings) console.warn('[placeLayout]', warning)
      setWarnings(world.warnings)
      map = new StrategyMap(container, world, {
        forest: forestSettingsRef.current,
        parchment: parchmentSettingsRef.current,
        terrain: terrainSettingsRef.current,
        render: renderSettingsRef.current,
        places: placeSettingsRef.current,
      })
      mapRef.current = map
      setMap(map)
      notifyMap(map)
      map.onStats = setStats
      if (import.meta.env.DEV) window.__strategyMap = map
      setLoading(false)
    }, (err: unknown) => {
      console.error('World generation failed', err)
    })
    return () => {
      cancelled = true
      job.cancel()
      map?.dispose()
      mapRef.current = null
      setMap(null)
      if (map) notifyMap(null)
      if (window.__strategyMap === map) delete window.__strategyMap
    }
  }, [])

  // A click (not a drag) selects the city under it; in dev it also shows the image coordinates for placeLayout.ts
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null }
    const onUp = (e: PointerEvent) => {
      if (!down || !e.isPrimary || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
      down = null
      if (!mapRef.current) return
      selectPlace(mapRef.current.pickPlace(e.clientX, e.clientY) ?? '')
      if (!import.meta.env.DEV) return
      const point = mapRef.current.pickImagePoint(e.clientX, e.clientY)
      if (!point) return
      const text = `[${point[0]}, ${point[1]}]`
      setPicked(`${text}${describeNearest(point)}`)
      navigator.clipboard?.writeText(text).then(
        () => setPicked(`${text}${describeNearest(point)}（コピー済み）`), () => {})
    }
    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointerup', onUp)
    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointerup', onUp)
    }
  }, [])

  const changeForestSettings = (settings: ForestSettings) => {
    forestSettingsRef.current = settings
    setForestSettings(settings)
    mapRef.current?.setForestSettings(settings)
    saveForestSettings(settings)
  }

  const changeTerrainSettings = (settings: TerrainSettings) => {
    terrainSettingsRef.current = settings
    setTerrainSettings(settings)
    mapRef.current?.setTerrainSettings(settings)
    saveTerrainSettings(settings)
  }

  const changeRenderSettings = (settings: RenderSettings) => {
    renderSettingsRef.current = settings
    setRenderSettings(settings)
    mapRef.current?.setRenderSettings(settings)
    saveRenderSettings(settings)
  }

  const changePlaceSettings = (settings: PlaceSettings) => {
    placeSettingsRef.current = settings
    setPlaceSettings(settings)
    mapRef.current?.setPlaceSettings(settings)
    savePlaceSettings(settings)
  }

  const changeParchmentSettings = (settings: ParchmentSettings) => {
    parchmentSettingsRef.current = settings
    setParchmentSettings(settings)
    mapRef.current?.setParchmentSettings(settings)
    saveParchmentSettings(settings)
  }

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view__canvas" />
      {loading && <div className="map-view__loading">地図を生成中…</div>}
      {showControls && <aside className="map-controls" aria-label="地図の描画設定">
        <SettingsExport forest={forestSettings} parchment={parchmentSettings} terrain={terrainSettings}
          render={renderSettings} places={placeSettings} />
        <OverlayTestControls map={map} selected={selectedPlace} onSelect={setSelectedPlace} />
        <PlaceControls settings={placeSettings} onChange={changePlaceSettings} warnings={warnings} />
        <RenderControls settings={renderSettings} onChange={changeRenderSettings}
          width={stats?.width} height={stats?.height} fps={stats?.fps} />
        <ParchmentControls settings={parchmentSettings} onChange={changeParchmentSettings} />
        <ForestControls settings={forestSettings} onChange={changeForestSettings} textureStatus={stats?.forestTexture} />
        <TerrainControls settings={terrainSettings} onChange={changeTerrainSettings}
          vertices={stats?.vertices} tiles={stats?.tiles} />
      </aside>}
      {import.meta.env.DEV && stats && (
        <div className="map-view__stats">
          {stats.fps.toFixed(0)} fps / {stats.tiles} tiles / {(stats.vertices / 1000).toFixed(0)}k verts / {stats.trees.toLocaleString()} trees / dist {stats.distance.toFixed(0)}
          {picked && <div>クリック地点 {picked}</div>}
        </div>
      )}
    </div>
  )
}

/** Nearest city to an image-space point, e.g. " / P011 コルネリア から 120px" */
function describeNearest([x, y]: [number, number]): string {
  let nearest: { id: string; d: number } | null = null
  for (const [id, [px, py]] of Object.entries(PLACE_POSITIONS)) {
    const d = Math.hypot(px - x, py - y)
    if (!nearest || d < nearest.d) nearest = { id, d }
  }
  if (!nearest || nearest.d > 400) return ''
  const name = PLACES.find((p) => p.id === nearest.id)?.name ?? ''
  return ` / ${nearest.id} ${name} から ${Math.round(nearest.d)}px`
}
