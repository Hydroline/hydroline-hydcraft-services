<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTransportationRailwayStore } from '@/stores/transportation/railway'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'
import type { RailwayRoute } from '@/types/transportation'

const router = useRouter()
const railwayStore = useTransportationRailwayStore()
const systemsStore = useTransportationRailwaySystemsStore()
const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

const formState = ref({
  name: '',
  englishName: '',
})

const searchTerm = ref('')
const searching = ref(false)
const searchResults = ref<RailwayRoute[]>([])
const selectedRoutes = ref<RailwayRoute[]>([])
const lastSearchKeyword = ref('')

const searchPage = ref(1)
const searchPageSize = ref(20)
const searchTotal = ref(0)

const selectedPage = ref(1)
const selectedPageSize = ref(10)

function extractBaseKey(name: string | null | undefined) {
  if (!name) return null
  const primary = name.split('||')[0] ?? ''
  const first = primary.split('|')[0] ?? ''
  return first.trim() || null
}

function buildGroupKey(
  name: string | null | undefined,
  fallback?: string | null,
) {
  return (
    extractBaseKey(name) ??
    name ??
    fallback ??
    `route-${fallback ?? Math.random().toString(36).slice(2, 8)}`
  )
}

function buildGroupName(name: string | null | undefined, fallback?: string) {
  if (!name) return fallback ?? '未知线路'
  return name.split('||')[0].split('|')[0].trim() || fallback || name
}

function parseRouteName(name: string | null | undefined) {
  if (!name) return { main: '未知线路', sub: null, extra: null }
  const parts = name.split('||')
  const mainPart = parts[0] ?? ''
  const extraPart = parts[1] ?? ''

  const main = mainPart.split('|')[0]?.trim() || name
  const sub = mainPart.split('|')[1]?.trim() || null
  const extra = extraPart.split('|')[0]?.trim() || null

  return { main, sub, extra }
}

const groupedSearchResults = computed(() => {
  const map = new Map<
    string,
    { groupKey: string; groupName: string; routes: RailwayRoute[] }
  >()
  for (const route of searchResults.value) {
    const key = buildGroupKey(route.name, route.id)
    if (!map.has(key)) {
      map.set(key, {
        groupKey: key,
        groupName: buildGroupName(route.name, route.id),
        routes: [],
      })
    }
    map.get(key)!.routes.push(route)
  }
  return Array.from(map.values())
})

const selectedRouteIds = computed(
  () => new Set(selectedRoutes.value.map((item) => item.id)),
)

const selectedGroups = computed(() => {
  const map = new Map<
    string,
    { groupKey: string; groupName: string; routes: RailwayRoute[] }
  >()
  for (const route of selectedRoutes.value) {
    const key = buildGroupKey(route.name, route.id)
    if (!map.has(key)) {
      map.set(key, {
        groupKey: key,
        groupName: buildGroupName(route.name, route.id),
        routes: [],
      })
    }
    map.get(key)!.routes.push(route)
  }
  const availableCounts = new Map(
    groupedSearchResults.value.map((group) => [
      group.groupKey,
      group.routes.length,
    ]),
  )
  return Array.from(map.values()).map((group) => ({
    ...group,
    totalCount: Math.max(
      availableCounts.get(group.groupKey) ?? 0,
      group.routes.length,
    ),
  }))
})

const paginatedSelectedGroups = computed(() => {
  const page = Number(selectedPage.value)
  const start = (page - 1) * selectedPageSize.value
  const end = start + selectedPageSize.value
  return selectedGroups.value.slice(start, end)
})

watch(
  () => selectedGroups.value.length,
  (newLength) => {
    const maxPage = Math.ceil(newLength / selectedPageSize.value) || 1
    if (selectedPage.value > maxPage) {
      selectedPage.value = maxPage
    }
  },
)

const selectedCountByGroup = computed(() => {
  const map = new Map<string, number>()
  for (const route of selectedRoutes.value) {
    const key = buildGroupKey(route.name, route.id)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
})

const searchGroupExpanded = ref<Record<string, boolean>>({})
const selectedGroupExpanded = ref<Record<string, boolean>>({})

const logoFileInput = ref<HTMLInputElement | null>(null)
const logoFile = ref<File | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const logoObjectUrl = ref<string | null>(null)
const logoUploading = ref(false)
const creating = ref(false)

async function searchRoutes() {
  const keyword = searchTerm.value.trim()
  if (!keyword) {
    searchResults.value = []
    lastSearchKeyword.value = ''
    searchTotal.value = 0
    return
  }
  searching.value = true
  try {
    const response = await railwayStore.searchRoutes({
      search: keyword,
      page: Number(searchPage.value),
      pageSize: searchPageSize.value,
    })
    searchResults.value = response.items
    searchTotal.value = response.pagination.total
    lastSearchKeyword.value = keyword
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '搜索失败',
      color: 'red',
    })
  } finally {
    searching.value = false
  }
}

function addRoute(route: RailwayRoute) {
  if (selectedRouteIds.value.has(route.id)) return
  selectedRoutes.value.push(route)
}

function removeRoute(routeId: string) {
  selectedRoutes.value = selectedRoutes.value.filter(
    (item) => item.id !== routeId,
  )
}

function isRouteSelected(routeId: string) {
  return selectedRouteIds.value.has(routeId)
}

function toggleSearchGroup(key: string) {
  searchGroupExpanded.value = {
    ...searchGroupExpanded.value,
    [key]: !searchGroupExpanded.value[key],
  }
}

function toggleSelectedGroup(key: string) {
  selectedGroupExpanded.value = {
    ...selectedGroupExpanded.value,
    [key]: !selectedGroupExpanded.value[key],
  }
}

function cleanupLogoPreview() {
  if (logoObjectUrl.value) {
    URL.revokeObjectURL(logoObjectUrl.value)
    logoObjectUrl.value = null
  }
  logoPreviewUrl.value = null
}

function triggerLogoPicker() {
  logoFileInput.value?.click()
}

function clearLogoSelection() {
  logoFile.value = null
  cleanupLogoPreview()
  if (logoFileInput.value) {
    logoFileInput.value.value = ''
  }
}

function handleLogoFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0] ?? null
  if (!file) {
    clearLogoSelection()
    return
  }
  logoFile.value = file
  cleanupLogoPreview()
  const objectUrl = URL.createObjectURL(file)
  logoObjectUrl.value = objectUrl
  logoPreviewUrl.value = objectUrl
  if (target) {
    target.value = ''
  }
}

async function createSystem() {
  if (creating.value) return
  if (!formState.value.name.trim()) {
    toast.add({ title: '请输入线路系统名称', color: 'orange' })
    return
  }
  if (!formState.value.englishName.trim()) {
    toast.add({ title: '请输入线路系统英文名', color: 'orange' })
    return
  }
  if (!selectedRoutes.value.length) {
    toast.add({ title: '至少选择一条线路', color: 'orange' })
    return
  }

  creating.value = true
  try {
    const system = await systemsStore.createSystem({
      name: formState.value.name.trim(),
      englishName: formState.value.englishName.trim(),
      routes: selectedRoutes.value.map((route) => ({
        entityId: route.id,
        railwayType: route.railwayType,
        serverId: route.server.id,
        dimension: route.dimension ?? null,
      })),
    })
    if (logoFile.value) {
      logoUploading.value = true
      try {
        await systemsStore.uploadSystemLogo(system.id, logoFile.value)
      } catch (error) {
        toast.add({
          title: 'Logo 上传失败',
          description:
            error instanceof Error ? error.message : '请稍后重试上传',
          color: 'orange',
        })
      } finally {
        logoUploading.value = false
      }
    }
    toast.add({ title: '线路系统已创建', color: 'green' })
    router.push({
      name: 'transportation.railway.system.detail',
      params: { systemId: system.id },
    })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '创建失败',
      color: 'red',
    })
  } finally {
    creating.value = false
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null

watch(
  () => searchTerm.value,
  (value) => {
    searchPage.value = 1
    if (searchTimeout) clearTimeout(searchTimeout)

    if (!value.trim()) {
      searchResults.value = []
      lastSearchKeyword.value = ''
      searchTotal.value = 0
      return
    }

    searchTimeout = setTimeout(() => {
      void searchRoutes()
    }, 500)
  },
)

function onSearchPageChange(newPage: number) {
  searchPage.value = newPage
  if (searchTerm.value.trim()) {
    void searchRoutes()
  }
}

watch(
  () => groupedSearchResults.value,
  (groups) => {
    const prev = { ...searchGroupExpanded.value }
    const next: Record<string, boolean> = {}
    for (const group of groups) {
      next[group.groupKey] =
        prev[group.groupKey] ?? (group.routes.length > 1 ? true : false)
    }
    searchGroupExpanded.value = next
  },
  { immediate: true },
)

onMounted(() => {
  if (!authStore.isAuthenticated) {
    uiStore.openLoginDialog()
  }
})

onBeforeUnmount(() => {
  cleanupLogoPreview()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          添加线路系统
        </h1>
        <p class="text-sm text-slate-500">
          按线路 / 方向组合成系统，可单独选择方向
        </p>
      </div>
      <UButton
        size="sm"
        class="absolute left-4 top-6 md:top-10"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
    </div>

    <div class="space-y-6">
      <div
        class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <UInput v-model="formState.name" placeholder="线路系统中文名" />
          <UInput
            v-model="formState.englishName"
            placeholder="线路系统英文名"
          />
        </div>
        <div
          class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <UInput
            v-model="searchTerm"
            placeholder="搜索线路名称"
            icon="i-lucide-search"
            class="flex-1"
          />
          <p class="text-xs text-slate-400">
            {{
              lastSearchKeyword
                ? `当前关键词：${lastSearchKeyword}`
                : '请输入关键词后开始搜索'
            }}
          </p>
        </div>
      </div>

      <div
        class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3
              class="text-base font-semibold text-slate-800 dark:text-slate-200"
            >
              线路系统 Logo
            </h3>
            <p class="text-xs text-slate-500">
              支持 PNG/JPG/SVG 格式，建议 120x120 像素。
            </p>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            class="group relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-sm font-medium text-slate-500 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            @click="triggerLogoPicker"
          >
            <img
              v-if="logoPreviewUrl"
              :src="logoPreviewUrl"
              alt="线路系统 Logo 预览"
              class="h-full w-full object-cover"
            />
            <span
              v-else
              class="flex h-full w-full items-center justify-center text-xs font-semibold"
            >
              Logo
            </span>
            <div
              class="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 text-xs text-white opacity-0 transition group-hover:opacity-100 dark:bg-slate-900/60"
            >
              更换图片
            </div>
          </button>
          <div
            class="flex-1 min-w-[200px] text-sm text-slate-500 dark:text-slate-400"
          >
            <p
              class="text-sm"
              :class="{
                'text-slate-900 dark:text-white': logoFile,
                'text-slate-500 dark:text-slate-400': !logoFile,
              }"
            >
              {{ logoFile?.name || '未选择图片' }}
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton size="xs" color="primary" @click="triggerLogoPicker">
                选择图片
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                :disabled="!logoFile"
                @click="clearLogoSelection"
              >
                移除
              </UButton>
            </div>
            <p v-if="logoUploading" class="text-xs text-amber-500 mt-2">
              正在上传 Logo，请稍候…
            </p>
          </div>
        </div>
        <input
          ref="logoFileInput"
          type="file"
          accept="image/*,.svg"
          class="hidden"
          @change="handleLogoFileChange"
        />
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <div
          class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
        >
          <div
            class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"
          >
            <div>
              <h3
                class="text-base font-semibold text-slate-800 dark:text-slate-200"
              >
                可选线路 / 方向
              </h3>
              <p class="text-xs text-slate-500">
                每个折叠卡片展示实际匹配的路线方向，点击即可选择或取消。
              </p>
            </div>
            <span class="text-xs text-slate-400">
              {{
                lastSearchKeyword
                  ? `当前关键词：${lastSearchKeyword}`
                  : '请先搜索线路'
              }}
            </span>
          </div>
          <div class="mt-4 space-y-3">
            <div
              v-if="groupedSearchResults.length === 0"
              class="rounded-xl border border-dashed border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400"
            >
              {{
                searching
                  ? '搜索中…'
                  : searchTerm
                    ? '暂无符合的线路'
                    : '请输入关键词后开始搜索'
              }}
            </div>
            <div
              v-else
              v-for="group in groupedSearchResults"
              :key="group.groupKey"
              class="overflow-hidden rounded-2xl border border-slate-100/70 bg-slate-50/80 p-0 dark:border-slate-800/70 dark:bg-slate-900/60"
            >
              <template v-if="group.routes.length === 1">
                <div
                  class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                  @click="
                    isRouteSelected(group.routes[0].id)
                      ? removeRoute(group.routes[0].id)
                      : addRoute(group.routes[0])
                  "
                >
                  <div>
                    <div class="flex items-baseline gap-2">
                      <span
                        class="text-base font-semibold text-slate-900 dark:text-white"
                      >
                        {{ parseRouteName(group.routes[0].name).main }}
                      </span>
                      <span
                        v-if="parseRouteName(group.routes[0].name).sub"
                        class="text-xs text-slate-500 dark:text-slate-400"
                      >
                        {{ parseRouteName(group.routes[0].name).sub }}
                      </span>
                    </div>
                    <div
                      v-if="parseRouteName(group.routes[0].name).extra"
                      class="text-xs text-slate-500 dark:text-slate-400"
                    >
                      {{ parseRouteName(group.routes[0].name).extra }}
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ group.routes[0].server.name }} ·
                      {{ group.routes[0].railwayType }} ·
                      {{ group.routes[0].dimension ?? '主世界' }}
                    </p>
                  </div>
                  <div
                    class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span
                      v-if="isRouteSelected(group.routes[0].id)"
                      class="rounded-full border border-slate-200 px-2 py-0.5 text-xs dark:border-slate-700"
                    >
                      已选
                    </span>
                    <UButton
                      size="2xs"
                      variant="ghost"
                      :color="
                        isRouteSelected(group.routes[0].id)
                          ? 'neutral'
                          : 'primary'
                      "
                      @click.stop="
                        isRouteSelected(group.routes[0].id)
                          ? removeRoute(group.routes[0].id)
                          : addRoute(group.routes[0])
                      "
                    >
                      {{
                        isRouteSelected(group.routes[0].id) ? '取消' : '选择'
                      }}
                    </UButton>
                  </div>
                </div>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                  @click="toggleSearchGroup(group.groupKey)"
                >
                  <div>
                    <p
                      class="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      {{ group.groupName }}
                    </p>
                    <p class="text-xs text-slate-500">
                      {{ group.routes.length }} 个方向 · 已选
                      {{ selectedCountByGroup[group.groupKey] ?? 0 }}/{{
                        group.routes.length
                      }}
                    </p>
                  </div>
                  <div
                    class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span>
                      {{ selectedCountByGroup[group.groupKey] ?? 0 }}/{{
                        group.routes.length
                      }}
                    </span>
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="h-4 w-4 transition-transform"
                      :class="{
                        'rotate-180': searchGroupExpanded[group.groupKey],
                      }"
                    />
                  </div>
                </button>
                <Transition
                  enter-active-class="transition-all duration-200"
                  leave-active-class="transition-all duration-200"
                >
                  <div
                    v-show="searchGroupExpanded[group.groupKey]"
                    class="border-t border-slate-200/60 px-4 py-3 dark:border-slate-800/60"
                  >
                    <div class="space-y-2">
                      <div
                        v-for="route in group.routes"
                        :key="route.id"
                        class="flex items-center justify-between gap-3 rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/60"
                      >
                        <div>
                          <div class="flex items-baseline gap-2">
                            <span
                              class="text-sm font-medium text-slate-900 dark:text-white"
                            >
                              {{ parseRouteName(route.name).main }}
                            </span>
                            <span
                              v-if="parseRouteName(route.name).sub"
                              class="text-xs text-slate-500 dark:text-slate-400"
                            >
                              {{ parseRouteName(route.name).sub }}
                            </span>
                          </div>
                          <div
                            v-if="parseRouteName(route.name).extra"
                            class="text-xs text-slate-500 dark:text-slate-400"
                          >
                            {{ parseRouteName(route.name).extra }}
                          </div>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            {{ route.server.name }} · {{ route.railwayType }} ·
                            {{ route.dimension ?? '主世界' }}
                          </p>
                        </div>
                        <div
                          class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                        >
                          <span
                            v-if="isRouteSelected(route.id)"
                            class="rounded-full border border-slate-200 px-2 py-0.5 text-xs dark:border-slate-700"
                          >
                            已选
                          </span>
                          <UButton
                            size="2xs"
                            variant="ghost"
                            :color="
                              isRouteSelected(route.id) ? 'neutral' : 'primary'
                            "
                            @click="
                              isRouteSelected(route.id)
                                ? removeRoute(route.id)
                                : addRoute(route)
                            "
                          >
                            {{ isRouteSelected(route.id) ? '取消' : '选择' }}
                          </UButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </Transition>
              </template>
            </div>
            <div
              v-if="searchTotal > searchPageSize"
              class="flex justify-center pt-2 flex-shrink-0"
            >
              <UPagination
                :page="searchPage"
                :items-per-page="searchPageSize"
                :total="searchTotal"
                @update:page="onSearchPageChange"
              />
            </div>
          </div>
        </div>

        <div
          class="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
        >
          <div class="flex items-center justify-between">
            <div>
              <h3
                class="text-base font-semibold text-slate-800 dark:text-slate-200"
              >
                已选择线路
              </h3>
              <p class="text-xs text-slate-400">
                已选择 {{ selectedRoutes.length }} 个方向，涵盖
                {{ selectedGroups.length }} 条线路
              </p>
            </div>
            <p class="text-xs text-slate-400">方向可单独移除</p>
          </div>
          <div class="mt-4 space-y-4">
            <div
              v-if="selectedGroups.length === 0"
              class="rounded-xl border border-dashed border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400"
            >
              暂无选中线路，添加后会在这里显示
            </div>
            <div
              v-else
              v-for="group in paginatedSelectedGroups"
              :key="group.groupKey"
              class="overflow-hidden rounded-2xl border border-slate-100/70 bg-slate-50/80 p-0 dark:border-slate-800/70 dark:bg-slate-900/60"
            >
              <template v-if="group.routes.length === 1">
                <div class="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div class="flex items-baseline gap-2">
                      <span
                        class="text-base font-semibold text-slate-900 dark:text-white"
                      >
                        {{ parseRouteName(group.routes[0].name).main }}
                      </span>
                      <span
                        v-if="parseRouteName(group.routes[0].name).sub"
                        class="text-xs text-slate-500 dark:text-slate-400"
                      >
                        {{ parseRouteName(group.routes[0].name).sub }}
                      </span>
                    </div>
                    <div
                      v-if="parseRouteName(group.routes[0].name).extra"
                      class="text-xs text-slate-500 dark:text-slate-400"
                    >
                      {{ parseRouteName(group.routes[0].name).extra }}
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ group.routes[0].server.name }} ·
                      {{ group.routes[0].railwayType }} ·
                      {{ group.routes[0].dimension ?? '主世界' }}
                    </p>
                  </div>
                  <UButton
                    size="2xs"
                    variant="ghost"
                    color="primary"
                    @click="removeRoute(group.routes[0].id)"
                  >
                    移除
                  </UButton>
                </div>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                  @click="toggleSelectedGroup(group.groupKey)"
                >
                  <div>
                    <p
                      class="text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      {{ group.groupName }}
                    </p>
                    <p class="text-xs text-slate-500">
                      {{ group.totalCount }} 个方向 · 已选
                      {{ group.routes.length }}/{{ group.totalCount }}
                    </p>
                  </div>
                  <div
                    class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span>
                      {{ group.routes.length }}/{{ group.totalCount }}
                    </span>
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="h-4 w-4 transition-transform"
                      :class="{
                        'rotate-180': selectedGroupExpanded[group.groupKey],
                      }"
                    />
                  </div>
                </button>
                <Transition
                  enter-active-class="transition-all duration-200"
                  leave-active-class="transition-all duration-200"
                >
                  <div
                    v-show="selectedGroupExpanded[group.groupKey]"
                    class="max-h-60 overflow-y-auto border-t border-slate-200/60 px-4 py-3 dark:border-slate-800/60"
                  >
                    <div class="space-y-2">
                      <div
                        v-for="route in group.routes"
                        :key="route.id"
                        class="flex items-center justify-between gap-3 rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/60"
                      >
                        <div>
                          <div class="flex items-baseline gap-2">
                            <span
                              class="text-sm font-medium text-slate-900 dark:text-white"
                            >
                              {{ parseRouteName(route.name).main }}
                            </span>
                            <span
                              v-if="parseRouteName(route.name).sub"
                              class="text-xs text-slate-500 dark:text-slate-400"
                            >
                              {{ parseRouteName(route.name).sub }}
                            </span>
                          </div>
                          <div
                            v-if="parseRouteName(route.name).extra"
                            class="text-xs text-slate-500 dark:text-slate-400"
                          >
                            {{ parseRouteName(route.name).extra }}
                          </div>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            {{ route.server.name }} · {{ route.railwayType }} ·
                            {{ route.dimension ?? '主世界' }}
                          </p>
                        </div>
                        <UButton
                          size="2xs"
                          variant="ghost"
                          color="primary"
                          @click="removeRoute(route.id)"
                        >
                          移除
                        </UButton>
                      </div>
                    </div>
                  </div>
                </Transition>
              </template>
            </div>
            <div
              v-if="selectedGroups.length > selectedPageSize"
              class="flex justify-center pt-2 flex-shrink-0"
            >
              <UPagination
                v-model:page="selectedPage"
                :items-per-page="selectedPageSize"
                :total="selectedGroups.length"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton
        color="primary"
        :loading="creating"
        :disabled="creating"
        @click="createSystem"
      >
        创建系统
      </UButton>
    </div>
  </div>
</template>
