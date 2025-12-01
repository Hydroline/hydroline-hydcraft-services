<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerMessageBoardEntry } from '@/types/portal'

const props = defineProps<{
  messages: PlayerMessageBoardEntry[]
}>()

const emit = defineEmits<{
  (event: 'badgeClick', message: PlayerMessageBoardEntry): void
}>()

function getContentPreview(content: string) {
  return content.length > 50 ? content.slice(0, 50) + '...' : content
}

const sortedMessages = computed(() => {
  return [...props.messages].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    return aTime - bTime
  })
})
</script>

<template>
  <div
    v-if="props.messages.length > 0"
    class="relative w-full h-9 overflow-hidden"
  >
    <div
      class="absolute flex gap-2 overflow-x-auto scrollbar-hide mask-[linear-gradient(to_right,#fff_0%_60%,transparent_80%_90%)]"
    >
      <div
        v-for="message in sortedMessages"
        :key="message.id"
        class="shrink-0 cursor-pointer rounded-lg border border-primary-500 bg-primary-200/30 px-3 py-2 hover:shadow-md transition-shadow"
        @click="emit('badgeClick', message)"
      >
        <div class="flex items-center gap-3 text-xs">
          <span
            class="text-slate-700 dark:text-slate-300 max-w-[200px] truncate"
          >
            {{ getContentPreview(message.content) }}
          </span>
          <div class="flex items-center gap-2">
            <span
              class="flex items-center gap-0.5 text-green-600 dark:text-green-400"
            >
              <UIcon name="i-lucide-thumbs-up" class="h-3 w-3" />
              <span>{{ message.positiveCount }}</span>
            </span>
            <span
              class="flex items-center gap-0.5 text-red-600 dark:text-red-400"
            >
              <UIcon name="i-lucide-thumbs-down" class="h-3 w-3" />
              <span>{{ message.negativeCount }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    v-else
    class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400"
  >
    暂无留言
  </div>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
