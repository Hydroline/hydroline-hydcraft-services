<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import { useAdminAttachmentsStore } from '@/stores/admin/attachments'
import { useAdminRbacStore } from '@/stores/admin/rbac'
import { useUiStore } from '@/stores/shared/ui'
import { apiFetch, ApiError, getApiBaseUrl } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import AttachmentManagementDialog from './components/AttachmentManagementDialog.vue'
import AttachmentBatchUploadDialog from './components/AttachmentBatchUploadDialog.vue'
import AttachmentFolderManager from './components/AttachmentFolderManager.vue'
import AttachmentTagManager from './components/AttachmentTagManager.vue'
import type { AdminAttachmentSummary } from '@/types/admin'
import type {
  AttachmentFolderEntry,
  AttachmentTagEntry,
  VisibilityModeOption,
} from '@/views/admin/Attachments/types'
import { formatFolderDisplay } from '@/views/admin/Attachments/folderDisplay'

const uiStore = useUiStore()
const authStore = useAuthStore()
const attachmentsStore = useAdminAttachmentsStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const backendBase = getApiBaseUrl()
const includeDeleted = ref(attachmentsStore.filters.includeDeleted ?? false)

const items = computed(() => attachmentsStore.items)
const pagination = computed(() => attachmentsStore.pagination)
const isFirstPage = computed(() => pagination.value.page <= 1)
const isLastPage = computed(
  () => pagination.value.page >= Math.max(pagination.value.pageCount, 1),
)

const pageInput = ref<number | null>(null)
const selectedFolderId = ref<string | null>(
  attachmentsStore.filters.folderId ?? null,
)
const folders = ref<AttachmentFolderEntry[]>([])
const tags = ref<AttachmentTagEntry[]>([])
const foldersLoading = ref(false)
const tagsLoading = ref(false)
const batchUploadDialogOpen = ref(false)
const folderDialogOpen = ref(false)
const tagDialogOpen = ref(false)
const managementDialogOpen = ref(false)
const managementAttachment = ref<AdminAttachmentSummary | null>(null)

const ROOT_FOLDER_VALUE = '__ROOT__'

const folderOptions = computed(() => [
  { label: '根目录 /', value: ROOT_FOLDER_VALUE },
  ...folders.value.map((folder) => ({
    label: formatFolderDisplay(folder),
    value: folder.id,
  })),
])

const tagOptions = computed(() =>
  tags.value.map((tag) => ({
    label: `${tag.name} (${tag.key})`,
    value: tag.key,
  })),
)

const roleOptions = computed(() =>
  rbacStore.roles.map((role) => ({
    label: role.name,
    value: role.key,
  })),
)

const permissionLabelOptions = computed(() =>
  rbacStore.labels.map((label) => ({
    label: label.name,
    value: label.key,
    color: label.color ?? undefined,
  })),
)

const visibilityModeOptions: Array<{
  label: string
  value: VisibilityModeOption
}> = [
  { label: '继承文件夹设置', value: 'inherit' },
  { label: '公开（所有人可见）', value: 'public' },
  { label: '受限（指定 RBAC）', value: 'restricted' },
]

const folderVisibilityOptions = visibilityModeOptions.filter(
  (option) => option.value !== 'inherit',
)

const selectPopperFixed = { strategy: 'fixed' } as const
const attachmentDialogSelectUi = { content: 'z-[350]' } as const

function ensureToken() {
  if (!authStore.token) {
    uiStore.openLoginDialog()
    throw new Error('需要登录后才能执行该操作')
  }
  return authStore.token
}

function notifyError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.add({
      title: error.message ?? fallback,
      color: 'error',
    })
    return
  }
  console.error(error)
  toast.add({
    title: fallback,
    description: error instanceof Error ? error.message : undefined,
    color: 'error',
  })
}

function toPublicUrl(item: (typeof items.value)[number]) {
  if (!item.publicUrl) return null
  return item.publicUrl.startsWith('http')
    ? item.publicUrl
    : `${backendBase}${item.publicUrl}`
}

function formatOwner(owner: AdminAttachmentSummary['owner']) {
  if (!owner) {
    return '已删除用户'
  }
  const name = owner.name?.trim()
  const email = owner.email?.trim()
  return name || email || '已删除用户'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function folderLabel(id: string | null) {
  if (!id) return '根目录'
  const folder = folders.value.find((item) => item.id === id)
  return folder ? formatFolderDisplay(folder) : '未知目录'
}

const folderDisplay = formatFolderDisplay

function visibilitySourceLabel(
  resolved: AdminAttachmentSummary['resolvedVisibility'],
) {
  if (resolved.source === 'folder') {
    return `继承：${resolved.folderName || '文件夹设置'}`
  }
  if (resolved.source === 'attachment') {
    return '自定义权限'
  }
  return '默认公开'
}

async function refresh(targetPage?: number) {
  uiStore.startLoading()
  try {
    await attachmentsStore.fetch({
      includeDeleted: includeDeleted.value,
      page: targetPage ?? pagination.value.page,
      folderId: selectedFolderId.value ?? null,
    })
    selectedFolderId.value = attachmentsStore.filters.folderId
  } finally {
    uiStore.stopLoading()
  }
}

function handleFolderFilterChange(value: string | null) {
  const normalized = !value || value === ROOT_FOLDER_VALUE ? null : value
  selectedFolderId.value = normalized
  void refresh(1)
}

async function fetchFolders() {
  const token = ensureToken()
  foldersLoading.value = true
  try {
    const data = await apiFetch<AttachmentFolderEntry[]>(
      '/attachments/folders/all',
      {
        token,
      },
    )
    folders.value = data
  } catch (error) {
    notifyError(error, '无法加载附件文件夹列表')
  } finally {
    foldersLoading.value = false
  }
}

async function fetchTags() {
  const token = ensureToken()
  tagsLoading.value = true
  try {
    const data = await apiFetch<AttachmentTagEntry[]>('/attachments/tags/all', {
      token,
    })
    tags.value = data
  } catch (error) {
    notifyError(error, '无法加载附件标签列表')
  } finally {
    tagsLoading.value = false
  }
}

function openBatchUploadDialog() {
  batchUploadDialogOpen.value = true
  if (folders.value.length === 0 && !foldersLoading.value) {
    void fetchFolders()
  }
  if (tags.value.length === 0 && !tagsLoading.value) {
    void fetchTags()
  }
}

function openFolderDialog() {
  folderDialogOpen.value = true
  if (folders.value.length === 0 && !foldersLoading.value) {
    void fetchFolders()
  }
}

function openTagDialog() {
  tagDialogOpen.value = true
  if (tags.value.length === 0 && !tagsLoading.value) {
    void fetchTags()
  }
}

function openManagementDialog(item: AdminAttachmentSummary) {
  managementAttachment.value = item
  managementDialogOpen.value = true
  if (folders.value.length === 0 && !foldersLoading.value) {
    void fetchFolders()
  }
  if (tags.value.length === 0 && !tagsLoading.value) {
    void fetchTags()
  }
}

function goToPage(target: number) {
  const totalPages = Math.max(pagination.value.pageCount, 1)
  const next = Math.min(Math.max(target, 1), totalPages)
  void refresh(next)
}

function goToFirstPage() {
  goToPage(1)
}

function goToLastPage() {
  goToPage(pagination.value.pageCount)
}

function goToPreviousPage() {
  goToPage(pagination.value.page - 1)
}

function goToNextPage() {
  goToPage(pagination.value.page + 1)
}

function handlePageInput() {
  if (!pageInput.value) return
  goToPage(pageInput.value)
  pageInput.value = null
}

watch(managementDialogOpen, (open) => {
  if (!open) {
    managementAttachment.value = null
  }
})

onMounted(async () => {
  if (items.value.length === 0) {
    await refresh(1)
  }
  if (authStore.token) {
    void fetchFolders()
    void fetchTags()
    void rbacStore.fetchRoles()
    void rbacStore.fetchLabels()
  }
})
</script>

<template>
  <div class="space-y-6">
    <header
      class="flex flex-col gap-3 md:flex-row md:items-center md:justify-end"
    >
      <div class="flex flex-wrap items-center gap-3">
        <label
          class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
        >
          <UCheckbox v-model="includeDeleted" @change="refresh(1)" size="sm" />
          显示已删除附件
        </label>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-slate-600 dark:text-slate-300">当前目录</span>
          <USelectMenu
            class="w-56"
            :items="folderOptions"
            value-key="value"
            label-key="label"
            :ui="{ option: { base: 'text-sm' } }"
            :model-value="(selectedFolderId || ROOT_FOLDER_VALUE) as string"
            placeholder="选择目录"
            :loading="foldersLoading"
            @update:model-value="
              (value: string | undefined) =>
                handleFolderFilterChange(value ?? ROOT_FOLDER_VALUE)
            "
          />
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="foldersLoading"
            @click="fetchFolders"
          >
            刷新目录
          </UButton>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton color="primary" @click="openBatchUploadDialog">
            批量上传
          </UButton>
          <UButton variant="soft" color="primary" @click="openFolderDialog">
            文件夹管理
          </UButton>
          <UButton variant="soft" color="primary" @click="openTagDialog">
            标签管理
          </UButton>
          <UButton
            color="primary"
            variant="link"
            :loading="attachmentsStore.loading"
            @click="refresh"
          >
            刷新
          </UButton>
        </div>
      </div>
    </header>

    <div
      class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <table
        class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
      >
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr
            class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            <th class="px-4 py-3">附件</th>
            <th class="px-4 py-3">目录</th>
            <th class="px-4 py-3">标签</th>
            <th class="px-4 py-3">大小</th>
            <th class="px-4 py-3">可见性</th>
            <th class="px-4 py-3">更新时间</th>
            <th class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="item in items"
            :key="item.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">{{
                  item.name
                }}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{
                  item.originalName
                }}</span>
                <span class="text-xs text-slate-400 dark:text-slate-500">
                  上传者：{{ formatOwner(item.owner) }}
                  <span
                    v-if="item.owner?.deleted"
                    class="ml-1 text-rose-500 dark:text-rose-400"
                  >
                    （账户已删除）
                  </span>
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ folderDisplay(item.folder ?? undefined) }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="tag in item.tags"
                  :key="tag.id"
                  color="primary"
                  variant="outline"
                >
                  {{ tag.name }}
                </UBadge>
                <span
                  v-if="item.tags.length === 0"
                  class="text-xs text-slate-400 dark:text-slate-500"
                  >无标签</span
                >
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ formatSize(item.size) }}
            </td>
            <td class="px-4 py-3 text-xs">
              <div class="flex flex-col gap-1">
                <div class="flex gap-1">
                  <UBadge
                    :color="
                      item.resolvedVisibility.mode === 'public'
                        ? 'success'
                        : 'warning'
                    "
                    variant="soft"
                  >
                    {{
                      item.resolvedVisibility.mode === 'public'
                        ? '公开'
                        : '受限'
                    }}
                  </UBadge>
                </div>
                <div class="text-slate-400 dark:text-slate-500">
                  {{ visibilitySourceLabel(item.resolvedVisibility) }}
                </div>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ new Date(item.updatedAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <UButton
                  v-if="toPublicUrl(item)"
                  :href="toPublicUrl(item) ?? undefined"
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  color="primary"
                  variant="soft"
                >
                  公开链接
                </UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  @click="openManagementDialog(item)"
                >
                  管理
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td
              colspan="7"
              class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无附件记录
            </td>
          </tr>
        </tbody>
      </table>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>
          第 {{ pagination.page }} / {{ pagination.pageCount || 1 }} 页，共
          {{ pagination.total }} 个附件
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            size="xs"
            variant="ghost"
            :disabled="isFirstPage"
            @click="goToFirstPage"
            >首页</UButton
          >
          <UButton
            size="xs"
            variant="ghost"
            :disabled="isFirstPage"
            @click="goToPreviousPage"
            >上一页</UButton
          >
          <UButton
            size="xs"
            variant="ghost"
            :disabled="isLastPage"
            @click="goToNextPage"
            >下一页</UButton
          >
          <UButton
            size="xs"
            variant="ghost"
            :disabled="isLastPage"
            @click="goToLastPage"
            >末页</UButton
          >
          <form
            class="flex items-center gap-2"
            @submit.prevent="handlePageInput"
          >
            <UInput
              v-model.number="pageInput"
              type="number"
              min="1"
              :max="pagination.pageCount || 1"
              size="xs"
              class="w-20"
              placeholder="跳转页"
            />
            <UButton type="submit" size="xs" variant="soft">跳转</UButton>
          </form>
        </div>
      </div>
    </div>
  </div>

  <AttachmentManagementDialog
    v-model="managementDialogOpen"
    :attachment="managementAttachment"
    :folder-options="folderOptions"
    :role-options="roleOptions"
    :permission-label-options="permissionLabelOptions"
    :visibility-mode-options="visibilityModeOptions"
    :root-folder-value="ROOT_FOLDER_VALUE"
    :select-popper-fixed="selectPopperFixed"
    :attachment-dialog-select-ui="attachmentDialogSelectUi"
    :ensure-token="ensureToken"
    :notify-error="notifyError"
    :refresh="refresh"
    :fetch-folders="fetchFolders"
    :fetch-tags="fetchTags"
    :visibility-source-label="visibilitySourceLabel"
    :format-size="formatSize"
    :format-owner="formatOwner"
  />

  <AttachmentBatchUploadDialog
    v-model="batchUploadDialogOpen"
    :folder-options="folderOptions"
    :tag-options="tagOptions"
    :folders-loading="foldersLoading"
    :tags-loading="tagsLoading"
    :visibility-mode-options="visibilityModeOptions"
    :root-folder-value="ROOT_FOLDER_VALUE"
    :select-popper-fixed="selectPopperFixed"
    :attachment-dialog-select-ui="attachmentDialogSelectUi"
    :ensure-token="ensureToken"
    :notify-error="notifyError"
    :refresh="refresh"
    :fetch-folders="fetchFolders"
    :fetch-tags="fetchTags"
    :folder-label="folderLabel"
    :format-size="formatSize"
    :role-options="roleOptions"
    :permission-label-options="permissionLabelOptions"
    :open-folder-dialog="openFolderDialog"
  />

  <AttachmentFolderManager
    v-model="folderDialogOpen"
    :folders="folders"
    :folders-loading="foldersLoading"
    :folder-options="folderOptions"
    :folder-visibility-options="folderVisibilityOptions"
    :role-options="roleOptions"
    :permission-label-options="permissionLabelOptions"
    :select-popper-fixed="selectPopperFixed"
    :attachment-dialog-select-ui="attachmentDialogSelectUi"
    :root-folder-value="ROOT_FOLDER_VALUE"
    :ensure-token="ensureToken"
    :notify-error="notifyError"
    :fetch-folders="fetchFolders"
    :refresh="refresh"
  />

  <AttachmentTagManager
    v-model="tagDialogOpen"
    :tags="tags"
    :tags-loading="tagsLoading"
    :ensure-token="ensureToken"
    :notify-error="notifyError"
    :fetch-tags="fetchTags"
  />
</template>
