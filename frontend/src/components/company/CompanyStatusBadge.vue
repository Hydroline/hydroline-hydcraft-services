<script setup lang="ts">
import { computed } from 'vue'
import type { CompanyStatus } from '@/types/company'

const props = defineProps<{ status: CompanyStatus }>()

const statusMeta: Record<CompanyStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'neutral' },
  PENDING_REVIEW: { label: '待提交', color: 'warning' },
  UNDER_REVIEW: { label: '审核中', color: 'warning' },
  NEEDS_REVISION: { label: '待补件', color: 'warning' },
  ACTIVE: { label: '已注册', color: 'success' },
  SUSPENDED: { label: '暂停营业', color: 'info' },
  REJECTED: { label: '已驳回', color: 'error' },
  ARCHIVED: { label: '注销', color: 'neutral' },
}

const meta = computed(() => statusMeta[props.status] ?? statusMeta.DRAFT)
</script>

<template>
  <UBadge :color="meta.color" variant="soft" size="xs">
    {{ meta.label }}
  </UBadge>
</template>
