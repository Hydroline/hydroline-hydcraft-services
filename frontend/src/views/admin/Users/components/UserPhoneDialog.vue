<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { phoneRegions } from '@/constants/profile'
import type {
  AdminContactEntry,
  AdminPhoneContactEntry,
  AdminUserDetail,
} from '@/types/admin'

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
const phoneDialOptions = phoneRegions.map((region) => ({
  label: region.name,
  value: region.dial,
}))
const phoneDialCode = ref(phoneDialOptions[0]?.value ?? '+86')
const phoneInputValue = ref('')
const phoneIsPrimary = ref(false)
const phoneSubmitting = ref(false)

type PhoneDialogEntry = {
  id: string | null
  dialCode: string
  number: string
  display: string
  isPrimary: boolean
  verified: boolean
  manageable: boolean
}

function extractDialCodeFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return null
  const dial = (metadata as Record<string, unknown>).dialCode
  return typeof dial === 'string' ? dial : null
}

function extractDialCodeFromValue(value: string) {
  const match = value.match(/^\+\d{2,6}/)
  return match ? match[0] : null
}

function buildPhoneDialogEntry(
  contact: AdminPhoneContactEntry | AdminContactEntry,
): PhoneDialogEntry | null {
  const rawValue = typeof contact.value === 'string' ? contact.value.trim() : ''
  if (!rawValue) return null
  const dial =
    extractDialCodeFromMetadata(contact.metadata) ??
    extractDialCodeFromValue(rawValue) ??
    ''
  const remaining =
    dial && rawValue.startsWith(dial) ? rawValue.slice(dial.length) : rawValue
  const normalized = remaining.replace(/\s+/g, '')
  return {
    id: contact.id ?? null,
    dialCode: dial,
    number: normalized,
    display: dial ? `${dial} ${normalized}`.trim() : normalized,
    isPrimary: Boolean(contact.isPrimary),
    verified:
      contact.verification === 'VERIFIED' || Boolean(contact.verifiedAt),
    manageable: Boolean(contact.id),
  }
}

const phoneEntries = computed<PhoneDialogEntry[]>(() => {
  const data = props.detail
  if (!data) return []
  const source: Array<AdminPhoneContactEntry | AdminContactEntry> =
    data.phoneContacts && data.phoneContacts.length > 0
      ? data.phoneContacts
      : (data.contacts ?? []).filter((entry) => entry.channel?.key === 'phone')

  const entries: PhoneDialogEntry[] = []
  for (const contact of source) {
    const entry = buildPhoneDialogEntry(contact)
    if (entry) {
      entries.push(entry)
    }
  }

  return entries.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    return a.display.localeCompare(b.display)
  })
})

function canDeletePhone(entry: PhoneDialogEntry) {
  return entry.manageable && Boolean(entry.id)
}

function canSetPrimaryPhone(entry: PhoneDialogEntry) {
  return entry.manageable && Boolean(entry.id) && !entry.isPrimary
}

function closeDialog() {
  emit('update:open', false)
}

async function submitAddPhone() {
  if (!auth.token || !props.detail) return
  const dial = phoneDialCode.value || phoneDialOptions[0]?.value || '+86'
  const digits = phoneInputValue.value.replace(/[^0-9]/g, '')
  if (!digits) {
    toast.add({ title: '请输入手机号', color: 'warning' })
    return
  }
  if (digits.length < 5 || digits.length > 20) {
    toast.add({ title: '手机号长度需在 5-20 位之间', color: 'warning' })
    return
  }
  phoneSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${props.detail.id}/contacts/phone`, {
      method: 'POST',
      token: auth.token,
      body: {
        dialCode: dial,
        phone: digits,
        isPrimary: phoneIsPrimary.value,
      },
    })
    toast.add({ title: '手机号已添加', color: 'primary' })
    phoneInputValue.value = ''
    phoneIsPrimary.value = false
    emit('saved')
  } catch (error) {
    console.warn('[admin] add phone contact failed', error)
    toast.add({ title: '添加手机号失败', color: 'error' })
  } finally {
    phoneSubmitting.value = false
  }
}

async function handleSetPrimaryPhone(entry: PhoneDialogEntry) {
  if (!auth.token || !props.detail) return
  if (!entry.manageable || !entry.id || entry.isPrimary) return
  phoneSubmitting.value = true
  try {
    await apiFetch(
      `/auth/users/${props.detail.id}/contacts/phone/${entry.id}/primary`,
      {
        method: 'PATCH',
        token: auth.token,
      },
    )
    toast.add({ title: '已设为主手机号', color: 'primary' })
    emit('saved')
  } catch (error) {
    console.warn('[admin] set primary phone failed', error)
    toast.add({ title: '设置主手机号失败', color: 'error' })
  } finally {
    phoneSubmitting.value = false
  }
}

function handleDeletePhone(entry: PhoneDialogEntry) {
  if (!entry.manageable || !entry.id) return
  props.onDeleteContact?.(entry.id)
}

watch(open, (value) => {
  if (!value) {
    phoneDialCode.value = phoneDialOptions[0]?.value ?? '+86'
    phoneInputValue.value = ''
    phoneIsPrimary.value = false
    phoneSubmitting.value = false
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
            手机号管理
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeDialog"
          />
        </div>
        <div v-if="phoneEntries.length" class="space-y-2">
          <ul class="space-y-2 text-xs">
            <li
              v-for="entry in phoneEntries"
              :key="entry.id ?? entry.display"
              class="flex items-start justify-between gap-3 rounded-lg bg-slate-100/60 px-4 py-3 dark:bg-slate-900/40"
            >
              <div class="flex flex-col gap-1">
                <div
                  class="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-white"
                >
                  <span class="break-all">{{ entry.display }}</span>
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
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                  通过管理端添加或同步的手机号，可在此设置主辅或删除。
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UButton
                  v-if="canSetPrimaryPhone(entry)"
                  size="xs"
                  color="primary"
                  variant="ghost"
                  :loading="phoneSubmitting"
                  @click="handleSetPrimaryPhone(entry)"
                >
                  设为主
                </UButton>
                <UButton
                  v-if="canDeletePhone(entry)"
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="phoneSubmitting"
                  @click="handleDeletePhone(entry)"
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
          暂无手机号记录
        </div>
        <div class="space-y-2">
          <label
            class="block text-xs font-semibold text-slate-600 dark:text-slate-300"
            >新增手机号</label
          >
          <div class="flex flex-col gap-2 sm:flex-row">
            <USelect
              v-model="phoneDialCode"
              :items="phoneDialOptions"
              label-key="label"
              value-key="value"
              class="w-full max-w-[120px]"
              :disabled="phoneSubmitting || !props.detail"
            />
            <UInput
              v-model="phoneInputValue"
              type="tel"
              placeholder="手机号（仅数字）"
              class="flex-1"
              :disabled="phoneSubmitting || !props.detail"
            />
          </div>
          <div
            class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
          >
            <UCheckbox
              v-model="phoneIsPrimary"
              label="设为主手机号"
              :disabled="phoneSubmitting || !props.detail"
            />
          </div>
          <div class="flex flex-col gap-2 sm:flex-row">
            <UButton
              color="primary"
              variant="soft"
              class="sm:w-auto"
              :disabled="phoneSubmitting || !props.detail || !phoneInputValue"
              :loading="phoneSubmitting"
              @click="submitAddPhone"
            >
              添加
            </UButton>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 sm:flex-1">
              手机号将按区号 + 数字保存，如需验证会自动向账号邮箱发送验证码。
            </p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
