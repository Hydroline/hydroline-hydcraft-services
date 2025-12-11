<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { CompanyRecommendation } from '@/types/company'
import CompanyStatusBadge from './CompanyStatusBadge.vue'

const props = defineProps<{
  company: CompanyRecommendation
}>()

const company = computed(() => props.company)
</script>

<template>
  <UCard
    class="group h-full border border-slate-200/80 dark:border-slate-800/60"
    :ui="{
      base: 'transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-xl/20',
      body: 'flex flex-col gap-3 p-4',
    }"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="text-base font-semibold text-slate-900 dark:text-white">
          {{ company.name }}
        </h3>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ company.industry?.name || '未分类行业' }} ·
          {{ company.type?.name || '自定义主体' }}
        </p>
      </div>
      <CompanyStatusBadge :status="company.status" />
    </div>
    <p class="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
      {{ company.summary || '暂无简介，等待完善。' }}
    </p>
    <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span v-if="company.legalPerson?.user">
        法人：{{
          company.legalPerson.user.displayName ||
          company.legalPerson.user.name ||
          '未知'
        }}
      </span>
      <span v-if="company.approvedAt">
        上线：{{ new Date(company.approvedAt).toLocaleDateString() }}
      </span>
      <span v-if="company.lastActiveAt">
        活跃：{{ new Date(company.lastActiveAt).toLocaleDateString() }}
      </span>
    </div>
    <div class="mt-auto pt-2">
      <RouterLink
        class="inline-flex items-center gap-2 text-sm font-medium text-primary-500 hover:text-primary-400"
        to="/company/dashboard"
      >
        查看详情
        <UIcon name="i-lucide-arrow-up-right" class="h-4 w-4" />
      </RouterLink>
    </div>
  </UCard>
</template>
