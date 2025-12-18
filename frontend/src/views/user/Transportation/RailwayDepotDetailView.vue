<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import RailwayDepotMapPanel from '@/views/user/Transportation/railway/components/RailwayDepotMapPanel.vue'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import type { RailwayDepotDetail } from '@/types/transportation'
import { getDimensionName } from '@/utils/minecraft/dimension-names'
import modpackCreateImg from '@/assets/resources/modpacks/Create.jpg'
import modpackMtrImg from '@/assets/resources/modpacks/MTR.png'

import type { RailwayRouteLogResult } from '@/types/transportation'

dayjs.locale('zh-cn')

const route = useRoute()
const router = useRouter()
const toast = useToast()
const transportationStore = useTransportationRailwayStore()

const detail = ref<RailwayDepotDetail | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const logs = ref<RailwayRouteLogResult | null>(null)
const logLoading = ref(true)
const logError = ref<string | null>(null)

const logContentRef = ref<HTMLElement | null>(null)
let lastLogContentHeight: number | null = null

const logPageSize = 8
const logPage = ref(1)
const logPageCount = computed(() => {
  const total = logs.value?.total ?? 0
  const pageSize = logs.value?.pageSize ?? logPageSize
  if (!total || !pageSize) return 1
  return Math.max(1, Math.ceil(total / pageSize))
})
const canGoLogPrev = computed(() => (logs.value?.page ?? logPage.value) > 1)
const canGoLogNext = computed(
  () => (logs.value?.page ?? logPage.value) < logPageCount.value,
)

const params = computed(() => {
  return {
    depotId: route.params.depotId as string | undefined,
    railwayType: route.params.railwayType as string | undefined,
    serverId: route.query.serverId as string | undefined,
    dimension: (route.query.dimension as string | undefined) ?? undefined,
  }
})

const depotName = computed(
  () => detail.value?.depot.name ?? detail.value?.depot.id ?? '未知车厂',
)
const serverBadge = computed(
  () => detail.value?.server.name ?? params.value.serverId ?? '—',
)
const dimensionName = computed(() =>
  getDimensionName(detail.value?.depot.dimension || params.value.dimension),
)

const associatedRoutes = computed(() => detail.value?.routes ?? [])

const modpackInfo = computed(() => {
  const modRaw = detail.value?.railwayType ?? params.value.railwayType
  const mod = typeof modRaw === 'string' ? modRaw.toUpperCase() : null
  if (mod === 'MTR') {
    return { label: 'MTR', image: modpackMtrImg }
  }
  if (mod === 'CREATE') {
    return { label: '机械动力', image: modpackCreateImg }
  }
  return { label: modRaw || '—', image: null as string | null }
})

const routeColor = computed(
  () => detail.value?.depot.color ?? detail.value?.routes?.[0]?.color ?? null,
)
const routeColorHex = computed(() => colorToHex(routeColor.value))

function colorToHex(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null
  const sanitized = Math.max(0, Math.floor(value))
  return `#${sanitized.toString(16).padStart(6, '0').slice(-6)}`
}

function getPlayerAvatar(playerName: string | null | undefined) {
  if (!playerName) return null
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(playerName)}/80`
}

function formatLogTimestamp(value: string | null | undefined) {
  if (!value) return '—'
  const d = dayjs(value)
  if (!d.isValid()) return value
  return d.format('YYYY-MM-DD HH:mm')
}

async function fetchDetail() {
  const { depotId, railwayType, serverId, dimension } = params.value
  if (!depotId || !railwayType || !serverId) {
    errorMessage.value = '缺少 depotId、serverId 或铁路类型参数'
    detail.value = null
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const result = await transportationStore.fetchDepotDetail(
      {
        id: depotId,
        railwayType,
        serverId,
        dimension,
      },
      true,
    )
    detail.value = result
  } catch (error) {
    console.error(error)
    errorMessage.value =
      error instanceof Error ? error.message : '加载失败，请稍后再试'
    toast.add({ title: errorMessage.value, color: 'error' })
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function fetchLogs(force = true) {
  const { depotId, railwayType, serverId, dimension } = params.value
  if (!depotId || !serverId || !railwayType) {
    logs.value = null
    return
  }
  logLoading.value = true
  logError.value = null
  try {
    const result = await transportationStore.fetchDepotLogs(
      {
        id: depotId,
        railwayType,
        serverId,
        dimension,
        limit: logPageSize,
        page: Math.max(1, logPage.value),
      },
      force,
    )
    logs.value = result
    logPage.value = Math.max(1, result.page ?? logPage.value)
  } catch (error) {
    console.error(error)
    logError.value = error instanceof Error ? error.message : '日志加载失败'
    toast.add({ title: logError.value, color: 'error' })
  } finally {
    logLoading.value = false
  }
}

function goBack() {
  router.push({ name: 'transportation.railway' })
}

function goRoute(routeId: string) {
  if (!detail.value) return
  router.push({
    name: 'transportation.railway.route',
    params: {
      railwayType: detail.value.railwayType.toLowerCase(),
      routeId,
    },
    query: {
      serverId: detail.value.server.id,
      dimension: detail.value.depot.dimension,
    },
  })
}

function goPlayerProfile(playerName: string | null | undefined) {
  if (!playerName) return
  router.push({
    name: 'player.name',
    params: { playerName },
  })
}

const frequencyLabel = computed(() => {
  const frequencies = detail.value?.depot.frequencies ?? []
  if (!frequencies?.length) return '—'
  const total = frequencies.reduce((sum, current) => sum + current, 0)
  return `${frequencies.length} 段 · 总计 ${total}`
})

watch(
  () => [logs.value?.page, logs.value?.entries.length] as const,
  async () => {
    await nextTick()
    const el = logContentRef.value
    if (!el) return

    const nextHeight = el.getBoundingClientRect().height
    if (lastLogContentHeight == null) {
      lastLogContentHeight = nextHeight
      return
    }
    if (Math.abs(nextHeight - lastLogContentHeight) < 1) return

    el.style.height = `${lastLogContentHeight}px`
    el.style.overflow = 'hidden'
    // force reflow
    void el.getBoundingClientRect()
    el.style.transition = 'height 200ms ease'
    el.style.height = `${nextHeight}px`

    window.setTimeout(() => {
      if (el !== logContentRef.value) return
      el.style.transition = ''
      el.style.height = ''
      el.style.overflow = ''
    }, 220)

    lastLogContentHeight = nextHeight
  },
  { flush: 'post' },
)

function goLogPrev() {
  if (!canGoLogPrev.value) return
  logPage.value = Math.max(1, logPage.value - 1)
  void fetchLogs(false)
}

function goLogNext() {
  if (!canGoLogNext.value) return
  logPage.value = Math.min(logPageCount.value, logPage.value + 1)
  void fetchLogs(false)
}

watch(
  () => route.fullPath,
  () => {
    logPage.value = 1
    void fetchDetail()
    void fetchLogs()
  },
)

onMounted(() => {
  void fetchDetail()
  void fetchLogs()
})
</script>

<template>
  <div class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      icon="i-lucide-arrow-left"
      @click="goBack"
    >
      返回概览
    </UButton>

    <div>
      <div class="flex flex-col gap-2">
        <p class="text-sm uppercase text-slate-500">铁路车厂信息</p>
        <div>
          <p class="text-4xl font-semibold text-slate-900 dark:text-white">
            {{ depotName.split('|')[0] }}

            <span class="inline-flex items-center gap-1.5">
              <UTooltip
                v-if="modpackInfo.image && modpackInfo.label"
                :text="`${modpackInfo.label} Mod`"
              >
                <img
                  :src="modpackInfo.image"
                  :alt="modpackInfo.label"
                  class="h-5 w-6 object-cover"
                />
              </UTooltip>
            </span>
          </p>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <UTooltip :text="`线路色 ${routeColorHex}`">
              <span
                class="block h-3 w-3 rounded-full"
                :style="
                  routeColorHex ? { backgroundColor: routeColorHex } : undefined
                "
              ></span>
            </UTooltip>

            <span
              class="text-lg font-semibold text-slate-600 dark:text-slate-300"
              v-if="depotName.split('|')[1]"
            >
              {{ depotName.split('|')[1] }}
            </span>

            <UBadge
              v-if="depotName.split('||').length > 1"
              variant="soft"
              size="sm"
              color="neutral"
            >
              {{ depotName.split('||')[1].split('|')[0] }}
            </UBadge>
            <UBadge variant="soft" size="sm">{{ serverBadge }}</UBadge>
            <UBadge variant="soft" size="sm">{{
              dimensionName || '未知维度'
            }}</UBadge>
          </div>
        </div>
      </div>
    </div>

    <RailwayDepotMapPanel
      :bounds="detail?.depot.bounds ?? null"
      :color="detail?.depot.color ?? detail?.routes[0]?.color ?? null"
      :loading="loading"
      height="460px"
    />

    <div v-if="loading" class="text-sm text-slate-500">
      <UIcon
        name="i-lucide-loader-2"
        class="inline-block h-5 w-5 animate-spin text-slate-400"
      />
    </div>
    <div v-else-if="detail" class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 class="text-lg text-slate-600 dark:text-slate-300">基本信息</h3>
          <dl
            class="mt-4 space-y-2 text-sm rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
          >
            <div class="flex justify-between gap-4">
              <dt>车厂 ID</dt>
              <dd class="font-mono text-slate-900 dark:text-white">
                {{ detail.depot.id }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>服务线路</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ detail.depot.routeIds.length }} 条
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>实时调度</dt>
              <dd class="text-slate-900 dark:text-white">
                {{
                  detail.depot.useRealTime == null
                    ? '—'
                    : detail.depot.useRealTime
                      ? '是'
                      : '否'
                }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>巡航高度</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ detail.depot.cruisingAltitude ?? '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt>班次频率</dt>
              <dd class="text-slate-900 dark:text-white">
                {{ frequencyLabel }}
              </dd>
            </div>
          </dl>

          <div class="mt-6 space-y-3">
            <div
              class="flex flex-col lg:flex-row lg:items-center lg:justify-betweenx"
            >
              <h3 class="text-lg text-slate-600 dark:text-slate-300">
                线路修改日志
              </h3>
              <div class="flex items-center gap-2 mx-auto lg:mx-0 lg:ml-auto">
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-chevron-left"
                  :disabled="logLoading || !canGoLogPrev"
                  @click="goLogPrev"
                >
                  上一页
                </UButton>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  第 {{ logs?.page ?? logPage }} / {{ logPageCount }} 页
                </span>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-chevron-right"
                  :disabled="logLoading || !canGoLogNext"
                  @click="goLogNext"
                >
                  下一页
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-refresh-cw"
                  :disabled="logLoading"
                  @click="fetchLogs(true)"
                >
                  刷新
                </UButton>
              </div>
            </div>

            <div>
              <div ref="logContentRef" class="relative">
                <p v-if="!logs && logLoading" class="text-sm text-slate-500">
                  <UIcon
                    name="i-lucide-loader-2"
                    class="inline-block h-5 w-5 animate-spin text-slate-400"
                  />
                </p>
                <p v-else-if="!logs && logError" class="text-sm text-red-500">
                  {{ logError }}
                </p>
                <p v-else-if="!logs" class="text-sm text-slate-500">
                  暂无日志记录。
                </p>
                <div v-else>
                  <p
                    v-if="logs.entries.length === 0"
                    class="text-sm text-slate-500"
                  >
                    暂无日志记录。
                  </p>
                  <div v-else class="space-y-3">
                    <div
                      v-for="entry in logs.entries"
                      :key="entry.id"
                      class="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition duration-250 outline-2 outline-transparent hover:outline-primary"
                      @click="goPlayerProfile(entry.playerName)"
                    >
                      <div class="flex items-center gap-3">
                        <button
                          type="button"
                          class="shrink-0"
                          @click="goPlayerProfile(entry.playerName)"
                        >
                          <img
                            v-if="getPlayerAvatar(entry.playerName)"
                            :src="
                              getPlayerAvatar(entry.playerName) || undefined
                            "
                            class="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700"
                            alt="player avatar"
                          />
                          <div
                            v-else
                            class="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                          >
                            无
                          </div>
                        </button>
                        <div>
                          <p
                            class="text-sm font-semibold text-slate-900 dark:text-white"
                          >
                            {{ entry.playerName || '未知玩家' }}
                          </p>
                          <p class="text-xs text-slate-500">
                            {{ entry.changeType || '—' }} ·
                            {{
                              entry.entryName ||
                              entry.className ||
                              entry.entryId
                            }}
                          </p>
                          <p class="text-xs text-slate-400">
                            {{ formatLogTimestamp(entry.timestamp) }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Transition
                    enter-active-class="transition-opacity duration-200"
                    enter-from-class="opacity-0"
                    enter-to-class="opacity-100"
                    leave-active-class="transition-opacity duration-200"
                    leave-from-class="opacity-100"
                    leave-to-class="opacity-0"
                  >
                    <div
                      v-if="logLoading"
                      class="absolute inset-0 rounded-xl bg-white/60 dark:bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center"
                    >
                      <UIcon
                        name="i-lucide-loader-2"
                        class="h-5 w-5 animate-spin text-slate-400"
                      />
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg text-slate-600 dark:text-slate-300">服务线路</h3>
          <div
            class="mt-3 space-y-2 rounded-xl px-4 py-3 bg-white border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-700/60"
          >
            <p
              v-if="associatedRoutes.length === 0"
              class="text-sm text-slate-500"
            >
              暂无线路数据
            </p>
            <div class="divide-y divide-slate-100 dark:divide-slate-800/60">
              <div
                v-for="route in associatedRoutes"
                :key="route.id"
                class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p
                    class="flex items-baseline gap-1 font-medium text-slate-900 dark:text-white"
                  >
                    <span>
                      {{ route.name?.split('|')[0] }}
                    </span>

                    <span
                      class="text-xs text-slate-700 dark:text-slate-500"
                      v-if="route.name?.split('|')[1]"
                    >
                      {{ route.name?.split('|')[1] }}
                    </span>
                  </p>
                  <p class="text-xs text-slate-500 flex items-center gap-1">
                    <UBadge
                      variant="soft"
                      size="sm"
                      v-if="(route.name?.split('||').length ?? 0) > 1"
                    >
                      {{ route.name?.split('||')[1] }}
                    </UBadge>

                    <UBadge variant="soft" color="neutral" size="sm">
                      {{ route.server.name }}
                    </UBadge>

                    <UBadge variant="soft" color="neutral" size="sm">
                      {{ getDimensionName(route.dimension) || '未知维度' }}
                    </UBadge>
                  </p>
                </div>
                <UButton size="xs" variant="soft" @click="goRoute(route.id)">
                  查看
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
