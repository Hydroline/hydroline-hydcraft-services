<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { CountryCode } from './region-data'
import {
  countries,
  provinces,
  municipalities,
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

const provinceOptions = computed(
  () => dynamicProvinces.value ?? provinces,
)
const isMunicipality = computed(() => {
  const list = dynamicMunicipalities.value ?? municipalities
  return list.includes(props.modelValue.province || '')
})
const cityOptions = computed(() => {
  const p = props.modelValue.province || ''
  const map = dynamicCitiesMap.value ?? citiesMap
  return map[p] || []
})
const districtOptions = computed(() => {
  const map = dynamicDistrictsMap.value ?? districtsMap
  if (isMunicipality.value) {
    const city = props.modelValue.province || ''
    return map[city] || []
  }
  const city = props.modelValue.city || ''
  return map[city] || []
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-6">
      <div class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300">
        国家 / 地区
      </div>
      <div class="flex-1">
        <USelectMenu
          class="w-full"
          :model-value="props.modelValue.country"
          :items="countries"
          value-key="code"
          label-key="name"
          :disabled="props.disabled"
          @update:model-value="
            (v: any) =>
              update({ country: v, province: null, city: null, district: null })
          "
        />
      </div>
    </div>

    <template v-if="isChina">
      <div class="flex items-center gap-6">
        <div
          class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          省 / 直辖市
        </div>
        <div class="flex-1">
          <USelectMenu
            class="w-full"
            :model-value="(props.modelValue.province ?? undefined) as string | undefined"
            :items="provinceOptions"
            :disabled="props.disabled"
            @update:model-value="
              (v: any) => update({ province: v, city: null, district: null })
            "
          />
        </div>
      </div>
      <div v-if="!isMunicipality" class="flex items-center gap-6">
        <div
          class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          城市
        </div>
        <div class="flex-1">
          <USelectMenu
            class="w-full"
            :model-value="(props.modelValue.city ?? undefined) as string | undefined"
            :items="cityOptions"
            :disabled="props.disabled || !props.modelValue.province"
            @update:model-value="
              (v: any) => update({ city: v, district: null })
            "
          />
        </div>
      </div>
      <div class="flex items-center gap-6">
        <div
          class="w-40 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          区 / 县
        </div>
        <div class="flex-1">
          <USelectMenu
            class="w-full"
            :model-value="(props.modelValue.district ?? undefined) as string | undefined"
            :items="districtOptions"
            :disabled="
              props.disabled || (!isMunicipality && !props.modelValue.city)
            "
            @update:model-value="(v: any) => update({ district: v })"
          />
        </div>
      </div>
    </template>
  </div>
</template>
