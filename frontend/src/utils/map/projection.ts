import L from 'leaflet'
import type {
  DynmapBlockPoint,
  DynmapBlockProjection,
  DynmapProjectionOptions,
} from './types'

const BASE_TILE_SIZE = 128

export function createDynmapProjection(
  options: DynmapProjectionOptions,
): DynmapBlockProjection {
  const tileSize = BASE_TILE_SIZE << (options.tileScale ?? 0)
  const zoomScale = 1 << options.mapZoomOut

  const toLatLng = (point: DynmapBlockPoint) => {
    const y = 0
    const lat =
      options.worldToMap[3] * point.x +
      options.worldToMap[4] * y +
      options.worldToMap[5] * point.z
    const lng =
      options.worldToMap[0] * point.x +
      options.worldToMap[1] * y +
      options.worldToMap[2] * point.z
    const normalizedLat = -((tileSize - lat) / zoomScale)
    const normalizedLng = lng / zoomScale
    return L.latLng(normalizedLat, normalizedLng)
  }

  const fromLatLng = (latlng: L.LatLng): DynmapBlockPoint => {
    const y = 0
    const lat = tileSize + latlng.lat * zoomScale
    const lng = latlng.lng * zoomScale
    const x =
      options.mapToWorld[0] * lng +
      options.mapToWorld[1] * lat +
      options.mapToWorld[2] * y
    const z =
      options.mapToWorld[6] * lng +
      options.mapToWorld[7] * lat +
      options.mapToWorld[8] * y
    return { x, z }
  }

  return {
    toLatLng,
    fromLatLng,
  }
}
