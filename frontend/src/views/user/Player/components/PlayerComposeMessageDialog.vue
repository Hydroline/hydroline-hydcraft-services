<script setup lang="ts">
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'

const props = defineProps<{
  open: boolean
  targetUserId: string | null
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

const composeDraft = ref('')
const composeMode = ref<'edit' | 'preview'>('edit')
const posting = ref(false)

const canSubmit = computed(() =>
  Boolean(props.targetUserId && composeDraft.value.trim().length > 0),
)

async function handlePostMessage() {
  if (!canSubmit.value || !props.targetUserId) return
  posting.value = true
  try {
    await playerPortalStore.postMessage(composeDraft.value.trim(), {
      id: props.targetUserId,
    })
    composeDraft.value = ''
    composeMode.value = 'edit'
    emit('update:open', false)
    toast.add({ title: '留言发表成功', color: 'primary' })
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : '留言失败'
    toast.add({ title: '留言失败', description, color: 'error' })
  } finally {
    posting.value = false
  }
}

function handleClose() {
  composeDraft.value = ''
  composeMode.value = 'edit'
  emit('update:open', false)
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
          <h3 class="text-lg font-semibold">发表留言</h3>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="ghost"
              :color="composeMode === 'edit' ? 'primary' : 'neutral'"
              @click="composeMode = 'edit'"
            >
              编辑
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              :color="composeMode === 'preview' ? 'primary' : 'neutral'"
              @click="composeMode = 'preview'"
            >
              预览
            </UButton>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="handleClose"
            />
          </div>
        </div>

        <div v-if="composeMode === 'edit'">
          <UTextarea
            v-model="composeDraft"
            :rows="8"
            class="w-full"
            placeholder="请遵守我国相关法律规定，营造文明友善的网络环境，最多 1000 字。"
          />
        </div>
        <div
          v-else
          class="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed min-h-[200px]"
          v-html="markdown.render(composeDraft)"
        />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="handleClose">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="posting"
            :disabled="!canSubmit"
            @click="handlePostMessage"
          >
            发送
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
