<script setup lang="ts">
import { computed } from 'vue'
import RailwayMapPanel from './RailwayMapPanel.vue'
import type {
  RailwayStationDetail,
  RailwayRouteDetail,
} from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    bounds: RailwayStationDetail['station']['bounds'] | null
    platforms?: Array<
      RailwayStationDetail['platforms'][number] & {
        pos1: { x: number; y: number; z: number } | null
        pos2: { x: number; y: number; z: number } | null
      }
    >
    color?: number | null
    height?: string | number
    loading?: boolean
  }>(),
  {
    platforms: () => [],
    height: '360px',
    loading: false,
  },
)

const geometry = computed(() => {
  const bounds = props.bounds
  if (!bounds) return null
  const { xMin, xMax, zMin, zMax } = bounds
  if (
    xMin == null ||
    xMax == null ||
    zMin == null ||
    zMax == null ||
    xMin === xMax ||
    zMin === zMax
  ) {
    return null
  }
  return {
    source: 'station-bounds' as const,
    points: [
      { x: xMin, z: zMin },
      { x: xMax, z: zMin },
      { x: xMax, z: zMax },
      { x: xMin, z: zMax },
      { x: xMin, z: zMin },
    ],
  }
})

const stops = computed<RailwayRouteDetail['stops']>(() =>
  props.platforms
    .map((platform, index) => {
      const position = computePlatformCenter(platform)
      if (!position) return null
      return {
        order: index,
        platformId: platform.id,
        platformName: platform.name ?? platform.id,
        stationId: platform.stationId,
        stationName: null,
        dwellTime: platform.dwellTime ?? null,
        position,
        bounds: null,
      }
    })
    .filter((stop): stop is RailwayRouteDetail['stops'][number] =>
      Boolean(stop),
    ),
)

function computePlatformCenter(
  platform: RailwayStationDetail['platforms'][number],
) {
  const pos1 = platform.pos1
  const pos2 = platform.pos2
  if (!pos1 || !pos2) return null
  return {
    x: Math.round((pos1.x + pos2.x) / 2),
    z: Math.round((pos1.z + pos2.z) / 2),
  }
}
</script>

<template>
  <RailwayMapPanel
    :geometry="geometry"
    :stops="stops"
    :color="color"
    :height="height"
    :loading="loading"
    :auto-focus="true"
    :combine-paths="true"
  />
</template>
