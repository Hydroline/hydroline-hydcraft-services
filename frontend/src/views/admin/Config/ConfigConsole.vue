<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
const createModalOpen = ref(false)

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
  submitting.value = true
  uiStore.startLoading()
  try {
    const payload = {
      key: namespaceForm.key.trim(),
      name: namespaceForm.name.trim(),
      description: namespaceForm.description.trim() || undefined,
    }
    if (!payload.key || !payload.name) {
      throw new Error('请填写命名空间 Key 和名称')
    }
    const created = await apiFetch<Namespace>('/config/namespaces', {
      method: 'POST',
      token: authStore.token ?? undefined,
      body: payload,
    })
    namespaces.value.push({ ...created, _count: { entries: 0 } })
    namespaceForm.key = ''
    namespaceForm.name = ''
    namespaceForm.description = ''
    selectNamespace(created.id)
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
    window.alert('请先选择命名空间')
    return
  }
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
        key: entryForm.key.trim(),
        value,
        description: entryForm.description.trim() || undefined,
      },
      },
    )
    entries.value.push(created)
    namespaceFormUpdateCount(selectedNamespaceId.value, 1)
    resetCreateForm()
    createModalOpen.value = false
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
  createModalOpen.value = true
}

function closeCreateModal() {
  createModalOpen.value = false
  resetCreateForm()
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
  editingEntry.value = null
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
  } catch (error) {
    handleError(error, '更新配置项失败')
  } finally {
    submitting.value = false
    uiStore.stopLoading()
  }
}

async function deleteEntry(entryId: string) {
  if (!selectedNamespaceId.value) return
  if (!window.confirm('确认删除该配置项？')) return
  uiStore.startLoading()
  try {
    await apiFetch(`/config/entries/${entryId}`, {
      method: 'DELETE',
      token: authStore.token ?? undefined,
    })
    entries.value = entries.value.filter((item) => item.id !== entryId)
    namespaceFormUpdateCount(selectedNamespaceId.value, -1)
  } catch (error) {
    handleError(error, '删除配置项失败')
  } finally {
    uiStore.stopLoading()
  }
}

function handleError(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    window.alert(error.message ?? fallbackMessage)
  } else if (error instanceof Error) {
    window.alert(error.message ?? fallbackMessage)
  } else {
    window.alert(fallbackMessage)
  }
  console.error(fallbackMessage, error)
}

onMounted(() => {
  void fetchNamespaces()
})
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">配置中心</h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        维护站点与客户端所需的动态 Key-Value 配置，可按命名空间分类管理。
      </p>
    </header>

    <div class="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside class="space-y-4">
        <UCard class="bg-white/80 p-4 dark:bg-slate-900/70">
          <template #header>
            <h2 class="text-sm font-semibold text-slate-900 dark:text-white">命名空间</h2>
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

        <UCard class="bg-white/80 p-4 dark:bg-slate-900/70">
          <template #header>
            <h2 class="text-sm font-semibold text-slate-900 dark:text-white">新建命名空间</h2>
          </template>
          <form class="space-y-3 text-sm" @submit.prevent="createNamespace">
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
            <UButton type="submit" color="primary" :loading="submitting" class="w-full justify-center items-center">创建命名空间</UButton>
          </form>
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
                  <UButton size="xs" color="error" variant="soft" @click="deleteEntry(entry.id)">删除</UButton>
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
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="editModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" @click="closeEditModal" />
          <div class="relative w-full max-w-2xl space-y-4 rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/85">
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
              <UButton color="neutral" variant="ghost" @click="closeEditModal">取消</UButton>
              <UButton color="primary" :loading="submitting" @click="saveEdit">保存</UButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="createModalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" @click="closeCreateModal" />
          <div class="relative w-full max-w-2xl space-y-4 rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/85">
            <header class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-slate-900 dark:text-white">新增配置项</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  创建时请确保 Key 唯一且值为合法 JSON。
                </p>
              </div>
            </header>
            <form class="space-y-3 text-sm" @submit.prevent="createEntry">
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
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
