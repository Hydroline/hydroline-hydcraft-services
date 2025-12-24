<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CompanyBindingField from '@/components/company/CompanyBindingField.vue'
import { useTransportationRailwayBindingsStore } from '@/stores/transportation/railwayBindings'
import { useAuthStore } from '@/stores/user/auth'

const props = defineProps<{
  entityType: string
  entityId: string
  serverId?: string | null
  railwayType?: string | null
  dimension?: string | null
  operatorCompanyIds?: string[]
  builderCompanyIds?: string[]
  editable?: boolean
}>()

const bindingStore = useTransportationRailwayBindingsStore()
const authStore = useAuthStore()
const toast = useToast()

const operatorCompanyIds = ref<string[]>(props.operatorCompanyIds ?? [])
const builderCompanyIds = ref<string[]>(props.builderCompanyIds ?? [])
const submitting = ref(false)

const allowEdit = computed(() => Boolean(authStore.isAuthenticated))

watch(
  () => props.operatorCompanyIds,
  (value) => {
    if (value) operatorCompanyIds.value = [...value]
  },
)

watch(
  () => props.builderCompanyIds,
  (value) => {
    if (value) builderCompanyIds.value = [...value]
  },
)

async function syncBindings(nextOperators: string[], nextBuilders: string[]) {
  submitting.value = true
  try {
    const payload = await bindingStore.updateBindings(
      {
        entityType: props.entityType,
        entityId: props.entityId,
        serverId: props.serverId ?? null,
        railwayType: props.railwayType ?? null,
        dimension: props.dimension ?? null,
      },
      {
        operatorCompanyIds: nextOperators,
        builderCompanyIds: nextBuilders,
      },
    )
    operatorCompanyIds.value = payload.operatorCompanyIds
    builderCompanyIds.value = payload.builderCompanyIds
    toast.add({
      title: '已更新绑定信息',
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '更新失败',
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}

async function updateOperators(next: string[]) {
  await syncBindings(next, builderCompanyIds.value)
}

async function updateBuilders(next: string[]) {
  await syncBindings(operatorCompanyIds.value, next)
}
</script>

<template>
  <CompanyBindingField
    label="运营单位"
    :company-ids="operatorCompanyIds"
    :allow-edit="allowEdit && !submitting"
    @update="updateOperators"
  />
  <CompanyBindingField
    label="建设单位"
    :company-ids="builderCompanyIds"
    :allow-edit="allowEdit && !submitting"
    @update="updateBuilders"
  />
</template>
