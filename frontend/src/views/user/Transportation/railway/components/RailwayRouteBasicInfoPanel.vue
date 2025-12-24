<script setup lang="ts">
import type {
  RailwayRouteDetail,
  RailwaySystemRef,
} from '@/types/transportation'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'

defineProps<{
  detail: RailwayRouteDetail
  routeColorHex: string | null
  modpackLabel: string
  modpackImage: string | null
  operatorCompanyIds: string[]
  builderCompanyIds: string[]
  systems?: RailwaySystemRef[]
}>()
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-lg text-slate-600 dark:text-slate-300">基本信息</h3>
    <div
      class="grid gap-2 rounded-xl border border-slate-200/60 bg-white px-4 py-3 dark:border-slate-800/60 dark:bg-slate-700/60"
    >
      <div class="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
        <RailwayCompanyBindingSection
          entity-type="ROUTE"
          :entity-id="detail.route.id"
          :server-id="detail.server.id"
          :railway-type="detail.railwayType"
          :dimension="detail.dimension"
          :operator-company-ids="operatorCompanyIds"
          :builder-company-ids="builderCompanyIds"
        />

        <div class="flex justify-between">
          <span>线路 ID</span>
          <span class="font-mono text-slate-900 dark:text-white">
            {{ detail.route.id }}
          </span>
        </div>
        <div class="flex justify-between">
          <span>线路长度</span>
          <span class="text-slate-900 dark:text-white">
            {{
              detail.metadata.lengthKm != null
                ? `${detail.metadata.lengthKm} km`
                : '—'
            }}
          </span>
        </div>
        <div class="flex justify-between">
          <span>运输模式</span>
          <span class="text-slate-900 dark:text-white">
            {{ detail.route.transportMode || '—' }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span>线路颜色</span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-slate-900 dark:text-white">
              {{ routeColorHex }}
            </span>
            <span
              class="h-3.5 w-3.5 rounded-full"
              :style="
                routeColorHex ? { backgroundColor: routeColorHex } : undefined
              "
            ></span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span>Mod 类型</span>
          <div class="flex items-center gap-2">
            <span class="-mr-1 text-slate-900 dark:text-white">
              {{ modpackLabel }}
            </span>
            <img
              v-if="modpackImage"
              :src="modpackImage"
              :alt="modpackLabel"
              class="h-5 w-6 object-cover"
            />
          </div>
        </div>
        <div class="flex justify-between">
          <span>站点数量</span>
          <span class="text-slate-900 dark:text-white">
            {{ detail.platforms.length }} 站
          </span>
        </div>
        <div class="flex justify-between">
          <span>几何点数</span>
          <span class="text-slate-900 dark:text-white">
            {{ detail.geometry.points.length }}
          </span>
        </div>
      </div>

      <div v-if="systems?.length" class="pt-2 border-t border-slate-200/70">
        <p class="text-xs font-semibold text-slate-500 uppercase">
          所属线路系统
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <RouterLink
            v-for="system in systems"
            :key="system.id"
            :to="{
              name: 'transportation.railway.system.detail',
              params: { systemId: system.id },
            }"
            class="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800/70 dark:bg-slate-700/60 dark:text-slate-200"
          >
            <img
              v-if="system.logoUrl"
              :src="system.logoUrl"
              :alt="system.name"
              class="h-4 w-4 rounded-full object-cover"
            />
            <span>{{ system.name }}</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
