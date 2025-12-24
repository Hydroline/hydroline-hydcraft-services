<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useTransportationRailwayBindingsStore } from '@/stores/transportation/railwayBindings'
import RailwayCompanyBindingSection from '@/views/user/Transportation/railway/components/RailwayCompanyBindingSection.vue'
import type { RailwayEntity, RailwayRoute } from '@/types/transportation'

const railwayStore = useTransportationRailwayStore()
const bindingStore = useTransportationRailwayBindingsStore()
const toast = useToast()
const router = useRouter()

const activeType = ref<'route' | 'station' | 'depot'>('route')
const items = ref<Array<RailwayRoute | RailwayEntity>>([])
const total = ref(0)
const loading = ref(false)

const filters = reactive({
  search: '',
  serverId: '',
  railwayType: '',
  dimension: '',
  page: 1,
  pageSize: 20,
})

const selectedItem = ref<RailwayRoute | RailwayEntity | null>(null)
const bindingModalOpen = ref(false)
const selectedBindings = ref({
  operatorCompanyIds: [] as string[],
  builderCompanyIds: [] as string[],
})

const servers = computed(() => railwayStore.servers)
const serverOptions = computed(() => [
  { id: '', name: '全部服务端' },
  ...servers.value,
])

const railwayTypeOptions = computed(() => {
  const types = Array.from(
    new Set(servers.value.map((s) => s.railwayType).filter(Boolean)),
  )
  return ['', ...types]
})

async function fetchList() {
  loading.value = true
  try {
    if (activeType.value === 'route') {
      const response = await railwayStore.fetchRouteList({
        search: filters.search || undefined,
        serverId: filters.serverId || undefined,
        railwayType: filters.railwayType || undefined,
        dimension: filters.dimension || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      })
      items.value = response.items
      total.value = response.pagination.total
    } else if (activeType.value === 'station') {
      const response = await railwayStore.fetchStationList({
        search: filters.search || undefined,
        serverId: filters.serverId || undefined,
        railwayType: filters.railwayType || undefined,
        dimension: filters.dimension || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      })
      items.value = response.items
      total.value = response.pagination.total
    } else {
      const response = await railwayStore.fetchDepotList({
        search: filters.search || undefined,
        serverId: filters.serverId || undefined,
        railwayType: filters.railwayType || undefined,
        dimension: filters.dimension || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      })
      items.value = response.items
      total.value = response.pagination.total
    }
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '加载失败',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

async function openBindingModal(item: RailwayRoute | RailwayEntity) {
  selectedItem.value = item
  bindingModalOpen.value = true
  try {
    const payload = await bindingStore.fetchBindings({
      entityType: activeType.value.toUpperCase(),
      entityId: item.id,
      serverId: item.server.id,
      railwayType: item.railwayType,
      dimension: item.dimension ?? null,
    })
    selectedBindings.value = {
      operatorCompanyIds: payload.operatorCompanyIds,
      builderCompanyIds: payload.builderCompanyIds,
    }
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '加载绑定失败',
      color: 'red',
    })
  }
}

watch(
  () => [
    activeType.value,
    filters.search,
    filters.serverId,
    filters.railwayType,
    filters.dimension,
    filters.page,
    filters.pageSize,
  ],
  () => {
    void fetchList()
  },
)

onMounted(async () => {
  if (!railwayStore.servers.length) {
    await railwayStore.fetchServers()
  }
  await fetchList()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          编辑设施
        </h1>
        <p class="text-sm text-slate-500">批量查看并绑定运营/建设单位</p>
      </div>
      <UButton
        size="sm"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        size="sm"
        :variant="activeType === 'route' ? 'solid' : 'ghost'"
        :color="activeType === 'route' ? 'primary' : 'neutral'"
        @click="activeType = 'route'"
      >
        线路
      </UButton>
      <UButton
        size="sm"
        :variant="activeType === 'station' ? 'solid' : 'ghost'"
        :color="activeType === 'station' ? 'primary' : 'neutral'"
        @click="activeType = 'station'"
      >
        车站
      </UButton>
      <UButton
        size="sm"
        :variant="activeType === 'depot' ? 'solid' : 'ghost'"
        :color="activeType === 'depot' ? 'primary' : 'neutral'"
        @click="activeType = 'depot'"
      >
        车厂
      </UButton>
    </div>

    <div
      class="grid gap-3 rounded-2xl bg-white p-4 border border-slate-200/70 dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="grid gap-3 md:grid-cols-4">
        <UInput v-model="filters.search" placeholder="关键词" />
        <USelectMenu
          v-model="filters.serverId"
          :items="serverOptions"
          value-key="id"
          label-key="name"
          placeholder="服务端"
        />
        <USelectMenu
          v-model="filters.railwayType"
          :items="railwayTypeOptions"
          placeholder="Mod 类型"
        />
        <UInput v-model="filters.dimension" placeholder="维度" />
      </div>
    </div>

    <div
      class="rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-[800px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
        >
          <thead
            class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <tr>
              <th class="px-4 py-3">名称</th>
              <th class="px-4 py-3">服务端</th>
              <th class="px-4 py-3">维度</th>
              <th class="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td
                class="px-4 py-6 text-center text-sm text-slate-500"
                colspan="4"
              >
                正在加载…
              </td>
            </tr>
            <tr v-else-if="items.length === 0">
              <td
                class="px-4 py-6 text-center text-sm text-slate-500"
                colspan="4"
              >
                暂无数据
              </td>
            </tr>
            <tr
              v-for="item in items"
              :key="item.id"
              class="border-t border-slate-100 dark:border-slate-800"
            >
              <td class="px-4 py-3 text-slate-900 dark:text-white">
                {{ item.name || item.id }}
              </td>
              <td class="px-4 py-3">{{ item.server.name }}</td>
              <td class="px-4 py-3">{{ item.dimension || '—' }}</td>
              <td class="px-4 py-3">
                <UButton
                  size="2xs"
                  variant="ghost"
                  @click="openBindingModal(item)"
                >
                  绑定信息
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model="bindingModalOpen">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-800">
              {{ selectedItem?.name || selectedItem?.id || '设施绑定' }}
            </h3>
            <UButton
              size="2xs"
              variant="ghost"
              @click="bindingModalOpen = false"
            >
              关闭
            </UButton>
          </div>
          <RailwayCompanyBindingSection
            v-if="selectedItem"
            :entity-type="activeType.toUpperCase()"
            :entity-id="selectedItem.id"
            :server-id="selectedItem.server.id"
            :railway-type="selectedItem.railwayType"
            :dimension="selectedItem.dimension ?? null"
            :operator-company-ids="selectedBindings.operatorCompanyIds"
            :builder-company-ids="selectedBindings.builderCompanyIds"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
