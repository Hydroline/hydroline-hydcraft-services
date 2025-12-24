<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CompanyModel } from '@/types/company'
import type { RailwayCompanyBindingEntry } from '@/types/transportation'
import { fetchCompanyDetail } from '@/utils/company/company-lib'
import { useTransportationRailwayBindingsStore } from '@/stores/transportation/railwayBindings'

const route = useRoute()
const router = useRouter()
const bindingStore = useTransportationRailwayBindingsStore()
const toast = useToast()

const company = ref<CompanyModel | null>(null)
const bindings = ref<RailwayCompanyBindingEntry[]>([])
const loading = ref(true)

const companyId = computed(() => route.params.companyId as string)
const bindingType = computed(() => {
  const value = route.query.bindingType
  return value === 'BUILDER' ? 'BUILDER' : 'OPERATOR'
})

function ownerUser(target: CompanyModel | null | undefined) {
  if (!target) return null
  return (
    target.members?.find((member) => member.role === 'OWNER' && member.user) ||
    target.legalPerson?.user ||
    target.legalRepresentative ||
    target.owners?.find((member) => member.user)?.user ||
    target.members?.find((member) => member.user)?.user ||
    null
  )
}

function extractDimension(dimensionContext: string | null) {
  if (!dimensionContext) return null
  const parts = dimensionContext.split(':')
  return parts.length > 1 ? parts[1] : dimensionContext
}

function buildEntityLink(entry: RailwayCompanyBindingEntry) {
  if (entry.entityType === 'SYSTEM') {
    return {
      name: 'transportation.railway.system.detail',
      params: { systemId: entry.entityId },
    }
  }
  if (!entry.serverId || !entry.railwayMod) return null
  const dimension = extractDimension(entry.dimensionContext)
  if (entry.entityType === 'ROUTE') {
    return {
      name: 'transportation.railway.route',
      params: {
        railwayType: entry.railwayMod.toLowerCase(),
        routeId: entry.entityId,
      },
      query: {
        serverId: entry.serverId,
        dimension: dimension ?? undefined,
      },
    }
  }
  if (entry.entityType === 'STATION') {
    return {
      name: 'transportation.railway.station',
      params: {
        railwayType: entry.railwayMod.toLowerCase(),
        stationId: entry.entityId,
      },
      query: {
        serverId: entry.serverId,
        dimension: dimension ?? undefined,
      },
    }
  }
  if (entry.entityType === 'DEPOT') {
    return {
      name: 'transportation.railway.depot',
      params: {
        railwayType: entry.railwayMod.toLowerCase(),
        depotId: entry.entityId,
      },
      query: {
        serverId: entry.serverId,
        dimension: dimension ?? undefined,
      },
    }
  }
  return null
}

function entityLabel(entry: RailwayCompanyBindingEntry) {
  if (entry.entityType === 'SYSTEM') return '线路系统'
  if (entry.entityType === 'STATION') return '车站'
  if (entry.entityType === 'DEPOT') return '车厂'
  return '线路'
}

async function fetchDetail() {
  loading.value = true
  try {
    company.value = await fetchCompanyDetail(companyId.value)
    bindings.value = await bindingStore.fetchCompanyBindings(
      companyId.value,
      bindingType.value,
    )
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : '加载失败',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchDetail()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          {{ company?.name || '单位详情' }}
        </h1>
        <p class="text-sm text-slate-500">
          {{ bindingType === 'OPERATOR' ? '运营单位' : '建设单位' }}
        </p>
      </div>
      <UButton
        size="sm"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway.companies' })"
      >
        返回统计
      </UButton>
    </div>

    <div v-if="loading" class="text-sm text-slate-500">正在加载…</div>

    <div v-else class="flex flex-col gap-6">
      <div
        class="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-800/70 dark:bg-slate-900"
      >
        <div class="flex items-center gap-3">
          <img
            v-if="company?.logoUrl"
            :src="company.logoUrl"
            :alt="company.name"
            class="h-12 w-12 rounded-xl object-cover"
          />
          <div>
            <p class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ company?.name || '未知公司' }}
            </p>
            <p class="text-xs text-slate-500">
              {{ company?.summary || '暂无简介' }}
            </p>
          </div>
        </div>
        <div class="mt-4 text-xs text-slate-500">
          <p>
            所属人：{{
              ownerUser(company)?.displayName || ownerUser(company)?.name || '—'
            }}
          </p>
          <p>状态：{{ company?.status || '—' }}</p>
        </div>
      </div>

      <div
        class="rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
      >
        <div
          class="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-200"
        >
          名下相关信息
        </div>
        <div class="overflow-x-auto">
          <table
            class="min-w-[720px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
          >
            <thead
              class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            >
              <tr>
                <th class="px-4 py-3">类型</th>
                <th class="px-4 py-3">标识</th>
                <th class="px-4 py-3">服务端</th>
                <th class="px-4 py-3">维度</th>
                <th class="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="bindings.length === 0">
                <td
                  class="px-4 py-6 text-center text-sm text-slate-500"
                  colspan="5"
                >
                  暂无绑定记录
                </td>
              </tr>
              <tr
                v-for="entry in bindings"
                :key="entry.id"
                class="border-t border-slate-100 dark:border-slate-800"
              >
                <td class="px-4 py-3">{{ entityLabel(entry) }}</td>
                <td class="px-4 py-3 font-mono text-xs text-slate-500">
                  {{ entry.entityId }}
                </td>
                <td class="px-4 py-3">{{ entry.serverId || '—' }}</td>
                <td class="px-4 py-3">
                  {{ extractDimension(entry.dimensionContext) || '—' }}
                </td>
                <td class="px-4 py-3">
                  <UButton
                    v-if="buildEntityLink(entry)"
                    size="2xs"
                    variant="ghost"
                    @click="router.push(buildEntityLink(entry)!)"
                  >
                    查看
                  </UButton>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
