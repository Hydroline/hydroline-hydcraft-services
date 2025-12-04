import { DynmapMapController } from './dynmap'
import { hydcraftDynmapSource } from './config'
import type { DynmapTileSourceConfig } from './types'

export * from './types'
export { DynmapMapController } from './dynmap'
export { hydcraftDynmapSource } from './config'

export function createHydcraftDynmapMap(
  overrides?: Partial<DynmapTileSourceConfig>,
) {
  return new DynmapMapController({
    ...hydcraftDynmapSource,
    ...overrides,
  })
}
