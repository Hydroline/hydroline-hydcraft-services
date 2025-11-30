<script setup lang="ts">
import { computed } from 'vue'
import UserDetail from '@/views/admin/Users/UserDetail.vue'

const props = defineProps<{
  open: boolean
  userId: string | null
  userSummary?: {
    displayName?: string | null
    email?: string | null
  } | null
  emailToken?: number
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'deleted'): void
}>()

const headerPrimary = computed(() => {
  const summary = props.userSummary
  if (summary?.displayName && summary.displayName.trim().length > 0) {
    return summary.displayName
  }
  if (summary?.email && summary.email.trim().length > 0) {
    return summary.email
  }
  if (props.userId) {
    return props.userId
  }
  return '用户详情'
})

function closeDialog() {
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
      <div class="flex h-full max-h-[85vh] flex-col">
        <div
          class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800"
        >
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              用户详情
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ headerPrimary }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <UserDetail
            v-if="props.open && props.userId"
            :user-id="props.userId"
            :email-token="props.emailToken"
            @deleted="emit('deleted')"
          />
          <div
            v-else
            class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
          >
            未选择用户。
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
