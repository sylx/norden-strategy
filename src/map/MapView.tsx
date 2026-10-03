import { useEffect, useRef, useState } from 'react'
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
import { SettingsExport } from './SettingsExport'
import './MapView.css'

declare global {
  interface Window {
    /** Dev builds expose the map for debugging from the console */
    __strategyMap?: StrategyMap
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<StrategyMap | null>(null)
  const [forestSettings, setForestSettings] = useState(readForestSettings)
  const forestSettingsRef = useRef(forestSettings)
  const [parchmentSettings, setParchmentSettings] = useState(readParchmentSettings)
  const parchmentSettingsRef = useRef(parchmentSettings)
  const [terrainSettings, setTerrainSettings] = useState(readTerrainSettings)
  const terrainSettingsRef = useRef(terrainSettings)
  const [renderSettings, setRenderSettings] = useState(readRenderSettings)
  const renderSettingsRef = useRef(renderSettings)
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
      map = new StrategyMap(container, world, {
        forest: forestSettingsRef.current,
        parchment: parchmentSettingsRef.current,
        terrain: terrainSettingsRef.current,
        render: renderSettingsRef.current,
      })
      mapRef.current = map
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
      if (window.__strategyMap === map) delete window.__strategyMap
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
      <aside className="map-controls" aria-label="地図の描画設定">
        <SettingsExport forest={forestSettings} parchment={parchmentSettings} terrain={terrainSettings}
          render={renderSettings} />
        <RenderControls settings={renderSettings} onChange={changeRenderSettings}
          width={stats?.width} height={stats?.height} fps={stats?.fps} />
        <ParchmentControls settings={parchmentSettings} onChange={changeParchmentSettings} />
        <ForestControls settings={forestSettings} onChange={changeForestSettings} textureStatus={stats?.forestTexture} />
        <TerrainControls settings={terrainSettings} onChange={changeTerrainSettings}
          vertices={stats?.vertices} tiles={stats?.tiles} />
      </aside>
      {import.meta.env.DEV && stats && (
        <div className="map-view__stats">
          {stats.fps.toFixed(0)} fps / {stats.tiles} tiles / {(stats.vertices / 1000).toFixed(0)}k verts / {stats.trees.toLocaleString()} trees / dist {stats.distance.toFixed(0)}
        </div>
      )}
    </div>
  )
}
