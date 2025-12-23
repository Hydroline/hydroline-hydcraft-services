<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import CompanyProfileForm from '@/components/company/CompanyProfileForm.vue'
import AvatarCropperModal from '@/components/common/AvatarCropperModal.vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  CompanyIndustry,
  CompanyJoinPolicy,
  CompanyModel,
  CompanyPermissionKey,
  CompanyPosition,
  UpdateCompanyPayload,
} from '@/types/company'

type SettingsPayload = {
  joinPolicy: CompanyJoinPolicy
  positionPermissions: Record<string, CompanyPermissionKey[]>
}

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
  industries: CompanyIndustry[]
  positions: CompanyPosition[]
  saving?: boolean
  settingsSaving?: boolean
  logoUploading?: boolean
  deregistrationSubmitting?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'save-profile', payload: UpdateCompanyPayload): void
  (event: 'save-settings', payload: SettingsPayload): void
  (event: 'upload-logo', payload: File): void
  (event: 'select-logo-attachment', payload: string): void
  (event: 'apply-deregistration', payload: { reason?: string }): void
}>()

const modalOpen = computed(() => props.modelValue)
const company = computed(() => props.company)
const detailTitle = computed(() => company.value?.name ?? '公司管理')
const canRequestDeregistration = computed(() =>
  ['ACTIVE', 'SUSPENDED'].includes(company.value?.status ?? ''),
)
const authStore = useAuthStore()

const joinPolicyOptions = [
  { value: 'AUTO', label: '自动通过' },
  { value: 'REVIEW', label: '需审核' },
]

const permissionOptions = [
  { value: 'VIEW_DASHBOARD', label: '查看公司后台' },
  { value: 'MANAGE_MEMBERS', label: '管理员工（HR）' },
  { value: 'EDIT_COMPANY', label: '共同修改公司信息' },
]

const settingsForm = reactive<SettingsPayload>({
  joinPolicy: 'REVIEW',
  positionPermissions: {},
})

watch(
  () => props.company,
  (value) => {
    if (!value) return
    settingsForm.joinPolicy = value.joinPolicy ?? 'REVIEW'
    settingsForm.positionPermissions = value.positionPermissions
      ? { ...value.positionPermissions }
      : {}
  },
  { immediate: true },
)

const logoFileInput = ref<HTMLInputElement | null>(null)
const logoCropModalOpen = ref(false)
const logoCropSource = ref<{ url: string; name: string } | null>(null)
const logoCropSubmitting = ref(false)
const deregistrationModalOpen = ref(false)
const deregistrationReason = ref('')

type AttachmentSearchResult = {
  id: string
  name: string
  originalName: string
  size: number
  isPublic: boolean
  publicUrl: string | null
  folder: {
    id: string
    name: string
    path: string
  } | null
}

type AttachmentSelectOption = {
  id: string
  label: string
  description: string
}

const attachmentOptions = ref<AttachmentSelectOption[]>([])
const attachmentSearchTerm = ref('')
const attachmentLoading = ref(false)
const attachmentMap = ref<Record<string, AttachmentSearchResult>>({})
const selectedAttachmentId = ref<string | null>(null)
let attachmentSearchTimer: ReturnType<typeof setTimeout> | null = null
let attachmentAbort: AbortController | null = null

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function buildAttachmentOption(
  item: AttachmentSearchResult,
): AttachmentSelectOption {
  const label = item.name?.trim() || item.originalName || item.id
  const segments = [`ID: ${item.id}`, formatFileSize(item.size)]
  if (item.folder?.path) {
    segments.push(item.folder.path)
  }
  segments.push(item.isPublic ? '公开' : '需设为公开')
  return {
    id: item.id,
    label,
    description: segments.join(' · '),
  }
}

async function fetchAttachmentOptions(keyword: string) {
  if (!authStore.token) return
  attachmentLoading.value = true
  attachmentAbort?.abort()
  const controller = new AbortController()
  attachmentAbort = controller
  const query = new URLSearchParams()
  if (keyword) query.set('keyword', keyword)
  query.set('limit', '30')
  try {
    const results = await apiFetch<AttachmentSearchResult[]>(
      `/companies/attachments?${query.toString()}`,
      { token: authStore.token, signal: controller.signal, noDedupe: true },
    )
    if (attachmentAbort !== controller) return
    attachmentMap.value = results.reduce<
      Record<string, AttachmentSearchResult>
    >((acc, record) => {
      acc[record.id] = record
      return acc
    }, {})
    attachmentOptions.value = results.map((item) => buildAttachmentOption(item))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
  } finally {
    if (attachmentAbort === controller) {
      attachmentAbort = null
    }
    attachmentLoading.value = false
  }
}

function closeDialog() {
  emit('update:modelValue', false)
}

function triggerLogoSelect() {
  logoFileInput.value?.click()
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取图片'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

async function handleLogoFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  const dataUrl = await readFileAsDataUrl(file)
  logoCropSource.value = { url: dataUrl, name: file.name }
  logoCropModalOpen.value = true
  if (target) target.value = ''
}

async function handleLogoCropConfirm(file: File) {
  logoCropSubmitting.value = true
  try {
    emit('upload-logo', file)
    logoCropModalOpen.value = false
  } finally {
    logoCropSubmitting.value = false
  }
}

function handleSaveSettings() {
  if (!company.value) return
  emit('save-settings', {
    joinPolicy: settingsForm.joinPolicy,
    positionPermissions: settingsForm.positionPermissions,
  })
}

function updatePositionPermissions(
  code: string,
  value: CompanyPermissionKey[],
) {
  settingsForm.positionPermissions = {
    ...settingsForm.positionPermissions,
    [code]: value,
  }
}

function handleSelectAttachment() {
  if (!selectedAttachmentId.value) return
  emit('select-logo-attachment', selectedAttachmentId.value)
}

function openDeregistrationDialog() {
  deregistrationReason.value = ''
  deregistrationModalOpen.value = true
}

function handleDeregistrationSubmit() {
  emit('apply-deregistration', {
    reason: deregistrationReason.value.trim() || undefined,
  })
  deregistrationModalOpen.value = false
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    selectedAttachmentId.value = props.company?.logoAttachmentId ?? null
    attachmentSearchTerm.value = ''
    void fetchAttachmentOptions('')
  },
)

watch(
  () => attachmentSearchTerm.value,
  (keyword) => {
    if (attachmentSearchTimer) {
      clearTimeout(attachmentSearchTimer)
    }
    attachmentSearchTimer = setTimeout(() => {
      attachmentSearchTimer = null
      void fetchAttachmentOptions(keyword.trim())
    }, 300)
  },
)
</script>

<template>
  <UModal
    :open="modalOpen"
    @update:open="closeDialog"
    :ui="{
      content:
        'w-full max-w-6xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
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
              公司管理
            </p>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ detailTitle }}
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
          <div
            class="grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,0.3fr)]"
          >
            <div class="space-y-6">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <CompanyProfileForm
                  :company="company"
                  :industries="industries"
                  :saving="saving"
                  @submit="emit('save-profile', $event)"
                />
              </div>

              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <p
                      class="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      入职设置
                    </p>
                    <h4
                      class="text-base font-semibold text-slate-900 dark:text-white"
                    >
                      入职方式与岗位权限
                    </h4>
                  </div>
                  <UButton
                    color="primary"
                    size="sm"
                    :loading="props.settingsSaving"
                    @click="handleSaveSettings"
                  >
                    保存设置
                  </UButton>
                </div>
                <div class="mt-4 space-y-4">
                  <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                    <label class="text-xs font-semibold text-slate-500"
                      >入职方式</label
                    >
                    <USelectMenu
                      v-model="settingsForm.joinPolicy"
                      :items="joinPolicyOptions"
                      value-key="value"
                      placeholder="选择入职方式"
                    />
                  </div>
                  <div>
                    <p class="text-xs font-semibold text-slate-500">
                      岗位权限分配
                    </p>
                    <div class="mt-3 space-y-3">
                      <div
                        v-for="position in positions"
                        :key="position.code"
                        class="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3"
                      >
                        <span class="text-sm text-slate-700">
                          {{ position.name }}
                        </span>
                        <USelect
                          :model-value="
                            settingsForm.positionPermissions[position.code] ??
                            []
                          "
                          :items="permissionOptions"
                          multiple
                          searchable
                          value-key="value"
                          label-key="label"
                          placeholder="选择权限"
                          @update:model-value="
                            updatePositionPermissions(position.code, $event)
                          "
                        />
                      </div>
                      <div
                        v-if="positions.length === 0"
                        class="rounded-xl border border-dashed border-slate-200/70 px-4 py-4 text-center text-xs text-slate-500"
                      >
                        暂无岗位配置，稍后可在后台补充。
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <h4
                  class="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  审计记录
                </h4>
                <div class="mt-3 space-y-2 text-sm">
                  <div
                    v-for="record in company?.auditTrail ?? []"
                    :key="record.id"
                    class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800"
                  >
                    <div
                      class="flex items-center justify-between text-xs text-slate-500"
                    >
                      <span>
                        {{
                          record.actor?.profile?.displayName ||
                          record.actor?.name ||
                          record.actor?.email ||
                          '系统'
                        }}
                      </span>
                      <span>{{
                        new Date(record.createdAt).toLocaleString()
                      }}</span>
                    </div>
                    <p class="text-slate-900 dark:text-white">
                      {{
                        record.comment || record.actionLabel || '公司信息更新'
                      }}
                    </p>
                  </div>
                  <div
                    v-if="(company?.auditTrail?.length ?? 0) === 0"
                    class="rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500"
                  >
                    暂无审计记录。
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 text-center dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <p
                  class="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  公司 Logo
                </p>
                <div class="mt-4 flex flex-col items-center gap-3">
                  <div
                    class="h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                  >
                    <img
                      v-if="company?.logoUrl"
                      :src="company.logoUrl"
                      alt="公司 Logo"
                      class="h-full w-full object-cover"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center text-xs text-slate-400"
                    >
                      暂无 Logo
                    </div>
                  </div>
                  <input
                    ref="logoFileInput"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleLogoFileChange"
                  />
                  <UButton
                    color="primary"
                    variant="soft"
                    size="sm"
                    :loading="props.logoUploading"
                    @click="triggerLogoSelect"
                  >
                    上传 Logo
                  </UButton>
                  <div class="w-full space-y-2">
                    <label
                      class="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      选择已上传 Logo
                    </label>
                    <USelectMenu
                      v-model="selectedAttachmentId"
                      :items="attachmentOptions"
                      :loading="attachmentLoading"
                      value-key="id"
                      label-key="label"
                      :searchable="true"
                      placeholder="搜索自己的附件"
                      v-model:search-term="attachmentSearchTerm"
                    >
                      <template #option="{ item }">
                        <div class="flex flex-col">
                          <span class="text-sm text-slate-900">{{
                            item.label
                          }}</span>
                          <span class="text-[11px] text-slate-500">{{
                            item.description
                          }}</span>
                        </div>
                      </template>
                    </USelectMenu>
                    <UButton
                      color="primary"
                      variant="ghost"
                      size="sm"
                      :disabled="!selectedAttachmentId"
                      @click="handleSelectAttachment"
                    >
                      使用选中附件
                    </UButton>
                  </div>
                </div>
              </div>

              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6 dark:border-slate-800/60 dark:bg-slate-900/70"
              >
                <h4
                  class="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  公司信息
                </h4>
                <div class="mt-3 space-y-2 text-sm text-slate-600">
                  <div>行业：{{ company?.industry?.name || '未设置' }}</div>
                  <div>类型：{{ company?.type?.name || '未设置' }}</div>
                  <div>状态：{{ company?.status || '—' }}</div>
                </div>
                <div class="mt-4">
                  <UButton
                    color="error"
                    variant="soft"
                    size="sm"
                    :disabled="!canRequestDeregistration"
                    @click="openDeregistrationDialog"
                  >
                    申请注销
                  </UButton>
                  <p
                    v-if="!canRequestDeregistration"
                    class="mt-2 text-xs text-slate-400"
                  >
                    仅已注册或暂停营业的公司可发起注销。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deregistrationModalOpen"
    @update:open="(value) => (deregistrationModalOpen = value)"
    :ui="{ content: 'w-full max-w-lg w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <header class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              公司注销
            </p>
            <h3 class="text-lg font-semibold text-slate-900">提交注销申请</h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="deregistrationModalOpen = false"
          />
        </header>
        <p class="text-xs text-slate-500">
          申请提交后将进入注销审批流程，审批通过后公司会被注销。
        </p>
        <div class="space-y-2">
          <label class="text-xs font-semibold text-slate-500"
            >注销原因（可选）</label
          >
          <UTextarea
            v-model="deregistrationReason"
            rows="4"
            placeholder="说明注销原因"
          />
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="deregistrationModalOpen = false"
          >
            取消
          </UButton>
          <UButton
            color="error"
            :loading="props.deregistrationSubmitting"
            :disabled="props.deregistrationSubmitting"
            @click="handleDeregistrationSubmit"
          >
            提交申请
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <AvatarCropperModal
    v-model:open="logoCropModalOpen"
    :image-url="logoCropSource?.url ?? null"
    :file-name="logoCropSource?.name"
    :submitting="logoCropSubmitting"
    confirm-label="保存 Logo"
    @confirm="handleLogoCropConfirm"
  />
</template>
