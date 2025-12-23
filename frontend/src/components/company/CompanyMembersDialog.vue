<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import type {
  CompanyMember,
  CompanyModel,
  CompanyPermissionKey,
  CompanyPosition,
} from '@/types/company'

type MemberFormState = {
  positionCode?: string | null
  title?: string
  permissions: CompanyPermissionKey[]
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
    event: 'save',
    payload: {
      memberId: string
      positionCode?: string | null
      title?: string
      permissions: CompanyPermissionKey[]
    },
  ): void
}>()

const activeMembers = computed(() =>
  (props.company?.members ?? []).filter(
    (member) => member.joinStatus !== 'PENDING',
  ),
)

const positionOptions = computed(() =>
  props.positions.map((position) => ({
    value: position.code,
    label: position.name,
  })),
)

const permissionOptions = [
  { value: 'VIEW_DASHBOARD', label: '查看公司后台' },
  { value: 'MANAGE_MEMBERS', label: '管理员工（HR）' },
  { value: 'EDIT_COMPANY', label: '共同修改公司信息' },
]

const forms = reactive<Record<string, MemberFormState>>({})

function ensureMemberForm(member: CompanyMember) {
  if (!forms[member.id]) {
    forms[member.id] = {
      positionCode: member.position?.code ?? null,
      title: member.title ?? '',
      permissions: member.permissions ?? [],
    }
  }
}

watch(
  () => activeMembers.value,
  (members) => {
    members.forEach((member) => ensureMemberForm(member))
  },
  { immediate: true },
)

function closeDialog() {
  emit('update:modelValue', false)
}

function handleSave(memberId: string) {
  const state = forms[memberId]
  if (!state) return
  emit('save', {
    memberId,
    positionCode: state.positionCode ?? null,
    title: state.title ?? undefined,
    permissions: state.permissions ?? [],
  })
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
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
              员工管理
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ company?.name || '员工管理' }}
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
              v-for="member in activeMembers"
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
                  <p class="text-xs text-slate-500">角色：{{ member.role }}</p>
                </div>
                <UButton
                  size="xs"
                  color="primary"
                  :loading="loading"
                  @click="handleSave(member.id)"
                >
                  保存调整
                </UButton>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-xs font-semibold text-slate-500">
                    岗位
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
                <div class="space-y-2 md:col-span-2">
                  <label class="text-xs font-semibold text-slate-500">
                    权限
                  </label>
                  <USelect
                    :model-value="forms[member.id].permissions"
                    :items="permissionOptions"
                    multiple
                    searchable
                    value-key="value"
                    label-key="label"
                    placeholder="选择权限"
                    @update:model-value="
                      (value) => (forms[member.id].permissions = value)
                    "
                  />
                </div>
              </div>
            </div>
            <div
              v-if="activeMembers.length === 0"
              class="rounded-2xl border border-dashed border-slate-200/70 p-6 text-center text-sm text-slate-500"
            >
              暂无成员数据。
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
