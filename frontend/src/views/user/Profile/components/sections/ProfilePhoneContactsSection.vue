<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { ApiError } from '@/utils/api'
import { translateAuthErrorMessage } from '@/utils/auth-errors'
import { phoneRegions } from '@/constants/profile'

const auth = useAuthStore()
const feature = useFeatureStore()
const toast = useToast()

const phoneContacts = ref<any[]>([])
const loadingContacts = ref(false)
const phoneError = ref('')
const phoneLoading = ref<string | null>(null)

const phoneVerificationEnabled = computed(
  () => feature.phoneVerificationEnabled,
)

const defaultDial = phoneRegions[0]?.dial ?? '+86'

const addPhoneDialog = reactive({
  open: false,
  dialCode: defaultDial,
  phone: '',
  isPrimary: false,
  sending: false,
  error: '',
})

const editPhoneDialog = reactive({
  open: false,
  contact: null as any,
  dialCode: defaultDial,
  phone: '',
  saving: false,
  error: '',
})

const deletePhoneDialog = reactive({
  open: false,
  contact: null as any,
  confirming: false,
  error: '',
})

const verificationDialog = reactive({
  open: false,
  phoneValue: '',
  dialCode: '',
  display: '',
  code: '',
  sendingCode: false,
  verifying: false,
  countdown: 0,
  codeRequested: false,
})

const verificationError = ref('')
const verificationTimer = ref<number | null>(null)

function stopVerificationCountdown() {
  if (verificationTimer.value && typeof window !== 'undefined') {
    window.clearInterval(verificationTimer.value)
    verificationTimer.value = null
  }
}

function startVerificationCountdown(seconds = 60) {
  stopVerificationCountdown()
  verificationDialog.countdown = seconds
  if (seconds <= 0 || typeof window === 'undefined') return
  verificationTimer.value = window.setInterval(() => {
    if (verificationDialog.countdown <= 1) {
      stopVerificationCountdown()
      verificationDialog.countdown = 0
    } else {
      verificationDialog.countdown -= 1
    }
  }, 1000)
}

function getDialCodeFromContact(contact: any) {
  const meta = contact?.metadata
  if (meta && typeof meta === 'object' && 'dialCode' in meta) {
    const dial = (meta as Record<string, unknown>).dialCode
    if (typeof dial === 'string' && dial.startsWith('+')) {
      return dial
    }
  }
  const value = typeof contact?.value === 'string' ? contact.value : ''
  const match = value.match(/^\+\d{2,6}/)
  return match ? match[0] : defaultDial
}

function getNumberFromContact(contact: any) {
  const value = typeof contact?.value === 'string' ? contact.value : ''
  const dial = getDialCodeFromContact(contact)
  return value.startsWith(dial) ? value.slice(dial.length) : value
}

function formatDisplayPhone(dialCode: string, number: string) {
  const digits = number.replace(/\s+/g, '')
  return dialCode ? `${dialCode} ${digits}` : digits
}

function formatContactDisplay(contact: any) {
  if (!contact) return ''
  const dial = getDialCodeFromContact(contact)
  const number = getNumberFromContact(contact)
  return formatDisplayPhone(dial, number)
}

function isContactVerified(contact: any) {
  if (!contact || typeof contact !== 'object') return false
  if (contact.verification === 'VERIFIED') return true
  return Boolean(contact.verifiedAt)
}

const showPhoneVerifyBanner = computed(() => {
  if (!phoneVerificationEnabled.value) return false
  const contacts: any[] = phoneContacts.value || []
  if (contacts.length === 0) return false
  const primary = contacts.find((c) => c.isPrimary)
  const anyUnverified = contacts.some((c) => !isContactVerified(c))
  return (primary && !isContactVerified(primary)) || anyUnverified
})

async function loadPhoneContacts() {
  loadingContacts.value = true
  phoneError.value = ''
  try {
    phoneContacts.value = await auth.listPhoneContacts()
  } catch (error) {
    phoneError.value =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '加载失败'
  } finally {
    loadingContacts.value = false
  }
}

function openAddPhoneDialog() {
  addPhoneDialog.open = true
  addPhoneDialog.dialCode = defaultDial
  addPhoneDialog.phone = ''
  addPhoneDialog.isPrimary = false
  addPhoneDialog.error = ''
}

function updateAddPhoneDialog(value: boolean) {
  addPhoneDialog.open = value
  if (!value) {
    addPhoneDialog.dialCode = defaultDial
    addPhoneDialog.phone = ''
    addPhoneDialog.isPrimary = false
    addPhoneDialog.error = ''
    addPhoneDialog.sending = false
  }
}

async function submitAddPhone() {
  const dialCode = addPhoneDialog.dialCode
  const phone = addPhoneDialog.phone.trim()
  if (!phone) {
    addPhoneDialog.error = '请输入手机号'
    return
  }
  addPhoneDialog.sending = true
  addPhoneDialog.error = ''
  try {
    const contact = await auth.addPhoneContact({
      dialCode,
      phone,
      isPrimary: addPhoneDialog.isPrimary,
    })
    await loadPhoneContacts()
    toast.add({
      title: phoneVerificationEnabled.value ? '验证码已发送' : '手机号已添加',
      color: 'success',
    })
    if (phoneVerificationEnabled.value && contact?.value) {
      openVerificationDialog(contact.value as string, {
        dialCode,
        codeAlreadySent: true,
      })
    }
    updateAddPhoneDialog(false)
  } catch (error) {
    const message =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '添加失败'
    addPhoneDialog.error = message
    toast.add({
      title: '添加失败',
      description: message,
      color: 'error',
    })
  } finally {
    addPhoneDialog.sending = false
  }
}

function openEditPhoneDialog(contact: any) {
  editPhoneDialog.open = true
  editPhoneDialog.contact = contact
  editPhoneDialog.dialCode = getDialCodeFromContact(contact)
  editPhoneDialog.phone = getNumberFromContact(contact)
  editPhoneDialog.error = ''
  editPhoneDialog.saving = false
}

function updateEditPhoneDialog(value: boolean) {
  editPhoneDialog.open = value
  if (!value) {
    editPhoneDialog.contact = null
    editPhoneDialog.dialCode = defaultDial
    editPhoneDialog.phone = ''
    editPhoneDialog.error = ''
    editPhoneDialog.saving = false
  }
}

async function submitEditPhone() {
  if (!editPhoneDialog.contact) return
  const dialCode = editPhoneDialog.dialCode
  const phone = editPhoneDialog.phone.trim()
  if (!phone) {
    editPhoneDialog.error = '请输入手机号'
    return
  }
  editPhoneDialog.saving = true
  editPhoneDialog.error = ''
  try {
    const updated = await auth.updatePhoneContact(
      editPhoneDialog.contact.id as string,
      {
        dialCode,
        phone,
      },
    )
    await loadPhoneContacts()
    toast.add({
      title: phoneVerificationEnabled.value ? '手机号已更新' : '手机号已保存',
      color: 'success',
    })
    if (
      phoneVerificationEnabled.value &&
      updated?.verification !== 'VERIFIED' &&
      updated?.value
    ) {
      openVerificationDialog(updated.value as string, {
        dialCode,
        codeAlreadySent: true,
      })
    }
    updateEditPhoneDialog(false)
  } catch (error) {
    const message =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '更新失败'
    editPhoneDialog.error = message
    toast.add({
      title: '更新失败',
      description: message,
      color: 'error',
    })
  } finally {
    editPhoneDialog.saving = false
  }
}

function openDeletePhoneDialog(contact: any) {
  deletePhoneDialog.open = true
  deletePhoneDialog.contact = contact
  deletePhoneDialog.error = ''
  deletePhoneDialog.confirming = false
}

function updateDeletePhoneDialog(value: boolean) {
  deletePhoneDialog.open = value
  if (!value) {
    deletePhoneDialog.contact = null
    deletePhoneDialog.error = ''
    deletePhoneDialog.confirming = false
  }
}

async function confirmDeletePhone() {
  if (!deletePhoneDialog.contact) return
  deletePhoneDialog.error = ''
  deletePhoneDialog.confirming = true
  const contact = deletePhoneDialog.contact
  try {
    await auth.removePhoneContact(contact.id as string)
    await loadPhoneContacts()
    toast.add({
      title: '已删除',
      color: 'success',
    })
    updateDeletePhoneDialog(false)
  } catch (error) {
    const message =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '删除失败'
    deletePhoneDialog.error = message
    toast.add({
      title: '删除失败',
      description: message,
      color: 'error',
    })
  } finally {
    deletePhoneDialog.confirming = false
  }
}

async function setPrimary(contact: any) {
  phoneError.value = ''
  phoneLoading.value = contact.id
  try {
    await auth.setPrimaryPhoneContact(contact.id as string)
    await loadPhoneContacts()
    toast.add({
      title: '已设为主手机号',
      color: 'success',
    })
  } catch (error) {
    phoneError.value =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '设置失败'
    toast.add({
      title: '设置失败',
      description: phoneError.value,
      color: 'error',
    })
  } finally {
    phoneLoading.value = null
  }
}

function openVerificationDialog(
  phoneValue: string,
  options?: { dialCode?: string; codeAlreadySent?: boolean },
) {
  verificationDialog.phoneValue = phoneValue.trim()
  const dial = options?.dialCode ?? phoneValue.match(/^\+\d{2,6}/)?.[0] ?? ''
  const number = dial ? phoneValue.slice(dial.length) : phoneValue
  verificationDialog.dialCode = dial
  verificationDialog.display = formatDisplayPhone(dial, number)
  verificationDialog.code = ''
  verificationDialog.open = true
  verificationDialog.sendingCode = false
  verificationDialog.verifying = false
  verificationDialog.countdown = 0
  verificationDialog.codeRequested = Boolean(options?.codeAlreadySent)
  verificationError.value = ''
  stopVerificationCountdown()
  if (options?.codeAlreadySent) {
    startVerificationCountdown()
  }
}

function closeVerificationDialog() {
  verificationDialog.open = false
  verificationDialog.phoneValue = ''
  verificationDialog.dialCode = ''
  verificationDialog.display = ''
  verificationDialog.code = ''
  verificationDialog.sendingCode = false
  verificationDialog.verifying = false
  verificationDialog.countdown = 0
  verificationDialog.codeRequested = false
  verificationError.value = ''
  stopVerificationCountdown()
}

function updateVerificationDialog(value: boolean) {
  if (!value) {
    closeVerificationDialog()
  } else {
    verificationDialog.open = true
  }
}

async function sendVerificationCode() {
  const phoneValue = verificationDialog.phoneValue.trim()
  if (!phoneValue) {
    verificationError.value = '手机号无效'
    return
  }
  if (verificationDialog.countdown > 0) {
    return
  }
  verificationError.value = ''
  verificationDialog.sendingCode = true
  try {
    await auth.resendPhoneVerification(phoneValue)
    verificationDialog.codeRequested = true
    startVerificationCountdown()
    toast.add({
      title: '验证码已发送',
      color: 'success',
    })
  } catch (error) {
    verificationError.value =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '验证码发送失败，请稍后重试'
    toast.add({
      title: '发送失败',
      description: verificationError.value,
      color: 'error',
    })
  } finally {
    verificationDialog.sendingCode = false
  }
}

async function submitVerification() {
  const phoneValue = verificationDialog.phoneValue.trim()
  const code = verificationDialog.code.trim()
  if (!phoneValue) {
    verificationError.value = '手机号无效'
    return
  }
  if (!verificationDialog.codeRequested) {
    verificationError.value = '请先发送验证码'
    return
  }
  if (!code) {
    verificationError.value = '请输入验证码'
    return
  }
  verificationError.value = ''
  verificationDialog.verifying = true
  try {
    await auth.verifyPhoneContact({ phone: phoneValue, code })
    await loadPhoneContacts()
    closeVerificationDialog()
    toast.add({
      title: '手机号验证成功',
      color: 'success',
    })
  } catch (error) {
    verificationError.value =
      error instanceof ApiError
        ? translateAuthErrorMessage(error.message)
        : '验证失败，请稍后重试'
    toast.add({
      title: '验证失败',
      description: verificationError.value,
      color: 'error',
    })
  } finally {
    verificationDialog.verifying = false
  }
}

onMounted(() => {
  if (auth.isAuthenticated) {
    void loadPhoneContacts()
  }
})

onBeforeUnmount(() => {
  stopVerificationCountdown()
})
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h3
        class="flex items-center gap-2 px-1 text-lg text-slate-600 dark:text-slate-300"
      >
        手机号码
        <span v-if="loadingContacts" class="block">
          <UIcon name="i-lucide-loader-2" class="mr-2 h-4 w-4 animate-spin" />
        </span>
      </h3>
      <UButton size="sm" variant="ghost" @click="openAddPhoneDialog">
        添加手机号
      </UButton>
    </div>

    <div class="space-y-3">
      <div
        v-if="showPhoneVerifyBanner"
        class="rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200 flex items-start gap-2"
      >
        <UIcon name="i-lucide-alert-triangle" class="h-4 w-4 shrink-0" />
        <span>部分手机号尚未完成验证，为保障安全请尽快完成验证。</span>
      </div>

      <div
        v-else-if="phoneContacts.length === 0"
        class="rounded-xl flex justify-center items-center border border-slate-200/60 bg-white p-4 text-xs dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        暂无手机号绑定
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="contact in phoneContacts"
          :key="contact.id"
          class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
        >
          <div class="flex items-center justify-between">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-800 dark:text-slate-100">
                  {{ formatContactDisplay(contact) }}
                </span>
                <UBadge
                  v-if="contact.isPrimary"
                  size="sm"
                  color="primary"
                  variant="soft"
                  >主手机号</UBadge
                >
                <UBadge v-else color="neutral" variant="soft" size="sm"
                  >辅助</UBadge
                >
                <UBadge
                  :color="isContactVerified(contact) ? 'success' : 'warning'"
                  variant="soft"
                  size="sm"
                  >{{
                    isContactVerified(contact) ? '已验证' : '未验证'
                  }}</UBadge
                >
              </div>
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {{
                  phoneRegions.find(
                    (r) => r.dial === getDialCodeFromContact(contact),
                  )?.name || '其他'
                }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="phoneVerificationEnabled && !isContactVerified(contact)"
                size="xs"
                variant="ghost"
                @click="openVerificationDialog(contact.value as string)"
                >验证</UButton
              >
              <UButton
                size="xs"
                variant="ghost"
                @click="openEditPhoneDialog(contact)"
                >编辑</UButton
              >
              <UButton
                v-if="
                  !contact.isPrimary &&
                  (!phoneVerificationEnabled || isContactVerified(contact))
                "
                size="xs"
                variant="ghost"
                :loading="phoneLoading === contact.id"
                @click="setPrimary(contact)"
                >设为主手机号</UButton
              >
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                @click="openDeletePhoneDialog(contact)"
                >删除</UButton
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <UModal
      :open="addPhoneDialog.open"
      @update:open="updateAddPhoneDialog"
      :ui="{
        content:
          'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3
                class="text-base font-semibold text-slate-900 dark:text-white"
              >
                添加手机号
              </h3>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                选择区号并输入手机号，按需完成验证码验证。
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="updateAddPhoneDialog(false)"
            />
          </div>

          <div class="flex flex-col gap-3 text-sm">
            <div class="flex gap-2">
              <USelect
                v-model="addPhoneDialog.dialCode"
                :items="phoneRegions"
                value-key="dial"
                label-key="name"
                class="w-40"
              />
              <UInput
                v-model="addPhoneDialog.phone"
                placeholder="请输入手机号"
                type="tel"
                class="flex-1"
              />
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <UCheckbox v-model="addPhoneDialog.isPrimary" />
              <span>设为主手机号</span>
            </div>
            <UButton
              class="ml-auto"
              color="primary"
              :loading="addPhoneDialog.sending"
              @click="submitAddPhone"
            >
              {{ phoneVerificationEnabled ? '发送验证码' : '确定' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="editPhoneDialog.open"
      @update:open="updateEditPhoneDialog"
      :ui="{
        content:
          'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">
              编辑手机号
            </h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="updateEditPhoneDialog(false)"
            />
          </div>
          <div class="flex flex-col gap-3 text-sm">
            <div class="flex gap-2">
              <USelect
                v-model="editPhoneDialog.dialCode"
                :items="phoneRegions"
                value-key="dial"
                label-key="name"
                class="w-40"
              />
              <UInput
                v-model="editPhoneDialog.phone"
                placeholder="请输入手机号"
                type="tel"
                class="flex-1"
              />
            </div>
            <UButton
              class="ml-auto"
              color="primary"
              :loading="editPhoneDialog.saving"
              @click="submitEditPhone"
            >
              {{ phoneVerificationEnabled ? '保存并发送验证码' : '保存' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="verificationDialog.open"
      @update:open="updateVerificationDialog"
      :ui="{
        content:
          'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">
              验证手机号
            </h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="updateVerificationDialog(false)"
            />
          </div>

          <div class="space-y-3 text-sm">
            <div
              v-if="verificationDialog.codeRequested"
              class="rounded-lg border border-primary-300/60 bg-primary-50/80 px-3 py-2 text-xs text-primary-600 dark:border-primary-700/50 dark:bg-primary-900/30 dark:text-primary-200"
            >
              验证码已发送至
              <span class="font-semibold">{{
                verificationDialog.display
              }}</span>
              ，请在 10 分钟内完成验证。
            </div>
            <div
              class="flex items-center justify-between rounded-lg bg-slate-100/70 px-3 py-2 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
            >
              <span class="text-xs text-slate-500 dark:text-slate-400"
                >手机号</span
              >
              <span class="font-medium">{{ verificationDialog.display }}</span>
            </div>
            <div v-if="verificationDialog.codeRequested" class="space-y-3">
              <UInput
                v-model="verificationDialog.code"
                placeholder="请输入验证码"
                autocomplete="one-time-code"
                class="w-full"
              />
            </div>
            <div class="flex justify-end items-center gap-2">
              <UButton
                color="primary"
                variant="soft"
                :loading="verificationDialog.sendingCode"
                :disabled="verificationDialog.countdown > 0"
                @click="sendVerificationCode"
              >
                {{
                  verificationDialog.countdown > 0
                    ? `重新发送 (${verificationDialog.countdown}s)`
                    : '发送验证码'
                }}
              </UButton>
              <UButton
                color="primary"
                :loading="verificationDialog.verifying"
                @click="submitVerification"
                >确认验证</UButton
              >
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="deletePhoneDialog.open"
      @update:open="updateDeletePhoneDialog"
      :ui="{
        content:
          'w-full max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">
              确认删除手机号
            </h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="updateDeletePhoneDialog(false)"
            />
          </div>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            确认移除手机号
            <span class="font-medium">{{
              formatContactDisplay(deletePhoneDialog.contact)
            }}</span>
            吗？删除后需要重新添加才能使用。
          </p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="updateDeletePhoneDialog(false)">
              取消
            </UButton>
            <UButton
              color="error"
              :loading="deletePhoneDialog.confirming"
              @click="confirmDeletePhone"
            >
              确认删除
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
