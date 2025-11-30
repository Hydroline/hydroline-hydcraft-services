<script setup lang="ts">
const { open, message } = defineProps<{
  open: boolean
  message: string | null
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
    :ui="{
      content: 'w-full max-w-sm w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-red-600 dark:text-red-300">
            操作失败
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('update:open', false)"
          />
        </div>
        <p
          class="rounded-lg border border-red-300/70 bg-red-50/90 px-4 py-3 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {{ message }}
        </p>
        <div class="flex justify-end">
          <UButton
            color="neutral"
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
