<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import type { AdminAttachmentSummary } from '@/types/admin'
import type { VisibilityModeOption } from '@/views/admin/Attachments/types'
import type { PropType } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  attachment: {
    type: Object as PropType<AdminAttachmentSummary | null>,
    default: null,
  },
  folderOptions: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    default: () => [],
  },
  formatSize: {
    type: Function as PropType<(bytes: number) => string>,
    required: true,
  },
  formatOwner: {
    type: Function as PropType<
      (owner: AdminAttachmentSummary['owner']) => string
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
  visibilitySourceLabel: {
    type: Function as PropType<
      (resolved: AdminAttachmentSummary['resolvedVisibility']) => string
    >,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])
const toast = useToast()

const managementForm = reactive({
  name: '',
  description: '',
  folderId: null as string | null,
  tagKeys: [] as string[],
  visibilityMode: 'inherit' as VisibilityModeOption,
  visibilityRoles: [] as string[],
  visibilityLabels: [] as string[],
})

const managementSaving = ref(false)
const managementDeleting = ref(false)
const deleteConfirmModalOpen = ref(false)

const visibleAttachment = computed(() => props.attachment)
const folderSelectValue = computed(() => {
  if (!managementForm.folderId) return props.rootFolderValue
  return managementForm.folderId
})

function resetForm() {
  managementForm.name = ''
  managementForm.description = ''
  managementForm.folderId = null
  managementForm.tagKeys = []
  managementForm.visibilityMode = 'inherit'
  managementForm.visibilityRoles = []
  managementForm.visibilityLabels = []
}

watch(
  () => props.attachment,
  (attachment) => {
    if (attachment) {
      managementForm.name = attachment.name
      managementForm.description = attachment.description ?? ''
      managementForm.folderId = attachment.folder?.id ?? null
      managementForm.tagKeys = attachment.tags.map((tag) => tag.key)
      managementForm.visibilityMode = attachment.visibilityMode
      managementForm.visibilityRoles = [...attachment.visibilityRoles]
      managementForm.visibilityLabels = [...attachment.visibilityLabels]
    } else {
      resetForm()
    }
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void props.fetchFolders()
      void props.fetchTags()
    }
    if (!open) {
      resetForm()
    }
  },
)

function closeDialog() {
  emit('update:modelValue', false)
}

async function saveDetails() {
  if (!props.attachment) return
  const token = props.ensureToken()
  managementSaving.value = true
  try {
    const payload: Record<string, unknown> = {
      name: managementForm.name.trim() || props.attachment.name,
      description: managementForm.description.trim() || undefined,
      folderId:
        managementForm.folderId === null
          ? null
          : managementForm.folderId || undefined,
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
    await apiFetch(`/attachments/${props.attachment.id}`, {
      method: 'PATCH',
      token,
      body: payload,
    })
    toast.add({ title: '附件信息已更新', color: 'success' })
    closeDialog()
    await props.refresh()
  } catch (error) {
    props.notifyError(error, '更新附件信息失败')
  } finally {
    managementSaving.value = false
  }
}

function openDeleteConfirm() {
  deleteConfirmModalOpen.value = true
}

function closeDeleteConfirm() {
  deleteConfirmModalOpen.value = false
}

async function confirmDeleteAttachment() {
  if (!props.attachment) return
  const token = props.ensureToken()
  managementDeleting.value = true
  try {
    await apiFetch(`/attachments/${props.attachment.id}`, {
      method: 'DELETE',
      token,
    })
    toast.add({ title: '附件已删除', color: 'warning' })
    closeDeleteConfirm()
    closeDialog()
    await props.refresh()
  } catch (error) {
    props.notifyError(error, '删除附件失败')
  } finally {
    managementDeleting.value = false
  }
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="emit('update:modelValue', $event)"
    :ui="{
      overlay: 'fixed inset-0 z-[205]',
      wrapper: 'z-[210]',
      content:
        'w-full max-w-lg z-[215] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-4 p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              管理附件
            </h3>
            <div
              v-if="visibleAttachment"
              class="text-xs font-mono text-slate-500 dark:text-slate-400"
            >
              {{ visibleAttachment.id }}
            </div>
          </div>
          <div class="flex gap-2">
            <UButton
              color="error"
              variant="link"
              :loading="managementDeleting"
              @click="openDeleteConfirm"
              >删除附件</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="closeDialog"
            />
          </div>
        </div>

        <div v-if="visibleAttachment" class="space-y-6">
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
                {{ visibleAttachment.originalName }}
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
                {{ formatSize(visibleAttachment.size) }}
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
                {{ formatOwner(visibleAttachment.owner) }}
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
                {{ new Date(visibleAttachment.updatedAt).toLocaleString() }}
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
                :model-value="folderSelectValue"
                placeholder="根目录"
                :ui="attachmentDialogSelectUi"
                :popper="selectPopperFixed"
                @update:model-value="
                  (value) => {
                    if (!value || value === rootFolderValue) {
                      managementForm.folderId = null
                      return
                    }
                    managementForm.folderId = value
                  }
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
                可见性
              </div>
              <div class="w-full space-y-2">
                <USelectMenu
                  class="w-full"
                  :items="visibilityModeOptions"
                  value-key="value"
                  label-key="label"
                  v-model="managementForm.visibilityMode"
                  :ui="attachmentDialogSelectUi"
                  :popper="selectPopperFixed"
                />
                <div
                  v-if="managementForm.visibilityMode === 'restricted'"
                  class="space-y-1 text-xs text-slate-500 dark:text-slate-400"
                >
                  <p>允许访问的角色</p>
                  <USelect
                    class="w-full"
                    multiple
                    :items="roleOptions"
                    v-model="managementForm.visibilityRoles"
                    placeholder="选择角色"
                    :ui="attachmentDialogSelectUi"
                    :popper="selectPopperFixed"
                  />
                  <p>允许访问的权限标签</p>
                  <USelect
                    class="w-full"
                    multiple
                    :items="permissionLabelOptions"
                    v-model="managementForm.visibilityLabels"
                    placeholder="选择标签"
                    :ui="attachmentDialogSelectUi"
                    :popper="selectPopperFixed"
                  />
                </div>
              </div>
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
                      visibleAttachment.resolvedVisibility.mode === 'public'
                        ? 'success'
                        : 'warning'
                    "
                    size="xs"
                  >
                    {{
                      visibleAttachment.resolvedVisibility.mode === 'public'
                        ? '公开'
                        : '受限'
                    }}
                  </UBadge>
                  <span>{{
                    visibilitySourceLabel(visibleAttachment.resolvedVisibility)
                  }}</span>
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
            <UButton variant="ghost" @click="closeDialog">取消</UButton>
            <UButton
              color="primary"
              :loading="managementSaving"
              @click="saveDetails"
              >保存</UButton
            >
          </div>
        </div>

        <div v-else class="py-10 text-center text-sm text-slate-500">
          未找到附件记录
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deleteConfirmModalOpen"
    @update:open="closeDeleteConfirm"
    :ui="{
      content:
        'w-full max-w-md z-[1101] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      overlay: 'z-[1100]',
    }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            确认删除附件
          </h3>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{
            visibleAttachment?.originalName ?? visibleAttachment?.id ?? '该附件'
          }}
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">此操作不可恢复</p>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDeleteConfirm">
            取消
          </UButton>
          <UButton
            color="error"
            :loading="managementDeleting"
            @click="confirmDeleteAttachment"
          >
            确认删除
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
