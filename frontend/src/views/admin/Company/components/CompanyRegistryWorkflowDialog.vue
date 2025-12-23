<script setup lang="ts">
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'
import type { CompanyModel } from '@/types/company'

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

function closeDialog() {
  emit('update:modelValue', false)
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
    :ui="{ content: 'w-full max-w-4xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              流程信息
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
              {{ company?.name || '流程信息' }}
            </h3>
          </div>
          <div class="flex items-center gap-3">
            <CompanyStatusBadge :status="company?.status ?? 'DRAFT'" />
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              @click="closeDialog"
            />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div class="rounded-2xl border border-slate-200/70 bg-white/80 p-6">
            <div class="mb-4 text-sm text-slate-500">
              当前流程：{{ company?.workflow?.definitionName || '未绑定流程' }}
              ·
              {{ company?.workflow?.state || '—' }}
            </div>
            <CompanyTimeline :company="company" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
