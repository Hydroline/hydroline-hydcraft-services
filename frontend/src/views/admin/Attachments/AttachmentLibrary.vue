<script setup lang="ts">
import { computed, watch, onMounted, reactive, ref } from 'vue'
import { useAdminAttachmentsStore } from '@/stores/adminAttachments'
import { useAdminRbacStore } from '@/stores/adminRbac'
import { useUiStore } from '@/stores/ui'
import { apiFetch, ApiError, getApiBaseUrl } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import type { AdminAttachmentSummary } from '@/types/admin'

type AttachmentFolderEntry = {
  id: string
  name: string
  path: string
  parentId: string | null
  description?: string | null
  visibilityMode?: VisibilityModeOption | 'PUBLIC' | 'RESTRICTED' | 'INHERIT'
  visibilityRoles?: string[]
  visibilityLabels?: string[]
}

type AttachmentTagEntry = {
  id: string
  key: string
  name: string
  description?: string | null
}

type VisibilityModeOption = 'inherit' | 'public' | 'restricted'

type BatchUploadRow = {
  id: string
  file: File
  name: string
  description: string
  tagKeys: string[]
  visibilityMode: VisibilityModeOption
  visibilityRoles: string[]
  visibilityLabels: string[]
  status: 'pending' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}

const uiStore = useUiStore()
const authStore = useAuthStore()
const attachmentsStore = useAdminAttachmentsStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const includeDeleted = ref(attachmentsStore.filters.includeDeleted ?? false)
const backendBase = getApiBaseUrl()

const items = computed(() => attachmentsStore.items)
const pagination = computed(() => attachmentsStore.pagination)
const isFirstPage = computed(() => pagination.value.page <= 1)
const isLastPage = computed(
  () => pagination.value.page >= Math.max(pagination.value.pageCount, 1),
)
const pageInput = ref<number | null>(null)
const batchUploadDialogOpen = ref(false)
const folderDialogOpen = ref(false)
const batchFolderId = ref<string | null>(null)
const batchFiles = ref<BatchUploadRow[]>([])
const batchUploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const folders = ref<AttachmentFolderEntry[]>([])
const tags = ref<AttachmentTagEntry[]>([])
const foldersLoading = ref(false)
const tagsLoading = ref(false)
const folderSubmitting = ref(false)
const editingFolderId = ref<string | null>(null)
const selectedFolderId = ref<string | null>(null)
const folderForm = reactive({
  name: '',
  parentId: '',
  description: '',
  visibilityMode: 'public' as VisibilityModeOption,
  visibilityRoles: [] as string[],
  visibilityLabels: [] as string[],
})
const deletingFolderId = ref<string | null>(null)
selectedFolderId.value = attachmentsStore.filters.folderId ?? null
const tagDialogOpen = ref(false)
const createTagDialogOpen = ref(false)
const editingTagId = ref<string | null>(null)
const tagSubmitting = ref(false)
const tagDeletingId = ref<string | null>(null)
const tagForm = reactive({
  key: '',
  name: '',
  description: '',
})
const editTagDialogOpen = ref(false)
const editTagSubmitting = ref(false)
const editTagForm = reactive({
  name: '',
  description: '',
})
const managementDialogOpen = ref(false)
const managementSaving = ref(false)
const managementDeleting = ref(false)
const managementAttachment = ref<AdminAttachmentSummary | null>(null)
const managementForm = reactive({
  name: '',
  description: '',
  folderId: null as string | null,
  tagKeys: [] as string[],
  visibilityMode: 'inherit' as VisibilityModeOption,
  visibilityRoles: [] as string[],
  visibilityLabels: [] as string[],
})
const modalUi = {
  batch: {
    overlay: 'fixed inset-0 z-[190]',
    wrapper: 'z-[195]',
    content: 'w-full max-w-5xl z-[200]',
  },
  folder: {
    overlay: 'fixed inset-0 z-[160]',
    wrapper: 'z-[165]',
    content: 'w-full max-w-lg z-[170]',
  },
  tags: {
    overlay: 'fixed inset-0 z-[150]',
    wrapper: 'z-[155]',
    content: 'w-full max-w-lg z-[160]',
  },
  tagEditor: {
    overlay: 'fixed inset-0 z-[210]',
    wrapper: 'z-[215]',
    content: 'w-full max-w-lg z-[220]',
  },
  tagCreator: {
    overlay: 'fixed inset-0 z-[210]',
    wrapper: 'z-[215]',
    content: 'w-full max-w-lg z-[220]',
  },
  manager: {
    overlay: 'fixed inset-0 z-[205]',
    wrapper: 'z-[210]',
    content: 'w-full max-w-lg z-[215]',
  },
} as const

const attachmentDialogSelectUi = {
  content: 'z-[350]',
} as const

// 让下拉面板在模态框中不被裁剪：使用 fixed 定位的 Popper
const selectPopperFixed = { strategy: 'fixed' } as const

function closeEditTagDialog() {
  editTagDialogOpen.value = false
  editingTagId.value = null
}

const ROOT_FOLDER_VALUE = '__ROOT__'

const folderOptions = computed(() => [
  { label: '根目录 /', value: ROOT_FOLDER_VALUE },
  ...folders.value.map((folder) => ({
    label: folder.path || folder.name,
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

const hasBatchFiles = computed(() => batchFiles.value.length > 0)

function ensureToken() {
  if (!authStore.token) {
    uiStore.openLoginDialog()
    throw new Error('需要登录后才能执行该操作')
  }
  return authStore.token
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
  return folder?.path || folder?.name || '未知目录'
}

function folderVisibilityLabel(mode?: string | null) {
  const normalized = (mode || '').toString().toLowerCase()
  if (normalized === 'restricted') return '受限'
  if (normalized === 'inherit') return '继承'
  return '公开'
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

async function refresh(targetPage?: number) {
  uiStore.startLoading()
  try {
    await attachmentsStore.fetch({
      includeDeleted: includeDeleted.value,
      page: targetPage ?? pagination.value.page,
      folderId: selectedFolderId.value ?? undefined,
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

function openFolderDialog(folder?: AttachmentFolderEntry) {
  if (folder) {
    editingFolderId.value = folder.id
    folderForm.name = folder.name
    folderForm.parentId = folder.parentId ?? ''
    folderForm.description = folder.description ?? ''
    const mode = (folder.visibilityMode || 'public').toString().toLowerCase()
    folderForm.visibilityMode = (
      ['public', 'restricted'].includes(mode) ? mode : 'public'
    ) as VisibilityModeOption
    folderForm.visibilityRoles = folder.visibilityRoles ?? []
    folderForm.visibilityLabels = folder.visibilityLabels ?? []
  } else {
    resetFolderForm()
  }
  folderDialogOpen.value = true
  if (folders.value.length === 0 && !foldersLoading.value) {
    void fetchFolders()
  }
}

function startCreateFolder() {
  resetFolderForm()
  openFolderDialog()
}

function startEditFolder(folder: AttachmentFolderEntry) {
  openFolderDialog(folder)
}

function openTagDialog() {
  tagDialogOpen.value = true
  if (tags.value.length === 0 && !tagsLoading.value) {
    void fetchTags()
  }
}

function openCreateTagDialog() {
  resetTagForm()
  createTagDialogOpen.value = true
}

function resetFolderForm() {
  folderForm.name = ''
  folderForm.parentId = ''
  folderForm.description = ''
  folderForm.visibilityMode = 'public'
  folderForm.visibilityRoles = []
  folderForm.visibilityLabels = []
  editingFolderId.value = null
}

function resetTagForm() {
  tagForm.key = ''
  tagForm.name = ''
  tagForm.description = ''
}

function resetManagementForm() {
  managementForm.name = ''
  managementForm.description = ''
  managementForm.folderId = null
  managementForm.tagKeys = []
  managementForm.visibilityMode = 'inherit'
  managementForm.visibilityRoles = []
  managementForm.visibilityLabels = []
}

function openManagementDialog(item: AdminAttachmentSummary) {
  managementAttachment.value = item
  managementForm.name = item.name
  managementForm.description = item.description ?? ''
  managementForm.folderId = item.folder?.id ?? null
  managementForm.tagKeys = item.tags.map((tag) => tag.key)
  managementForm.visibilityMode = item.visibilityMode
  managementForm.visibilityRoles = [...item.visibilityRoles]
  managementForm.visibilityLabels = [...item.visibilityLabels]
  managementDialogOpen.value = true
  if (folders.value.length === 0 && !foldersLoading.value) {
    void fetchFolders()
  }
  if (tags.value.length === 0 && !tagsLoading.value) {
    void fetchTags()
  }
}

function closeManagementDialog() {
  managementDialogOpen.value = false
  managementAttachment.value = null
  resetManagementForm()
}

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

function startEditTag(tag: AttachmentTagEntry) {
  editingTagId.value = tag.id
  editTagForm.name = tag.name
  editTagForm.description = tag.description ?? ''
  editTagDialogOpen.value = true
}

function updateBatchFolder(value?: string | null) {
  if (!value || value === ROOT_FOLDER_VALUE) {
    batchFolderId.value = null
    return
  }
  batchFolderId.value = value
}

function updateFolderParent(value?: string | null) {
  if (!value || value === ROOT_FOLDER_VALUE) {
    folderForm.parentId = ''
    return
  }
  folderForm.parentId = value
}

async function submitFolder() {
  const name = folderForm.name.trim()
  if (!name) {
    toast.add({
      title: '信息不完整',
      description: '请填写文件夹名称',
      color: 'warning',
    })
    return
  }
  const token = ensureToken()
  folderSubmitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name,
      parentId: folderForm.parentId || null,
      description: folderForm.description.trim() || undefined,
      visibilityMode: folderForm.visibilityMode,
    }
    if (folderForm.visibilityMode === 'restricted') {
      payload.visibilityRoles = folderForm.visibilityRoles
      payload.visibilityLabels = folderForm.visibilityLabels
    } else {
      payload.visibilityRoles = []
      payload.visibilityLabels = []
    }

    if (editingFolderId.value) {
      await apiFetch(`/attachments/folders/${editingFolderId.value}`, {
        method: 'PATCH',
        token,
        body: payload,
      })
      toast.add({ title: '文件夹已更新', color: 'success' })
    } else {
      await apiFetch('/attachments/folders', {
        method: 'POST',
        token,
        body: payload,
      })
      toast.add({ title: '文件夹已创建', color: 'success' })
    }
    folderDialogOpen.value = false
    resetFolderForm()
    await fetchFolders()
    await refresh()
  } catch (error) {
    notifyError(error, '保存附件文件夹失败')
  } finally {
    folderSubmitting.value = false
  }
}

async function deleteFolder(folder: AttachmentFolderEntry) {
  if (!window.confirm(`确定删除文件夹「${folder.path}」吗？`)) return
  const token = ensureToken()
  deletingFolderId.value = folder.id
  try {
    await apiFetch(`/attachments/folders/${folder.id}`, {
      method: 'DELETE',
      token,
    })
    toast.add({ title: '文件夹已删除', color: 'success' })
    if (selectedFolderId.value === folder.id) {
      selectedFolderId.value = null
    }
    await fetchFolders()
    await refresh()
  } catch (error) {
    notifyError(error, '删除附件文件夹失败')
  } finally {
    deletingFolderId.value = null
  }
}

function handleFileSelection(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target?.files?.length) return
  appendFiles(target.files)
  target.value = ''
}

async function submitTagForm() {
  const name = tagForm.name.trim()
  const key = tagForm.key.trim()
  if (!name || !key) {
    toast.add({
      title: '信息不完整',
      description: '请填写标签 Key 和名称',
      color: 'warning',
    })
    return
  }
  const token = ensureToken()
  tagSubmitting.value = true
  try {
    await apiFetch('/attachments/tags', {
      method: 'POST',
      token,
      body: {
        key,
        name,
        description: tagForm.description.trim() || undefined,
      },
    })
    toast.add({ title: '标签已创建', color: 'success' })
    await fetchTags()
    resetTagForm()
    createTagDialogOpen.value = false
  } catch (error) {
    notifyError(error, '保存标签失败')
  } finally {
    tagSubmitting.value = false
  }
}

async function submitEditTag() {
  if (!editingTagId.value) {
    return
  }
  const name = editTagForm.name.trim()
  if (!name) {
    toast.add({
      title: '信息不完整',
      description: '请填写标签名称',
      color: 'warning',
    })
    return
  }
  const token = ensureToken()
  editTagSubmitting.value = true
  try {
    await apiFetch(`/attachments/tags/${editingTagId.value}`, {
      method: 'PATCH',
      token,
      body: {
        name,
        description: editTagForm.description.trim() || undefined,
      },
    })
    toast.add({ title: '标签已更新', color: 'success' })
    await fetchTags()
    closeEditTagDialog()
  } catch (error) {
    notifyError(error, '更新标签失败')
  } finally {
    editTagSubmitting.value = false
  }
}

async function removeTag(tag: AttachmentTagEntry) {
  if (!window.confirm(`确定删除标签「${tag.name}」吗？`)) {
    return
  }
  const token = ensureToken()
  tagDeletingId.value = tag.id
  try {
    await apiFetch(`/attachments/tags/${tag.id}`, {
      method: 'DELETE',
      token,
    })
    toast.add({ title: '标签已删除', color: 'warning' })
    if (editingTagId.value === tag.id) {
      closeEditTagDialog()
    }
    await fetchTags()
  } catch (error) {
    notifyError(error, '删除标签失败')
  } finally {
    tagDeletingId.value = null
  }
}

function appendFiles(fileList: FileList | File[]) {
  const newRows: BatchUploadRow[] = Array.from(fileList).map((file) =>
    reactive({
      id: `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      file,
      name: file.name,
      description: '',
      tagKeys: [] as string[],
      visibilityMode: 'inherit' as VisibilityModeOption,
      visibilityRoles: [] as string[],
      visibilityLabels: [] as string[],
      status: 'pending' as BatchUploadRow['status'],
    }),
  )
  batchFiles.value = [...batchFiles.value, ...newRows]
}

function removeBatchFile(rowId: string) {
  batchFiles.value = batchFiles.value.filter((row) => row.id !== rowId)
}

function clearBatchFiles() {
  batchFiles.value = []
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}

async function saveManagementDetails() {
  if (!managementAttachment.value) return
  const token = ensureToken()
  managementSaving.value = true
  try {
    const folderId = managementForm.folderId
    const payload: Record<string, unknown> = {
      name: managementForm.name.trim() || managementAttachment.value.name,
      description: managementForm.description.trim() || undefined,
      folderId: folderId === null ? null : folderId || undefined,
      tagKeys: managementForm.tagKeys,
      visibilityMode: managementForm.visibilityMode,
    }
    if (managementForm.visibilityMode === 'restricted') {
      payload.visibilityRoles = managementForm.visibilityRoles
      payload.visibilityLabels = managementForm.visibilityLabels
    } else {
      payload.visibilityRoles = []
      payload.visibilityLabels = []
    }

    await apiFetch(`/attachments/${managementAttachment.value.id}`, {
      method: 'PATCH',
      token,
      body: payload,
    })
    toast.add({ title: '附件信息已更新', color: 'success' })
    managementDialogOpen.value = false
    resetManagementForm()
    await refresh(pagination.value.page)
  } catch (error) {
    notifyError(error, '更新附件信息失败')
  } finally {
    managementSaving.value = false
  }
}

async function deleteAttachmentRecord() {
  if (!managementAttachment.value) return
  if (!window.confirm('确定删除该附件吗？操作不可恢复。')) {
    return
  }
  const token = ensureToken()
  managementDeleting.value = true
  try {
    await apiFetch(`/attachments/${managementAttachment.value.id}`, {
      method: 'DELETE',
      token,
    })
    toast.add({ title: '附件已删除', color: 'warning' })
    managementDialogOpen.value = false
    resetManagementForm()
    await refresh()
  } catch (error) {
    notifyError(error, '删除附件失败')
  } finally {
    managementDeleting.value = false
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

function statusLabel(status: BatchUploadRow['status']) {
  switch (status) {
    case 'uploading':
      return '上传中'
    case 'done':
      return '已完成'
    case 'error':
      return '失败'
    default:
      return '待上传'
  }
}

async function uploadBatch() {
  if (batchFiles.value.length === 0) {
    toast.add({
      title: '请选择文件',
      description: '请先添加至少一个待上传的附件',
      color: 'warning',
    })
    return
  }
  const token = ensureToken()
  batchUploading.value = true
  const summary = {
    success: 0,
    failed: 0,
  }
  try {
    for (const row of batchFiles.value) {
      row.status = 'uploading'
      row.errorMessage = ''
      const formData = new FormData()
      formData.append('file', row.file, row.file.name)
      formData.append('name', row.name.trim() || row.file.name)
      if (batchFolderId.value) {
        formData.append('folderId', batchFolderId.value)
      }
      formData.append('visibilityMode', row.visibilityMode)
      if (row.visibilityMode === 'restricted' && row.visibilityRoles.length) {
        formData.append('visibilityRoles', row.visibilityRoles.join(','))
      }
      if (row.visibilityMode === 'restricted' && row.visibilityLabels.length) {
        formData.append('visibilityLabels', row.visibilityLabels.join(','))
      }
      if (row.tagKeys.length > 0) {
        formData.append('tagKeys', row.tagKeys.join(','))
      }
      if (row.description.trim()) {
        formData.append('description', row.description.trim())
      }
      try {
        await apiFetch('/attachments', {
          method: 'POST',
          token,
          body: formData,
        })
        row.status = 'done'
        summary.success += 1
      } catch (error) {
        row.status = 'error'
        row.errorMessage =
          error instanceof ApiError ? (error.message ?? '上传失败') : '上传失败'
        summary.failed += 1
      }
    }
    if (summary.failed === 0) {
      toast.add({
        title: '上传完成',
        description: `成功上传 ${summary.success} 个附件`,
        color: 'success',
      })
      batchFiles.value = []
      batchUploadDialogOpen.value = false
      await refresh()
    } else if (summary.success > 0) {
      toast.add({
        title: '部分上传成功',
        description: `成功 ${summary.success} 个，失败 ${summary.failed} 个`,
        color: 'warning',
      })
      await refresh()
    } else {
      toast.add({
        title: '批量上传失败',
        description: '所有文件均上传失败，请检查后重试',
        color: 'error',
      })
    }
  } finally {
    batchUploading.value = false
  }
}

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

watch(folderDialogOpen, (open) => {
  if (!open) {
    resetFolderForm()
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
          <UButton variant="soft" color="primary" @click="startCreateFolder">
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
              {{ item.folder?.path ?? '根目录' }}
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

  <UModal v-model:open="managementDialogOpen" :ui="modalUi.manager">
    <template #content>
      <div class="space-y-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              管理附件
            </h3>
            <div
              v-if="managementAttachment"
              class="text-xs font-mono text-slate-500 dark:text-slate-400"
            >
              {{ managementAttachment.id }}
            </div>
          </div>
          <div class="flex gap-2">
            <UButton
              color="error"
              variant="link"
              :loading="managementDeleting"
              @click="deleteAttachmentRecord"
            >
              删除附件
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="closeManagementDialog"
            />
          </div>
        </div>

        <div v-if="managementAttachment" class="space-y-6">
          <div class="grid gap-2 md:grid-cols-2">
            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                原文件
              </div>
              <div
                class="font-mono break-all text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ managementAttachment.originalName }}
              </div>
            </div>

            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                大小
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ formatSize(managementAttachment.size) }}
              </div>
            </div>

            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                上传者
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ formatOwner(managementAttachment.owner) }}
              </div>
            </div>

            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                更新时间
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ new Date(managementAttachment.updatedAt).toLocaleString() }}
              </div>
            </div>

            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                附件名字
              </div>
              <UInput class="w-full" v-model="managementForm.name" />
            </div>

            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                所属目录
              </div>
              <USelectMenu
                class="w-full"
                :items="folderOptions"
                value-key="value"
                label-key="label"
                :model-value="
                  (managementForm.folderId || ROOT_FOLDER_VALUE) as string
                "
                placeholder="根目录"
                :ui="attachmentDialogSelectUi"
                :popper="selectPopperFixed"
                @update:model-value="
                  (value: string | undefined) =>
                    (managementForm.folderId =
                      value === ROOT_FOLDER_VALUE
                        ? null
                        : (value ?? managementForm.folderId))
                "
              />
            </div>
            <div class="space-y-1 md:col-span-2">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                描述（可选）
              </div>
              <UTextarea
                class="w-full"
                v-model="managementForm.description"
                placeholder="用于后台提示或前台展示"
                :rows="3"
              />
            </div>
            <div class="space-y-1 md:col-span-2">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                标签
              </div>
              <USelect
                class="w-full"
                multiple
                searchable
                :items="tagOptions"
                v-model="managementForm.tagKeys"
                placeholder="选择标签"
                :loading="tagsLoading"
                :ui="attachmentDialogSelectUi"
                :popper="selectPopperFixed"
              />
            </div>
            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                可见性模式
                <span class="font-medium pl-0.5 text-primary">
                  当前：{{
                    visibilitySourceLabel(
                      managementAttachment.resolvedVisibility,
                    )
                  }}</span
                >
              </div>
              <USelectMenu
                class="w-full"
                :items="visibilityModeOptions"
                value-key="value"
                label-key="label"
                v-model="managementForm.visibilityMode"
                :ui="attachmentDialogSelectUi"
                :popper="selectPopperFixed"
              />
            </div>
            <div class="space-y-1">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                可见性摘要
              </div>
              <div
                class="rounded-2xl border border-dashed border-slate-300/80 p-2 px-4 text-xs text-slate-500 dark:border-slate-700/60 dark:text-slate-400"
              >
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="
                      managementAttachment.resolvedVisibility.mode === 'public'
                        ? 'success'
                        : 'warning'
                    "
                    size="xs"
                  >
                    {{
                      managementAttachment.resolvedVisibility.mode === 'public'
                        ? '公开'
                        : '受限'
                    }}
                  </UBadge>
                  <span>
                    {{
                      visibilitySourceLabel(
                        managementAttachment.resolvedVisibility,
                      )
                    }}
                  </span>
                </div>
              </div>
            </div>

            <template v-if="managementForm.visibilityMode === 'restricted'">
              <div class="space-y-1">
                <div
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  允许的角色
                </div>
                <USelect
                  class="w-full"
                  multiple
                  :items="roleOptions"
                  v-model="managementForm.visibilityRoles"
                  placeholder="选择角色"
                  :ui="attachmentDialogSelectUi"
                  :popper="selectPopperFixed"
                />
              </div>
              <div class="space-y-1">
                <div
                  class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
                >
                  允许的权限标签
                </div>
                <USelect
                  class="w-full"
                  multiple
                  :items="permissionLabelOptions"
                  v-model="managementForm.visibilityLabels"
                  placeholder="选择权限标签"
                  :ui="attachmentDialogSelectUi"
                  :popper="selectPopperFixed"
                />
              </div>
            </template>
          </div>

          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="closeManagementDialog"
              >取消</UButton
            >
            <UButton
              color="primary"
              :loading="managementSaving"
              @click="saveManagementDetails"
            >
              保存
            </UButton>
          </div>
        </div>
        <div v-else class="py-10 text-center text-sm text-slate-500">
          未找到附件记录
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="batchUploadDialogOpen" :ui="modalUi.batch">
    <template #content>
      <div class="space-y-6 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              批量上传附件
            </h3>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            @click="batchUploadDialogOpen = false"
            icon="i-lucide-x"
          />
        </div>

        <div class="grid gap-4 md:grid-cols-[2fr,1fr]">
          <div class="space-y-2">
            <label
              class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500 dark:text-slate-300"
              >目标文件夹</label
            >
            <USelectMenu
              class="w-full"
              :items="folderOptions"
              value-key="value"
              label-key="label"
              :model-value="(batchFolderId || ROOT_FOLDER_VALUE) as string"
              placeholder="选择存储路径（默认根目录）"
              :loading="foldersLoading"
              searchable
              :ui="attachmentDialogSelectUi"
              :popper="selectPopperFixed"
              @update:model-value="
                (value: string | undefined) => updateBatchFolder(value)
              "
            />
            <p class="text-xs text-slate-500 dark:text-slate-400">
              当前目录：{{ folderLabel(batchFolderId) }}
            </p>
          </div>
          <div class="flex items-end justify-end gap-2">
            <UButton
              size="xs"
              variant="ghost"
              color="primary"
              :loading="foldersLoading"
              @click="fetchFolders"
            >
              刷新列表
            </UButton>
            <UButton size="xs" variant="soft" @click="openFolderDialog">
              新建文件夹
            </UButton>
          </div>
        </div>

        <div
          class="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 p-6 text-center dark:border-slate-700/60 dark:bg-slate-900/40"
        >
          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden"
            @change="handleFileSelection"
          />
          <p class="text-sm text-slate-600 dark:text-slate-300">
            点击下方按钮选择文件，或将文件直接拖入此区域。
          </p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-3">
            <UButton color="primary" @click="triggerFileSelect">
              选择文件
            </UButton>
            <UButton
              v-if="hasBatchFiles"
              color="neutral"
              variant="ghost"
              @click="clearBatchFiles"
            >
              清空列表
            </UButton>
          </div>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
            附件名称默认与原文件一致，可在下方列表中逐一修改。
          </p>
        </div>

        <div
          v-if="hasBatchFiles"
          class="rounded-3xl border border-slate-200/80 bg-white/90 dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <div class="overflow-x-auto">
            <table
              class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
            >
              <thead
                class="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"
              >
                <tr>
                  <th class="px-4 py-3 text-left">原始文件</th>
                  <th class="px-4 py-3 text-left">附件名称</th>
                  <th class="px-4 py-3 text-left">描述</th>
                  <th class="px-4 py-3 text-left">标签</th>
                  <th class="px-4 py-3 text-left">可见性</th>
                  <th class="px-4 py-3 text-left">状态</th>
                  <th class="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
                <tr v-for="row in batchFiles" :key="row.id" class="align-top">
                  <td class="px-4 py-3">
                    <div
                      class="text-sm font-medium text-slate-800 dark:text-white"
                    >
                      {{ row.file.name }}
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">
                      {{ formatSize(row.file.size) }}
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <UInput v-model="row.name" placeholder="输入附件名称" />
                  </td>
                  <td class="px-4 py-3">
                    <UTextarea
                      v-model="row.description"
                      :rows="2"
                      placeholder="可选，简要描述"
                    />
                  </td>
                  <td class="px-4 py-3">
                    <USelect
                      :model-value="row.tagKeys"
                      :items="tagOptions"
                      multiple
                      searchable
                      size="sm"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="选择标签"
                      :loading="tagsLoading"
                      @update:model-value="
                        (value: string[] | null) => (row.tagKeys = value ?? [])
                      "
                    />
                  </td>
                  <td class="px-4 py-3 space-y-2">
                    <USelectMenu
                      class="w-full"
                      :items="visibilityModeOptions"
                      value-key="value"
                      label-key="label"
                      v-model="row.visibilityMode"
                    />
                    <div
                      v-if="row.visibilityMode === 'restricted'"
                      class="space-y-1 text-xs"
                    >
                      <USelect
                        class="w-full"
                        multiple
                        :items="roleOptions"
                        v-model="row.visibilityRoles"
                        placeholder="允许的角色"
                      />
                      <USelect
                        class="w-full"
                        multiple
                        :items="permissionLabelOptions"
                        v-model="row.visibilityLabels"
                        placeholder="允许的权限标签"
                      />
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex gap-1">
                      <UBadge
                        :color="
                          row.status === 'done'
                            ? 'success'
                            : row.status === 'error'
                              ? 'error'
                              : row.status === 'uploading'
                                ? 'primary'
                                : 'neutral'
                        "
                        variant="soft"
                      >
                        {{ statusLabel(row.status) }}
                      </UBadge>
                      <p
                        v-if="row.errorMessage"
                        class="text-[11px] text-rose-500 dark:text-rose-400"
                      >
                        {{ row.errorMessage }}
                      </p>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :disabled="batchUploading"
                      @click="removeBatchFile(row.id)"
                    >
                      移除
                    </UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
          >
            <span>共 {{ batchFiles.length }} 个待上传附件</span>
            <UButton
              color="primary"
              :loading="batchUploading"
              :disabled="batchFiles.length === 0"
              @click="uploadBatch"
            >
              {{ batchUploading ? '上传中…' : '开始上传' }}
            </UButton>
          </div>
        </div>
        <div
          v-else
          class="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400"
        >
          暂未选择待上传的文件
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="folderDialogOpen" :ui="modalUi.folder">
    <template #content>
      <div class="space-y-6 p-4 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              附件文件夹管理
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ editingFolderId ? '编辑文件夹' : '新建文件夹' }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            @click="
              () => {
                folderDialogOpen = false
                resetFolderForm()
              }
            "
            icon="i-lucide-x"
          />
        </div>
        <div class="space-y-4">
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >文件夹名称</label
            >
            <UInput
              class="w-full"
              v-model="folderForm.name"
              placeholder="输入文件夹名称"
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >父级目录（可选）</label
            >
            <USelectMenu
              class="w-full"
              :items="
                folderOptions.filter(
                  (option) => option.value !== editingFolderId,
                )
              "
              value-key="value"
              label-key="label"
              :model-value="
                (folderForm.parentId || ROOT_FOLDER_VALUE) as string
              "
              placeholder="若不选择则创建在根目录"
              :loading="foldersLoading"
              searchable
              :ui="attachmentDialogSelectUi"
              :popper="selectPopperFixed"
              @update:model-value="
                (value: string | undefined) => updateFolderParent(value)
              "
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >描述（可选）</label
            >
            <UTextarea
              class="w-full"
              v-model="folderForm.description"
              :rows="3"
              placeholder="填写说明，帮助他人理解用途"
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >可见性</label
            >
            <div class="w-full space-y-2">
              <USelectMenu
                class="w-full"
                :items="folderVisibilityOptions"
                value-key="value"
                label-key="label"
                v-model="folderForm.visibilityMode"
                :ui="attachmentDialogSelectUi"
                :popper="selectPopperFixed"
              />
              <div
                v-if="folderForm.visibilityMode === 'restricted'"
                class="space-y-1 text-xs text-slate-500 dark:text-slate-400"
              >
                <p>允许访问的角色</p>
                <USelect
                  class="w-full"
                  multiple
                  :items="roleOptions"
                  v-model="folderForm.visibilityRoles"
                  placeholder="选择角色"
                  :ui="attachmentDialogSelectUi"
                  :popper="selectPopperFixed"
                />
                <p>允许访问的权限标签</p>
                <USelect
                  class="w-full"
                  multiple
                  :items="permissionLabelOptions"
                  v-model="folderForm.visibilityLabels"
                  placeholder="选择标签"
                  :ui="attachmentDialogSelectUi"
                  :popper="selectPopperFixed"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="folderSubmitting"
            @click="
              () => {
                folderDialogOpen = false
                resetFolderForm()
              }
            "
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="folderSubmitting"
            @click="submitFolder"
            >{{ editingFolderId ? '保存' : '创建' }}</UButton
          >
        </div>
        <div
          class="space-y-3 border-t border-slate-200/70 pt-4 dark:border-slate-800/60"
        >
          <div class="flex items-center justify-between">
            <div
              class="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              已有文件夹
            </div>
            <div class="flex gap-2">
              <UButton size="xs" variant="soft" @click="startCreateFolder">
                新建
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                :loading="foldersLoading"
                @click="fetchFolders"
              >
                刷新
              </UButton>
            </div>
          </div>
          <div
            v-if="foldersLoading"
            class="rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400"
          >
            目录加载中…
          </div>
          <div
            v-else-if="folders.length === 0"
            class="rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400"
          >
            暂无文件夹
          </div>
          <div
            v-else
            class="max-h-72 overflow-y-auto rounded-xl border border-slate-200/70 dark:border-slate-800/60"
          >
            <table
              class="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800"
            >
              <thead class="bg-slate-50/60 dark:bg-slate-900/60">
                <tr
                  class="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  <th class="px-3 py-2">路径</th>
                  <th class="px-3 py-2">可见性</th>
                  <th class="px-3 py-2">描述</th>
                  <th class="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                <tr
                  v-for="folder in folders"
                  :key="folder.id"
                  class="hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
                >
                  <td
                    class="px-3 py-2 font-mono text-[13px] text-slate-700 dark:text-slate-200"
                  >
                    {{ folder.path || folder.name }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge
                      size="xs"
                      :color="
                        folderVisibilityLabel(folder.visibilityMode) === '受限'
                          ? 'warning'
                          : 'success'
                      "
                      variant="soft"
                    >
                      {{ folderVisibilityLabel(folder.visibilityMode) }}
                    </UBadge>
                  </td>
                  <td
                    class="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    {{ folder.description || '—' }}
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div class="flex justify-end gap-2">
                      <UButton
                        size="xs"
                        variant="soft"
                        @click="startEditFolder(folder)"
                      >
                        编辑
                      </UButton>
                      <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        :loading="deletingFolderId === folder.id"
                        @click="deleteFolder(folder)"
                      >
                        删除
                      </UButton>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="tagDialogOpen" :ui="modalUi.tags">
    <template #content>
      <div class="space-y-6 p-4 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              附件标签管理
            </h3>
          </div>
          <div class="flex gap-0.5">
            <UButton variant="link" @click="openCreateTagDialog">
              新增标签
            </UButton>
            <UButton variant="link" :loading="tagsLoading" @click="fetchTags"
              >刷新</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              @click="tagDialogOpen = false"
              icon="i-lucide-x"
            />
          </div>
        </div>

        <div>
          <div
            class="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1 text-sm text-slate-600 dark:text-slate-300"
          >
            <div
              v-if="tags.length === 0 && !tagsLoading"
              class="rounded-xl border border-dashed border-slate-200/80 p-4 text-center text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400"
            >
              暂无标签
            </div>
            <div
              v-for="tag in tags"
              :key="tag.id"
              class="rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p
                    class="text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {{ tag.name }}
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    Key：{{ tag.key }}
                  </p>
                </div>
                <div class="flex gap-2">
                  <UButton size="xs" variant="soft" @click="startEditTag(tag)">
                    编辑
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :loading="tagDeletingId === tag.id"
                    @click="removeTag(tag)"
                    >删除</UButton
                  >
                </div>
              </div>
              <p
                v-if="tag.description"
                class="mt-2 text-xs text-slate-500 dark:text-slate-400"
              >
                {{ tag.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="editTagDialogOpen" :ui="modalUi.tagEditor">
    <template #content>
      <div class="space-y-4 p-4 sm:p-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              编辑标签
            </h3>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            @click="closeEditTagDialog"
            icon="i-lucide-x"
          />
        </div>
        <div class="space-y-4">
          <div class="flex gap-2">
            <span class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >标签 Key</span
            >
            <span class="w-full font-mono text-slate-800 dark:text-slate-200">
              {{ tags.find((tag) => tag.id === editingTagId)?.key ?? '—' }}
            </span>
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >标签名称</label
            >
            <UInput
              class="w-full"
              v-model="editTagForm.name"
              placeholder="显示名称"
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >描述（可选）</label
            >
            <UTextarea
              class="w-full"
              v-model="editTagForm.description"
              :rows="4"
              placeholder="可选，说明此标签的用途"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="editTagSubmitting"
            @click="closeEditTagDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="editTagSubmitting"
            @click="submitEditTag"
            >保存</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="createTagDialogOpen" :ui="modalUi.tagCreator">
    <template #content>
      <div class="space-y-4 p-4 sm:p-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              新增附件标签
            </h3>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            @click="createTagDialogOpen = false"
            icon="i-lucide-x"
          />
        </div>
        <div class="space-y-4">
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >标签 Key</label
            >
            <UInput
              class="w-full"
              v-model="tagForm.key"
              placeholder="请填写唯一 Key"
              @keydown.enter.prevent
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >标签名称</label
            >
            <UInput
              class="w-full"
              v-model="tagForm.name"
              placeholder="显示名称"
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >描述（可选）</label
            >
            <UTextarea
              class="w-full"
              v-model="tagForm.description"
              :rows="4"
              placeholder="可选，说明此标签的用途"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="tagSubmitting"
            @click="resetTagForm"
            >重置</UButton
          >
          <UButton
            color="primary"
            :loading="tagSubmitting"
            @click="submitTagForm"
            >创建</UButton
          >
        </div>
      </div>
    </template>
  </UModal>
</template>
