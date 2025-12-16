<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type { AdminContactEntry, AdminUserDetail } from '@/types/admin'

type EmailDialogEntry = {
  id: string | null
  value: string
  isPrimary: boolean
  verified: boolean
  manageable: boolean
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

const props = defineProps<{
  open: boolean
  detail: AdminUserDetail | null
  onDeleteContact?: ((contactId: string) => void) | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'saved'): void
}>()

const open = toRef(props, 'open')
const auth = useAuthStore()
const toast = useToast()
const emailInputValue = ref('')
const emailSubmitting = ref(false)
const contactChannels = ref<
  Array<{ id: string; key: string; displayName: string }>
>([])

const emailEntries = computed<EmailDialogEntry[]>(() => {
  const data = props.detail
  if (!data) return []

  const items: EmailDialogEntry[] = []
  const seen = new Map<string, EmailDialogEntry>()

  for (const contact of data.contacts ?? []) {
    if (contact.channel?.key !== 'email') continue
    const value = normalizeEmail(contact.value)
    if (!value) continue
    const key = value.toLowerCase()
    const entry: EmailDialogEntry = {
      id: contact.id ?? null,
      value,
      isPrimary: Boolean(contact.isPrimary),
      verified:
        contact.verification === 'VERIFIED' || Boolean(contact.verifiedAt),
      manageable: Boolean(contact.id),
    }
    const existing = seen.get(key)
    if (existing) {
      existing.isPrimary = existing.isPrimary || entry.isPrimary
      existing.verified = existing.verified || entry.verified
      if (!existing.id && entry.id) existing.id = entry.id
      existing.manageable = existing.manageable || entry.manageable
      continue
    }
    seen.set(key, entry)
    items.push(entry)
  }

  const accountEmail = normalizeEmail(data.email)
  if (accountEmail) {
    const key = accountEmail.toLowerCase()
    const existing = seen.get(key)
    if (existing) {
      existing.isPrimary = true
      existing.verified = existing.verified || Boolean(data.emailVerified)
      existing.manageable = existing.manageable && Boolean(existing.id)
    } else {
      items.push({
        id: null,
        value: accountEmail,
        isPrimary: true,
        verified: Boolean(data.emailVerified),
        manageable: false,
      })
    }
  }

  if (items.length > 0 && !items.some((entry) => entry.isPrimary)) {
    items[0].isPrimary = true
  }

  return items.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    return a.value.localeCompare(b.value)
  })
})

const manageableEmailCount = computed(
  () => emailEntries.value.filter((entry) => entry.manageable).length,
)

const emailChannel = computed(
  () => contactChannels.value.find((c) => c.key === 'email') ?? null,
)

const emailChannelMissing = computed(() => !emailChannel.value)

function canDeleteEmail(entry: EmailDialogEntry) {
  if (!entry.manageable || !entry.id) return false
  return manageableEmailCount.value > 1
}

function canSetPrimaryEmail(entry: EmailDialogEntry) {
  return entry.manageable && Boolean(entry.id) && !entry.isPrimary
}

async function ensureContactChannels() {
  if (!auth.token) return
  if (contactChannels.value.length > 0) return
  try {
    const data = await apiFetch<
      Array<{ id: string; key: string; displayName: string }>
    >('/auth/contact-channels', { token: auth.token })
    contactChannels.value = data
  } catch (error) {
    console.warn('[admin] fetch contact channels failed', error)
  }
}

function closeDialog() {
  emit('update:open', false)
}

function handleDeleteEmail(entry: EmailDialogEntry) {
  if (!entry.manageable || !entry.id) return
  if (manageableEmailCount.value <= 1) {
    toast.add({ title: '至少需要保留一个邮箱，无法删除', color: 'warning' })
    return
  }
  props.onDeleteContact?.(entry.id)
}

async function submitAddEmail() {
  if (!auth.token || !props.detail) return
  const email = emailInputValue.value.trim()
  if (!email) {
    toast.add({ title: '请输入邮箱地址', color: 'warning' })
    return
  }

  let channel = emailChannel.value
  if (!channel) {
    await ensureContactChannels()
    channel = emailChannel.value
  }

  if (!channel) {
    toast.add({ title: '未配置邮箱渠道，无法添加', color: 'error' })
    return
  }

  emailSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${props.detail.id}/contacts`, {
      method: 'POST',
      token: auth.token,
      body: {
        channelKey: channel.key,
        value: email,
        isPrimary: false,
      },
    })
    toast.add({ title: '邮箱已添加', color: 'primary' })
    emailInputValue.value = ''
    emit('saved')
  } catch (error) {
    console.warn('[admin] add email contact failed', error)
    toast.add({ title: '添加邮箱失败', color: 'error' })
  } finally {
    emailSubmitting.value = false
  }
}

async function handleSetPrimaryEmail(entry: EmailDialogEntry) {
  if (!auth.token || !props.detail) return
  if (!entry.manageable || !entry.id || entry.isPrimary) return
  const submission = async () => {
    await apiFetch(`/auth/users/${props.detail!.id}/contacts/${entry.id}`, {
      method: 'PATCH',
      token: auth.token,
      body: { isPrimary: true },
    })
  }
  emailSubmitting.value = true
  try {
    await submission()
    toast.add({ title: '已设为主邮箱', color: 'primary' })
    emit('saved')
  } catch (error) {
    console.warn('[admin] set primary email failed', error)
    toast.add({ title: '设置主邮箱失败', color: 'error' })
  } finally {
    emailSubmitting.value = false
  }
}

watch(open, (value) => {
  if (value) {
    void ensureContactChannels()
  } else {
    emailInputValue.value = ''
    emailSubmitting.value = false
  }
})
</script>

<template>
  <UModal
    :open="open"
    @update:open="$emit('update:open', $event)"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            邮箱管理
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <div v-if="emailEntries.length" class="space-y-2">
          <ul class="space-y-2 text-xs">
            <li
              v-for="entry in emailEntries"
              :key="entry.value"
              class="flex items-start justify-between gap-3 rounded-lg bg-slate-100/60 px-4 py-3 dark:bg-slate-900/40"
            >
              <div class="flex flex-col gap-1">
                <div
                  class="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-white"
                >
                  <span class="break-all">{{ entry.value }}</span>
                  <UBadge
                    :color="entry.isPrimary ? 'primary' : 'neutral'"
                    size="sm"
                    variant="soft"
                  >
                    {{ entry.isPrimary ? '主' : '辅' }}
                  </UBadge>
                  <UBadge
                    :color="entry.verified ? 'success' : 'warning'"
                    size="sm"
                    variant="soft"
                  >
                    {{ entry.verified ? '已验证' : '未验证' }}
                  </UBadge>
                  <UBadge
                    v-if="!entry.manageable"
                    color="neutral"
                    size="sm"
                    variant="soft"
                  >
                    账号邮箱
                  </UBadge>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                  {{
                    entry.manageable
                      ? '可在此调整主辅状态或删除。'
                      : '来自账号邮箱字段，无法直接修改。'
                  }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UButton
                  v-if="canSetPrimaryEmail(entry)"
                  size="xs"
                  color="primary"
                  variant="ghost"
                  :loading="emailSubmitting"
                  @click="handleSetPrimaryEmail(entry)"
                >
                  设为主
                </UButton>
                <UButton
                  v-if="canDeleteEmail(entry)"
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="emailSubmitting"
                  @click="handleDeleteEmail(entry)"
                >
                  删除
                </UButton>
              </div>
            </li>
          </ul>
        </div>
        <div
          v-else
          class="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
        >
          暂无邮箱记录
        </div>
        <div class="space-y-2">
          <label
            class="block text-xs font-semibold text-slate-600 dark:text-slate-300"
            >新增邮箱</label
          >
          <div class="flex flex-col gap-2 sm:flex-row">
            <UInput
              v-model="emailInputValue"
              type="email"
              placeholder="user@example.com"
              class="flex-1"
              :disabled="emailSubmitting || !props.detail"
            />
            <UButton
              color="primary"
              variant="soft"
              class="sm:w-auto"
              :disabled="
                emailSubmitting ||
                !props.detail ||
                !emailInputValue ||
                emailChannelMissing
              "
              :loading="emailSubmitting"
              @click="submitAddEmail"
            >
              添加
            </UButton>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            添加后可在上方列表调整主辅或删除。
            <span
              v-if="emailChannelMissing"
              class="text-amber-600 dark:text-amber-400"
            >
              当前没有可用的邮箱渠道，请先在联系方式配置中启用邮箱类型。
            </span>
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
