<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch, ApiError } from '@/utils/api'
import type {
  BatchUploadRow,
  VisibilityModeOption,
} from '@/views/admin/Attachments/types'
import type { PropType } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  folderOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    default: () => [],
  },
  tagOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    default: () => [],
  },
  roleOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    default: () => [],
  },
  permissionLabelOptions: {
    type: Array as PropType<
      Array<{ label: string; value: string; color?: string }>
    >,
    default: () => [],
  },
  foldersLoading: Boolean,
  tagsLoading: Boolean,
  visibilityModeOptions: {
    type: Array as PropType<
      Array<{ label: string; value: VisibilityModeOption }>
    >,
    required: true,
  },
  rootFolderValue: { type: String, required: true },
  selectPopperFixed: {
    type: Object as PropType<{ strategy: string }>,
    required: true,
  },
  attachmentDialogSelectUi: {
    type: Object as PropType<Record<string, unknown>>,
    required: true,
  },
  ensureToken: { type: Function as PropType<() => string>, required: true },
  notifyError: {
    type: Function as PropType<(error: unknown, fallback: string) => void>,
    required: true,
  },
  refresh: { type: Function as PropType<() => Promise<void>>, required: true },
  fetchFolders: {
    type: Function as PropType<() => Promise<void>>,
    required: true,
  },
  fetchTags: {
    type: Function as PropType<() => Promise<void>>,
    required: true,
  },
  folderLabel: {
    type: Function as PropType<(id: string | null) => string>,
    required: true,
  },
  formatSize: {
    type: Function as PropType<(bytes: number) => string>,
    required: true,
  },
  openFolderDialog: { type: Function as PropType<() => void>, required: true },
})

const emit = defineEmits(['update:modelValue'])
const toast = useToast()

const batchFiles = ref<BatchUploadRow[]>([])
const batchFolderId = ref<string | null>(null)
const batchUploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const hasBatchFiles = computed(() => batchFiles.value.length > 0)

function appendFiles(fileList: FileList | File[]) {
  const newRows: BatchUploadRow[] = Array.from(fileList).map((file) =>
    reactive({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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

function handleFileSelection(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target?.files?.length) return
  appendFiles(target.files)
  target.value = ''
}

function clearBatchFiles() {
  batchFiles.value = []
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}

function removeBatchFile(rowId: string) {
  batchFiles.value = batchFiles.value.filter((row) => row.id !== rowId)
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

function updateBatchFolder(value?: string | null) {
  if (!value || value === props.rootFolderValue) {
    batchFolderId.value = null
    return
  }
  batchFolderId.value = value
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
  const token = props.ensureToken()
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
      emit('update:modelValue', false)
      await props.refresh()
    } else if (summary.success > 0) {
      toast.add({
        title: '部分上传成功',
        description: `成功 ${summary.success} 个，失败 ${summary.failed} 个`,
        color: 'warning',
      })
      await props.refresh()
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

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.folderOptions.length === 0) {
        void props.fetchFolders()
      }
      if (props.tagOptions.length === 0) {
        void props.fetchTags()
      }
    }
  },
)
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="emit('update:modelValue', $event)"
    :ui="{
      overlay: 'fixed inset-0 z-[190]',
      wrapper: 'z-[195]',
      content:
        'w-full max-w-5xl z-[200] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
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
            @click="emit('update:modelValue', false)"
            icon="i-lucide-x"
          />
        </div>

        <div class="grid gap-4 md:grid-cols-[2fr,1fr]">
          <div class="space-y-2">
            <label
              class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >目标文件夹</label
            >
            <USelectMenu
              class="w-full"
              :items="folderOptions"
              value-key="value"
              label-key="label"
              :model-value="batchFolderId ?? rootFolderValue"
              placeholder="选择存储路径（默认根目录）"
              :loading="foldersLoading"
              searchable
              :ui="attachmentDialogSelectUi"
              :popper="selectPopperFixed"
              @update:model-value="(value) => updateBatchFolder(value)"
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
              >刷新列表</UButton
            >
            <UButton size="xs" variant="soft" @click="openFolderDialog"
              >新建文件夹</UButton
            >
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
            <UButton color="primary" @click="triggerFileSelect"
              >选择文件</UButton
            >
            <UButton
              v-if="hasBatchFiles"
              color="neutral"
              variant="ghost"
              @click="clearBatchFiles"
              >清空列表</UButton
            >
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
                        (value) => (row.tagKeys = value ?? [])
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
                      <p>允许的角色</p>
                      <USelect
                        class="w-full"
                        multiple
                        :items="roleOptions"
                        v-model="row.visibilityRoles"
                        placeholder="选择角色"
                        :ui="attachmentDialogSelectUi"
                        :popper="selectPopperFixed"
                      />
                      <p>允许的权限标签</p>
                      <USelect
                        class="w-full"
                        multiple
                        :items="permissionLabelOptions"
                        v-model="row.visibilityLabels"
                        placeholder="选择标签"
                        :ui="attachmentDialogSelectUi"
                        :popper="selectPopperFixed"
                      />
                    </div>
                  </td>
                  <td
                    class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400"
                  >
                    {{ statusLabel(row.status) }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex gap-2">
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :disabled="batchUploading"
                        @click="removeBatchFile(row.id)"
                        >移除</UButton
                      >
                    </div>
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
</template>
