<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { CountryCode } from './region-data'
import {
  countries,
  provinces,
  municipalities,
  singleLevelRegions,
  citiesMap,
  districtsMap,
} from './region-data'
import { loadChinaDivision } from './region-loader'

export type RegionValue = {
  country: CountryCode
  province?: string | null
  city?: string | null
  district?: string | null
}

const props = defineProps<{
  modelValue: RegionValue
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: RegionValue): void }>()

function update(partial: Partial<RegionValue>) {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

const isChina = computed(() => props.modelValue.country === 'CN')

// 动态数据（按需）
const dynamicProvinces = ref<string[] | null>(null)
const dynamicCitiesMap = ref<Record<string, string[]> | null>(null)
const dynamicDistrictsMap = ref<Record<string, string[]> | null>(null)
const dynamicMunicipalities = ref<string[] | null>(null)

async function ensureChinaDataLoaded() {
  if (!isChina.value) return
  if (dynamicProvinces.value) return
  const data = await loadChinaDivision()
  dynamicProvinces.value = data.provinces
  dynamicCitiesMap.value = data.citiesMap
  dynamicDistrictsMap.value = data.districtsMap
  dynamicMunicipalities.value = data.municipalities
}

onMounted(() => {
  if (isChina.value) void ensureChinaDataLoaded()
})
watch(
  () => props.modelValue.country,
  (c) => {
    if (c === 'CN') void ensureChinaDataLoaded()
  },
)

const provinceOptions = computed(() => dynamicProvinces.value ?? provinces)
const isMunicipality = computed(() => {
  const list = dynamicMunicipalities.value ?? municipalities
  return list.includes(props.modelValue.province || '')
})
const isSingleLevel = computed(() =>
  singleLevelRegions.includes(props.modelValue.province || ''),
)
const cityOptions = computed(() => {
  const p = props.modelValue.province || ''
  const map = dynamicCitiesMap.value ?? citiesMap
  return map[p] || []
})
const districtOptions = computed(() => {
  if (isSingleLevel.value) {
    return []
  }
  const map = dynamicDistrictsMap.value ?? districtsMap
  if (isMunicipality.value) {
    const city = props.modelValue.province || ''
    return map[city] || []
  }
  const city = props.modelValue.city || ''
  return map[city] || []
})

watch(
  () => [props.modelValue.province, isSingleLevel.value],
  ([, single]) => {
    if (single) {
      update({ city: null, district: null })
    }
  },
  { immediate: false },
)
</script>

<template>
  <div class="space-y-3">
    <div
      class="flex flex-col gap-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 md:flex-row md:items-center md:gap-6"
    >
      <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">
        常驻地区
      </div>
      <div class="flex-1 grid grid-cols-2 gap-3">
        <div>
          <USelectMenu
            class="w-full"
            :model-value="props.modelValue.country"
            :items="countries"
            value-key="code"
            label-key="name"
            :disabled="props.disabled"
            @update:model-value="
              (v: any) =>
                update({
                  country: v,
                  province: null,
                  city: null,
                  district: null,
                })
            "
          />
        </div>
        <div v-if="isChina">
          <USelectMenu
            class="w-full"
            :model-value="
              (props.modelValue.province ?? undefined) as string | undefined
            "
            :items="provinceOptions"
            :disabled="props.disabled"
            @update:model-value="
              (v: any) => update({ province: v, city: null, district: null })
            "
          />
        </div>
        <div v-if="!isMunicipality && !isSingleLevel">
          <USelectMenu
            class="w-full"
            :model-value="
              (props.modelValue.city ?? undefined) as string | undefined
            "
            :items="cityOptions"
            :disabled="props.disabled || !props.modelValue.province"
            @update:model-value="
              (v: any) => update({ city: v, district: null })
            "
          />
        </div>
        <div v-if="!isSingleLevel">
          <USelectMenu
            class="w-full"
            :model-value="
              (props.modelValue.district ?? undefined) as string | undefined
            "
            :items="districtOptions"
            :disabled="
              props.disabled || (!isMunicipality && !props.modelValue.city)
            "
            @update:model-value="(v: any) => update({ district: v })"
          />
        </div>
      </div>
    </div>
  </div>
</template>
