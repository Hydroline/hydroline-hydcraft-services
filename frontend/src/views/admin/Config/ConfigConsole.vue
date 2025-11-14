<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiFetch, ApiError } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

type Namespace = {
  id: string
  key: string
  name: string
  description?: string | null
  _count?: {
    entries: number
  }
}

type ConfigEntry = {
  id: string
  key: string
  value: unknown
  description?: string | null
  version: number
  updatedAt: string
}

type NamespaceListResponse = {
  items: Namespace[]
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
}

const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

const namespaces = ref<Namespace[]>([])
const selectedNamespaceId = ref<string | null>(null)
const entries = ref<ConfigEntry[]>([])
const loadingNamespaces = ref(false)
const loadingEntries = ref(false)
const submitting = ref(false)

const namespaceDetailOpen = ref(false)

const page = ref(1)
const pageSize = ref(10)
const pagination = reactive({
  total: 0,
  page: 1,
  pageSize: 10,
  pageCount: 1,
})
const safePageCount = computed(() => Math.max(pagination.pageCount, 1))
const isFirstPage = computed(() => pagination.page <= 1)
const isLastPage = computed(() => pagination.page >= pagination.pageCount)
const pageInput = ref<number | null>(null)

const namespaceForm = reactive({
  key: '',
  name: '',
  description: '',
})
const namespaceModalMode = ref<'create' | 'edit'>('create')

const entryForm = reactive({
  key: '',
  value: '{\n  \n}',
  description: '',
})

const editingEntry = ref<ConfigEntry | null>(null)
const editingValue = ref('')
const editingDescription = ref('')
const editModalOpen = ref(false)
const createEntryModalOpen = ref(false)
const namespaceModalOpen = ref(false)
const deleteModalOpen = ref(false)
const pendingDeleteEntry = ref<ConfigEntry | null>(null)
const deletingEntry = ref(false)

const selectedNamespace = computed(
  () =>
    namespaces.value.find((item) => item.id === selectedNamespaceId.value) ??
    null,
)
const isEditingNamespace = computed(() => namespaceModalMode.value === 'edit')

async function fetchNamespaces(targetPage = page.value) {
  loadingNamespaces.value = true
  try {
    const data = await apiFetch<NamespaceListResponse>(
      `/config/namespaces?page=${targetPage}&pageSize=${pageSize.value}`,
      {
        token: authStore.token ?? undefined,
      },
    )
    namespaces.value = data.items
    pagination.total = data.pagination.total
    pagination.page = data.pagination.page
    pagination.pageSize = data.pagination.pageSize
    pagination.pageCount = data.pagination.pageCount
    page.value = data.pagination.page
    if (selectedNamespaceId.value) {
      const exists = data.items.find(
        (item) => item.id === selectedNamespaceId.value,
      )
      if (!exists) {
        selectedNamespaceId.value = null
      }
    }
  } catch (error) {
    handleError(error, '无法加载配置命名空间')
  } finally {
    loadingNamespaces.value = false
  }
}

async function fetchEntries(namespaceId: string) {
  loadingEntries.value = true
  try {
    entries.value = await apiFetch<ConfigEntry[]>(
      `/config/namespaces/${namespaceId}/entries`,
      {
        token: authStore.token ?? undefined,
      },
    )
  } catch (error) {
    handleError(error, '无法加载配置项')
  } finally {
    loadingEntries.value = false
  }
}

function selectNamespace(namespaceId: string) {
  if (selectedNamespaceId.value === namespaceId) return
  selectedNamespaceId.value = namespaceId
  void fetchEntries(namespaceId)
}

function openNamespaceDetail(namespaceId: string) {
  selectedNamespaceId.value = namespaceId
  void fetchEntries(namespaceId)
  namespaceDetailOpen.value = true
}

function closeNamespaceDetail() {
  namespaceDetailOpen.value = false
}

function editNamespace(namespaceId: string) {
  selectedNamespaceId.value = namespaceId
  openNamespaceModal('edit')
}

function goToPage(target: number) {
  const totalPages = Math.max(pagination.pageCount, 1)
  const next = Math.min(Math.max(1, target), totalPages)
  void fetchNamespaces(next)
}

function handlePageInput() {
  if (!pageInput.value) return
  goToPage(pageInput.value)
}

async function submitNamespace() {
  if (namespaceModalMode.value === 'edit') {
    await updateNamespace()
    return
  }
  const key = namespaceForm.key.trim()
  const name = namespaceForm.name.trim()
  if (!key || !name) {
    toast.add({
      title: '信息不完整',
      description: '请填写命名空间 Key 和名称',
      color: 'warning',
    })
    return
  }

  submitting.value = true
  uiStore.startLoading()
  try {
    const created = await apiFetch<Namespace>('/config/namespaces', {
      method: 'POST',
      token: authStore.token ?? undefined,
      body: {
        key,
        name,
        description: namespaceForm.description.trim() || undefined,
      },
    })
    namespaces.value.push({ ...created, _count: { entries: 0 } })
    toast.add({
      title: '已创建命名空间',
      description: name,
      color: 'success',
    })
    selectNamespace(created.id)
    namespaceModalOpen.value = false
  } catch (error) {
    handleError(error, '创建命名空间失败')
  } finally {
    submitting.value = false
    uiStore.stopLoading()
  }
}

function parseJsonInput(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error('请输入正确的 JSON 值')
  }
}

async function createEntry() {
  if (!selectedNamespaceId.value) {
    toast.add({
      title: '未选择命名空间',
      description: '请先选择命名空间后再新增配置项',
      color: 'warning',
    })
    return
  }
  const key = entryForm.key.trim()
  submitting.value = true
  uiStore.startLoading()
  try {
    const value = parseJsonInput(entryForm.value)
    const created = await apiFetch<ConfigEntry>(
      `/config/namespaces/${selectedNamespaceId.value}/entries`,
      {
        method: 'POST',
        token: authStore.token ?? undefined,
        body: {
          key,
          value,
          description: entryForm.description.trim() || undefined,
        },
      },
    )
    entries.value.push(created)
    namespaceFormUpdateCount(selectedNamespaceId.value, 1)
    resetCreateForm()
    createEntryModalOpen.value = false
    toast.add({
      title: '已新增配置项',
      description: key || created.key,
      color: 'success',
    })
  } catch (error) {
    handleError(error, '新增配置项失败')
  } finally {
    submitting.value = false
    uiStore.stopLoading()
  }
}

function resetCreateForm() {
  entryForm.key = ''
  entryForm.value = '{\n  \n}'
  entryForm.description = ''
}

function openCreateModal() {
  resetCreateForm()
  createEntryModalOpen.value = true
}

function closeCreateModal() {
  createEntryModalOpen.value = false
}

function openNamespaceModal(mode: 'create' | 'edit' = 'create') {
  namespaceModalMode.value = mode
  if (mode === 'create') {
    resetNamespaceForm()
    namespaceModalOpen.value = true
    return
  }
  if (!selectedNamespace.value) {
    toast.add({
      title: '请选择命名空间',
      description: '选择后才能编辑名称和描述',
      color: 'warning',
    })
    return
  }
  namespaceForm.key = selectedNamespace.value.key
  namespaceForm.name = selectedNamespace.value.name
  namespaceForm.description = selectedNamespace.value.description ?? ''
  namespaceModalOpen.value = true
}

function closeNamespaceModal() {
  namespaceModalOpen.value = false
}

function namespaceFormUpdateCount(namespaceId: string, delta: number) {
  const ns = namespaces.value.find((item) => item.id === namespaceId)
  if (ns && ns._count) {
    ns._count.entries = Math.max(0, ns._count.entries + delta)
  }
}

async function updateNamespace() {
  const current = selectedNamespace.value
  if (!current) {
    toast.add({
      title: '未选择命名空间',
      description: '请选择后再编辑',
      color: 'warning',
    })
    return
  }
  const name = namespaceForm.name.trim()
  const description = namespaceForm.description.trim()

  submitting.value = true
  uiStore.startLoading()
  try {
    const updated = await apiFetch<Namespace>(
      `/config/namespaces/${current.id}`,
      {
        method: 'PATCH',
        token: authStore.token ?? undefined,
        body: {
          name: name || undefined,
          description: description || undefined,
        },
      },
    )
    namespaces.value = namespaces.value.map((item) =>
      item.id === updated.id
        ? { ...item, name: updated.name, description: updated.description }
        : item,
    )
    toast.add({
      title: '命名空间已更新',
      description: updated.name,
      color: 'success',
    })
    namespaceModalOpen.value = false
  } catch (error) {
    handleError(error, '更新命名空间失败')
  } finally {
    submitting.value = false
    uiStore.stopLoading()
  }
}

function openEdit(entry: ConfigEntry) {
  editingEntry.value = entry
  editingValue.value = JSON.stringify(entry.value, null, 2)
  editingDescription.value = entry.description ?? ''
  editModalOpen.value = true
}

function closeEditModal() {
  editModalOpen.value = false
}

async function saveEdit() {
  if (!editingEntry.value) return
  submitting.value = true
  uiStore.startLoading()
  try {
    const value = parseJsonInput(editingValue.value)
    const updated = await apiFetch<ConfigEntry>(
      `/config/entries/${editingEntry.value.id}`,
      {
        method: 'PATCH',
        token: authStore.token ?? undefined,
        body: {
          value,
          description: editingDescription.value.trim() || undefined,
        },
      },
    )
    entries.value = entries.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
    closeEditModal()
    toast.add({
      title: '配置项已更新',
      description: updated.key,
      color: 'success',
    })
  } catch (error) {
    handleError(error, '更新配置项失败')
  } finally {
    submitting.value = false
    uiStore.stopLoading()
  }
}

function requestDeleteEntry(entry: ConfigEntry) {
  pendingDeleteEntry.value = entry
  deleteModalOpen.value = true
}

function closeDeleteModal() {
  deleteModalOpen.value = false
}

async function confirmDeleteEntry() {
  if (!selectedNamespaceId.value || !pendingDeleteEntry.value) return
  deletingEntry.value = true
  uiStore.startLoading()
  try {
    await apiFetch(`/config/entries/${pendingDeleteEntry.value.id}`, {
      method: 'DELETE',
      token: authStore.token ?? undefined,
    })
    entries.value = entries.value.filter(
      (item) => item.id !== pendingDeleteEntry.value?.id,
    )
    toast.add({
      title: '已删除配置项',
      description: pendingDeleteEntry.value.key,
      color: 'success',
    })
    namespaceFormUpdateCount(selectedNamespaceId.value, -1)
    closeDeleteModal()
  } catch (error) {
    handleError(error, '删除配置项失败')
  } finally {
    deletingEntry.value = false
    uiStore.stopLoading()
  }
}

function handleError(error: unknown, fallbackMessage: string) {
  const detail =
    error instanceof ApiError
      ? (error.message ?? fallbackMessage)
      : error instanceof Error
        ? error.message || fallbackMessage
        : fallbackMessage

  toast.add({
    title: fallbackMessage,
    description: detail,
    color: 'error',
  })
  console.error(fallbackMessage, error)
}

function resetNamespaceForm() {
  namespaceForm.key = ''
  namespaceForm.name = ''
  namespaceForm.description = ''
  namespaceModalMode.value = 'create'
}

watch(namespaceModalOpen, (open) => {
  if (!open) {
    resetNamespaceForm()
  }
})

watch(createEntryModalOpen, (open) => {
  if (!open) {
    resetCreateForm()
  }
})

watch(editModalOpen, (open) => {
  if (!open) {
    editingEntry.value = null
    editingValue.value = ''
    editingDescription.value = ''
  }
})

watch(deleteModalOpen, (open) => {
  if (!open) {
    pendingDeleteEntry.value = null
    deletingEntry.value = false
  }
})

watch(namespaceDetailOpen, (open) => {
  if (!open) {
    pageInput.value = null
  }
})

onMounted(() => {
  void fetchNamespaces()
})
</script>

<template>
  <div class="space-y-6">
    <header
      class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        配置中心
      </h1>

      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-plus"
        @click="openNamespaceModal('create')"
        >新建命名空间</UButton
      >
    </header>

    <section class="space-y-3">
      <div
        class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <div class="overflow-x-auto">
          <table
            class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
          >
            <thead
              class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
            >
              <tr>
                <th class="px-4 py-3 text-left">名称</th>
                <th class="px-4 py-3 text-left">Key</th>
                <th class="px-4 py-3 text-left">配置项</th>
                <th class="px-4 py-3 text-left">说明</th>
                <th class="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody
              v-if="!loadingNamespaces"
              class="divide-y divide-slate-100 dark:divide-slate-800/70"
            >
              <tr
                v-for="ns in namespaces"
                :key="ns.id"
                class="transition hover:bg-slate-50/60 dark:hover:bg-slate-900/50"
              >
                <td
                  class="px-4 py-3 font-medium text-slate-900 dark:text-white"
                >
                  {{ ns.name }}
                </td>
                <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                  {{ ns.key }}
                </td>
                <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                  {{ ns._count?.entries ?? 0 }}
                </td>
                <td
                  class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ ns.description ?? '—' }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex justify-end gap-2">
                    <UButton
                      size="xs"
                      color="primary"
                      variant="soft"
                      @click="openNamespaceDetail(ns.id)"
                      >查看</UButton
                    >
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="editNamespace(ns.id)"
                      >编辑</UButton
                    >
                  </div>
                </td>
              </tr>
              <tr v-if="namespaces.length === 0">
                <td
                  colspan="5"
                  class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  暂无命名空间。
                </td>
              </tr>
            </tbody>
            <tbody v-else>
              <tr>
                <td
                  colspan="5"
                  class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  加载中...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
        >
          <span
            >第 {{ pagination.page }} / {{ pagination.pageCount || 1 }} 页，共
            {{ pagination.total }} 个命名空间</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isFirstPage || loadingNamespaces"
              @click="goToPage(1)"
              >首页</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isFirstPage || loadingNamespaces"
              @click="goToPage(page - 1)"
              >上一页</UButton
            >
            <div class="flex items-center gap-1">
              <UInput
                v-model.number="pageInput"
                type="number"
                size="xs"
                class="w-16 text-center"
                :disabled="loadingNamespaces"
                min="1"
                :max="safePageCount"
                @keydown.enter.prevent="handlePageInput"
              />
              <span class="text-xs text-slate-500 dark:text-slate-400"
                >/ {{ safePageCount }}</span
              >
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              :disabled="loadingNamespaces"
              @click="handlePageInput"
              >跳转</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isLastPage || loadingNamespaces"
              @click="goToPage(page + 1)"
              >下一页</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isLastPage || loadingNamespaces"
              @click="goToPage(pagination.pageCount)"
              >末页</UButton
            >
          </div>
        </div>
      </div>
    </section>

    <UModal
      :open="namespaceDetailOpen"
      @update:open="namespaceDetailOpen = $event"
      :ui="{ overlay: 'z-[50]', content: 'z-[50] w-full max-w-4xl' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {{ selectedNamespace?.name ?? '未选择命名空间' }}
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{
                    selectedNamespace?.description ??
                    selectedNamespace?.key ??
                    '—'
                  }}
                </p>
              </div>
              <div class="flex gap-2">
                <UButton
                  v-if="selectedNamespaceId"
                  size="xs"
                  color="primary"
                  @click="openCreateModal"
                  >新增配置项</UButton
                >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="closeNamespaceDetail"
                  >关闭</UButton
                >
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <div
              class="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
            >
              <div class="overflow-x-auto">
                <table
                  class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
                >
                  <thead
                    class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
                  >
                    <tr>
                      <th class="px-4 py-3 text-left">键</th>
                      <th class="px-4 py-3 text-left">版本</th>
                      <th class="px-4 py-3 text-left">更新时间</th>
                      <th class="px-4 py-3 text-left">描述</th>
                      <th class="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody
                    v-if="!loadingEntries"
                    class="divide-y divide-slate-100 dark:divide-slate-800/70"
                  >
                    <tr
                      v-for="entry in entries"
                      :key="entry.id"
                      class="align-top"
                    >
                      <td
                        class="px-4 py-3 font-medium text-slate-900 dark:text-white"
                      >
                        {{ entry.key }}
                      </td>
                      <td class="px-4 py-3">v{{ entry.version }}</td>
                      <td class="px-4 py-3 text-xs">
                        {{ new Date(entry.updatedAt).toLocaleString() }}
                      </td>
                      <td
                        class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400"
                      >
                        {{ entry.description ?? '—' }}
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex justify-end gap-2">
                          <UButton
                            size="xs"
                            color="neutral"
                            variant="outline"
                            @click="openEdit(entry)"
                            >编辑</UButton
                          >
                          <UButton
                            size="xs"
                            color="error"
                            variant="soft"
                            @click="requestDeleteEntry(entry)"
                            >删除</UButton
                          >
                        </div>
                      </td>
                    </tr>
                    <tr v-if="entries.length === 0">
                      <td
                        colspan="5"
                        class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        该命名空间暂无配置项。
                      </td>
                    </tr>
                  </tbody>
                  <tbody v-else>
                    <tr>
                      <td
                        colspan="5"
                        class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        加载中...
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="editModalOpen"
      :ui="{ overlay: 'z-[60]', content: 'z-[60] w-full max-w-2xl' }"
    >
      <template #content>
        <form class="space-y-4 p-6" @submit.prevent="saveEdit">
          <header>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              编辑配置项 {{ editingEntry?.key }}
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              修改值请保持合法 JSON。
            </p>
          </header>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >描述</span
            >
            <UInput v-model="editingDescription" placeholder="描述（可选）" />
          </label>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >值（JSON）</span
            >
            <UTextarea v-model="editingValue" :rows="10" spellcheck="false" />
          </label>
          <div class="flex justify-end gap-2">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              @click="closeEditModal"
              >取消</UButton
            >
            <UButton type="submit" color="primary" :loading="submitting"
              >保存</UButton
            >
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="createEntryModalOpen"
      :ui="{ overlay: 'z-[60]', content: 'z-[60] w-full max-w-2xl' }"
    >
      <template #content>
        <form class="space-y-4 p-6 text-sm" @submit.prevent="createEntry">
          <header class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                新增配置项
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                创建时请确保 Key 唯一且值为合法 JSON。
              </p>
            </div>
          </header>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-1">
              <span
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >Key</span
              >
              <UInput
                v-model="entryForm.key"
                placeholder="例如 wiki"
                required
              />
            </label>
            <label class="flex flex-col gap-1">
              <span
                class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >描述</span
              >
              <UInput
                v-model="entryForm.description"
                placeholder="补充说明（可选）"
              />
            </label>
          </div>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >值（JSON）</span
            >
            <UTextarea
              v-model="entryForm.value"
              :rows="10"
              spellcheck="false"
            />
          </label>
          <div class="flex justify-end gap-2">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              @click="closeCreateModal"
              >取消</UButton
            >
            <UButton type="submit" color="primary" :loading="submitting"
              >保存</UButton
            >
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="namespaceModalOpen"
      :ui="{ overlay: 'z-[60]', content: 'z-[60] w-full max-w-lg' }"
    >
      <template #content>
        <form class="space-y-4 p-6 text-sm" @submit.prevent="submitNamespace">
          <header>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ isEditingNamespace ? '编辑命名空间' : '新建命名空间' }}
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{
                isEditingNamespace
                  ? '更新名称或描述以便更好地识别此命名空间。'
                  : '填写后将立即创建并选中该命名空间。'
              }}
            </p>
          </header>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >Key</span
            >
            <UInput
              v-model="namespaceForm.key"
              placeholder="如 portal.navigation"
              :disabled="isEditingNamespace"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >名称</span
            >
            <UInput
              v-model="namespaceForm.name"
              placeholder="展示名称"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >描述</span
            >
            <UTextarea
              v-model="namespaceForm.description"
              placeholder="补充说明（可选）"
              :rows="2"
            />
          </label>
          <div class="flex justify-end gap-2">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              @click="closeNamespaceModal"
              >取消</UButton
            >
            <UButton type="submit" color="primary" :loading="submitting">
              {{ isEditingNamespace ? '保存' : '创建' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteModalOpen"
      :ui="{ overlay: 'z-[60]', content: 'z-[60] w-full max-w-md' }"
    >
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <header>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              确认删除
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              删除后该配置项将无法恢复，确定要删除
              <span class="font-medium">{{ pendingDeleteEntry?.key }}</span>
              吗？
            </p>
          </header>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closeDeleteModal"
              >取消</UButton
            >
            <UButton
              color="error"
              :loading="deletingEntry"
              @click="confirmDeleteEntry"
              >删除</UButton
            >
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
