<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import dayjs from 'dayjs'
import JsBarcode from 'jsbarcode'
import type { SkinViewer } from 'skinview3d'
import { playerStatusOptions } from '@/constants/status'
import type {
  PlayerMinecraftResponse,
  PlayerStatusSnapshot,
  PlayerRegionResponse,
  PlayerStatsResponse,
  PlayerSummary,
} from '@/types/portal'
import {
  countries,
  municipalities,
} from '@/views/user/Profile/components/region-data'
import PlayerBindingDetailDialog from './PlayerBindingDetailDialog.vue'
import PlayerGameStatsPanel from './PlayerGameStatsPanel.vue'
import { usePlayerPortalStore } from '@/stores/playerPortal'

type PlayerAuthmeBinding = PlayerSummary['authmeBindings'][number]

const props = defineProps<{
  isViewingSelf: boolean
  summary: PlayerSummary | null
  minecraft: PlayerMinecraftResponse | null
  stats: PlayerStatsResponse | null
  formatDateTime: (value: string | null | undefined) => string
  formatMetricValue: (value: number, unit: string) => string
  region: PlayerRegionResponse | null
  statusSnapshot: PlayerStatusSnapshot | null
  formatIpLocation: (value: string | null | undefined) => string
  serverOptions: Array<{ id: string; displayName: string }>
}>()

const playerPortalStore = usePlayerPortalStore()
const isPlayerLogged = computed(() => Boolean(playerPortalStore.logged))
const toast = useToast()
const isRefreshingStats = ref(false)

function resolveBindingIdentifier(
  binding:
    | {
        username: string
        realname?: string | null
      }
    | null
    | undefined,
) {
  if (!binding) return null
  const trimmedRealname = binding.realname?.trim()
  if (trimmedRealname) return trimmedRealname
  const trimmedUsername = binding.username?.trim()
  return trimmedUsername || null
}

const primaryAuthmeIdentifier = computed(() =>
  resolveBindingIdentifier(props.summary?.authmeBindings?.[0]),
)
const primaryAvatarUrl = computed(() => {
  const identifier = primaryAuthmeIdentifier.value
  if (!identifier) return null
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
    identifier,
  )}/64`
})

const barcodeCanvas = ref<HTMLCanvasElement | null>(null)

const skinCanvasRefs = ref<Record<string, HTMLCanvasElement | null>>({})
const skinViewers = ref<Record<string, SkinViewer | null>>({})
let skinviewModule: typeof import('skinview3d') | null = null

async function ensureSkinview() {
  if (!skinviewModule) {
    skinviewModule = await import('skinview3d')
  }
  return skinviewModule
}

async function updateSkinViewer(bindingId: string, playerIdentifier: string) {
  if (typeof window === 'undefined') return
  if (!playerIdentifier) return
  const canvas = skinCanvasRefs.value[bindingId]
  if (!canvas) return

  try {
    const skinview = await ensureSkinview()
    const width = canvas.clientWidth > 0 ? canvas.clientWidth : 160
    const height =
      canvas.clientHeight > 0 ? canvas.clientHeight : Math.round(width * 1.2)
    canvas.width = width
    canvas.height = height

    if (!skinViewers.value[bindingId]) {
      const instance = new skinview.SkinViewer({
        canvas,
        width,
        height,
        skin: `https://mc-heads.hydcraft.cn/skin/${encodeURIComponent(
          playerIdentifier,
        )}`,
      })
      instance.autoRotate = true
      instance.zoom = 0.95
      if (instance.controls) {
        instance.controls.enableZoom = false
        instance.controls.enablePan = false
      }
      const idleAnimation = new skinview.IdleAnimation()
      instance.animation = idleAnimation
      skinViewers.value[bindingId] = instance
    } else {
      const viewer = skinViewers.value[bindingId]
      if (viewer) {
        viewer.width = width
        viewer.height = height
        viewer.loadSkin(
          `https://mc-heads.hydcraft.cn/skin/${encodeURIComponent(
            playerIdentifier,
          )}`,
        )
      }
    }
  } catch (error) {
    console.error('Failed to initialize skinview3d:', error)
  }
}

function cleanupAllSkinViewers() {
  Object.values(skinViewers.value).forEach((viewer) => {
    if (viewer) {
      try {
        viewer.dispose()
      } catch (error) {
        console.error('Error disposing viewer:', error)
      }
    }
  })
  skinViewers.value = {}
  skinCanvasRefs.value = {}
}

watch(
  () => props.summary?.authmeBindings,
  async (bindings) => {
    if (!bindings || bindings.length === 0) {
      cleanupAllSkinViewers()
      return
    }
    await nextTick()
    bindings.forEach((binding) => {
      const identifier = resolveBindingIdentifier(binding)
      if (identifier) {
        void updateSkinViewer(binding.id, identifier)
      }
    })
  },
  { immediate: true, deep: false },
)

onBeforeUnmount(() => {
  cleanupAllSkinViewers()
})

const generateBarcode = async () => {
  await nextTick()

  const canvas = barcodeCanvas.value
  const piic = props.summary?.piic

  if (!canvas || !piic) {
    return
  }

  try {
    JsBarcode(canvas, piic, {
      format: 'CODE128',
      height: 35,
      displayValue: false,
      background: 'transparent',
      margin: 2,
    })
  } catch (error) {
    console.error('Failed to generate PIIC barcode', error)
  }
}

watch(
  [() => props.summary?.piic, () => barcodeCanvas.value],
  () => {
    void generateBarcode()
  },
  { immediate: true },
)

const rawBirthday = computed(
  () =>
    props.summary?.birthday ?? props.summary?.profileExtra?.birthday ?? null,
)

const formattedBirthday = computed(() => {
  const raw = rawBirthday.value
  if (!raw) {
    return null
  }
  const parsed = dayjs(raw)
  return parsed.isValid() ? parsed.format('YYYY/MM/DD') : null
})

const fallbackRegion = computed(() => props.summary?.profileExtra ?? {})
const regionCountryCode = computed(
  () => props.region?.country ?? fallbackRegion.value.regionCountry ?? 'OTHER',
)
const regionCountryLabel = computed(() => {
  if (!regionCountryCode.value) {
    return ''
  }
  const mapped = countries.find(
    (entry) => entry.code === regionCountryCode.value,
  )?.name
  if (mapped) return mapped
  if (regionCountryCode.value === 'HK') return '香港特别行政区'
  if (regionCountryCode.value === 'MO') return '澳门特别行政区'
  if (regionCountryCode.value === 'TW') return '台湾地区'
  return regionCountryCode.value
})

const regionProvince = computed(
  () => props.region?.province ?? fallbackRegion.value.regionProvince ?? '',
)
const regionCity = computed(
  () => props.region?.city ?? fallbackRegion.value.regionCity ?? '',
)
const regionDistrict = computed(
  () => props.region?.district ?? fallbackRegion.value.regionDistrict ?? '',
)

const isChina = computed(() => regionCountryCode.value === 'CN')
const isHkMoTw = computed(() => {
  const province = regionProvince.value
  return (
    province === '香港特别行政区' ||
    province === '澳门特别行政区' ||
    province === '台湾地区'
  )
})

const isMunicipality = computed(() => {
  if (!regionProvince.value) return false
  return municipalities.includes(regionProvince.value)
})

const hasRegionData = computed(() => {
  return Boolean(
    regionCountryCode.value ||
      regionProvince.value ||
      regionCity.value ||
      regionDistrict.value,
  )
})

const hasSummary = computed(() => Boolean(props.summary))

const showCityLevel = computed(() => {
  if (!isChina.value) return false
  if (!regionCity.value) return false
  if (isMunicipality.value) return false
  return true
})

const showCountryLabel = computed(() => {
  if (!regionCountryCode.value) return false
  if (isChina.value && !isHkMoTw.value) {
    return false
  }
  return true
})

const displayCountryLabel = computed(() => {
  if (!showCountryLabel.value) return ''
  if (isChina.value) {
    return '中国'
  }
  return regionCountryLabel.value
})

const showProvince = computed(
  () => isChina.value && Boolean(regionProvince.value),
)
const showDistrict = computed(
  () => isChina.value && Boolean(regionDistrict.value),
)

const summaryLastLoginLocationDisplay = computed(() => {
  if (!props.summary?.lastLoginLocation) return ''
  return props.formatIpLocation(props.summary.lastLoginLocation)
})

const statusLabel = computed(() => {
  const code = props.statusSnapshot?.status
  if (!code) return ''
  const option = playerStatusOptions.find((item) => item.value === code)
  return option?.label ?? code
})

onMounted(() => {
  void generateBarcode()
})

const detailDialogOpen = ref(false)
const selectedBinding = ref<PlayerAuthmeBinding | null>(null)

const selectedBindingLuckperms = computed(() => {
  const binding = selectedBinding.value
  const luckperms = props.summary?.luckperms
  if (!binding || !luckperms) return null
  return (
    luckperms.find((entry) => matchBindingLuckperms(binding, entry)) ?? null
  )
})

function openBindingDetail(binding: PlayerAuthmeBinding) {
  selectedBinding.value = binding
  detailDialogOpen.value = true
}

function handleDetailDialogOpenChange(value: boolean) {
  detailDialogOpen.value = value
  if (!value) {
    selectedBinding.value = null
  }
}

function matchBindingLuckperms(
  binding: PlayerAuthmeBinding,
  entry: PlayerSummary['luckperms'][number],
) {
  const bindingUuid = normalizeComparisonKey(binding.uuid)
  const entryUuid = normalizeComparisonKey(entry.uuid)
  if (bindingUuid && entryUuid) {
    return bindingUuid === entryUuid
  }
  const bindingUsername = normalizeComparisonKey(binding.username)
  const entryUsername = normalizeComparisonKey(entry.authmeUsername)
  return Boolean(
    bindingUsername && entryUsername && bindingUsername === entryUsername,
  )
}

function normalizeComparisonKey(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}

async function handleStatsRefresh() {
  if (isRefreshingStats.value) return
  isRefreshingStats.value = true
  try {
    const period = props.stats?.period ?? '30d'
    await playerPortalStore.refreshStats(period)
    toast.add({ title: '游戏统计信息已刷新', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '刷新失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    isRefreshingStats.value = false
  }
}
</script>

<template>
  <div class="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
    <div class="space-y-8 md:pt-6">
      <div class="space-y-3">
        <div class="flex flex-col gap-3">
          <div class="flex gap-2 select-none">
            <template v-if="props.summary">
              <img
                v-if="props.summary.avatarUrl"
                :src="props.summary.avatarUrl"
                :alt="props.summary.displayName ?? props.summary.email"
                class="h-18 w-18 rounded-xl border border-slate-200 object-cover dark:border-slate-700 shadow"
              />

              <img
                v-if="primaryAvatarUrl"
                :src="primaryAvatarUrl"
                :alt="
                  primaryAuthmeIdentifier ??
                  props.summary?.authmeBindings?.[0]?.username ??
                  'MC Avatar'
                "
                class="h-18 w-18 rounded-xl border border-slate-200 object-cover dark:border-slate-700 shadow"
              />
            </template>
            <template v-else>
              <USkeleton
                class="h-18 w-18 rounded-xl border border-slate-200 bg-slate-200/70 dark:bg-slate-700"
              />
              <USkeleton
                class="h-18 w-18 rounded-xl border border-slate-200 bg-slate-200/70 dark:bg-slate-700"
              />
            </template>

            <div class="flex items-center">
              <UTooltip
                v-if="props.summary?.authmeBindings?.length > 1"
                :text="`共 ${props.summary?.authmeBindings?.length ?? 0} 个账户`"
              >
                <UButton
                  class="w-6 h-6 flex justify-center items-center rounded-full mt-auto"
                  variant="ghost"
                  size="sm"
                >
                  ...
                </UButton>
              </UTooltip>
            </div>
          </div>

          <div>
            <div
              class="flex items-center gap-1 font-semibold text-slate-700 dark:text-white"
            >
              <template v-if="props.summary">
                <div>
                  <span class="text-2xl">
                    {{
                      props.summary.minecraftProfiles[0]?.nickname ||
                      props.summary.authmeBindings[0]?.realname
                    }}
                  </span>
                  <span
                    class="mx-2 select-none"
                    v-if="
                      props.summary.authmeBindings[0]?.realname &&
                      props.summary.minecraftProfiles[0]?.nickname
                    "
                    >/</span
                  >
                  <span
                    v-if="
                      props.summary.authmeBindings[0]?.realname &&
                      props.summary.minecraftProfiles[0]?.nickname
                    "
                  >
                    {{ props.summary.authmeBindings[0]?.realname }}
                  </span>
                </div>

                <div class="flex items-center ml-1">
                  <UButton
                    variant="soft"
                    color="error"
                    class="flex justify-center items-center px-1 py-0.5"
                    size="xs"
                  >
                    <UIcon name="i-lucide-heart" class="h-3 w-3" />
                    <span> 0 </span>
                  </UButton>
                </div>
              </template>
              <template v-else>
                <div class="flex-1 flex flex-col gap-1">
                  <USkeleton class="h-6 w-32" />
                  <USkeleton class="h-4 w-24" />
                </div>
                <div class="flex items-center gap-2">
                  <USkeleton class="h-6 w-6 rounded-full" />
                  <USkeleton class="h-6 w-6 rounded-full" />
                </div>
              </template>
            </div>

            <template v-if="props.summary">
              <div class="text-xs text-slate-500 dark:text-slate-500 mt-1">
                {{ props.summary.id }}
              </div>
            </template>
            <template v-else>
              <USkeleton class="h-4 w-40 mt-1" />
            </template>

            <template v-if="props.summary?.rbacLabels?.length">
              <div class="flex flex-wrap gap-1 mt-1">
                <UBadge
                  v-for="label in props.summary?.rbacLabels"
                  :key="label.id"
                  variant="soft"
                  size="sm"
                  :style="
                    label.color
                      ? {
                          backgroundColor: label.color,
                          color: '#ffffff',
                          borderColor: 'transparent',
                        }
                      : undefined
                  "
                >
                  {{ label.name || label.key }}
                </UBadge>
              </div>
            </template>
            <template v-else-if="!props.summary">
              <div class="flex gap-2 mt-1">
                <USkeleton class="h-5 w-16" />
                <USkeleton class="h-5 w-16" />
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="flex flex-col mb-1 rounded-lg select-none">
        <div class="justify-center items-center select-none">
          <canvas
            ref="barcodeCanvas"
            class="object-cover w-full h-full dark:filter-[invert(1)]"
          >
          </canvas>
        </div>

        <UTooltip text="玩家身份标识码（PIIC）">
          <div
            class="text-center text-xs text-slate-700 dark:text-slate-200 leading-normal tracking-widest"
          >
            <template v-if="props.summary?.piic">
              {{ props.summary.piic }}
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="mx-auto h-4 w-32" />
            </template>
          </div>
        </UTooltip>
      </div>

      <div
        class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-200"
      >
        <div class="md:col-span-2">
          <div class="text-xs text-slate-500 dark:text-slate-500">用户信息</div>
          <div
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="props.summary">
              <span class="inline-flex items-center gap-2">
                {{ props.summary.displayName }}

                <UButton
                  variant="link"
                  icon="i-lucide-qr-code"
                  class="flex justify-center items-center rounded-full h-3 w-3"
                  size="xs"
                />
              </span>

              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                <div
                  v-if="props.minecraft?.permissionRoles?.length"
                  class="flex flex-wrap gap-2"
                >
                  <UBadge
                    v-for="role in props.minecraft?.permissionRoles"
                    :key="role.id"
                    variant="soft"
                    size="sm"
                  >
                    {{ role.name || role.key }}
                  </UBadge>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="flex flex-col gap-1 w-full">
                <USkeleton class="h-4 w-32" />
                <USkeleton class="h-4 w-28" />
              </div>
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">地区</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300 space-y-0"
          >
            <template v-if="hasSummary && hasRegionData">
              <div class="flex flex-wrap gap-0.5">
                <span v-if="displayCountryLabel">{{
                  displayCountryLabel
                }}</span>
                <span v-if="showProvince">{{ regionProvince }}</span>
                <span v-if="showCityLevel">{{ regionCity }}</span>
                <span v-if="showDistrict">
                  {{ regionDistrict }}
                </span>
              </div>
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="h-4 w-32" />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">入服时间</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="props.summary?.joinDate">
              {{ dayjs(props.summary.joinDate).format('YYYY/MM/DD') }}
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="h-5 w-24" />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">用户状态</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="props.statusSnapshot">
              {{ statusLabel }}
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="h-5 w-24" />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">生日</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="formattedBirthday">
              {{ formattedBirthday }}
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="h-5 w-24" />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">注册时间</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="props.summary?.createdAt">
              {{ props.formatDateTime(props.summary.createdAt) }}
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="h-5 w-24" />
            </template>
          </div>
        </div>

        <div>
          <div class="text-xs text-slate-500 dark:text-slate-500">最近登录</div>
          <div
            class="text-base font-semibold text-slate-800 dark:text-slate-300 flex flex-col"
          >
            <template v-if="props.summary?.lastLoginAt">
              <span>
                {{ props.formatDateTime(props.summary.lastLoginAt) }}
              </span>
            </template>
            <template v-else-if="hasSummary">
              <span class="text-slate-400">—</span>
            </template>
            <template v-else>
              <USkeleton class="h-5 w-36" />
            </template>
            <template v-if="summaryLastLoginLocationDisplay">
              <span
                class="text-xs font-normal text-slate-500 dark:text-slate-500"
              >
                {{ summaryLastLoginLocationDisplay }}
              </span>
            </template>
            <template v-else-if="hasSummary">
              <span
                class="text-xs font-normal text-slate-500 dark:text-slate-500"
              >
                —
              </span>
            </template>
            <template v-else>
              <USkeleton class="h-3 w-32 mt-1" />
            </template>
          </div>
        </div>
      </div>

      <div class="flex items-center">
        <UButton
          v-if="!props.isViewingSelf"
          class="justify-center items-center w-full"
          color="primary"
        >
          <UIcon name="i-lucide-message-square" />
          私信
        </UButton>

        <RouterLink v-else to="/profile/minecraft" class="block w-full">
          <UButton class="justify-center items-center w-full" color="primary">
            <UIcon name="i-lucide-pencil-line" />
            编辑信息
          </UButton>
        </RouterLink>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-4">
        <div>
          <div>
            <PlayerGameStatsPanel
              :stats="props.stats"
              :bindings="props.summary?.authmeBindings ?? []"
              :is-viewing-self="props.isViewingSelf"
              :refreshing="isRefreshingStats"
              @refresh="handleStatsRefresh"
            />
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div>
          <div
            class="flex items-center justify-between px-1 text-lg text-slate-600 dark:text-slate-300 mb-1"
          >
            <span>站内统计信息</span>
          </div>

          <div>
            <div class="grid gap-2 md:grid-cols-4">
              <template v-if="props.stats">
                <div
                  v-for="metric in props.stats.metrics"
                  :key="metric.id"
                  class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
                >
                  <p class="text-xs text-slate-500 dark:text-slate-500">
                    {{ metric.label }}
                  </p>
                  <p
                    class="text-xl font-semibold text-slate-900 dark:text-white"
                  >
                    {{ props.formatMetricValue(metric.value, metric.unit) }}
                  </p>
                </div>
              </template>
              <template v-else>
                <div
                  v-for="index in 4"
                  :key="`stat-placeholder-${index}`"
                  class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
                >
                  <USkeleton class="h-17" />
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div>
          <div
            class="flex items-center justify-between px-1 text-lg text-slate-600 dark:text-slate-300 mb-1"
          >
            游戏账户
          </div>
          <div class="grid gap-2 md:grid-cols-4">
            <div v-if="props.summary" class="space-y-3 text-sm">
              <div
                v-for="binding in props.summary.authmeBindings"
                :key="binding.id"
                class="w-42 rounded-xl p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 relative hover:shadow-inner hover:outline-primary-400 outline-2 outline-transparent transition duration-200 cursor-pointer"
                role="button"
                @click="openBindingDetail(binding)"
              >
                <div class="flex justify-center items-center gap-3">
                  <canvas
                    :ref="
                      (el) => {
                        if (el)
                          skinCanvasRefs[binding.id] = el as HTMLCanvasElement
                      }
                    "
                    width="140"
                    height="200"
                    class="h-50 w-auto rounded-lg pointer-events-none"
                  />
                </div>

                <div>
                  <UPopover mode="hover">
                    <template #content>
                      <div class="p-3">
                        <div
                          v-if="binding.lastlogin"
                          class="text-xs text-slate-500 dark:text-slate-500"
                        >
                          最近登录于
                          <span class="font-semibold">
                            {{
                              dayjs(binding.lastlogin).format(
                                'YYYY/MM/DD HH:mm:ss',
                              )
                            }}
                          </span>
                          <span
                            v-if="
                              props.formatIpLocation(
                                binding.lastLoginLocation,
                              ) !== ''
                            "
                          >
                            （{{
                              props.formatIpLocation(binding.lastLoginLocation)
                            }}）
                          </span>
                          。
                        </div>
                        <div
                          v-if="binding.regdate"
                          class="text-xs text-slate-500 dark:text-slate-500"
                        >
                          该账号注册于
                          <span class="font-semibold">
                            {{
                              dayjs(binding.regdate).format(
                                'YYYY/MM/DD HH:mm:ss',
                              )
                            }}
                          </span>
                          <span
                            v-if="
                              props.formatIpLocation(binding.regIpLocation) !==
                              ''
                            "
                          >
                            （{{
                              props.formatIpLocation(binding.regIpLocation)
                            }}）
                          </span>
                          。
                        </div>
                        <div
                          v-if="binding.boundAt"
                          class="text-xs text-slate-500 dark:text-slate-500"
                        >
                          该账户于
                          <span class="font-semibold">
                            {{ props.formatDateTime(binding.boundAt) }}
                          </span>
                          绑定到本系统。
                        </div>
                      </div>
                    </template>

                    <div>
                      <div
                        class="line-clamp-1 truncate text-xl font-semibold text-slate-900 dark:text-white"
                      >
                        {{ binding.realname }}
                      </div>

                      <div
                        v-if="binding.lastlogin"
                        class="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1"
                      >
                        <span
                          v-if="isPlayerLogged"
                          class="inline-flex h-2 w-2 rounded-full bg-emerald-500"
                        />
                        <span>
                          {{ dayjs().diff(dayjs(binding.lastlogin), 'day') }}
                          天前登录过
                        </span>
                      </div>
                    </div>
                  </UPopover>
                </div>
              </div>
              <div
                v-if="props.summary.authmeBindings.length === 0"
                class="text-xs text-slate-500 dark:text-slate-500"
              >
                暂无 AuthMe 绑定
              </div>
            </div>
            <USkeleton v-else class="h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
    <PlayerBindingDetailDialog
      :open="detailDialogOpen"
      :binding="selectedBinding"
      :luckperms-entry="selectedBindingLuckperms"
      :format-date-time="props.formatDateTime"
      :format-ip-location="props.formatIpLocation"
      :is-viewing-self="props.isViewingSelf"
      :server-options="props.serverOptions"
      @update:open="handleDetailDialogOpenChange"
    />
  </div>
</template>
