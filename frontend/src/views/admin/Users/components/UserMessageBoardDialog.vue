<script setup lang="ts">
import { ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { apiFetch } from '@/utils/http/api'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import type { PlayerMessageBoardEntry } from '@/types/portal'

const props = defineProps<{ open: boolean; userId: string | null }>()
const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const messages = ref<PlayerMessageBoardEntry[]>([])
const loading = ref(false)
const deleting = ref<Record<string, boolean>>({})
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
const toast = useToast()

async function fetchMessages() {
  if (!props.userId) {
    messages.value = []
    return
  }
  loading.value = true
  try {
    const response = await apiFetch<PlayerMessageBoardEntry[]>(
      `/player/messages?id=${props.userId}`,
    )
    messages.value = response
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : 'Failed to load messages'
    toast.add({ title: 'Loading failed', description, color: 'error' })
    messages.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (value) => {
    if (value) {
      void fetchMessages()
    }
  },
)

watch(
  () => props.userId,
  (value) => {
    if (value && props.open) {
      void fetchMessages()
    }
  },
)

async function handleDelete(messageId: string) {
  if (!props.userId) return
  deleting.value[messageId] = true
  try {
    await apiFetch(`/player/messages/${messageId}`, {
      method: 'DELETE',
    })
    await fetchMessages()
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : '删除失败'
    toast.add({ title: '删除失败', description, color: 'error' })
  } finally {
    deleting.value[messageId] = false
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
          <h3 class="text-lg font-semibold">留言区管理</h3>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            @click="emit('update:open', false)"
          >
            关闭
          </UButton>
        </div>

        <div v-if="loading" class="text-sm text-slate-500">正在加载留言...</div>
        <div v-else class="space-y-3 max-h-[65vh] overflow-y-auto">
          <template v-if="messages.length">
            <div
              v-for="entry in messages"
              :key="entry.id"
              class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900/50"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p
                    class="text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {{ entry.author.displayName ?? entry.author.email }}
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ new Date(entry.createdAt).toLocaleString() }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <UIcon name="i-lucide-thumbs-up" class="h-3 w-3" />
                    <span>{{ entry.positiveCount }}</span>
                  </span>
                  <span
                    class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <UIcon name="i-lucide-thumbs-down" class="h-3 w-3" />
                    <span>{{ entry.negativeCount }}</span>
                  </span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="danger"
                    :loading="deleting[entry.id]"
                    @click="handleDelete(entry.id)"
                  >
                    <UIcon name="i-lucide-trash-2" class="h-4 w-4" />
                    删除
                  </UButton>
                </div>
              </div>
              <div
                class="mt-3 text-sm prose prose-slate dark:prose-invert max-w-none"
                v-html="markdown.render(entry.content)"
              />
            </div>
          </template>
          <template v-else>
            <div
              class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400"
            >
              暂无留言。
            </div>
          </template>
        </div>
      </div>
    </template>
  </UModal>
</template>
