<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import type { AttachmentTagEntry } from '@/views/admin/Attachments/types'
import type { PropType } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  tags: { type: Array as PropType<AttachmentTagEntry[]>, default: () => [] },
  tagsLoading: Boolean,
  ensureToken: { type: Function as PropType<() => string>, required: true },
  notifyError: {
    type: Function as PropType<(error: unknown, fallback: string) => void>,
    required: true,
  },
  fetchTags: {
    type: Function as PropType<() => Promise<void>>,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])
const toast = useToast()

const tagForm = reactive({ key: '', name: '', description: '' })
const editTagForm = reactive({ name: '', description: '' })
const editingTagId = ref<string | null>(null)
const tagSubmitting = ref(false)
const editTagSubmitting = ref(false)
const tagDeletingId = ref<string | null>(null)
const createTagDialogOpen = ref(false)
const editTagDialogOpen = ref(false)
const deleteTagConfirmOpen = ref(false)
const pendingDeleteTag = ref<AttachmentTagEntry | null>(null)

function resetTagForm() {
  tagForm.key = ''
  tagForm.name = ''
  tagForm.description = ''
}

function openCreateTagDialog() {
  resetTagForm()
  createTagDialogOpen.value = true
}

function closeCreateTagDialog() {
  createTagDialogOpen.value = false
}

function closeEditTagDialog() {
  editTagDialogOpen.value = false
  editingTagId.value = null
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
  const token = props.ensureToken()
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
    await props.fetchTags()
    createTagDialogOpen.value = false
    resetTagForm()
  } catch (error) {
    props.notifyError(error, '保存标签失败')
  } finally {
    tagSubmitting.value = false
  }
}

function startEditTag(tag: AttachmentTagEntry) {
  editingTagId.value = tag.id
  editTagForm.name = tag.name
  editTagForm.description = tag.description ?? ''
  editTagDialogOpen.value = true
}

async function submitEditTag() {
  if (!editingTagId.value) return
  const name = editTagForm.name.trim()
  if (!name) {
    toast.add({
      title: '信息不完整',
      description: '请填写标签名称',
      color: 'warning',
    })
    return
  }
  const token = props.ensureToken()
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
    await props.fetchTags()
    editTagDialogOpen.value = false
  } catch (error) {
    props.notifyError(error, '更新标签失败')
  } finally {
    editTagSubmitting.value = false
  }
}

async function removeTag(tag: AttachmentTagEntry) {
  pendingDeleteTag.value = tag
  deleteTagConfirmOpen.value = true
}

function closeDeleteTagConfirm() {
  deleteTagConfirmOpen.value = false
  pendingDeleteTag.value = null
}

async function confirmDeleteTag() {
  if (!pendingDeleteTag.value) return
  const tag = pendingDeleteTag.value
  const token = props.ensureToken()
  tagDeletingId.value = tag.id
  try {
    await apiFetch(`/attachments/tags/${tag.id}`, {
      method: 'DELETE',
      token,
    })
    toast.add({ title: '标签已删除', color: 'warning' })
    if (editingTagId.value === tag.id) {
      editTagDialogOpen.value = false
      editingTagId.value = null
    }
    closeDeleteTagConfirm()
    await props.fetchTags()
  } catch (error) {
    props.notifyError(error, '删除标签失败')
  } finally {
    tagDeletingId.value = null
  }
}

function closeTagDialog() {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      closeCreateTagDialog()
      closeEditTagDialog()
    }
  },
)
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="emit('update:modelValue', $event)"
    :ui="{
      overlay: 'fixed inset-0 z-[150]',
      wrapper: 'z-[155]',
      content:
        'w-full max-w-lg z-[160] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-6 p-4 sm:p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              附件标签管理
            </h3>
          </div>
          <div class="flex gap-0.5">
            <UButton variant="link" @click="openCreateTagDialog"
              >新增标签</UButton
            >
            <UButton variant="link" :loading="tagsLoading" @click="fetchTags"
              >刷新</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              @click="closeTagDialog"
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
                  <UButton size="xs" variant="soft" @click="startEditTag(tag)"
                    >编辑</UButton
                  >
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

      <UModal
        v-model:open="editTagDialogOpen"
        :ui="{
          overlay: 'fixed inset-0 z-[210]',
          wrapper: 'z-[215]',
          content:
            'w-full max-w-lg z-[220] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
        }"
      >
        <template #content>
          <div class="space-y-4 p-4 sm:p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
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
                <span
                  class="w-full font-mono text-slate-800 dark:text-slate-200"
                  >{{
                    tags.find((tag) => tag.id === editingTagId)?.key ?? '—'
                  }}</span
                >
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

      <UModal
        v-model:open="createTagDialogOpen"
        :ui="{
          overlay: 'fixed inset-0 z-[210]',
          wrapper: 'z-[215]',
          content:
            'w-full max-w-lg z-[220] w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
        }"
      >
        <template #content>
          <div class="space-y-4 p-4 sm:p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3
                  class="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  新增附件标签
                </h3>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                @click="closeCreateTagDialog"
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
  </UModal>

  <UModal
    :open="deleteTagConfirmOpen"
    @update:open="closeDeleteTagConfirm"
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
            确认删除标签
          </h3>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{ pendingDeleteTag?.name ?? '该标签' }}
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="closeDeleteTagConfirm"
          >
            取消
          </UButton>
          <UButton
            color="error"
            :loading="tagDeletingId === pendingDeleteTag?.id"
            @click="confirmDeleteTag"
          >
            确认删除
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
