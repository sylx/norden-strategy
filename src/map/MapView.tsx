import { useEffect, useRef, useState } from 'react'
import { StrategyMap, type MapStats } from './engine/StrategyMap'
import { loadWorld } from './world/loadWorld'
import './MapView.css'

declare global {
  interface Window {
    /** Dev builds expose the map for debugging from the console */
    __strategyMap?: StrategyMap
  }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
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
      map = new StrategyMap(container, world)
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
      if (window.__strategyMap === map) delete window.__strategyMap
    }
  }, [])

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view__canvas" />
      {loading && <div className="map-view__loading">地図を生成中…</div>}
      {import.meta.env.DEV && stats && (
        <div className="map-view__stats">
          {stats.fps.toFixed(0)} fps / {stats.tiles} tiles / dist {stats.distance.toFixed(0)}
        </div>
      )}
    </div>
  )
}
