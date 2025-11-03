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

const authStore = useAuthStore()
const uiStore = useUiStore()
const toast = useToast()

const namespaces = ref<Namespace[]>([])
const selectedNamespaceId = ref<string | null>(null)
const entries = ref<ConfigEntry[]>([])
const loadingNamespaces = ref(false)
const loadingEntries = ref(false)
const submitting = ref(false)

const namespaceForm = reactive({
  key: '',
  name: '',
  description: '',
})

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

const selectedNamespace = computed(() =>
  namespaces.value.find((item) => item.id === selectedNamespaceId.value) ?? null,
)

async function fetchNamespaces() {
  loadingNamespaces.value = true
  try {
    const data = await apiFetch<Namespace[]>('/config/namespaces', {
      token: authStore.token ?? undefined,
    })
    namespaces.value = data
    if (!selectedNamespaceId.value && data.length > 0) {
      selectedNamespaceId.value = data[0].id
      await fetchEntries(data[0].id)
    } else if (selectedNamespaceId.value) {
      const exists = data.find((item) => item.id === selectedNamespaceId.value)
      if (!exists && data.length > 0) {
        selectedNamespaceId.value = data[0].id
        await fetchEntries(data[0].id)
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
    entries.value = await apiFetch<ConfigEntry[]>(`/config/namespaces/${namespaceId}/entries`, {
      token: authStore.token ?? undefined,
    })
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

async function createNamespace() {
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

function openNamespaceModal() {
  resetNamespaceForm()
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
    const updated = await apiFetch<ConfigEntry>(`/config/entries/${editingEntry.value.id}`, {
      method: 'PATCH',
      token: authStore.token ?? undefined,
      body: {
        value,
        description: editingDescription.value.trim() || undefined,
      },
    })
    entries.value = entries.value.map((item) => (item.id === updated.id ? updated : item))
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
    entries.value = entries.value.filter((item) => item.id !== pendingDeleteEntry.value?.id)
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
      ? error.message ?? fallbackMessage
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

onMounted(() => {
  void fetchNamespaces()
})
</script>

<template>
  <section class="flex w-full flex-col gap-8 px-4 pb-10 lg:px-10">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">配置中心</h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        维护站点与客户端所需的动态 Key-Value 配置，可按命名空间分类管理。
      </p>
    </header>

    <div class="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside class="space-y-4">
        <UCard class="bg-white/80 p-4 dark:bg-slate-900/70">
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-slate-900 dark:text-white">命名空间</h2>
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-plus"
                class="items-center"
                @click="openNamespaceModal"
              >
                新增
              </UButton>
            </div>
          </template>
          <div class="space-y-2">
            <button
              v-for="ns in namespaces"
              :key="ns.id"
              type="button"
              class="w-full rounded-lg border px-3 py-2 text-left text-sm transition"
              :class="[
                selectedNamespaceId === ns.id
                  ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-200'
                  : 'border-slate-200 hover:border-primary-200 dark:border-slate-700 dark:hover:border-primary-400',
              ]"
              @click="selectNamespace(ns.id)"
            >
              <p class="font-medium">{{ ns.name }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">{{ ns.key }}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">
                配置项：{{ ns._count?.entries ?? 0 }}
              </p>
            </button>
            <p v-if="!namespaces.length && !loadingNamespaces" class="text-xs text-slate-500">
              暂无命名空间，请先创建。
            </p>
          </div>
        </UCard>
      </aside>

      <main class="space-y-6">
        <UCard class="bg-white/80 p-6 dark:bg-slate-900/70">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                  {{ selectedNamespace?.name ?? '未选择命名空间' }}
                </h2>
                <p class="text-xs text-slate-500">
                  {{ selectedNamespace?.description ?? selectedNamespace?.key ?? '请选择左侧命名空间以查看配置项' }}
                </p>
              </div>
              <UButton
                v-if="selectedNamespaceId"
                size="sm"
                color="primary"
                class="shrink-0 justify-center items-center"
                @click="openCreateModal"
              >
                新增配置项
              </UButton>
            </div>
          </template>

          <div v-if="!selectedNamespaceId" class="text-sm text-slate-500">
            请选择命名空间以查看配置项。
          </div>

          <div v-else class="space-y-4">
            <article
              v-for="entry in entries"
              :key="entry.id"
              class="rounded-xl border border-slate-200/70 p-4 text-sm dark:border-slate-700/70"
            >
              <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="font-semibold text-slate-900 dark:text-white">{{ entry.key }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    更新于 {{ new Date(entry.updatedAt).toLocaleString() }} · 版本 {{ entry.version }}
                  </p>
                </div>
                <div class="flex gap-2">
                  <UButton size="xs" color="neutral" variant="outline" @click="openEdit(entry)">编辑</UButton>
                  <UButton size="xs" color="error" variant="soft" @click="requestDeleteEntry(entry)">删除</UButton>
                </div>
              </header>
              <p v-if="entry.description" class="mb-2 text-xs text-slate-500 dark:text-slate-400">
                {{ entry.description }}
              </p>
              <pre class="max-h-52 overflow-auto rounded-lg bg-slate-950/90 p-3 text-xs text-slate-100 dark:bg-slate-900/80">{{ JSON.stringify(entry.value, null, 2) }}</pre>
            </article>

            <p v-if="!entries.length && !loadingEntries" class="text-sm text-slate-500">
              该命名空间暂无配置项。
            </p>
          </div>
        </UCard>
      </main>
    </div>
    <UModal v-model:open="editModalOpen" :ui="{ content: 'w-full max-w-2xl' }">
      <template #content>
        <form class="space-y-4 p-6" @submit.prevent="saveEdit">
          <header>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">编辑配置项 {{ editingEntry?.key }}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">修改值请保持合法 JSON。</p>
          </header>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">描述</span>
            <UInput v-model="editingDescription" placeholder="描述（可选）" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">值（JSON）</span>
            <UTextarea v-model="editingValue" :rows="10" spellcheck="false" />
          </label>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="closeEditModal">取消</UButton>
            <UButton type="submit" color="primary" :loading="submitting">保存</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="createEntryModalOpen" :ui="{ content: 'w-full max-w-2xl' }">
      <template #content>
        <form class="space-y-4 p-6 text-sm" @submit.prevent="createEntry">
          <header class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">新增配置项</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                创建时请确保 Key 唯一且值为合法 JSON。
              </p>
            </div>
          </header>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Key</span>
              <UInput v-model="entryForm.key" placeholder="例如 wiki" required />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">描述</span>
              <UInput v-model="entryForm.description" placeholder="补充说明（可选）" />
            </label>
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">值（JSON）</span>
            <UTextarea v-model="entryForm.value" :rows="10" spellcheck="false" />
          </label>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="closeCreateModal">取消</UButton>
            <UButton type="submit" color="primary" :loading="submitting">保存</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="namespaceModalOpen" :ui="{ content: 'w-full max-w-lg' }">
      <template #content>
        <form class="space-y-4 p-6 text-sm" @submit.prevent="createNamespace">
          <header>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">新建命名空间</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">填写后将立即创建并选中该命名空间。</p>
          </header>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Key</span>
            <UInput v-model="namespaceForm.key" placeholder="如 portal.navigation" required />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">名称</span>
            <UInput v-model="namespaceForm.name" placeholder="展示名称" required />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">描述</span>
            <UTextarea v-model="namespaceForm.description" placeholder="补充说明（可选）" :rows="2" />
          </label>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="closeNamespaceModal">取消</UButton>
            <UButton type="submit" color="primary" :loading="submitting">创建</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="deleteModalOpen" :ui="{ content: 'w-full max-w-md' }">
      <template #content>
        <div class="space-y-4 p-6 text-sm">
          <header>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">确认删除</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              删除后该配置项将无法恢复，确定要删除
              <span class="font-medium">{{ pendingDeleteEntry?.key }}</span>
              吗？
            </p>
          </header>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closeDeleteModal">取消</UButton>
            <UButton color="error" :loading="deletingEntry" @click="confirmDeleteEntry">删除</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
