<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import CompanyStatusBadge from '@/components/company/CompanyStatusBadge.vue'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  CompanyIndustry,
  CompanyModel,
  CompanyType,
  CompanyVisibility,
} from '@/types/company'

const props = defineProps<{
  modelValue: boolean
  company: CompanyModel | null
  industries: CompanyIndustry[]
  types: CompanyType[]
  saving?: boolean
}>()

const authStore = useAuthStore()
const toast = useToast()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'save', payload: Record<string, unknown>): void
}>()

const formState = reactive({
  name: '',
  summary: '',
  description: '',
  typeId: undefined as string | undefined,
  industryId: undefined as string | undefined,
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
  homepageUrl: '',
  visibility: undefined as CompanyVisibility | undefined,
  status: undefined as CompanyModel['status'] | undefined,
  logoAttachmentId: '',
  auditReason: '',
})

const visibilityOptions = [
  { value: 'PUBLIC', label: '公开' },
  { value: 'PRIVATE', label: '仅成员' },
  { value: 'INTERNAL', label: '内部' },
]

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
const logoUploadInput = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)
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
  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''
  try {
    const results = await apiFetch<AttachmentSearchResult[]>(
      `/portal/attachments/search${query ? `${query}&` : '?'}publicOnly=false`,
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

function triggerLogoUpload() {
  logoUploadInput.value?.click()
}

async function handleLogoUploadChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file || !authStore.token) return
  logoUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('isPublic', 'true')
    const attachment = await apiFetch<AttachmentSearchResult>('/attachments', {
      method: 'POST',
      body: formData,
      token: authStore.token,
    })
    formState.logoAttachmentId = attachment.id
    attachmentMap.value = {
      ...attachmentMap.value,
      [attachment.id]: attachment,
    }
    attachmentOptions.value = [
      buildAttachmentOption(attachment),
      ...attachmentOptions.value.filter((item) => item.id !== attachment.id),
    ]
    toast.add({ title: 'Logo 已上传', color: 'primary' })
  } catch (error) {
    toast.add({
      title: (error as Error).message || 'Logo 上传失败',
      color: 'error',
    })
  } finally {
    logoUploading.value = false
    if (target) target.value = ''
  }
}

const selectedLogoPreview = computed(() => {
  const selectedId = formState.logoAttachmentId?.trim()
  if (!selectedId) return props.company?.logoUrl ?? null
  return (
    attachmentMap.value[selectedId]?.publicUrl ?? props.company?.logoUrl ?? null
  )
})

const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'UNDER_REVIEW', label: '审核中' },
  { value: 'NEEDS_REVISION', label: '待补件' },
  { value: 'ACTIVE', label: '已注册' },
  { value: 'SUSPENDED', label: '暂停营业' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'ARCHIVED', label: '注销' },
]

const typeOptions = computed(() =>
  props.types.map((type) => ({ value: type.id, label: type.name })),
)

const industryOptions = computed(() =>
  props.industries.map((item) => ({ value: item.id, label: item.name })),
)

watch(
  () => props.company,
  (company) => {
    if (!company) return
    formState.name = company.name
    formState.summary = company.summary ?? ''
    formState.description = company.description ?? ''
    formState.typeId = company.type?.id
    formState.industryId = company.industry?.id
    formState.contactEmail = company.contactEmail ?? ''
    formState.contactPhone = company.contactPhone ?? ''
    formState.contactAddress = company.contactAddress ?? ''
    formState.homepageUrl = company.homepageUrl ?? ''
    formState.visibility = company.visibility
    formState.status = company.status
    formState.logoAttachmentId = company.logoAttachmentId ?? ''
    formState.auditReason = ''
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
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

const detailTitle = computed(() => props.company?.name ?? '公司管理')

const permissionLabelMap: Record<string, string> = {
  VIEW_DASHBOARD: '查看公司后台',
  MANAGE_MEMBERS: '管理员工（HR）',
  EDIT_COMPANY: '共同修改公司信息',
}

const positionPermissionEntries = computed(() => {
  const permissions = props.company?.positionPermissions ?? {}
  return Object.entries(permissions)
})

function closeDialog() {
  emit('update:modelValue', false)
}

function handleSave() {
  if (!props.company) return
  emit('save', {
    name: formState.name,
    summary: formState.summary,
    description: formState.description,
    typeId: formState.typeId,
    industryId: formState.industryId,
    contactEmail: formState.contactEmail,
    contactPhone: formState.contactPhone,
    contactAddress: formState.contactAddress,
    homepageUrl: formState.homepageUrl,
    visibility: formState.visibility,
    status: formState.status,
    logoAttachmentId: formState.logoAttachmentId || undefined,
    auditReason: formState.auditReason || '管理员更新公司信息',
  })
}
</script>

<template>
  <UModal
    :open="modelValue"
    @update:open="closeDialog"
    :ui="{ content: 'w-full max-w-6xl w-[calc(100vw-2rem)]' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500">
              公司管理
            </p>
            <h3 class="text-lg font-semibold text-slate-900">
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
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
              >
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >公司名称</label
                    >
                    <UInput v-model="formState.name" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >可见性</label
                    >
                    <USelectMenu
                      v-model="formState.visibility"
                      :items="visibilityOptions"
                      value-key="value"
                      placeholder="选择可见性"
                    />
                  </div>
                </div>
                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >公司类型</label
                    >
                    <USelectMenu
                      v-model="formState.typeId"
                      :items="typeOptions"
                      value-key="value"
                      placeholder="公司类型"
                    />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >行业</label
                    >
                    <USelectMenu
                      v-model="formState.industryId"
                      :items="industryOptions"
                      value-key="value"
                      placeholder="行业"
                    />
                  </div>
                </div>
                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >公司状态</label
                    >
                    <USelectMenu
                      v-model="formState.status"
                      :items="statusOptions"
                      value-key="value"
                      placeholder="选择状态"
                    />
                  </div>
                </div>
                <div class="mt-4 space-y-2">
                  <label class="text-xs font-semibold text-slate-500"
                    >概要</label
                  >
                  <UInput
                    v-model="formState.summary"
                    placeholder="一句话说明公司定位"
                  />
                </div>
                <div class="mt-4 space-y-2">
                  <label class="text-xs font-semibold text-slate-500"
                    >详细介绍</label
                  >
                  <UTextarea v-model="formState.description" rows="4" />
                </div>
                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >联系邮箱</label
                    >
                    <UInput v-model="formState.contactEmail" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >联系电话</label
                    >
                    <UInput v-model="formState.contactPhone" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >联系地址</label
                    >
                    <UInput v-model="formState.contactAddress" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >官网链接</label
                    >
                    <UInput v-model="formState.homepageUrl" />
                  </div>
                </div>
                <div class="mt-4 space-y-2">
                  <label class="text-xs font-semibold text-slate-500"
                    >修改原因</label
                  >
                  <UTextarea
                    v-model="formState.auditReason"
                    rows="2"
                    placeholder="请输入修改原因"
                  />
                </div>
                <div class="mt-4 flex justify-end">
                  <UButton
                    color="primary"
                    :loading="saving"
                    @click="handleSave"
                  >
                    保存修改
                  </UButton>
                </div>
              </div>
            </div>
            <div class="space-y-4">
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
              >
                <h4 class="text-sm font-semibold text-slate-900">公司 Logo</h4>
                <div class="mt-3">
                  <img
                    v-if="selectedLogoPreview"
                    :src="selectedLogoPreview"
                    alt="公司 Logo"
                    class="h-24 w-24 rounded-xl object-cover"
                  />
                  <div
                    v-else
                    class="h-24 w-24 rounded-xl border border-dashed border-slate-200/70 text-center text-xs text-slate-400 flex items-center justify-center"
                  >
                    暂无 Logo
                  </div>
                </div>
                <div class="mt-4 space-y-3 text-sm">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold text-slate-500"
                      >选择已有附件</label
                    >
                    <USelectMenu
                      v-model="formState.logoAttachmentId"
                      :items="attachmentOptions"
                      :loading="attachmentLoading"
                      value-key="id"
                      label-key="label"
                      :searchable="true"
                      placeholder="搜索或选择附件"
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
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      ref="logoUploadInput"
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="handleLogoUploadChange"
                    />
                    <UButton
                      color="primary"
                      variant="soft"
                      size="sm"
                      :loading="logoUploading"
                      @click="triggerLogoUpload"
                    >
                      上传新 Logo
                    </UButton>
                  </div>
                </div>
              </div>
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
              >
                <h4 class="text-sm font-semibold text-slate-900">注册信息</h4>
                <div class="mt-3 space-y-2 text-sm text-slate-600">
                  <div>
                    注册时间：
                    {{
                      company?.approvedAt
                        ? new Date(company.approvedAt).toLocaleString()
                        : '未注册'
                    }}
                  </div>
                </div>
              </div>
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
              >
                <h4 class="text-sm font-semibold text-slate-900">成员与岗位</h4>
                <div class="mt-3 space-y-2 text-sm text-slate-600">
                  <div
                    v-for="member in company?.members ?? []"
                    :key="member.id"
                  >
                    {{
                      member.user?.displayName ||
                      member.user?.name ||
                      member.user?.email ||
                      '未知成员'
                    }}
                    · {{ member.position?.name || member.role }}
                  </div>
                  <div
                    v-if="(company?.members?.length ?? 0) === 0"
                    class="text-xs text-slate-400"
                  >
                    暂无成员数据
                  </div>
                </div>
              </div>
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
              >
                <h4 class="text-sm font-semibold text-slate-900">岗位权限</h4>
                <div class="mt-3 space-y-2 text-sm text-slate-600">
                  <div
                    v-for="[code, perms] in positionPermissionEntries"
                    :key="code"
                    class="rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div class="text-xs text-slate-500">{{ code }}</div>
                    <div class="text-sm text-slate-900">
                      {{
                        perms
                          .map((perm) => permissionLabelMap[perm] || perm)
                          .join('、') || '未配置'
                      }}
                    </div>
                  </div>
                  <div
                    v-if="positionPermissionEntries.length === 0"
                    class="text-xs text-slate-400"
                  >
                    暂无岗位权限配置
                  </div>
                </div>
              </div>
              <div
                class="rounded-2xl border border-slate-200/70 bg-white/80 p-6"
              >
                <h4 class="text-sm font-semibold text-slate-900">审计记录</h4>
                <div class="mt-3 space-y-2 text-sm">
                  <div
                    v-for="record in company?.auditTrail ?? []"
                    :key="record.id"
                    class="rounded-xl border border-slate-200/70 p-3"
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
                    <p class="text-slate-900">
                      {{
                        record.comment || record.actionLabel || '公司信息更新'
                      }}
                    </p>
                  </div>
                  <div
                    v-if="(company?.auditTrail?.length ?? 0) === 0"
                    class="rounded-xl border border-dashed border-slate-200/70 p-4 text-center text-xs text-slate-500"
                  >
                    暂无审计记录
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
