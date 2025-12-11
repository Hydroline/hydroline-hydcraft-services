<script setup lang="ts">
import type { CompanyModel } from '@/types/company'
import CompanyStatusBadge from './CompanyStatusBadge.vue'

const props = defineProps<{
  company: CompanyModel | null
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">
        审核流程
      </h3>
      <CompanyStatusBadge v-if="company" :status="company.status" />
      <UBadge v-if="company?.workflow" color="neutral" variant="soft" size="xs">
        {{ company.workflow.definitionName || company.workflow.definitionCode }}
      </UBadge>
    </div>
    <div v-if="company?.auditTrail?.length" class="space-y-3">
      <div
        v-for="record in company.auditTrail"
        :key="record.id"
        class="rounded-xl border border-slate-200/70 bg-white/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div class="flex items-center justify-between">
          <div class="font-medium text-slate-900 dark:text-white">
            {{ record.actionLabel || record.actionKey }}
          </div>
          <span class="text-xs text-slate-500">
            {{ new Date(record.createdAt).toLocaleString() }}
          </span>
        </div>
        <p
          v-if="record.comment"
          class="mt-1 text-slate-600 dark:text-slate-300"
        >
          {{ record.comment }}
        </p>
        <p v-if="record.resultState" class="mt-1 text-xs text-slate-500">
          流转至 {{ record.resultState }}
        </p>
      </div>
    </div>
    <div
      v-else
      class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800"
    >
      暂无审核记录，将在流程推进后展示。
    </div>
  </div>
</template>
