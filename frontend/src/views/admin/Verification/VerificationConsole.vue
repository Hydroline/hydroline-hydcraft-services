<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { apiFetch, ApiError } from '@/utils/api'

const auth = useAuthStore()
const ui = useUiStore()
const toast = useToast()

// 权限判定：是否允许编辑配置
const canManageConfig = computed(() =>
  auth.permissionKeys.includes('config.manage'),
)

// 验证配置开关
interface VerificationFlags {
  enableEmailVerification: boolean
  enablePhoneVerification: boolean
  enablePasswordReset: boolean
  emailCodeTtlMinutes: number
  rateLimitPerEmailPerHour: number
  supportedPhoneRegions: string[]
}

interface MailTemplateInfo {
  key: string
  label: string
  description: string | null
  defaultSubject: string | null
}

type TestMailLogStatus = 'pending' | 'active' | 'success' | 'error'

interface TestMailLogEntry {
  id: string
  label: string
  status: TestMailLogStatus
  detail?: string
  timestamp: string
}

const flags = reactive<VerificationFlags>({
  enableEmailVerification: true,
  enablePhoneVerification: false,
  enablePasswordReset: true,
  emailCodeTtlMinutes: 10,
  rateLimitPerEmailPerHour: 5,
  supportedPhoneRegions: ['+86', '+852', '+853', '+886'],
})

const flagsLoading = ref(false)
const flagsSaving = ref(false)
const configDialogOpen = ref(false)
const mailTemplates = ref<MailTemplateInfo[]>([])
const mailTemplatesLoading = ref(false)
const testMailDialogOpen = ref(false)
const testMailSending = ref(false)
const testMailSubjectEdited = ref(false)
const testMailContextJson = ref('')
const testMailLogs = ref<TestMailLogEntry[]>([])
const testMailForm = reactive({
  email: '',
  template: '',
  subject: '',
})

const statusSummaries = computed(() => [
  {
    label: '短信验证',
    enabled: Boolean(flags.enablePasswordReset),
    description: flags.enablePasswordReset
      ? '验证码找回密码功能已启用'
      : '暂未开放验证码找回功能',
  },
  {
    label: '手机验证',
    enabled: Boolean(flags.enablePhoneVerification),
    description: flags.enablePhoneVerification
      ? '支持 +86/+852/+853/+886 区号'
      : '暂未开启手机号验证',
  },
])

const mailTemplateOptions = computed(() =>
  mailTemplates.value.map((tpl) => ({ label: tpl.label, value: tpl.key })),
)

const selectedMailTemplate = computed(
  () =>
    mailTemplates.value.find((tpl) => tpl.key === testMailForm.template) ??
    null,
)

const logIconByStatus: Record<TestMailLogStatus, string> = {
  pending: 'i-lucide-clock-3',
  active: 'i-lucide-loader',
  success: 'i-lucide-check-circle-2',
  error: 'i-lucide-x-circle',
}

const logColorByStatus: Record<TestMailLogStatus, string> = {
  pending: 'text-slate-400',
  active: 'text-primary-500',
  success: 'text-emerald-500',
  error: 'text-rose-500',
}

async function fetchFlags() {
  if (!auth.token) return
  flagsLoading.value = true
  try {
    const data = await apiFetch<VerificationFlags>(
      '/auth/admin/verification/flags',
      { token: auth.token },
    )
    flags.enableEmailVerification = Boolean(data.enableEmailVerification)
    flags.enablePhoneVerification = Boolean(data.enablePhoneVerification)
    flags.enablePasswordReset = Boolean(data.enablePasswordReset)
    flags.emailCodeTtlMinutes = Number(data.emailCodeTtlMinutes || 10)
    flags.rateLimitPerEmailPerHour = Number(data.rateLimitPerEmailPerHour || 5)
    flags.supportedPhoneRegions = Array.isArray(data.supportedPhoneRegions)
      ? [...data.supportedPhoneRegions]
      : ['+86', '+852', '+853', '+886']
  } catch (error) {
    console.warn('[admin] load verification flags failed', error)
    toast.add({ title: '读取验证开关失败', color: 'error' })
  } finally {
    flagsLoading.value = false
  }
}

function updateConfigDialog(value: boolean) {
  configDialogOpen.value = value
}

async function fetchMailTemplates() {
  if (!auth.token) return
  mailTemplatesLoading.value = true
  try {
    const data = await apiFetch<{ templates: MailTemplateInfo[] }>(
      '/auth/admin/verification/templates',
      { token: auth.token },
    )
    mailTemplates.value = data.templates
    ensureTestMailDefaults()
  } catch (error) {
    console.warn('[admin] load mail templates failed', error)
    toast.add({ title: '读取邮件模板失败', color: 'error' })
  } finally {
    mailTemplatesLoading.value = false
  }
}

function ensureTestMailDefaults() {
  if (!testMailForm.template && mailTemplates.value.length > 0) {
    testMailForm.template = mailTemplates.value[0].key
  }
  applyTemplateSubject(true)
}

function applyTemplateSubject(force = false) {
  if (!force && testMailSubjectEdited.value) return
  const template = selectedMailTemplate.value
  if (template) {
    testMailForm.subject =
      template.defaultSubject ?? `Hydroline 测试：${template.label}`
  } else if (!testMailForm.subject || force) {
    testMailForm.subject = 'Hydroline 测试邮件'
  }
}

function resetTestMailState() {
  testMailForm.email = ''
  testMailForm.subject = ''
  testMailForm.template = mailTemplates.value[0]?.key ?? ''
  testMailContextJson.value = ''
  testMailSubjectEdited.value = false
  testMailLogs.value = []
  applyTemplateSubject(true)
}

function updateTestMailDialog(value: boolean) {
  testMailDialogOpen.value = value
  if (value) {
    if (!mailTemplates.value.length && !mailTemplatesLoading.value) {
      void fetchMailTemplates()
    }
    applyTemplateSubject(true)
  } else {
    resetTestMailState()
  }
}

function handleTestMailSubjectInput() {
  testMailSubjectEdited.value = true
}

function createLogEntry(
  label: string,
  status: TestMailLogStatus,
  detail?: string,
) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const entry: TestMailLogEntry = {
    id,
    label,
    status,
    detail,
    timestamp: new Date().toLocaleTimeString(),
  }
  testMailLogs.value.push(entry)
  return entry
}

function updateLogEntry(
  entry: TestMailLogEntry,
  status: TestMailLogStatus,
  detail?: string,
) {
  entry.status = status
  entry.detail = detail ?? entry.detail
  entry.timestamp = new Date().toLocaleTimeString()
}

function parseContextPayload(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed: unknown = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模板变量必须是一个对象')
  }
  const normalized: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      normalized[key] = value
    } else if (value === undefined) {
      normalized[key] = null
    } else {
      normalized[key] = JSON.stringify(value)
    }
  }
  return normalized
}

async function sendTestMail() {
  if (!auth.token || testMailSending.value) return
  const email = testMailForm.email.trim()
  testMailSending.value = true
  testMailLogs.value = []
  const validationLog = createLogEntry('验证邮箱输入', 'active')
  if (!email) {
    updateLogEntry(validationLog, 'error', '请输入有效的邮箱地址')
    toast.add({ title: '请输入邮箱地址', color: 'error' })
    testMailSending.value = false
    return
  }
  updateLogEntry(validationLog, 'success', email)

  let contextPayload:
    | Record<string, string | number | boolean | null>
    | undefined
  if (testMailContextJson.value.trim()) {
    const contextLog = createLogEntry('解析模板变量 JSON', 'active')
    try {
      contextPayload = parseContextPayload(testMailContextJson.value)
      updateLogEntry(contextLog, 'success', '模板变量已解析')
    } catch (error) {
      const msg = error instanceof Error ? error.message : '模板变量格式错误'
      updateLogEntry(contextLog, 'error', msg)
      toast.add({ title: msg, color: 'error' })
      testMailSending.value = false
      return
    }
  }

  const requestLog = createLogEntry('请求后端接口', 'active')
  try {
    await apiFetch('/auth/admin/verification/test-email', {
      method: 'POST',
      token: auth.token,
      body: {
        email,
        template: testMailForm.template || undefined,
        subject: testMailForm.subject.trim()
          ? testMailForm.subject.trim()
          : undefined,
        ...(contextPayload ? { context: contextPayload } : {}),
      },
    })
    updateLogEntry(requestLog, 'success', '后端已接受请求')
    createLogEntry('SMTP 发送', 'success', `系统已尝试投递至 ${email}`)
    toast.add({ title: `测试邮件已发送至 ${email}`, color: 'primary' })
  } catch (error) {
    console.warn('[admin] send test mail failed', error)
    const msg = error instanceof ApiError ? error.message : '发送测试邮件失败'
    updateLogEntry(requestLog, 'error', msg)
    toast.add({ title: msg, color: 'error' })
  } finally {
    testMailSending.value = false
  }
}

async function saveFlags() {
  if (!auth.token) return
  if (!canManageConfig.value) return
  flagsSaving.value = true
  ui.startLoading()
  try {
    await apiFetch('/auth/admin/verification/flags', {
      method: 'POST',
      token: auth.token,
      body: { ...flags },
    })
    toast.add({ title: '已保存验证开关', color: 'primary' })
  } catch (error) {
    console.warn('[admin] save verification flags failed', error)
    const msg = error instanceof ApiError ? error.message : '保存验证开关失败'
    toast.add({ title: msg, color: 'error' })
  } finally {
    flagsSaving.value = false
    ui.stopLoading()
  }
}

// 未验证用户列表
interface UnverifiedContact {
  id: string
  value: string | null
  isPrimary?: boolean
  verification?: string | null
  verifiedAt?: string | null
}

interface UnverifiedUserItem {
  id: string
  email: string
  name: string | null
  profile?: { displayName: string | null } | null
  contacts: UnverifiedContact[]
}

const unverified = ref<UnverifiedUserItem[]>([])
const listLoading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const pageCount = ref(1)
const total = ref(0)
const pageInput = ref<number | null>(1)

async function fetchUnverified(p = page.value) {
  if (!auth.token) return
  listLoading.value = true
  try {
    const data = await apiFetch<{
      items: UnverifiedUserItem[]
      pagination: {
        total: number
        page: number
        pageSize: number
        pageCount: number
      }
    }>(
      `/auth/admin/verification/unverified?page=${p}&pageSize=${pageSize.value}`,
      { token: auth.token },
    )
    unverified.value = data.items
    total.value = data.pagination.total
    page.value = data.pagination.page
    pageSize.value = data.pagination.pageSize
    pageCount.value = data.pagination.pageCount
    pageInput.value = page.value
  } catch (error) {
    console.warn('[admin] load unverified users failed', error)
    toast.add({ title: '读取未验证用户失败', color: 'error' })
  } finally {
    listLoading.value = false
  }
}

async function goToPage(p: number) {
  const safe = Math.max(1, Math.min(p, pageCount.value))
  if (safe === page.value) return
  await fetchUnverified(safe)
}

function handlePageInput() {
  if (pageInput.value === null || Number.isNaN(pageInput.value)) {
    pageInput.value = page.value
    return
  }
  const normalized = Math.min(
    Math.max(Math.trunc(pageInput.value), 1),
    pageCount.value,
  )
  pageInput.value = normalized
  void goToPage(normalized)
}

async function resendEmail(userId: string, email: string) {
  if (!auth.token) return
  ui.startLoading()
  try {
    await apiFetch('/auth/admin/verification/resend-email', {
      method: 'POST',
      token: auth.token,
      body: { userId, email },
    })
    toast.add({ title: `验证码已重发至 ${email}`, color: 'primary' })
  } catch (error) {
    console.warn('[admin] resend email code failed', error)
    const msg = error instanceof ApiError ? error.message : '重发失败'
    toast.add({ title: msg, color: 'error' })
  } finally {
    ui.stopLoading()
  }
}

const phoneRegionOptions = [
  { label: '+86 中国大陆', value: '+86' },
  { label: '+852 中国香港', value: '+852' },
  { label: '+853 中国澳门', value: '+853' },
  { label: '+886 中国台湾', value: '+886' },
]

onMounted(async () => {
  await fetchFlags()
  await fetchUnverified(1)
  await fetchMailTemplates()
})

watch(
  () => auth.token,
  async (t) => {
    if (t) {
      await fetchFlags()
      await fetchUnverified(page.value)
      await fetchMailTemplates()
    }
  },
)

watch(
  () => testMailForm.template,
  () => {
    applyTemplateSubject()
  },
)
</script>

<template>
  <div class="space-y-6">
    <!-- 验证管理入口 -->
    <section class="text-sm">
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="space-y-3">
          <div class="flex flex-wrap gap-3">
            <div
              v-for="item in statusSummaries"
              :key="item.label"
              class="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <UIcon
                :name="
                  item.enabled ? 'i-lucide-check-circle-2' : 'i-lucide-x-circle'
                "
                class="h-5 w-5"
                :class="item.enabled ? 'text-emerald-500' : 'text-slate-400'"
              />
              <div>
                <p class="text-sm font-medium">
                  {{ item.label }}{{ item.enabled ? '已启动' : '未启动' }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <UButton
            color="primary"
            variant="link"
            :loading="flagsLoading"
            @click="configDialogOpen = true"
          >
            <template #leading>
              <UIcon name="i-lucide-sliders-horizontal" class="h-4 w-4" />
            </template>
            配置开关
          </UButton>
          <UButton
            color="primary"
            variant="soft"
            :loading="mailTemplatesLoading && !mailTemplates.length"
            @click="updateTestMailDialog(true)"
          >
            <template #leading>
              <UIcon name="i-lucide-mail-plus" class="h-4 w-4" />
            </template>
            测试邮件
          </UButton>
        </div>
      </div>
    </section>

    <UModal
      :open="configDialogOpen"
      @update:open="updateConfigDialog"
      :ui="{
        content:
          'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3
                class="text-base font-semibold text-slate-900 dark:text-white"
              >
                验证配置
              </h3>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                v-if="!canManageConfig"
                size="xs"
                color="warning"
                variant="soft"
              >
                需要 config.manage 权限
              </UBadge>
              <UButton
                color="primary"
                variant="link"
                :disabled="!canManageConfig || flagsSaving"
                :loading="flagsSaving"
                @click="saveFlags"
              >
                保存
              </UButton>
            </div>
          </div>

          <div class="grid gap-4">
            <label
              class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div>
                <p class="text-sm font-medium">启用邮箱验证</p>
                <p class="text-xs text-slate-500">
                  用户绑定邮箱需验证后才可设为主邮箱
                </p>
              </div>
              <input
                type="checkbox"
                v-model="flags.enableEmailVerification"
                :disabled="!canManageConfig"
                class="h-4 w-4"
              />
            </label>

            <label
              class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div>
                <p class="text-sm font-medium">启用手机号验证</p>
                <p class="text-xs text-slate-500">
                  仅大中华区号段（+86/+852/+853/+886）
                </p>
              </div>
              <input
                type="checkbox"
                v-model="flags.enablePhoneVerification"
                :disabled="!canManageConfig"
                class="h-4 w-4"
              />
            </label>

            <label
              class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <div>
                <p class="text-sm font-medium">启用“忘记密码”</p>
                <p class="text-xs text-slate-500">通过邮箱验证码重置密码</p>
              </div>
              <input
                type="checkbox"
                v-model="flags.enablePasswordReset"
                :disabled="!canManageConfig"
                class="h-4 w-4"
              />
            </label>

            <div
              class="grid gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/60"
            >
              <label class="flex items-center justify-between gap-3">
                <span class="text-sm">邮箱验证码有效期（分钟）</span>
                <UInput
                  type="number"
                  v-model.number="flags.emailCodeTtlMinutes"
                  :disabled="!canManageConfig"
                  class="w-28 text-right"
                  min="1"
                />
              </label>
              <label class="flex items-center justify-between gap-3">
                <span class="text-sm">同邮箱每小时发送上限</span>
                <UInput
                  type="number"
                  v-model.number="flags.rateLimitPerEmailPerHour"
                  :disabled="!canManageConfig"
                  class="w-28 text-right"
                  min="1"
                />
              </label>
              <label class="flex flex-col gap-2">
                <span class="text-sm">支持手机号区号</span>
                <USelect
                  v-model="flags.supportedPhoneRegions"
                  :items="phoneRegionOptions"
                  multiple
                  value-key="value"
                  label-key="label"
                  :disabled="!canManageConfig"
                />
              </label>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="testMailDialogOpen"
      @update:open="updateTestMailDialog"
      :ui="{
        content:
          'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      }"
    >
      <template #content>
        <div class="space-y-5 p-6">
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3
                class="text-base font-semibold text-slate-900 dark:text-white"
              >
                发送测试邮件
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                输入邮箱并选择模板，方便调试邮件样式
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="testMailSending"
                @click="resetTestMailState"
              >
                重置
              </UButton>
              <UButton
                color="primary"
                :loading="testMailSending"
                :disabled="!testMailForm.email"
                @click="sendTestMail"
              >
                <template #leading>
                  <UIcon name="i-lucide-send" class="h-4 w-4" />
                </template>
                发送
              </UButton>
            </div>
          </div>

          <div class="grid gap-4">
            <label class="flex flex-col gap-2 text-sm">
              <span class="font-medium">收件邮箱</span>
              <UInput
                v-model="testMailForm.email"
                type="email"
                placeholder="user@example.com"
              />
            </label>

            <div class="grid gap-4 md:grid-cols-2">
              <label class="flex flex-col gap-2 text-sm">
                <span class="font-medium">模板</span>
                <USelect
                  v-model="testMailForm.template"
                  :items="mailTemplateOptions"
                  value-key="value"
                  label-key="label"
                  :loading="mailTemplatesLoading"
                  :disabled="
                    mailTemplatesLoading || mailTemplateOptions.length === 0
                  "
                  placeholder="选择邮件模板"
                />
                <p
                  v-if="selectedMailTemplate?.description"
                  class="text-xs text-slate-500 dark:text-slate-400"
                >
                  {{ selectedMailTemplate.description }}
                </p>
              </label>
              <label class="flex flex-col gap-2 text-sm">
                <span class="font-medium">邮件主题</span>
                <UInput
                  v-model="testMailForm.subject"
                  placeholder="Hydroline 测试邮件"
                  @input="handleTestMailSubjectInput"
                />
              </label>
            </div>

            <label class="flex flex-col gap-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="font-medium">模板变量 JSON（可选）</span>
                <span class="text-xs text-slate-400">对象格式</span>
              </div>
              <UTextarea
                v-model="testMailContextJson"
                :rows="4"
                placeholder='{"displayName":"氢气"}'
              />
            </label>
          </div>

          <div
            class="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-sm dark:border-slate-800/70 dark:bg-slate-900/40"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-700 dark:text-slate-200"
                >发送进度</span
              >
              <UBadge
                v-if="testMailSending"
                size="xs"
                color="primary"
                variant="soft"
              >
                发送中
              </UBadge>
            </div>
            <div
              v-if="testMailLogs.length === 0"
              class="text-xs text-slate-500 dark:text-slate-400"
            >
              发送记录会显示在这里
            </div>
            <ul v-else class="space-y-2 text-xs">
              <li
                v-for="log in testMailLogs"
                :key="log.id"
                class="flex items-start gap-3"
              >
                <UIcon
                  :name="logIconByStatus[log.status]"
                  class="mt-0.5 h-4 w-4"
                  :class="[
                    logColorByStatus[log.status],
                    log.status === 'active' ? 'animate-spin' : '',
                  ]"
                />
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-medium text-slate-700 dark:text-slate-200"
                    >
                      {{ log.label }}
                    </span>
                    <span
                      class="text-[10px] text-slate-400 dark:text-slate-500"
                    >
                      {{ log.timestamp }}
                    </span>
                  </div>
                  <p
                    v-if="log.detail"
                    class="text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    {{ log.detail }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 未验证用户列表 -->
    <section
      class="rounded-3xl overflow-hidden border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-full divide-y divide-slate-200 dark:divide-slate-800"
        >
          <thead class="bg-slate-50/70 dark:bg-slate-900/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <th class="px-4 py-3">用户</th>
              <th class="px-4 py-3">邮箱列表</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr v-for="u in unverified" :key="u.id" class="align-top">
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-900 dark:text-white">{{
                    u.profile?.displayName ?? u.email
                  }}</span>
                  <span class="text-xs text-slate-500">{{ u.email }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-1">
                  <UBadge
                    v-for="c in u.contacts"
                    :key="c.id"
                    :color="
                      c.verification === 'VERIFIED' ? 'success' : 'warning'
                    "
                    size="xs"
                    variant="soft"
                    class="text-[11px]"
                  >
                    <span>{{ c.value }}</span>
                    <span v-if="c.isPrimary" class="ml-1 font-semibold"
                      >主</span
                    >
                  </UBadge>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <UButton
                    v-for="c in u.contacts"
                    :key="c.id + ':btn'"
                    size="xs"
                    color="primary"
                    variant="soft"
                    :disabled="listLoading || !c.value"
                    @click="c.value && resendEmail(u.id, c.value)"
                  >
                    重发验证码至 {{ c.value?.slice(0, 16) }}
                  </UButton>
                </div>
              </td>
            </tr>
            <tr v-if="unverified.length === 0">
              <td
                colspan="3"
                class="px-4 py-12 text-center text-slate-500 dark:text-slate-400"
              >
                暂无未验证邮箱的用户
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer
        class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-5 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
      >
        <span>第 {{ page }} / {{ pageCount }} 页，共 {{ total }} 人</span>
        <div class="flex items-center gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="page <= 1 || listLoading"
            @click="goToPage(1)"
            >首页</UButton
          >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="page <= 1 || listLoading"
            @click="goToPage(page - 1)"
            >上一页</UButton
          >
          <div class="flex items-center gap-1">
            <UInput
              v-model.number="pageInput"
              type="number"
              size="xs"
              class="w-16 text-center"
              :disabled="listLoading"
              min="1"
              :max="pageCount"
              @keydown.enter.prevent="handlePageInput"
            />
            <span class="text-xs text-slate-500 dark:text-slate-400"
              >/ {{ pageCount }}</span
            >
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="listLoading"
            @click="handlePageInput"
            >跳转</UButton
          >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="page >= pageCount || listLoading"
            @click="goToPage(page + 1)"
            >下一页</UButton
          >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="page >= pageCount || listLoading"
            @click="goToPage(pageCount)"
            >末页</UButton
          >
        </div>
      </footer>
    </section>
  </div>
</template>
