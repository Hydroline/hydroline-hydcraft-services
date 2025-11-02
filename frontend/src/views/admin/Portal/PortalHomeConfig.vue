<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { apiFetch, ApiError } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

type PortalAdminConfigResponse = {
  hero: {
    subtitle: string
    backgrounds: Array<{
      id: string
      attachmentId: string
      description: string | null
      imageUrl: string | null
      available: boolean
    }>
  }
  navigation: Array<{
    id: string
    label: string
    tooltip: string | null
    url: string | null
    available: boolean
    icon: string | null
  }>
  cards: Record<
    string,
    {
      enabled: boolean
      allowedRoles: string[]
      allowedUsers: string[]
      allowGuests: boolean
    }
  >
  registry: Array<{
    id: string
    name: string
    description?: string
  }>
}

type EditableHeroBackground = PortalAdminConfigResponse['hero']['backgrounds'][number] & {
  editAttachmentId: string
  editDescription: string
}

type EditableNavigationItem = PortalAdminConfigResponse['navigation'][number] & {
  editLabel: string
  editTooltip: string
  editUrl: string
  editIcon: string
  editAvailable: boolean
}

type CardRegistryEntry = PortalAdminConfigResponse['registry'][number]

type EditableCardForm = {
  enabled: boolean
  allowGuests: boolean
  rolesInput: string
  usersInput: string
}

const authStore = useAuthStore()
const uiStore = useUiStore()

const loading = ref(false)
const isMutating = ref(false)

const heroSubtitle = ref('')
const heroSubtitleDraft = ref('')
const isEditingHeroSubtitle = ref(false)
const heroBackgrounds = reactive<EditableHeroBackground[]>([])
const navigationItems = reactive<EditableNavigationItem[]>([])
const cardsRegistry = ref<CardRegistryEntry[]>([])
const cardsForm = reactive<Record<string, EditableCardForm>>({})

const editingHeroBackgroundId = ref<string | null>(null)
const editingNavigationId = ref<string | null>(null)
const showNewBackgroundForm = ref(false)
const showNewNavigationForm = ref(false)

const cardEntries = computed(() =>
  cardsRegistry.value
    .map((card) => ({
      card,
      form: cardsForm[card.id] ?? null,
    }))
    .filter(
      (
        entry,
      ): entry is {
        card: CardRegistryEntry
        form: EditableCardForm
      } => Boolean(entry.form),
    ),
)

const newBackground = reactive({
  attachmentId: '',
  description: '',
})

const newNavigation = reactive({
  id: '',
  label: '',
  tooltip: '',
  url: '',
  icon: '',
  available: true,
})

function handleError(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    window.alert(error.message ?? fallbackMessage)
    return
  }
  console.error(error)
  window.alert(fallbackMessage)
}

function ensureToken(): string {
  if (!authStore.token) {
    uiStore.openLoginDialog()
    throw new Error('需要登录后才能执行该操作')
  }
  return authStore.token
}

function assignHeroBackgrounds(list: EditableHeroBackground[]) {
  heroBackgrounds.splice(0, heroBackgrounds.length, ...list)
}

function assignNavigationItems(list: EditableNavigationItem[]) {
  navigationItems.splice(0, navigationItems.length, ...list)
}

function resetCardsForm() {
  for (const key of Object.keys(cardsForm)) {
    delete cardsForm[key]
  }
}

async function fetchConfig() {
  const token = authStore.token
  if (!token) {
    return
  }
  loading.value = true
  uiStore.startLoading()
  try {
    const response = await apiFetch<PortalAdminConfigResponse>('/admin/portal/config', {
      token,
    })
  heroSubtitle.value = response.hero.subtitle
  heroSubtitleDraft.value = response.hero.subtitle
    assignHeroBackgrounds(
      response.hero.backgrounds.map((item) => ({
        ...item,
        editAttachmentId: item.attachmentId,
        editDescription: item.description ?? '',
      })),
    )
    assignNavigationItems(
      response.navigation.map((item) => ({
        ...item,
        editLabel: item.label,
        editTooltip: item.tooltip ?? '',
        editUrl: item.url ?? '',
        editIcon: item.icon ?? '',
        editAvailable: item.available,
      })),
    )
    resetCardsForm()
    const nextForms: Record<string, EditableCardForm> = {}
    for (const entry of response.registry) {
      const cardConfig = response.cards[entry.id] ?? {
        enabled: false,
        allowedRoles: [],
        allowedUsers: [],
        allowGuests: false,
      }
      nextForms[entry.id] = {
        enabled: cardConfig.enabled,
        allowGuests: cardConfig.allowGuests,
        rolesInput: cardConfig.allowedRoles.join(', '),
        usersInput: cardConfig.allowedUsers.join(', '),
      }
    }
    for (const key of Object.keys(nextForms)) {
      cardsForm[key] = nextForms[key]
    }
    cardsRegistry.value = response.registry
  } catch (error) {
    handleError(error, '无法加载 Portal 首页配置')
  } finally {
    loading.value = false
    uiStore.stopLoading()
  }
}

function startEditHeroSubtitle() {
  heroSubtitleDraft.value = heroSubtitle.value
  isEditingHeroSubtitle.value = true
}

function cancelHeroSubtitleEdit() {
  heroSubtitleDraft.value = heroSubtitle.value
  isEditingHeroSubtitle.value = false
}

async function updateHeroSubtitle() {
  if (!heroSubtitleDraft.value.trim()) {
    window.alert('请填写副标题')
    return
  }
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch('/admin/portal/config/hero', {
      method: 'PATCH',
      token,
      body: {
        subtitle: heroSubtitleDraft.value.trim(),
      },
    })
    isEditingHeroSubtitle.value = false
    heroSubtitle.value = heroSubtitleDraft.value.trim()
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '更新 Hero 副标题失败')
  } finally {
    isMutating.value = false
  }
}

function resetHeroBackgroundForm() {
  newBackground.attachmentId = ''
  newBackground.description = ''
}

function startEditHeroBackground(background: EditableHeroBackground) {
  background.editAttachmentId = background.attachmentId ?? ''
  background.editDescription = background.description ?? ''
  editingHeroBackgroundId.value = background.id
}

function cancelHeroBackgroundEdit(background: EditableHeroBackground) {
  background.editAttachmentId = background.attachmentId ?? ''
  background.editDescription = background.description ?? ''
  editingHeroBackgroundId.value = null
}

async function createHeroBackground() {
  if (!newBackground.attachmentId.trim()) {
    window.alert('请填写附件 ID')
    return
  }
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch('/admin/portal/config/hero/backgrounds', {
      method: 'POST',
      token,
      body: {
        attachmentId: newBackground.attachmentId.trim(),
        description: newBackground.description.trim() || undefined,
      },
    })
    resetHeroBackgroundForm()
    showNewBackgroundForm.value = false
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '新增背景图失败')
  } finally {
    isMutating.value = false
  }
}

async function saveHeroBackground(background: EditableHeroBackground) {
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch(`/admin/portal/config/hero/backgrounds/${background.id}`, {
      method: 'PATCH',
      token,
      body: {
        attachmentId: background.editAttachmentId.trim() || undefined,
        description: background.editDescription.trim() || undefined,
      },
    })
    editingHeroBackgroundId.value = null
    background.attachmentId = background.editAttachmentId.trim()
    background.description = background.editDescription.trim() || null
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '更新背景图失败')
  } finally {
    isMutating.value = false
  }
}

async function removeHeroBackground(id: string) {
  if (!window.confirm('确定要删除该背景图吗？')) {
    return
  }
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch(`/admin/portal/config/hero/backgrounds/${id}`, {
      method: 'DELETE',
      token,
    })
    if (editingHeroBackgroundId.value === id) {
      editingHeroBackgroundId.value = null
    }
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '删除背景图失败')
  } finally {
    isMutating.value = false
  }
}

async function moveHeroBackground(currentIndex: number, offset: number) {
  const targetIndex = currentIndex + offset
  if (targetIndex < 0 || targetIndex >= heroBackgrounds.length) {
    return
  }
  const order = [...heroBackgrounds]
  const [item] = order.splice(currentIndex, 1)
  order.splice(targetIndex, 0, item)
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch('/admin/portal/config/hero/backgrounds/reorder', {
      method: 'PATCH',
      token,
      body: {
        order: order.map((entry) => entry.id),
      },
    })
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '调整背景图排序失败')
  } finally {
    isMutating.value = false
  }
}

function resetNavigationForm() {
  newNavigation.id = ''
  newNavigation.label = ''
  newNavigation.tooltip = ''
  newNavigation.url = ''
  newNavigation.icon = ''
  newNavigation.available = true
}

function startEditNavigationItem(item: EditableNavigationItem) {
  item.editLabel = item.label
  item.editTooltip = item.tooltip ?? ''
  item.editUrl = item.url ?? ''
  item.editIcon = item.icon ?? ''
  item.editAvailable = item.available
  editingNavigationId.value = item.id
}

function cancelNavigationEdit(item: EditableNavigationItem) {
  item.editLabel = item.label
  item.editTooltip = item.tooltip ?? ''
  item.editUrl = item.url ?? ''
  item.editIcon = item.icon ?? ''
  item.editAvailable = item.available
  editingNavigationId.value = null
}

async function createNavigationItem() {
  if (!newNavigation.id.trim() || !newNavigation.label.trim()) {
    window.alert('请填写导航 ID 和名称')
    return
  }
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch('/admin/portal/config/navigation', {
      method: 'POST',
      token,
      body: {
        id: newNavigation.id.trim(),
        label: newNavigation.label.trim(),
        tooltip: newNavigation.tooltip.trim() || undefined,
        url: newNavigation.url.trim() || undefined,
        icon: newNavigation.icon.trim() || undefined,
        available: newNavigation.available,
      },
    })
    resetNavigationForm()
    showNewNavigationForm.value = false
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '新增导航项失败')
  } finally {
    isMutating.value = false
  }
}

async function saveNavigationItem(item: EditableNavigationItem) {
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch(`/admin/portal/config/navigation/${item.id}`, {
      method: 'PATCH',
      token,
      body: {
        label: item.editLabel.trim() || undefined,
        tooltip: item.editTooltip.trim() || undefined,
        url: item.editUrl.trim() || undefined,
        icon: item.editIcon.trim() || undefined,
        available: item.editAvailable,
      },
    })
    editingNavigationId.value = null
    item.label = item.editLabel.trim()
    item.tooltip = item.editTooltip.trim() || null
    item.url = item.editUrl.trim() || null
    item.icon = item.editIcon.trim() || null
    item.available = item.editAvailable
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '更新导航项失败')
  } finally {
    isMutating.value = false
  }
}

async function removeNavigationItem(id: string) {
  if (!window.confirm('确定要删除该导航项吗？')) {
    return
  }
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch(`/admin/portal/config/navigation/${id}`, {
      method: 'DELETE',
      token,
    })
    if (editingNavigationId.value === id) {
      editingNavigationId.value = null
    }
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '删除导航项失败')
  } finally {
    isMutating.value = false
  }
}

async function moveNavigationItem(currentIndex: number, offset: number) {
  const targetIndex = currentIndex + offset
  if (targetIndex < 0 || targetIndex >= navigationItems.length) {
    return
  }
  const order = [...navigationItems]
  const [item] = order.splice(currentIndex, 1)
  order.splice(targetIndex, 0, item)
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch('/admin/portal/config/navigation/reorder', {
      method: 'PATCH',
      token,
      body: {
        order: order.map((entry) => entry.id),
      },
    })
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '调整导航项排序失败')
  } finally {
    isMutating.value = false
  }
}

function toList(input: string) {
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

async function saveCardConfig(cardId: string) {
  const form = cardsForm[cardId]
  if (!form) {
    return
  }
  try {
    const token = ensureToken()
    isMutating.value = true
    await apiFetch(`/admin/portal/config/cards/${cardId}`, {
      method: 'PATCH',
      token,
      body: {
        enabled: form.enabled,
        allowGuests: form.allowGuests,
        allowedRoles: toList(form.rolesInput),
        allowedUsers: toList(form.usersInput),
      },
    })
    await fetchConfig()
  } catch (error) {
    if (error instanceof Error && error.message.includes('登录')) {
      return
    }
    handleError(error, '更新卡片配置失败')
  } finally {
    isMutating.value = false
  }
}

onMounted(() => {
  void fetchConfig()
})
</script>

<template>
  <div class="space-y-8">
    <header>
      <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">Portal 首页配置</h2>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        管理 Hero 背景、导航按钮与卡片可见性，所有改动实时保存至后端配置中心。
      </p>
    </header>

    <UAlert
      v-if="loading"
      color="neutral"
      variant="soft"
      title="正在加载配置"
      description="请稍候，正在同步最新的 Portal 首页配置……"
    />

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Hero 区域配置</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">设置首页顶部背景轮播与副标题文案。</p>
          </div>
          <UBadge variant="soft" color="primary">{{ heroBackgrounds.length }} 张背景图</UBadge>
        </div>
      </template>

      <div class="space-y-6">
        <section class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Hero 副标题
              </p>
              <p v-if="heroSubtitle" class="text-base font-medium text-slate-900 dark:text-white">
                {{ heroSubtitle }}
              </p>
              <p v-else class="text-base text-slate-400 dark:text-slate-500">尚未设置副标题</p>
            </div>
            <UButton
              v-if="!isEditingHeroSubtitle"
              size="xs"
              variant="soft"
              @click="startEditHeroSubtitle"
            >
              编辑
            </UButton>
          </div>
          <form
            v-if="isEditingHeroSubtitle"
            class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            @submit.prevent="updateHeroSubtitle"
          >
            <UInput
              v-model="heroSubtitleDraft"
              placeholder="例如：ALPHA 测试阶段"
            />
            <div class="flex items-center justify-end gap-2 md:justify-start">
              <UButton
                type="submit"
                color="primary"
                :loading="isMutating"
              >
                保存副标题
              </UButton>
              <UButton type="button" variant="ghost" :disabled="isMutating" @click="cancelHeroSubtitleEdit">
                取消
              </UButton>
            </div>
          </form>
        </section>

        <div
          v-if="heroBackgrounds.length === 0"
          class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300"
        >
          暂无背景图，请通过下方表单新增一张背景图。
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UCard
            v-for="(background, index) in heroBackgrounds"
            :key="background.id"
            class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
          >
            <div class="space-y-4">
              <div class="flex flex-col gap-4 lg:flex-row">
                <div
                  class="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 lg:w-44"
                >
                  <img
                    v-if="background.imageUrl"
                    :src="background.imageUrl"
                    alt="背景图预览"
                    class="h-full w-full rounded-xl object-cover"
                  />
                  <span v-else class="text-xs text-slate-400 dark:text-slate-500">暂无预览</span>
                </div>
                <div class="flex-1 space-y-3">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div class="space-y-1">
                      <p class="text-xs font-medium text-slate-500 dark:text-slate-300">附件 ID</p>
                      <p class="text-sm text-slate-900 dark:text-white break-all">
                        {{ background.attachmentId || '未配置' }}
                      </p>
                    </div>
                    <div class="space-y-1">
                      <p class="text-xs font-medium text-slate-500 dark:text-slate-300">描述</p>
                      <p class="text-sm text-slate-600 dark:text-slate-300">
                        {{ background.description || '未填写描述' }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="background.available ? 'primary' : 'neutral'"
                    variant="soft"
                  >
                    {{ background.available ? '附件可访问' : '附件不可访问' }}
                  </UBadge>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    size="xs"
                    variant="soft"
                    :disabled="index === 0 || isMutating || editingHeroBackgroundId === background.id"
                    @click="moveHeroBackground(index, -1)"
                  >
                    上移
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    :disabled="index === heroBackgrounds.length - 1 || isMutating || editingHeroBackgroundId === background.id"
                    @click="moveHeroBackground(index, 1)"
                  >
                    下移
                  </UButton>
                  <template v-if="editingHeroBackgroundId === background.id">
                    <UButton
                      size="xs"
                      color="primary"
                      :loading="isMutating"
                      @click="saveHeroBackground(background)"
                    >
                      保存
                    </UButton>
                    <UButton
                      size="xs"
                      variant="ghost"
                      :disabled="isMutating"
                      @click="cancelHeroBackgroundEdit(background)"
                    >
                      取消
                    </UButton>
                  </template>
                  <template v-else>
                    <UButton
                      size="xs"
                      variant="soft"
                      :disabled="isMutating"
                      @click="startEditHeroBackground(background)"
                    >
                      编辑
                    </UButton>
                  </template>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :loading="isMutating"
                    @click="removeHeroBackground(background.id)"
                  >
                    删除
                  </UButton>
                </div>
              </div>

              <div
                v-if="editingHeroBackgroundId === background.id"
                class="border-t border-slate-200 pt-4 dark:border-slate-800"
              >
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-slate-500 dark:text-slate-300">附件 ID</label>
                    <UInput
                      v-model="background.editAttachmentId"
                      placeholder="输入附件 ID"
                    />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-slate-500 dark:text-slate-300">描述</label>
                    <UInput
                      v-model="background.editDescription"
                      placeholder="用于顶部标题显示"
                    />
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div
          class="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 p-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60"
        >
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
              新增背景图
            </h4>
            <UButton
              size="xs"
              variant="soft"
              @click="showNewBackgroundForm = !showNewBackgroundForm"
            >
              {{ showNewBackgroundForm ? '收起表单' : '展开表单' }}
            </UButton>
          </div>
          <div v-if="showNewBackgroundForm" class="mt-3 space-y-4">
            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">附件 ID</label>
                <UInput
                  v-model="newBackground.attachmentId"
                  placeholder="来自附件系统的 ID"
                />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">描述（可选）</label>
                <UInput
                  v-model="newBackground.description"
                  placeholder="用于顶部标题显示"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <UButton
                color="primary"
                :loading="isMutating"
                @click="createHeroBackground"
              >
                添加背景图
              </UButton>
              <UButton type="button" variant="ghost" :disabled="isMutating" @click="resetHeroBackgroundForm">
                重置
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">导航链接管理</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">维护首页按钮的图标、链接与顺序。</p>
          </div>
          <UBadge variant="soft" color="primary">{{ navigationItems.length }} 条导航</UBadge>
        </div>
      </template>

      <div class="space-y-6">
        <div
          v-if="navigationItems.length === 0"
          class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300"
        >
          暂无导航链接，请在下方新增。
        </div>

        <div class="space-y-4">
          <div
            v-for="(item, index) in navigationItems"
            :key="item.id"
            class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
          >
            <div class="space-y-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="space-y-2">
                  <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                    {{ item.label || '未命名导航' }}
                    <span class="text-xs font-normal text-slate-400 dark:text-slate-500">（{{ item.id }}）</span>
                  </h4>
                  <div class="grid gap-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                    <span>图标：{{ item.icon || '未设置' }}</span>
                    <span>链接：{{ item.url || '未配置' }}</span>
                  </div>
                  <p v-if="item.tooltip" class="text-xs text-slate-400 dark:text-slate-500">
                    提示：{{ item.tooltip }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <UButton
                    size="xs"
                    variant="soft"
                    :disabled="index === 0 || isMutating || editingNavigationId === item.id"
                    @click="moveNavigationItem(index, -1)"
                  >
                    上移
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    :disabled="index === navigationItems.length - 1 || isMutating || editingNavigationId === item.id"
                    @click="moveNavigationItem(index, 1)"
                  >
                    下移
                  </UButton>
                  <UButton
                    v-if="editingNavigationId !== item.id"
                    size="xs"
                    variant="soft"
                    :disabled="isMutating"
                    @click="startEditNavigationItem(item)"
                  >
                    编辑
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :loading="isMutating"
                    @click="removeNavigationItem(item.id)"
                  >
                    删除
                  </UButton>
                </div>
              </div>

              <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <UBadge :color="item.available ? 'primary' : 'neutral'" variant="soft">
                  {{ item.available ? '已启用' : '已禁用' }}
                </UBadge>
                <span>当前排序：第 {{ index + 1 }} 位</span>
              </div>

              <div
                v-if="editingNavigationId === item.id"
                class="border-t border-slate-200 pt-4 dark:border-slate-800"
              >
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-slate-500 dark:text-slate-300">显示标题</label>
                    <UInput v-model="item.editLabel" placeholder="按钮标题" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-slate-500 dark:text-slate-300">图标名称</label>
                    <UInput v-model="item.editIcon" placeholder="如 i-heroicons-map" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-slate-500 dark:text-slate-300">链接地址</label>
                    <UInput v-model="item.editUrl" placeholder="https://example.com" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-medium text-slate-500 dark:text-slate-300">提示文案</label>
                    <UInput v-model="item.editTooltip" placeholder="鼠标 hover 提示" />
                  </div>
                </div>

                <div class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <UCheckbox v-model="item.editAvailable" />
                    启用按钮（未启用时前台将禁用点击）
                  </label>
                  <div class="flex gap-2">
                    <UButton
                      size="xs"
                      color="primary"
                      :loading="isMutating"
                      @click="saveNavigationItem(item)"
                    >
                      保存配置
                    </UButton>
                    <UButton
                      size="xs"
                      variant="ghost"
                      :disabled="isMutating"
                      @click="cancelNavigationEdit(item)"
                    >
                      取消
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60"
        >
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
              新增导航链接
            </h4>
            <UButton
              size="xs"
              variant="soft"
              @click="showNewNavigationForm = !showNewNavigationForm"
            >
              {{ showNewNavigationForm ? '收起表单' : '展开表单' }}
            </UButton>
          </div>
          <div v-if="showNewNavigationForm" class="mt-3 space-y-4">
            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">导航 ID</label>
                <UInput v-model="newNavigation.id" placeholder="唯一 ID，用于权限控制" />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">显示标题</label>
                <UInput v-model="newNavigation.label" placeholder="按钮名称" />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">链接地址</label>
                <UInput v-model="newNavigation.url" placeholder="https://example.com" />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">提示文案</label>
                <UInput v-model="newNavigation.tooltip" placeholder="悬停提示" />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-300">图标</label>
                <UInput v-model="newNavigation.icon" placeholder="如 i-heroicons-map" />
              </div>
              <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <UCheckbox v-model="newNavigation.available" />
                默认启用
              </div>
            </div>
            <div class="flex gap-2">
              <UButton
                color="primary"
                :loading="isMutating"
                @click="createNavigationItem"
              >
                添加导航
              </UButton>
              <UButton type="button" variant="ghost" :disabled="isMutating" @click="resetNavigationForm">
                重置
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">卡片可见性</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              为已注册的首页卡片分配访问控制，支持按角色或用户精准下发。
            </p>
          </div>
          <UBadge variant="soft" color="primary">{{ cardsRegistry.length }} 张卡片</UBadge>
        </div>
      </template>

      <div
        v-if="cardsRegistry.length === 0"
        class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300"
      >
        当前尚未注册任何卡片。
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div
          v-for="entry in cardEntries"
          :key="entry.card.id"
          class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <div class="space-y-3">
            <header>
              <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                {{ entry.card.name }}
                <span class="text-xs font-normal text-slate-400 dark:text-slate-500">（{{ entry.card.id }}）</span>
              </h4>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ entry.card.description || '暂无描述信息' }}
              </p>
            </header>

            <div class="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">
              <label class="flex items-center gap-2">
                <UCheckbox v-model="entry.form.enabled" />
                启用卡片
              </label>
              <label class="flex items-center gap-2">
                <UCheckbox v-model="entry.form.allowGuests" />
                允许访客查看（未登录也会展示）
              </label>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-medium text-slate-500 dark:text-slate-300">
                角色 Key 列表（逗号分隔）
              </label>
              <UInput
                v-model="entry.form.rolesInput"
                placeholder="如 admin, moderator"
              />
            </div>

            <div class="space-y-2">
              <label class="text-xs font-medium text-slate-500 dark:text-slate-300">
                指定用户（ID 或邮箱，逗号分隔）
              </label>
              <UInput
                v-model="entry.form.usersInput"
                placeholder="支持用户 ID 或邮箱地址"
              />
            </div>

            <div class="flex justify-end">
              <UButton
                size="xs"
                color="primary"
                :loading="isMutating"
                @click="saveCardConfig(entry.card.id)"
              >
                保存配置
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
