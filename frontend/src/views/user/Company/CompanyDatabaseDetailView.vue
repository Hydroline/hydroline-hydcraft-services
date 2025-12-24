<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/user/auth'
import { apiFetch } from '@/utils/http/api'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyModel } from '@/types/company'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const company = ref<CompanyModel | null>(null)
const loading = ref(false)

const companyId = computed(() => route.params.companyId as string)
const ownerUser = computed(() => {
  return (
    company.value?.legalRepresentative ||
    company.value?.legalPerson?.user ||
    null
  )
})

async function fetchDetail() {
  if (!companyId.value) return
  loading.value = true
  try {
    company.value = await apiFetch<CompanyModel>(
      `/companies/${companyId.value}`,
      {
        token: authStore.token ?? undefined,
      },
    )
  } catch (error) {
    toast.add({
      title: (error as Error).message || '无法加载公司详情',
      color: 'error',
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
  <section class="space-y-6">
    <UButton
      size="sm"
      class="absolute left-4 top-6 md:top-10"
      variant="ghost"
      color="primary"
      @click="router.push({ name: 'company.database' })"
    >
      <UIcon name="i-lucide-arrow-left" />
      返回工商数据库
    </UButton>

    <div
      class="rounded-2xl border border-slate-200/70 bg-white/90 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div v-if="loading" class="text-sm text-slate-500">加载中...</div>
      <div v-else-if="!company" class="text-sm text-slate-500">
        未找到公司信息。
      </div>
      <div v-else class="space-y-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              工商数据库详情
            </p>
            <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ company.name }}
            </h2>
            <p class="mt-2 text-sm text-slate-500">
              {{ company.summary || '暂无简介' }}
            </p>
          </div>
          <CompanyStatusBadge :status="company.status" />
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border border-slate-200/70 bg-white/80 p-4">
            <h3 class="text-sm font-semibold text-slate-900">基础信息</h3>
            <div class="mt-3 space-y-2 text-sm text-slate-600">
              <div>行业：{{ company.industry?.name || '未设置' }}</div>
              <div>类型：{{ company.type?.name || '未设置' }}</div>
              <div>
                注册时间：{{
                  company.approvedAt
                    ? new Date(company.approvedAt).toLocaleString()
                    : '未注册'
                }}
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200/70 bg-white/80 p-4">
            <h3 class="text-sm font-semibold text-slate-900">法人信息</h3>
            <div class="mt-3 flex items-center gap-3 text-sm text-slate-600">
              <UAvatar
                v-if="ownerUser?.avatarUrl"
                :src="ownerUser.avatarUrl"
                size="md"
                class="ring-2 ring-slate-200/60"
              />
              <div
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"
              >
                <UIcon name="i-lucide-user-round" class="h-6 w-6" />
              </div>
              <div class="flex flex-col">
                <span class="font-medium text-slate-900">
                  {{ ownerUser?.displayName || ownerUser?.name || '未知法人' }}
                </span>
                <RouterLink
                  v-if="ownerUser?.id"
                  :to="{ name: 'player', params: { playerId: ownerUser.id } }"
                  class="text-xs text-primary-500 hover:underline"
                >
                  查看个人页面
                </RouterLink>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200/70 bg-white/80 p-4">
          <h3 class="text-sm font-semibold text-slate-900">公司简介</h3>
          <p class="mt-3 text-sm text-slate-600">
            {{ company.description || '暂无详细介绍' }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
