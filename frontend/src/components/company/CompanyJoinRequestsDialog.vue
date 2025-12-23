<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type { CompanyModel, CompanyPosition } from '@/types/company'

type PendingFormState = {
  positionCode?: string | null
  title?: string
}

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
  positions: CompanyPosition[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (
    event: 'approve',
    payload: {
      memberId: string
      positionCode?: string | null
      title?: string
    },
  ): void
  (event: 'reject', payload: { memberId: string }): void
}>()

const pendingMembers = computed(() =>
  (props.company?.members ?? []).filter(
    (member) => member.joinStatus === 'PENDING',
  ),
)

const positionOptions = computed(() =>
  props.positions.map((position) => ({
    value: position.code,
    label: position.name,
  })),
)

const forms = reactive<Record<string, PendingFormState>>({})

watch(
  () => pendingMembers.value,
  (members) => {
    members.forEach((member) => {
      if (!forms[member.id]) {
        forms[member.id] = {
          positionCode: member.requestedPositionCode ?? null,
          title: member.requestedTitle ?? '',
        }
      }
    })
  },
  { immediate: true },
)

function closeDialog() {
  emit('update:modelValue', false)
}

function handleApprove(memberId: string) {
  emit('approve', {
    memberId,
    positionCode: forms[memberId]?.positionCode ?? null,
    title: forms[memberId]?.title ?? undefined,
  })
}

function handleReject(memberId: string) {
  emit('reject', { memberId })
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
    :ui="{
      content:
        'w-full max-w-4xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
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
              入职申请
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ company?.name || '入职申请' }}
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
          <div class="space-y-4">
            <div
              v-for="member in pendingMembers"
              :key="member.id"
              class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-800/60 dark:bg-slate-900/70"
            >
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-semibold text-slate-900">
                    {{
                      member.user?.displayName ||
                      member.user?.name ||
                      member.user?.email ||
                      '未知玩家'
                    }}
                  </p>
                  <p class="text-xs text-slate-500">
                    期望岗位：{{ member.requestedPositionCode || '未填写' }}
                    <span v-if="member.requestedTitle">
                      · {{ member.requestedTitle }}
                    </span>
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    color="primary"
                    :loading="loading"
                    @click="handleApprove(member.id)"
                  >
                    通过
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :loading="loading"
                    @click="handleReject(member.id)"
                  >
                    拒绝
                  </UButton>
                </div>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-xs font-semibold text-slate-500">
                    分配岗位
                  </label>
                  <USelectMenu
                    v-model="forms[member.id].positionCode"
                    :items="positionOptions"
                    value-key="value"
                    placeholder="选择岗位"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-semibold text-slate-500">
                    职称
                  </label>
                  <UInput
                    v-model="forms[member.id].title"
                    placeholder="可留空"
                  />
                </div>
              </div>
            </div>
            <div
              v-if="pendingMembers.length === 0"
              class="rounded-2xl border border-dashed border-slate-200/70 p-6 text-center text-sm text-slate-500"
            >
              暂无待处理的入职申请。
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
