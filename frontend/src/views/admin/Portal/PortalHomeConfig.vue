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

type EditableHeroBackground =
  PortalAdminConfigResponse['hero']['backgrounds'][number] & {
    editAttachmentId: string
    editDescription: string
  }

type EditableNavigationItem =
  PortalAdminConfigResponse['navigation'][number] & {
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

// 删除确认对话框
const deleteConfirmDialogOpen = ref(false)
const deleteConfirmMessage = ref('')
const deleteConfirmCallback = ref<(() => Promise<void>) | null>(null)
const deleteConfirmSubmitting = ref(false)

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

const activeTab = ref<'hero' | 'navigation' | 'cards'>('hero')
const tabs = [
  { key: 'hero', label: 'Hero 区域' },
  { key: 'navigation', label: '导航链接' },
  { key: 'cards', label: '卡片可见性' },
] as const
function switchTab(key: (typeof tabs)[number]['key']) {
  activeTab.value = key
}

const heroDetailOpen = ref(false)
const heroDetailItem = ref<EditableHeroBackground | null>(null)
function openHeroDetail(item: EditableHeroBackground) {
  heroDetailItem.value = item
  heroDetailOpen.value = true
}

const navDetailOpen = ref(false)
const navDetailItem = ref<EditableNavigationItem | null>(null)
function openNavDetail(item: EditableNavigationItem) {
  navDetailItem.value = item
  navDetailOpen.value = true
}

const cardsDialogOpen = ref(false)
const selectedCardId = ref<string | null>(null)
function openCardDialog(cardId: string) {
  selectedCardId.value = cardId
  cardsDialogOpen.value = true
}
function updateCardsDialog(open: boolean) {
  cardsDialogOpen.value = open
}
const selectedCardEntry = computed(() => {
  const id = selectedCardId.value
  if (!id) return null
  const registry = cardsRegistry.value.find((c) => c.id === id) || null
  const form = cardsForm[id] || null
  if (!registry || !form) return null
  return { registry, form }
})

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

async function confirmDelete() {
  deleteConfirmSubmitting.value = true
  try {
    if (deleteConfirmCallback.value) {
      await deleteConfirmCallback.value()
    }
  } finally {
    deleteConfirmSubmitting.value = false
    deleteConfirmDialogOpen.value = false
    deleteConfirmCallback.value = null
    deleteConfirmMessage.value = ''
  }
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
    const response = await apiFetch<PortalAdminConfigResponse>(
      '/admin/portal/config',
      {
        token,
      },
    )
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
  deleteConfirmMessage.value = '确定要删除该背景图吗？'
  deleteConfirmCallback.value = async () => {
    try {
      const token = ensureToken()
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
    }
  }
  deleteConfirmDialogOpen.value = true
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
  deleteConfirmMessage.value = '确定要删除该导航项吗？'
  deleteConfirmCallback.value = async () => {
    try {
      const token = ensureToken()
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
    }
  }
  deleteConfirmDialogOpen.value = true
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
  <div class="space-y-6">
    <div class="flex flex-wrap justify-between items-start gap-2">
      <div class="flex items-center gap-2">
        <UButton
          v-for="tab in tabs"
          variant="soft"
          :key="tab.key"
          :color="activeTab === tab.key ? 'primary' : 'neutral'"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </UButton>
      </div>
    </div>

    <div v-if="activeTab === 'hero'">
      <div class="space-y-6">
        <section
          class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <div
            class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p
                class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                Hero 副标题
              </p>
              <p
                v-if="heroSubtitle"
                class="text-base font-medium text-slate-900 dark:text-white"
              >
                {{ heroSubtitle }}
              </p>
              <p v-else class="text-base text-slate-400 dark:text-slate-500">
                尚未设置副标题
              </p>
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
              <UButton type="submit" color="primary" :loading="isMutating">
                保存副标题
              </UButton>
              <UButton
                type="button"
                variant="ghost"
                :disabled="isMutating"
                @click="cancelHeroSubtitleEdit"
              >
                取消
              </UButton>
            </div>
          </form>
        </section>

        <div
          v-if="heroBackgrounds.length === 0"
          class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300"
        >
          暂无背景图，请通过下方表单新增一张背景图
        </div>

        <section
          v-if="heroBackgrounds.length > 0"
          class="rounded-3xl border border-slate-200/70 bg-white/80 text-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <div class="overflow-hidden rounded-3xl">
            <div class="overflow-x-auto">
              <table
                class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
              >
                <thead
                  class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
                >
                  <tr>
                    <th class="px-4 py-3">预览</th>
                    <th class="px-4 py-3">附件 ID</th>
                    <th class="px-4 py-3">描述</th>
                    <th class="px-4 py-3">可访问</th>
                    <th class="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody
                  class="divide-y divide-slate-100 dark:divide-slate-800/70"
                >
                  <tr
                    v-for="(background, index) in heroBackgrounds"
                    :key="background.id"
                    class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
                  >
                    <td class="px-4 py-3">
                      <div
                        class="h-12 w-20 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                      >
                        <img
                          v-if="background.imageUrl"
                          :src="background.imageUrl"
                          alt="预览"
                          class="h-full w-full object-cover"
                        />
                        <span
                          v-else
                          class="text-[11px] text-slate-400 dark:text-slate-500"
                          >暂无预览</span
                        >
                      </div>
                    </td>
                    <td class="px-4 py-3 text-xs break-all">
                      {{ background.attachmentId || '未配置' }}
                    </td>
                    <td class="px-4 py-3 text-xs">
                      {{ background.description || '未填写描述' }}
                    </td>
                    <td class="px-4 py-3">
                      <UBadge
                        :color="background.available ? 'primary' : 'neutral'"
                        variant="soft"
                        >{{
                          background.available ? '附件可访问' : '附件不可访问'
                        }}</UBadge
                      >
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-2">
                        <UButton
                          size="xs"
                          variant="soft"
                          @click="openHeroDetail(background)"
                          >查看</UButton
                        >
                        <UButton
                          size="xs"
                          variant="soft"
                          :disabled="index === 0 || isMutating"
                          @click="moveHeroBackground(index, -1)"
                          >上移</UButton
                        >
                        <UButton
                          size="xs"
                          variant="soft"
                          :disabled="
                            index === heroBackgrounds.length - 1 || isMutating
                          "
                          @click="moveHeroBackground(index, 1)"
                          >下移</UButton
                        >
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          :loading="isMutating"
                          @click="removeHeroBackground(background.id)"
                          >删除</UButton
                        >
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div
          class="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 p-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60"
        >
          <div class="flex items-center justify-between">
            <h4 class="px-1 text-lg text-slate-600 dark:text-slate-300">
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
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >附件 ID</label
                >
                <UInput
                  v-model="newBackground.attachmentId"
                  placeholder="来自附件系统的 ID"
                />
              </div>
              <div class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >描述（可选）</label
                >
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
              <UButton
                type="button"
                variant="ghost"
                :disabled="isMutating"
                @click="resetHeroBackgroundForm"
              >
                重置
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'navigation'">
      <div class="space-y-6">
        <div
          v-if="navigationItems.length === 0"
          class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300"
        >
          暂无导航链接，请在下方新增
        </div>
        <section
          v-if="navigationItems.length > 0"
          class="rounded-3xl border border-slate-200/70 bg-white/80 text-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <div class="overflow-hidden rounded-3xl">
            <div class="overflow-x-auto">
              <table
                class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
              >
                <thead
                  class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
                >
                  <tr>
                    <th class="px-4 py-3">标题</th>
                    <th class="px-4 py-3">ID</th>
                    <th class="px-4 py-3">图标</th>
                    <th class="px-4 py-3">链接</th>
                    <th class="px-4 py-3">可见</th>
                    <th class="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody
                  class="divide-y divide-slate-100 dark:divide-slate-800/70"
                >
                  <tr
                    v-for="(item, index) in navigationItems"
                    :key="item.id"
                    class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
                  >
                    <td class="px-4 py-3 text-sm">
                      {{ item.label || '未命名导航' }}
                    </td>
                    <td class="px-4 py-3 text-xs">{{ item.id }}</td>
                    <td class="px-4 py-3 text-xs">{{ item.icon || '未设置' }}</td>
                    <td class="px-4 py-3 text-xs break-all">
                      {{ item.url || '未配置' }}
                    </td>
                    <td class="px-4 py-3">
                      <UBadge
                        :color="item.available ? 'primary' : 'neutral'"
                        variant="soft"
                        >{{ item.available ? '可见' : '隐藏' }}</UBadge
                      >
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-2">
                        <UButton
                          size="xs"
                          variant="soft"
                          @click="openNavDetail(item)"
                          >查看</UButton
                        >
                        <UButton
                          size="xs"
                          variant="soft"
                          :disabled="index === 0 || isMutating"
                          @click="moveNavigationItem(index, -1)"
                          >上移</UButton
                        >
                        <UButton
                          size="xs"
                          variant="soft"
                          :disabled="
                            index === navigationItems.length - 1 || isMutating
                          "
                          @click="moveNavigationItem(index, 1)"
                          >下移</UButton
                        >
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          :loading="isMutating"
                          @click="removeNavigationItem(item.id)"
                          >删除</UButton
                        >
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div
          class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60"
        >
          <div class="flex items-center justify-between">
            <h4 class="px-1 text-lg text-slate-600 dark:text-slate-300">
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
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >导航 ID</label
                >
                <UInput
                  v-model="newNavigation.id"
                  placeholder="唯一 ID，用于权限控制"
                />
              </div>
              <div class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >显示标题</label
                >
                <UInput v-model="newNavigation.label" placeholder="按钮名称" />
              </div>
              <div class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >链接地址</label
                >
                <UInput
                  v-model="newNavigation.url"
                  placeholder="https://example.com"
                />
              </div>
              <div class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >提示文案</label
                >
                <UInput
                  v-model="newNavigation.tooltip"
                  placeholder="悬停提示"
                />
              </div>
              <div class="space-y-2">
                <label
                  class="text-xs font-medium text-slate-500 dark:text-slate-300"
                  >图标</label
                >
                <UInput
                  v-model="newNavigation.icon"
                  placeholder="如 i-heroicons-map"
                />
              </div>
              <div
                class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
              >
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
              <UButton
                type="button"
                variant="ghost"
                :disabled="isMutating"
                @click="resetNavigationForm"
              >
                重置
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'cards'">
      <div
        v-if="cardsRegistry.length === 0"
        class="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300"
      >
        当前尚未注册任何卡片。
      </div>

      <section
        class="rounded-3xl border border-slate-200/70 bg-white/80 text-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div class="overflow-hidden rounded-3xl">
          <div class="overflow-x-auto">
            <table
              class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
            >
              <thead
                class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
              >
                <tr>
                  <th class="px-4 py-3">名称</th>
                  <th class="px-4 py-3">ID</th>
                  <th class="px-4 py-3">启用</th>
                  <th class="px-4 py-3">允许访客</th>
                  <th class="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
                <tr
                  v-for="entry in cardEntries"
                  :key="entry.card.id"
                  class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
                >
                  <td class="px-4 py-3 text-sm">{{ entry.card.name }}</td>
                  <td class="px-4 py-3 text-xs">{{ entry.card.id }}</td>
                  <td class="px-4 py-3">
                    <UBadge
                      :color="entry.form.enabled ? 'primary' : 'neutral'"
                      variant="soft"
                      >{{ entry.form.enabled ? '启用' : '停用' }}</UBadge
                    >
                  </td>
                  <td class="px-4 py-3">
                    <UBadge
                      :color="entry.form.allowGuests ? 'primary' : 'neutral'"
                      variant="soft"
                      >{{ entry.form.allowGuests ? '允许' : '禁止' }}</UBadge
                    >
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex justify-start gap-2">
                      <UButton
                        size="xs"
                        color="primary"
                        variant="soft"
                        @click="openCardDialog(entry.card.id)"
                        >配置</UButton
                      >
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <!-- 删除确认对话框 -->
    <UModal
      :open="deleteConfirmDialogOpen"
      @update:open="deleteConfirmDialogOpen = $event"
      :ui="{
        content: 'w-full max-w-sm',
        wrapper: 'z-[140]',
        overlay: 'z-[130] bg-slate-950/40 backdrop-blur-sm',
      }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <p class="text-base font-semibold text-slate-900 dark:text-white">
            {{ deleteConfirmMessage }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              @click="deleteConfirmDialogOpen = false"
              >取消</UButton
            >
            <UButton
              color="error"
              variant="soft"
              :loading="deleteConfirmSubmitting"
              @click="confirmDelete"
              >确定</UButton
            >
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="heroDetailOpen"
      @update:open="heroDetailOpen = $event"
      :ui="{ content: 'w-full max-w-md' }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">
              背景图详情
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              @click="heroDetailOpen = false"
              >关闭</UButton
            >
          </div>
          <div v-if="heroDetailItem" class="space-y-4">
            <div
              class="h-40 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
            >
              <img
                v-if="heroDetailItem.imageUrl"
                :src="heroDetailItem.imageUrl"
                class="h-full w-full object-cover"
              />
              <span v-else class="text-xs text-slate-400 dark:text-slate-500"
                >暂无预览</span
              >
            </div>
            <div class="grid gap-2 text-sm">
              <div>
                附件 ID：<span class="break-all">{{
                  heroDetailItem.attachmentId || '未配置'
                }}</span>
              </div>
              <div>描述：{{ heroDetailItem.description || '未填写描述' }}</div>
              <div>可访问：{{ heroDetailItem.available ? '是' : '否' }}</div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="navDetailOpen"
      @update:open="navDetailOpen = $event"
      :ui="{ content: 'w-full max-w-md' }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">
              导航详情
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              @click="navDetailOpen = false"
              >关闭</UButton
            >
          </div>
          <div v-if="navDetailItem" class="space-y-3 text-sm">
            <div>标题：{{ navDetailItem.label || '未命名导航' }}</div>
            <div>ID：{{ navDetailItem.id }}</div>
            <div>图标：{{ navDetailItem.icon || '未设置' }}</div>
            <div>
              链接：<span class="break-all">{{
                navDetailItem.url || '未配置'
              }}</span>
            </div>
            <div>提示：{{ navDetailItem.tooltip || '无' }}</div>
            <div>可见：{{ navDetailItem.available ? '是' : '否' }}</div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="cardsDialogOpen"
      @update:open="updateCardsDialog"
      :ui="{ content: 'w-full max-w-md' }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3
                class="text-base font-semibold text-slate-900 dark:text-white"
              >
                配置卡片可见性
              </h3>
              <p
                class="text-xs text-slate-500 dark:text-slate-400"
                v-if="selectedCardEntry"
              >
                {{ selectedCardEntry.registry.name }}（{{
                  selectedCardEntry.registry.id
                }}）
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="updateCardsDialog(false)"
                >取消</UButton
              >
              <UButton
                color="primary"
                :loading="isMutating"
                :disabled="!selectedCardId"
                @click="selectedCardId && saveCardConfig(selectedCardId)"
                >保存</UButton
              >
            </div>
          </div>

          <div v-if="selectedCardEntry" class="space-y-4">
            <div class="flex flex-col gap-2 text-sm">
              <label class="flex items-center gap-2"
                ><UCheckbox v-model="selectedCardEntry.form.enabled" />
                启用卡片</label
              >
              <label class="flex items-center gap-2"
                ><UCheckbox v-model="selectedCardEntry.form.allowGuests" />
                允许访客查看</label
              >
            </div>
            <div class="space-y-2">
              <label
                class="text-xs font-medium text-slate-500 dark:text-slate-300"
                >角色 Key（逗号分隔）</label
              >
              <UInput
                v-model="selectedCardEntry.form.rolesInput"
                placeholder="如 admin, moderator"
              />
            </div>
            <div class="space-y-2">
              <label
                class="text-xs font-medium text-slate-500 dark:text-slate-300"
                >指定用户（ID 或邮箱，逗号分隔）</label
              >
              <UInput
                v-model="selectedCardEntry.form.usersInput"
                placeholder="支持用户 ID 或邮箱地址"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
