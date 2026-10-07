import * as THREE from 'three'
import type { Heightfield } from '../world/Heightfield'
import type { Place } from '../world/placeLayout'
import { cardPixels, emblemUrl, PLACE_ART } from './Cities'
import { PLACE_DEFAULTS, type PlaceSettings } from './placeSettings'
import './PlaceLabels.css'

interface Label {
  place: Place
  ground: THREE.Vector3
  hasEmblem: boolean
  element: HTMLDivElement
  emblem: HTMLImageElement
  transform: string
  visible: boolean
}

/** City names (with the faction emblem) in an HTML layer that follows the cards */
export class PlaceLabels {
  private readonly layer = document.createElement('div')
  private readonly labels: Label[]
  private settings = { ...PLACE_DEFAULTS }
  private readonly tmp = new THREE.Vector3()

  constructor(container: HTMLElement, places: readonly Place[], heights: Heightfield, heightScale: number) {
    this.layer.className = 'place-labels'
    this.labels = places.map((place) => {
      const element = document.createElement('div')
      element.className = 'place-label'
      const emblem = document.createElement('img')
      emblem.alt = ''
      element.append(emblem, place.name)
      this.layer.append(element)
      const ground = new THREE.Vector3(place.x, heights.surfaceAt(place.x, place.z) * heightScale, place.z)
      const label: Label = { place, ground, hasEmblem: false, element, emblem, transform: '', visible: true }
      setOwner(label, place.belongTo)
      return label
    })
    container.append(this.layer)
  }

  /** Changes the factions the cities belong to (the emblem beside the name); cities not listed keep theirs */
  setOwners(owners: Readonly<Record<string, string | undefined>>) {
    for (const label of this.labels) {
      if (Object.hasOwn(owners, label.place.id)) setOwner(label, owners[label.place.id])
    }
  }

  applySettings(settings: PlaceSettings) {
    this.settings = { ...settings }
    this.layer.hidden = !settings.labels
    this.layer.style.setProperty('--place-label-emblem', `${settings.labelEmblemPx}px`)
  }

  /** Labels of these cities are drawn as selected */
  setHighlighted(ids: ReadonlySet<string>) {
    for (const label of this.labels) label.element.classList.toggle('place-label--selected', ids.has(label.place.id))
  }

  /**
   * pxScale: CSS px per world unit at view depth 1; art: visibility of the
   * city art against the emblems (Cities.update)
   */
  update(camera: THREE.PerspectiveCamera, width: number, height: number, pxScale: number, art: number) {
    if (!this.settings.labels) return
    // The emblem itself replaces the small one in the label
    this.layer.classList.toggle('place-labels--emblems', art < 0.5)
    const emblemOffset = this.settings.emblemPx * 0.5 + 2
    for (const label of this.labels) {
      const view = this.tmp.copy(label.ground).applyMatrix4(camera.matrixWorldInverse)
      const depth = -view.z
      let visible = depth > camera.near
      let transform = label.transform
      if (visible) {
        const ndc = this.tmp.copy(label.ground).project(camera)
        const cardArt = PLACE_ART[label.place.type]
        const size = cardPixels(label.place.type, depth, pxScale, this.settings)
        const x = (ndc.x * 0.5 + 0.5) * width
        // Just under the lowest part of the card's art, or under the emblem
        const cardOffset = (cardArt.anchor[1] - cardArt.bottom) * size - 4
        const offset = label.hasEmblem ? THREE.MathUtils.lerp(emblemOffset, cardOffset, art) : cardOffset
        const y = (0.5 - ndc.y * 0.5) * height + offset
        visible = x > -200 && x < width + 200 && y > -100 && y < height + 100
        transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateX(-50%)`
      }
      if (visible !== label.visible) {
        label.visible = visible
        label.element.hidden = !visible
      }
      if (visible && transform !== label.transform) {
        label.transform = transform
        label.element.style.transform = transform
      }
    }
  }

  dispose() {
    this.layer.remove()
  }
}

function setOwner(label: Label, owner: string | undefined) {
  const url = emblemUrl(owner)
  label.hasEmblem = Boolean(url)
  label.emblem.hidden = !url
  if (url) label.emblem.src = url
  else label.emblem.removeAttribute('src')
}
