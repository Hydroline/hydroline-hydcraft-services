import type { DynmapTileSourceConfig } from './types'

const FALLBACK_BASE_URL = 'https://map.nitrogen.hydcraft.cn/tiles'

const normalizeBaseUrl = (value: string | undefined | null) => {
  if (!value) return FALLBACK_BASE_URL
  return value.replace(/\/$/, '')
}

const tileBaseUrl = normalizeBaseUrl(import.meta.env.VITE_DYNMAP_TILE_BASE_URL)

export const hydcraftDynmapSource: DynmapTileSourceConfig = {
  tileBaseUrl,
  worldName: 'world',
  mapName: 'flat',
  tileExtension: 'jpg',
  minZoom: 0,
  maxZoom: 6,
  defaultZoom: 0,
  defaultCenter: { x: 811, z: 2933 },
  mapZoomIn: 1,
  mapZoomOut: 5,
  tileScale: 0,
  worldToMap: [
    4, 0, -2.4492935982947064e-16, -2.4492935982947064e-16, 0, -4, 0, 1, 0,
  ],
  mapToWorld: [
    0.25, -1.5308084989341915e-17, 0, 0, 0, 1, -1.5308084989341915e-17, -0.25,
    0,
  ],
}
