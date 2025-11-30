<script setup lang="ts">
const { open, result } = defineProps<{
  open: boolean
  result: { temporaryPassword: string | null; message: string } | null
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'copy'): void
}>()
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
    :ui="{
      content: 'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">密码重置结果</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('update:open', false)"
          />
        </div>
        <p class="text-xs text-emerald-700 dark:text-emerald-200 font-medium">
          {{ result?.message }}
        </p>
        <div
          v-if="result?.temporaryPassword"
          class="rounded-lg border border-emerald-200/70 bg-white/80 px-4 py-3 font-mono text-sm tracking-wide text-emerald-700 shadow-sm dark:border-emerald-800/60 dark:bg-slate-900/70 dark:text-emerald-200"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="break-all">{{ result?.temporaryPassword }}</span>
            <UButton
              color="primary"
              variant="ghost"
              size="xs"
              @click="emit('copy')"
              >复制</UButton
            >
          </div>
        </div>
        <div class="flex justify-end">
          <UButton
            color="primary"
            variant="soft"
            size="sm"
            @click="emit('update:open', false)"
            >关闭</UButton
          >
        </div>
      </div>
    </template>
  </UModal>
</template>
