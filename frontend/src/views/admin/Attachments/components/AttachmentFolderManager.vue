<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import type {
  AttachmentFolderEntry,
  VisibilityModeOption,
} from '@/views/admin/Attachments/types'
import type { PropType } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  folders: {
    type: Array as PropType<AttachmentFolderEntry[]>,
    default: () => [],
  },
  foldersLoading: Boolean,
  folderOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    default: () => [],
  },
  folderVisibilityOptions: {
    type: Array as PropType<
      Array<{ label: string; value: VisibilityModeOption }>
    >,
    required: true,
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
  selectPopperFixed: {
    type: Object as PropType<{ strategy: string }>,
    required: true,
  },
  attachmentDialogSelectUi: {
    type: Object as PropType<Record<string, unknown>>,
    required: true,
  },
  rootFolderValue: { type: String, required: true },
  ensureToken: { type: Function as PropType<() => string>, required: true },
  notifyError: {
    type: Function as PropType<(error: unknown, fallback: string) => void>,
    required: true,
  },
  fetchFolders: {
    type: Function as PropType<() => Promise<void>>,
    required: true,
  },
  refresh: { type: Function as PropType<() => Promise<void>>, required: true },
})

const emit = defineEmits(['update:modelValue'])
const toast = useToast()

const editingFolderId = ref<string | null>(null)
const folderSubmitting = ref(false)
const deletingFolderId = ref<string | null>(null)

const folderForm = reactive({
  name: '',
  parentId: '',
  description: '',
  visibilityMode: 'public' as VisibilityModeOption,
  visibilityRoles: [] as string[],
  visibilityLabels: [] as string[],
})

const filteredFolderOptions = computed(() =>
  folderOptions.filter((option) => option.value !== editingFolderId.value),
)

function resetFolderForm() {
  folderForm.name = ''
  folderForm.parentId = ''
  folderForm.description = ''
  folderForm.visibilityMode = 'public'
  folderForm.visibilityRoles = []
  folderForm.visibilityLabels = []
}

function startCreateFolder() {
  editingFolderId.value = null
  resetFolderForm()
}

function startEditFolder(folder: AttachmentFolderEntry) {
  editingFolderId.value = folder.id
  folderForm.name = folder.name
  folderForm.parentId = folder.parentId ?? ''
  folderForm.description = folder.description ?? ''
  folderForm.visibilityMode = (folder.visibilityMode ?? 'public')
    .toString()
    .toLowerCase() as VisibilityModeOption
  folderForm.visibilityRoles = folder.visibilityRoles ?? []
  folderForm.visibilityLabels = folder.visibilityLabels ?? []
}

function closeDialog() {
  emit('update:modelValue', false)
}

function updateFolderParent(value?: string | null) {
  if (!value || value === props.rootFolderValue) {
    folderForm.parentId = ''
    return
  }
  folderForm.parentId = value
}

function folderVisibilityLabel(mode?: string | null) {
  const normalized = (mode || '').toString().toLowerCase()
  if (normalized === 'restricted') return '受限'
  if (normalized === 'inherit') return '继承'
  return '公开'
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
  const token = props.ensureToken()
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
    closeDialog()
    resetFolderForm()
    await props.fetchFolders()
    await props.refresh()
  } catch (error) {
    props.notifyError(error, '保存附件文件夹失败')
  } finally {
    folderSubmitting.value = false
  }
}

async function deleteFolder(folder: AttachmentFolderEntry) {
  if (!window.confirm(`确定删除文件夹「${folder.path}」吗？`)) return
  const token = props.ensureToken()
  deletingFolderId.value = folder.id
  try {
    await apiFetch(`/attachments/folders/${folder.id}`, {
      method: 'DELETE',
      token,
    })
    toast.add({ title: '文件夹已删除', color: 'success' })
    await props.fetchFolders()
    await props.refresh()
  } catch (error) {
    props.notifyError(error, '删除附件文件夹失败')
  } finally {
    deletingFolderId.value = null
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      resetFolderForm()
      editingFolderId.value = null
    }
  },
)
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="emit('update:modelValue', $event)"
    :ui="{
      overlay: 'fixed inset-0 z-[160]',
      wrapper: 'z-[165]',
      content: 'w-full max-w-lg z-[170]',
    }"
  >
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
            @click="closeDialog"
            icon="i-lucide-x"
          />
        </div>
        <div class="space-y-4">
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >文件夹名称</label
            >
            <UInput
              v-model="folderForm.name"
              class="w-full"
              placeholder="输入文件夹名称"
            />
          </div>
          <div class="flex gap-2">
            <label class="w-32 text-sm text-slate-500 dark:text-slate-300"
              >父级目录（可选）</label
            >
            <USelectMenu
              class="w-full"
              :items="filteredFolderOptions"
              value-key="value"
              label-key="label"
              :model-value="(folderForm.parentId || rootFolderValue) as string"
              placeholder="若不选择则创建在根目录"
              :loading="foldersLoading"
              searchable
              :ui="attachmentDialogSelectUi"
              :popper="selectPopperFixed"
              @update:model-value="(value) => updateFolderParent(value)"
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
            @click="closeDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="folderSubmitting"
            @click="submitFolder"
          >
            {{ editingFolderId ? '保存' : '创建' }}
          </UButton>
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
              <UButton size="xs" variant="soft" @click="startCreateFolder"
                >新建</UButton
              >
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                :loading="foldersLoading"
                @click="fetchFolders"
                >刷新</UButton
              >
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
                        >编辑</UButton
                      >
                      <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        :loading="deletingFolderId === folder.id"
                        @click="deleteFolder(folder)"
                        >删除</UButton
                      >
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
</template>
