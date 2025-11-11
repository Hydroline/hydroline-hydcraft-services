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
})

watch(
  () => auth.token,
  async (t) => {
    if (t) {
      await fetchFlags()
      await fetchUnverified(page.value)
    }
  },
)
</script>

<template>
  <div class="space-y-6">
    <!-- 验证开关 -->
    <section
      class="rounded-3xl border border-slate-200/70 bg-white/80 p-5 text-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-semibold">验证管理</h2>
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
            :disabled="!canManageConfig || flagsSaving"
            :loading="flagsSaving"
            @click="saveFlags"
            >保存</UButton
          >
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
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
    </section>

    <!-- 未验证用户列表 -->
    <section
      class="rounded-3xl border border-slate-200/70 bg-white/80 text-sm dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <header class="flex items-center justify-between px-5 py-4">
        <h3 class="text-base font-semibold">未验证邮箱的用户</h3>
        <div class="text-xs text-slate-500">共 {{ total }} 人</div>
      </header>
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
        <span>第 {{ page }} / {{ pageCount }} 页</span>
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
