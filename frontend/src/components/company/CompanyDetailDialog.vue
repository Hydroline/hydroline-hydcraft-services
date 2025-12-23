<script setup lang="ts">
import { computed } from 'vue'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyProfileForm from '@/components/company/CompanyProfileForm.vue'
import CompanyTimeline from '@/components/company/CompanyTimeline.vue'
import type {
  CompanyIndustry,
  CompanyModel,
  UpdateCompanyPayload,
} from '@/types/company'

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
  industries: CompanyIndustry[]
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', payload: UpdateCompanyPayload): void
  (event: 'invite'): void
}>()

const modalOpen = computed(() => props.modelValue)
const company = computed(() => props.company)
const detailTitle = computed(() => company.value?.name ?? '我的公司')
const canInvite = computed(() => !!company.value?.permissions.canManageMembers)

const handleClose = () => emit('update:modelValue', false)
const handleSubmit = (payload: UpdateCompanyPayload) => emit('submit', payload)

const handleInviteClick = () => emit('invite')
</script>

<template>
  <UModal
    :open="modalOpen"
    @update:open="handleClose"
    :ui="{
      content:
        'w-full max-w-5xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800"
        >
          <div>
            <p
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              主体详情
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ detailTitle }}
            </h3>
          </div>
          <div class="flex items-center gap-3">
            <CompanyStatusBadge :status="company.value?.status ?? 'DRAFT'" />
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              @click="handleClose"
            />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div
            class="grid gap-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,0.35fr)]"
          >
            <div class="space-y-6">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <CompanyProfileForm
                  :company="company.value"
                  :industries="props.industries"
                  :saving="props.saving"
                  @submit="handleSubmit"
                />
              </div>
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <p
                      class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      当前职员
                    </p>
                    <h4
                      class="text-lg font-semibold text-slate-900 dark:text-white"
                    >
                      {{ company.value?.members.length ?? 0 }} 位成员
                    </h4>
                  </div>
                  <UButton
                    size="sm"
                    color="primary"
                    variant="soft"
                    :disabled="!canInvite"
                    @click="handleInviteClick"
                  >
                    邀请职员
                  </UButton>
                </div>
                <div class="mt-4 space-y-3">
                  <div
                    v-for="member in company.value?.members ?? []"
                    :key="member.id"
                    class="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300"
                  >
                    <div>
                      <p class="font-semibold text-slate-900 dark:text-white">
                        {{
                          member.user?.displayName ||
                          member.user?.name ||
                          '未知用户'
                        }}
                      </p>
                      <p class="text-xs text-slate-500">
                        {{ member.position?.name || member.role }}
                        <span v-if="member.title"> · {{ member.title }}</span>
                      </p>
                    </div>
                    <span
                      class="text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {{ member.role }}
                    </span>
                  </div>
                  <div
                    v-if="(company.value?.members.length ?? 0) === 0"
                    class="rounded-xl border border-dashed border-slate-200/70 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800/60"
                  >
                    暂无职员数据，邀请成员或申请加入即可扩充团队。
                  </div>
                </div>
              </div>
            </div>
            <div class="space-y-4">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <CompanyTimeline :company="company.value" />
              </div>
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <h4
                  class="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  内部制度
                </h4>
                <div class="mt-2 space-y-2 text-sm">
                  <div
                    v-for="policy in company.value?.policies ?? []"
                    :key="policy.id"
                    class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800"
                  >
                    <div
                      class="flex items-center justify-between text-xs text-slate-500"
                    >
                      <span>v{{ policy.version }}</span>
                      <span>{{
                        new Date(policy.updatedAt).toLocaleDateString()
                      }}</span>
                    </div>
                    <p class="text-slate-900 dark:text-white">
                      {{ policy.title }}
                    </p>
                    <p class="text-xs text-slate-500">
                      {{ policy.summary || '暂无摘要' }}
                    </p>
                  </div>
                  <div
                    v-if="(company.value?.policies.length ?? 0) === 0"
                    class="rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500 dark:border-slate-800/60"
                  >
                    暂无制度文档，稍后可在后台创建。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
