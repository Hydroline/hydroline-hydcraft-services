<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { apiFetch } from '@/utils/http/api'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import type { PlayerBiography } from '@/types/portal'
import MonacoMarkdownEditor from '@/components/editors/MonacoMarkdownEditor.vue'

const props = defineProps<{ open: boolean; userId: string | null }>()
const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const biography = ref<PlayerBiography | null>(null)
const loading = ref(false)
const saving = ref(false)
const mode = ref<'edit' | 'preview'>('edit')
const draft = ref('')
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
const toast = useToast()

async function fetchBiography() {
  if (!props.userId) {
    biography.value = null
    return
  }
  loading.value = true
  try {
    biography.value = await apiFetch<PlayerBiography>(
      `/player/bio?id=${props.userId}`,
    )
    draft.value = biography.value?.markdown ?? ''
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (value) => {
    if (value) {
      void fetchBiography()
    }
  },
)

watch(
  () => props.userId,
  (value) => {
    if (value && props.open) {
      void fetchBiography()
    }
  },
)

const renderedPreview = computed(() => {
  if (!draft.value) return ''
  return markdown.render(draft.value)
})

async function saveBiography() {
  if (!props.userId) return
  saving.value = true
  try {
    biography.value = await apiFetch<PlayerBiography>(
      `/player/bio?id=${props.userId}`,
      {
        method: 'POST',
        body: { markdown: draft.value },
      },
    )
    toast.add({ title: '自述已保存', color: 'primary' })
    emit('update:open', false)
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : '保存失败'
    toast.add({ title: '保存失败', description, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    @update:open="(value) => emit('update:open', value)"
    :ui="{
      content:
        'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-4 p-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">用户自述</h3>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="ghost"
              :color="mode === 'edit' ? 'primary' : 'neutral'"
              @click="mode = 'edit'"
            >
              编辑
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              :color="mode === 'preview' ? 'primary' : 'neutral'"
              @click="mode = 'preview'"
            >
              预览
            </UButton>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="emit('update:open', false)"
            />
          </div>
        </div>

        <div v-if="mode === 'edit'">
          <MonacoMarkdownEditor v-model="draft" />
        </div>
        <div
          v-else
          class="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 prose prose-slate dark:prose-invert max-w-none"
          v-html="renderedPreview"
        />

        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="emit('update:open', false)"
          >
            取消
          </UButton>
          <UButton color="primary" :loading="saving" @click="saveBiography">
            保存
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
