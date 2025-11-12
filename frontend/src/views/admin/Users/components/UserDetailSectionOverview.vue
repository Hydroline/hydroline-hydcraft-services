<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { AdminUserDetail } from '@/types/admin'

interface RoleOption {
  label: string
  value: string
  color?: string
}
interface LabelOption {
  label: string
  value: string
  color?: string
}

const {
  detail,
  loading,
  roleSelection,
  labelSelection,
  roleOptions,
  labelOptions,
  roleSaving,
  labelSaving,
  joinDateEditing,
  joinDateSaving,
} = defineProps<{
  detail: AdminUserDetail | null
  loading: boolean
  roleSelection: string[]
  labelSelection: string[]
  roleOptions: RoleOption[]
  labelOptions: LabelOption[]
  roleSaving: boolean
  labelSaving: boolean
  joinDateEditing: string | null
  joinDateSaving: boolean
}>()

const emit = defineEmits<{
  (e: 'reload'): void
  (e: 'openContacts'): void
  (e: 'openEmails'): void
  (e: 'resetPassword'): void
  (e: 'deleteUser'): void
  (e: 'editJoinDate', date: string | null): void
  (e: 'saveJoinDate'): void
  (e: 'updateRoles', nextValue: unknown): void
  (e: 'updateLabels', nextValue: unknown): void
  (e: 'refreshPiic'): void
  (e: 'openSessions'): void
}>()

// 本地可编辑的入服日期副本，避免直接修改 prop
const localJoinDate = ref(joinDateEditing)
watch(
  () => joinDateEditing,
  (v) => {
    localJoinDate.value = v
  },
)

function onJoinDateInput(val: string | null) {
  localJoinDate.value = val
  emit('editJoinDate', val)
}

function fmtDateTime(ts?: string | null, format = 'YYYY-MM-DD HH:mm') {
  if (!ts) return '—'
  return dayjs(ts).format(format)
}

// 加载态：用于模板中仅在加载/未有 detail 时显示转圈
const isLoading = computed(() => loading || !detail)

// 计算主 Minecraft 信息（与父组件逻辑保持一致以减少耦合）
const primaryMinecraft = computed(() => {
  const d = detail
  if (!d)
    return null as null | {
      id: string
      realname: string | null
      username: string | null
      nickname: string | null
    }
  const primaryBindId = d.profile?.primaryAuthmeBindingId
  if (!primaryBindId) return null
  const b = (d.authmeBindings ?? []).find((x) => x.id === primaryBindId)
  if (!b || !b.id) return null
  const primaryNick =
    (d.nicknames ?? []).find((n) => n.isPrimary)?.nickname ?? null
  return {
    id: b.authmeUuid ?? '',
    realname: b.authmeRealname ?? null,
    username: b.authmeUsername ?? null,
    nickname: primaryNick,
  }
})

type EmailContactDisplay = {
  id: string
  value: string
  isPrimary: boolean
  verified: boolean
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

const emailContacts = computed<EmailContactDisplay[]>(() => {
  const d = detail
  if (!d) return []

  const items: EmailContactDisplay[] = []
  const seen = new Map<string, EmailContactDisplay>()
  const contacts = (d.contacts ?? []).filter(
    (c) => c.channel?.key === 'email' && normalizeEmail(c.value),
  )

  for (const contact of contacts) {
    const value = normalizeEmail(contact.value)
    if (!value) continue
    const key = value.toLowerCase()
    const existing = seen.get(key)
    const next: EmailContactDisplay = {
      id: contact.id,
      value,
      isPrimary: Boolean(contact.isPrimary),
      verified:
        contact.verification === 'VERIFIED' || Boolean(contact.verifiedAt),
    }
    if (existing) {
      existing.isPrimary = existing.isPrimary || next.isPrimary
      existing.verified = existing.verified || next.verified
      continue
    }
    seen.set(key, next)
    items.push(next)
  }

  const userEmail = normalizeEmail(d.email)
  if (userEmail && !seen.has(userEmail.toLowerCase())) {
    items.push({
      id: 'primary-email',
      value: userEmail,
      isPrimary: true,
      verified: Boolean(d.emailVerified),
    })
  }

  if (items.length === 0 && userEmail) {
    return [
      {
        id: 'primary-email',
        value: userEmail,
        isPrimary: true,
        verified: Boolean(d.emailVerified),
      },
    ]
  }

  if (items.length > 0 && !items.some((c) => c.isPrimary)) {
    items[0].isPrimary = true
  }

  return items.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1
    }
    if (a.verified !== b.verified) {
      return a.verified ? -1 : 1
    }
    return a.value.localeCompare(b.value)
  })
})
</script>

<template>
  <section
    class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
  >
    <div
      class="flex flex-col gap-4 relative md:flex-row md:items-start md:justify-between"
    >
      <div class="flex-1">
        <div>
          <UserAvatar
            :src="(detail?.profile as any)?.avatarUrl || undefined"
            :alt="detail?.profile?.displayName || detail?.email || '用户头像'"
            size="lg"
            class="mb-2"
          />
        </div>
        <div>
          <span
            class="line-clamp-1 truncate text-2xl font-semibold text-slate-900 dark:text-white"
          >
            {{ detail?.profile?.displayName ?? detail?.email ?? '用户详情' }}
          </span>
          <span class="text-sm">{{ detail?.id ?? '—' }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 md:absolute md:top-0 md:right-0">
        <UButton
          class="flex items-center justify-center leading-none"
          color="neutral"
          variant="soft"
          size="sm"
          :loading="loading"
          @click="emit('reload')"
          >重新载入</UButton
        >
        <UButton
          class="flex items-center justify-center leading-none"
          color="neutral"
          variant="soft"
          size="sm"
          :disabled="loading || !detail"
          @click="emit('openContacts')"
          >管理联系方式</UButton
        >
        <UButton
          class="flex items-center justify-center leading-none"
          color="primary"
          variant="soft"
          size="sm"
          :disabled="loading || !detail"
          @click="emit('resetPassword')"
          >重置密码</UButton
        >
        <UButton
          class="flex items-center justify-center leading-none"
          color="error"
          variant="soft"
          size="sm"
          :disabled="!detail"
          @click="emit('deleteUser')"
          >删除该用户</UButton
        >
      </div>
    </div>

    <div class="mt-6 grid gap-4 sm:grid-cols-3">
      <div>
        <div
          class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
        >
          邮箱
          <UButton
            v-if="!isLoading && detail"
            size="xs"
            class="p-0 font-medium"
            color="primary"
            variant="link"
            @click="emit('openEmails')"
            >管理</UButton
          >
        </div>
        <div
          class="flex items-center gap-1 text-base font-semibold text-slate-800 dark:text-slate-300"
        >
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else-if="emailContacts.length === 0"> — </template>
          <template v-else>
            <span class="line-clamp-1 truncate">
              {{ emailContacts[0].value }}
            </span>

            <UBadge
              :color="emailContacts[0].isPrimary ? 'primary' : 'neutral'"
              size="sm"
              variant="soft"
            >
              {{ emailContacts[0].isPrimary ? '主' : '辅' }}
            </UBadge>
            <UIcon
              :name="
                emailContacts[0].verified
                  ? 'i-lucide-check-circle-2'
                  : 'i-lucide-alert-triangle'
              "
              :class="
                emailContacts[0].verified
                  ? 'text-emerald-500'
                  : 'text-amber-500'
              "
              class="h-5 w-5"
            />
          </template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">用户名</div>
        <div
          class="line-clamp-1 truncate text-base font-semibold text-slate-800 dark:text-slate-300"
        >
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else>{{ detail?.name ?? '—' }}</template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">状态</div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else>{{
            detail?.statusSnapshot?.status ?? '—'
          }}</template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">PIIC</div>
        <div
          class="text-base font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1"
        >
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else>
            <span>{{ detail?.profile?.piic ?? '—' }}</span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-7 w-7 rounded-full p-0 flex justify-center items-center"
              icon="i-lucide-refresh-cw"
              :disabled="!detail || loading"
              @click="emit('refreshPiic')"
            >
              <span class="sr-only">刷新 PIIC</span>
            </UButton>
          </template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">注册时间</div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else>{{ fmtDateTime(detail?.createdAt) }}</template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">入服时间</div>
        <div class="flex flex-col gap-1 sm:flex-row sm:items-center">
          <div class="flex-1">
            <UInput
              :model-value="localJoinDate"
              type="date"
              class="w-full"
              :disabled="!detail"
              @update:model-value="onJoinDateInput($event as string)"
            />
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            class="h-7 w-7 rounded-full p-0 flex justify-center items-center"
            icon="i-lucide-refresh-cw"
            :loading="joinDateSaving"
            :disabled="!detail || !localJoinDate"
            @click="emit('saveJoinDate')"
          >
            <span class="sr-only">更新</span>
          </UButton>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">
          主 Minecraft 昵称
        </div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else>{{ primaryMinecraft?.nickname ?? '—' }}</template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">
          主 Minecraft ID
        </div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else-if="primaryMinecraft">
            <span class="flex items-center gap-1">
              <img
                :src="
                  'https://mc-heads.net/avatar/' + primaryMinecraft.username
                "
                class="block h-4 w-4 rounded-xs"
              />
              {{ primaryMinecraft.realname || '—' }}
            </span>
            <span
              class="block line-clamp-1 truncate font-medium text-xs text-slate-600 dark:text-slate-600"
              >{{ primaryMinecraft.id }}</span
            >
          </template>
          <template v-else>—</template>
        </div>
      </div>

      <div>
        <div
          class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
        >
          最近登录时间
          <span>
            <UButton
              size="xs"
              class="p-0 font-medium"
              color="primary"
              variant="link"
              :disabled="!detail"
              @click="emit('openSessions')"
              >查看全部</UButton
            >
          </span>
        </div>
        <div class="text-base font-semibold text-slate-800 dark:text-slate-300">
          <template v-if="isLoading">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </template>
          <template v-else>
            {{ fmtDateTime(detail?.lastLoginAt) }}
            <span
              class="block line-clamp-1 truncate font-medium text-xs text-slate-600 dark:text-slate-600"
            >
              {{ detail?.lastLoginIp ?? '—' }}
              <span class="text-[10px]">
                {{
                  detail?.lastLoginIpLocation ||
                  detail?.lastLoginIpLocationRaw ||
                  ''
                }}
              </span>
            </span>
          </template>
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">RBAC 角色</div>
        <div>
          <USelect
            class="w-full"
            :model-value="roleSelection"
            :items="roleOptions"
            multiple
            searchable
            value-key="value"
            label-key="label"
            :disabled="roleSaving || loading"
            :loading="roleSaving || loading"
            placeholder="选择角色"
            @update:model-value="emit('updateRoles', $event)"
          />
        </div>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500">RBAC 标签</div>
        <div>
          <template v-if="labelOptions.length > 0">
            <USelect
              class="w-full"
              :model-value="labelSelection"
              :items="labelOptions"
              multiple
              searchable
              value-key="value"
              label-key="label"
              :disabled="labelSaving || loading"
              :loading="labelSaving || loading"
              placeholder="选择标签"
              @update:model-value="emit('updateLabels', $event)"
            />
          </template>
          <template v-else>
            <span
              class="line-clamp-1 truncate text-base font-semibold text-slate-800 dark:text-slate-300"
              >暂无可用标签</span
            >
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
