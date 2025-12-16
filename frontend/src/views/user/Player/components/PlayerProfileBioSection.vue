<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import type { PlayerBiography } from '@/types/portal'
import MonacoMarkdownEditor from '@/components/editors/MonacoMarkdownEditor.vue'

const props = defineProps<{
  biography: PlayerBiography | null
  open: boolean
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const playerPortalStore = usePlayerPortalStore()
const toast = useToast()
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const mode = ref<'edit' | 'preview'>('edit')
const draft = ref(props.biography?.markdown ?? '')
const saving = ref(false)

const renderedBiography = computed(() => {
  if (!props.biography?.markdown) return ''
  return markdown.render(props.biography.markdown)
})

const biographyUpdatedText = computed(() => {
  const biography = props.biography
  if (!biography?.updatedAt) return null
  const label = biography.updatedBy?.displayName
    ? `由 ${biography.updatedBy.displayName} 更新`
    : '最新更新'
  return `${label} · ${new Date(biography.updatedAt).toLocaleString()}`
})

watch(
  () => props.biography?.markdown,
  (value) => {
    if (!props.open) {
      draft.value = value ?? ''
    }
  },
)

watch(
  () => props.open,
  (value) => {
    if (value) {
      mode.value = 'edit'
      draft.value = props.biography?.markdown ?? ''
    }
  },
)

async function saveBiography() {
  saving.value = true
  try {
    await playerPortalStore.updateBiography({ markdown: draft.value })
    toast.add({ title: '自述更新成功', color: 'primary' })
    emit('update:open', false)
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : '自述保存失败'
    toast.add({
      title: '保存失败',
      description,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="props.biography?.markdown">
    <div
      class="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white backdrop-blur dark:bg-slate-800"
      v-html="renderedBiography"
    />
  </div>

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
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <span>编辑自述</span>
            <span
              v-if="biographyUpdatedText"
              class="text-xs text-slate-500 dark:text-slate-400 font-normal"
            >
              {{ biographyUpdatedText }}
            </span>
          </h3>
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
          class="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 prose prose-slate dark:prose-invert max-w-none h-64"
          v-html="markdown.render(draft)"
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
