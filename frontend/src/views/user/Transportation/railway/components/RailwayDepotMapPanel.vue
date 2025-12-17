<script setup lang="ts">
import { computed } from 'vue'
import RailwayMapPanel from './RailwayMapPanel.vue'
import type { RailwayDepotDetail } from '@/types/transportation'

const props = withDefaults(
  defineProps<{
    bounds: RailwayDepotDetail['depot']['bounds'] | null
    color?: number | null
    height?: string | number
    loading?: boolean
  }>(),
  {
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
</script>

<template>
  <RailwayMapPanel
    :geometry="geometry"
    :color="color"
    :height="height"
    :loading="loading"
    :auto-focus="true"
    :combine-paths="true"
  />
</template>
