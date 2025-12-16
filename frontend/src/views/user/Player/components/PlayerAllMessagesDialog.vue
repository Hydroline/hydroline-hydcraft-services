<script setup lang="ts">
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { Motion } from 'motion-v'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import type {
  PlayerMessageBoardEntry,
  PlayerMessageReactionType,
} from '@/types/portal'

const props = defineProps<{
  open: boolean
  messages: PlayerMessageBoardEntry[]
  isViewerLogged: boolean
  targetUserId: string | null
  viewerId: string | null
  formatDateTime: (value: string | null | undefined) => string
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

const deleting = ref<Record<string, boolean>>({})
const reactionProcessing = ref<Record<string, boolean>>({})

const targetOptions = computed(() => ({
  id: props.targetUserId ?? undefined,
}))

async function handleDeleteMessage(messageId: string) {
  deleting.value[messageId] = true
  try {
    await playerPortalStore.deleteMessage(messageId, targetOptions.value)
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

async function toggleReaction(
  entry: PlayerMessageBoardEntry,
  reaction: PlayerMessageReactionType,
) {
  if (!props.viewerId || !props.targetUserId) return
  const current = entry.viewerReaction
  reactionProcessing.value[entry.id] = true
  try {
    if (current === reaction) {
      await playerPortalStore.clearMessageReaction(
        entry.id,
        targetOptions.value,
      )
    } else {
      await playerPortalStore.setMessageReaction(
        entry.id,
        reaction,
        targetOptions.value,
      )
    }
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : '操作失败'
    toast.add({ title: '表态失败', description, color: 'error' })
  } finally {
    reactionProcessing.value[entry.id] = false
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
          <h3 class="text-lg font-semibold">所有留言</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('update:open', false)"
          />
        </div>

        <div
          v-if="!props.messages.length"
          class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 text-center"
        >
          暂无留言，快来留下第一条评价吧。
        </div>

        <div v-else class="grid gap-4 max-h-[60vh] overflow-y-auto">
          <Motion
            v-for="(entry, index) in props.messages"
            :key="entry.id"
            as="div"
            :initial="{ opacity: 0, filter: 'blur(6px)', y: 8 }"
            :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
            :transition="{
              duration: 0.35,
              ease: 'easeInOut',
              delay: index * 0.05,
            }"
            :class="[
              'rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800 w-full',
            ]"
          >
            <div class="flex items-center justify-between">
              <div class="flex flex-col text-sm">
                <span class="font-semibold text-slate-900 dark:text-white">
                  {{ entry.author.displayName ?? entry.author.email }}
                </span>
                <span class="text-xs text-slate-500 dark:text-slate-400">
                  {{ formatDateTime(entry.createdAt) }}
                </span>
              </div>
              <div class="flex items-center gap-0.5">
                <UButton
                  size="xs"
                  variant="ghost"
                  :color="entry.viewerReaction === 'UP' ? 'success' : 'neutral'"
                  :loading="reactionProcessing[entry.id]"
                  @click="toggleReaction(entry, 'UP')"
                >
                  <UIcon name="i-lucide-thumbs-up" class="h-4 w-4" />
                  <span>{{ entry.positiveCount }}</span>
                </UButton>
                <UButton
                  size="xs"
                  variant="ghost"
                  :color="entry.viewerReaction === 'DOWN' ? 'error' : 'neutral'"
                  :loading="reactionProcessing[entry.id]"
                  @click="toggleReaction(entry, 'DOWN')"
                >
                  <UIcon name="i-lucide-thumbs-down" class="h-4 w-4" />
                  <span>{{ entry.negativeCount }}</span>
                </UButton>
                <UButton
                  v-if="entry.viewerCanDelete"
                  size="xs"
                  variant="ghost"
                  color="error"
                  :loading="deleting[entry.id]"
                  @click="handleDeleteMessage(entry.id)"
                >
                  <UIcon name="i-lucide-trash" class="h-4 w-4" />
                </UButton>
              </div>
            </div>
            <div
              class="mt-3 text-sm text-slate-700 dark:text-slate-200 prose prose-slate dark:prose-invert max-w-none"
              v-html="markdown.render(entry.content)"
            />
          </Motion>
        </div>
      </div>
    </template>
  </UModal>
</template>
