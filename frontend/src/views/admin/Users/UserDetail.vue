<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ApiError, apiFetch } from '@/utils/api'
import type { RegionValue } from '@/views/user/Profile/components/RegionSelector.vue'
import { useAuthStore } from '@/stores/auth'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import type { AdminBindingHistoryEntry, AdminUserDetail } from '@/types/admin'
import UserDetailSectionOverview from './components/UserDetailSectionOverview.vue'
import UserDetailSectionProfile from './components/UserDetailSectionProfile.vue'
import UserDetailSectionServerAccounts from './components/UserDetailSectionServerAccounts.vue'
import UserBindingHistoryDialog from './components/UserBindingHistoryDialog.vue'
import UserSessionsDialog from './components/UserSessionsDialog.vue'
import ResetPasswordResultDialog from './components/ResetPasswordResultDialog.vue'
import ErrorDialog from './components/ErrorDialog.vue'

type PasswordMode = 'temporary' | 'custom'

const props = defineProps<{ userId: string | null; emailToken?: number }>()
const emit = defineEmits<{ (event: 'deleted'): void }>()
const auth = useAuthStore()
const usersStore = useAdminUsersStore()
const rbacStore = useAdminRbacStore()
const toast = useToast()

const userId = computed(() => props.userId ?? null)
const loading = ref(false)
const detail = ref<AdminUserDetail | null>(null)
const errorMsg = ref<string | null>(null)
const bindingHistory = ref<AdminBindingHistoryEntry[]>([])
const historyLoading = ref(false)
const resetResult = ref<{
  temporaryPassword: string | null
  message: string
} | null>(null)

// 弹窗控制：原先内联显示的重置结果与错误信息改为弹窗
const resetResultDialogOpen = ref(false)
const errorDialogOpen = ref(false)

const passwordDialogOpen = ref(false)
const passwordMode = ref<PasswordMode>('temporary')
const customPassword = ref('')
const showCustomPassword = ref(false)
const passwordSubmitting = ref(false)
const deleteDialogOpen = ref(false)
const deleteSubmitting = ref(false)

// 新增：三个列表对话框的开关
const bindingHistoryDialogOpen = ref(false)
const sessionsDialogOpen = ref(false)
const contactsListDialogOpen = ref(false)

type ProfileForm = {
  displayName?: string
  birthday?: string
  gender?: string
  motto?: string
  timezone?: string
  locale?: string
  phoneCountry?: 'CN' | 'HK' | 'MO' | 'TW'
  phone?: string
  region?: RegionValue
}

const profileForm = reactive<ProfileForm>({
  displayName: undefined,
  birthday: undefined,
  gender: undefined,
  motto: undefined,
  timezone: undefined,
  locale: undefined,
  phoneCountry: 'CN',
  phone: undefined,
  region: undefined,
})

const profileSaving = ref(false)
const joinDateEditing = ref<string | null>(null)
const joinDateSaving = ref(false)

const roleSelection = ref<string[]>([])
const labelSelection = ref<string[]>([])
const roleSaving = ref(false)
const labelSaving = ref(false)

const piicDialogOpen = ref(false)
const piicReason = ref('')
const piicSubmitting = ref(false)

const roleOptions = computed(() =>
  rbacStore.roles.map((role) => ({ label: role.name, value: role.key })),
)
const labelOptions = computed(() =>
  rbacStore.labels.map((label) => ({
    label: label.name,
    value: label.key,
    color: label.color ?? undefined,
  })),
)

const sessions = computed(() => detail.value?.sessions ?? [])

// 已迁移到分离的 Section 组件中计算主 Minecraft 信息与昵称列表。
const minecraftProfiles = computed(() => {
  const list = detail.value?.nicknames ?? []
  return list.map((n) => ({
    id: n.id,
    isPrimary: n.isPrimary,
    nickname: n.nickname ?? null,
  }))
})

// === 联系方式管理（声明与加载渠道） ===
const contactDialogOpen = ref(false)
const contactEditingId = ref<string | null>(null)
const contactChannelId = ref<string | undefined>(undefined)
const contactValue = ref('')
const contactIsPrimary = ref(false)
const contactSubmitting = ref(false)
const contactChannels = ref<
  Array<{ id: string; key: string; displayName: string }>
>([])

// 删除确认对话框
const deleteConfirmDialogOpen = ref(false)
const deleteConfirmMessage = ref('')
const deleteConfirmCallback = ref<(() => Promise<void>) | null>(null)
const deleteConfirmSubmitting = ref(false)

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

const emailDialogOpen = ref(false)
const emailInputValue = ref('')
const emailSubmitting = ref(false)
const pendingEmailToken = ref<number | null>(null)

const emailEntries = computed<EmailDialogEntry[]>(() => {
  const data = detail.value
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
      // 使用后端返回的 emailVerified 字段判断验证状态
      existing.verified = existing.verified || Boolean(data.emailVerified)
      existing.manageable = existing.manageable && Boolean(existing.id)
    } else {
      items.push({
        id: null,
        value: accountEmail,
        isPrimary: true,
        // 使用后端返回的 emailVerified 字段
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

const emailChannel = computed(
  () => contactChannels.value.find((c) => c.key === 'email') ?? null,
)
const emailChannelId = computed(() => emailChannel.value?.id ?? null)
const emailChannelMissing = computed(() => !emailChannel.value)

function openEmailDialog() {
  if (!detail.value) return
  emailDialogOpen.value = true
  emailInputValue.value = ''
  pendingEmailToken.value = null
  void ensureContactChannels()
}

function closeEmailDialog() {
  emailDialogOpen.value = false
}

watch(emailDialogOpen, (value) => {
  if (!value) {
    emailInputValue.value = ''
    emailSubmitting.value = false
  }
})

const manageableEmailCount = computed(
  () => emailEntries.value.filter((entry) => entry.manageable).length,
)

function canDeleteEmail(entry: EmailDialogEntry) {
  if (!entry.manageable || !entry.id) return false
  return manageableEmailCount.value > 1
}

function canSetPrimaryEmail(entry: EmailDialogEntry) {
  return entry.manageable && Boolean(entry.id) && !entry.isPrimary
}

async function submitAddEmail() {
  if (!auth.token || !detail.value) return
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
    await apiFetch(`/auth/users/${detail.value.id}/contacts`, {
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
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] add email contact failed', error)
    toast.add({ title: '添加邮箱失败', color: 'error' })
  } finally {
    emailSubmitting.value = false
  }
}

async function handleDeleteEmail(entry: EmailDialogEntry) {
  if (!entry.manageable || !entry.id) return
  if (manageableEmailCount.value <= 1) {
    toast.add({ title: '至少需要保留一个邮箱，无法删除', color: 'warning' })
    return
  }
  await deleteContact(entry.id)
}

async function handleSetPrimaryEmail(entry: EmailDialogEntry) {
  if (!entry.manageable || !entry.id || entry.isPrimary) return
  await submitSetPrimaryEmail(entry.id)
}

function tryOpenEmailDialog() {
  if (pendingEmailToken.value === null) return
  if (!detail.value) return
  pendingEmailToken.value = null
  openEmailDialog()
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

function openCreateContactDialog() {
  contactEditingId.value = null
  contactChannelId.value = contactChannels.value[0]?.id ?? undefined
  contactValue.value = ''
  contactIsPrimary.value = false
  contactDialogOpen.value = true
  void ensureContactChannels()
}

function openEditContactDialog(entry: {
  id: string
  channelId: string
  value: string | null
  isPrimary?: boolean
}) {
  contactEditingId.value = entry.id
  contactChannelId.value = entry.channelId
  contactValue.value = entry.value ?? ''
  contactIsPrimary.value = entry.isPrimary ?? false
  contactDialogOpen.value = true
  void ensureContactChannels()
}

function closeContactDialog() {
  contactDialogOpen.value = false
  contactSubmitting.value = false
}

async function submitContact() {
  if (!auth.token || !detail.value) return
  const trimmedValue = contactValue.value.trim()
  if (!contactChannelId.value || !trimmedValue) {
    toast.add({ title: '请填写必要信息', color: 'warning' })
    return
  }
  contactSubmitting.value = true
  try {
    if (!contactEditingId.value) {
      let channel = contactChannels.value.find(
        (entry) => entry.id === contactChannelId.value,
      )
      if (!channel) {
        await ensureContactChannels()
        channel = contactChannels.value.find(
          (entry) => entry.id === contactChannelId.value,
        )
      }
      if (!channel) {
        toast.add({ title: '无法确定联系方式渠道，请刷新后重试', color: 'error' })
        return
      }
      await apiFetch(`/auth/users/${detail.value.id}/contacts`, {
        method: 'POST',
        token: auth.token,
        body: {
          channelKey: channel.key,
          value: trimmedValue,
          isPrimary: contactIsPrimary.value,
        },
      })
    } else {
      await apiFetch(
        `/auth/users/${detail.value.id}/contacts/${contactEditingId.value}`,
        {
          method: 'PATCH',
          token: auth.token,
          body: {
            value: trimmedValue,
            isPrimary: contactIsPrimary.value,
          },
        },
      )
    }
    toast.add({ title: '联系方式已保存', color: 'primary' })
    await fetchDetail()
    closeContactDialog()
  } catch (error) {
    console.warn('[admin] submit contact failed', error)
    toast.add({ title: '保存失败', color: 'error' })
  } finally {
    contactSubmitting.value = false
  }
}

async function deleteContact(contactId: string) {
  if (!auth.token || !detail.value) return
  const detailId = detail.value.id
  deleteConfirmMessage.value = '确定要删除该联系方式吗？'
  deleteConfirmCallback.value = async () => {
    try {
      await apiFetch(`/auth/users/${detailId}/contacts/${contactId}`, {
        method: 'DELETE',
        token: auth.token,
      })
      toast.add({ title: '已删除', color: 'primary' })
      await fetchDetail()
    } catch (error) {
      console.warn('[admin] delete contact failed', error)
      toast.add({ title: '删除失败', color: 'error' })
    }
  }
  deleteConfirmDialogOpen.value = true
}

async function submitSetPrimaryEmail(contactId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(`/auth/users/${detail.value.id}/contacts/${contactId}`, {
      method: 'PATCH',
      token: auth.token,
      body: { isPrimary: true },
    })
    toast.add({ title: '已设为主邮箱', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] set primary email failed', error)
    toast.add({ title: '设置主邮箱失败', color: 'error' })
  }
}

// === 新增绑定 UI 状态 ===
const createBindingDialogOpen = ref(false)
const createBindingIdentifier = ref('')
const createBindingSetPrimary = ref(true)
const createBindingSubmitting = ref(false)

function openCreateBindingDialog() {
  createBindingIdentifier.value = ''
  createBindingSetPrimary.value = true
  createBindingDialogOpen.value = true
}

function closeCreateBindingDialog() {
  createBindingDialogOpen.value = false
  createBindingSubmitting.value = false
}

async function submitCreateBinding() {
  if (!auth.token || !detail.value) return
  const identifier = createBindingIdentifier.value.trim()
  if (!identifier) {
    toast.add({ title: '请输入要绑定的 AuthMe 标识', color: 'warning' })
    return
  }
  createBindingSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/bindings`, {
      method: 'POST',
      token: auth.token,
      body: { identifier, setPrimary: createBindingSetPrimary.value },
    })
    toast.add({ title: '绑定成功', color: 'primary' })
    closeCreateBindingDialog()
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] create binding failed', error)
    toast.add({ title: '绑定失败', color: 'error' })
  } finally {
    createBindingSubmitting.value = false
  }
}

// === Minecraft 昵称管理 ===
const minecraftProfileDialogOpen = ref(false)
const minecraftNicknameInput = ref('')
const minecraftPrimaryCheckbox = ref(false)
const minecraftSubmitting = ref(false)

function openMinecraftProfileDialog() {
  minecraftNicknameInput.value = ''
  minecraftPrimaryCheckbox.value = false
  minecraftProfileDialogOpen.value = true
}

function closeMinecraftProfileDialog() {
  minecraftProfileDialogOpen.value = false
  minecraftSubmitting.value = false
}

async function submitMinecraftProfile() {
  if (!auth.token || !detail.value) return
  const nickname = minecraftNicknameInput.value.trim()
  if (!nickname) {
    toast.add({ title: '请输入昵称', color: 'warning' })
    return
  }
  minecraftSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/minecraft-profiles`, {
      method: 'POST',
      token: auth.token,
      body: { nickname, isPrimary: minecraftPrimaryCheckbox.value },
    })
    toast.add({ title: '已添加昵称', color: 'primary' })
    closeMinecraftProfileDialog()
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] add minecraft profile failed', error)
    toast.add({ title: '添加失败', color: 'error' })
  } finally {
    minecraftSubmitting.value = false
  }
}

async function markPrimaryMinecraft(profileId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/minecraft-profiles/${profileId}`,
      {
        method: 'PATCH',
        token: auth.token,
        body: { isPrimary: true },
      },
    )
    toast.add({ title: '已设为主昵称', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] mark primary minecraft failed', error)
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function deleteMinecraftProfile(profileId: string) {
  if (!auth.token || !detail.value) return
  const detailId = detail.value.id
  deleteConfirmMessage.value = '确定要删除该昵称记录吗？'
  deleteConfirmCallback.value = async () => {
    try {
      await apiFetch(
        `/auth/users/${detailId}/minecraft-profiles/${profileId}`,
        {
          method: 'DELETE',
          token: auth.token,
        },
      )
      toast.add({ title: '已删除昵称', color: 'primary' })
      await fetchDetail()
    } catch (error) {
      console.warn('[admin] delete minecraft profile failed', error)
      toast.add({ title: '删除失败', color: 'error' })
    }
  }
  deleteConfirmDialogOpen.value = true
}

// fmtDateTime: 原本用于本文件模态内部，现已由各子组件自行实现

function hydratedRoleKeys(data: AdminUserDetail | null) {
  return data?.roles.map((link) => link.role.key).sort() ?? []
}

function hydratedLabelKeys(data: AdminUserDetail | null) {
  return data?.permissionLabels?.map((link) => link.label.key).sort() ?? []
}

function normalizeSelection(input: unknown): string[] {
  if (Array.isArray(input)) {
    if (input.every((item) => typeof item === 'string')) {
      return [...(input as string[])]
    }
    return (input as Array<{ value?: string | null }>)
      .map((item) => item?.value ?? null)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
  }
  if (!input) {
    return []
  }
  if (typeof input === 'string') {
    return [input]
  }
  if (
    typeof input === 'object' &&
    'value' in (input as Record<string, unknown>)
  ) {
    const value = (input as Record<string, unknown>).value
    return typeof value === 'string' && value.length > 0 ? [value] : []
  }
  return []
}

async function fetchDetail() {
  if (!auth.token) return
  loading.value = true
  errorMsg.value = null
  try {
    const data = await apiFetch<AdminUserDetail>(
      `/auth/users/${userId.value}`,
      { token: auth.token },
    )
    detail.value = data
    profileForm.displayName = data.profile?.displayName ?? undefined
    // 转换 birthday 为 YYYY-MM-DD 格式
    profileForm.birthday = data.profile?.birthday
      ? dayjs(data.profile.birthday).format('YYYY-MM-DD')
      : undefined
    profileForm.gender = data.profile?.gender ?? undefined
    profileForm.motto = data.profile?.motto ?? undefined
    profileForm.timezone = data.profile?.timezone ?? undefined
    profileForm.locale = data.profile?.locale ?? undefined
    // 来自 extra 的电话与行政区划
    const extra =
      data.profile?.extra && typeof data.profile.extra === 'object'
        ? (data.profile.extra as Record<string, unknown>)
        : {}
    profileForm.phone =
      typeof extra['phone'] === 'string'
        ? (extra['phone'] as string)
        : undefined
    profileForm.phoneCountry = ((extra['phoneCountry'] as
      | 'CN'
      | 'HK'
      | 'MO'
      | 'TW') ||
      profileForm.phoneCountry ||
      'CN') as 'CN' | 'HK' | 'MO' | 'TW'
    const country = ((extra['regionCountry'] as string) ||
      'CN') as RegionValue['country']
    const province =
      typeof extra['regionProvince'] === 'string'
        ? (extra['regionProvince'] as string)
        : null
    const city =
      typeof extra['regionCity'] === 'string'
        ? (extra['regionCity'] as string)
        : null
    const district =
      typeof extra['regionDistrict'] === 'string'
        ? (extra['regionDistrict'] as string)
        : null
    profileForm.region = { country, province, city, district }
    // 转换 joinDate 为 YYYY-MM-DD 格式
    joinDateEditing.value = data.joinDate
      ? dayjs(data.joinDate).format('YYYY-MM-DD')
      : null
    roleSelection.value = hydratedRoleKeys(data)
    labelSelection.value = hydratedLabelKeys(data)
    await fetchBindingHistory(data.id)
  } catch (error) {
    errorMsg.value =
      error instanceof ApiError ? error.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function fetchBindingHistory(targetId?: string) {
  if (!auth.token) return
  const id = targetId ?? detail.value?.id
  if (!id) return
  historyLoading.value = true
  try {
    const data = await apiFetch<{ items: AdminBindingHistoryEntry[] }>(
      `/auth/users/${id}/bindings/history?page=1&pageSize=50`,
      { token: auth.token },
    )
    bindingHistory.value = data.items
  } finally {
    historyLoading.value = false
  }
}

async function saveProfile() {
  if (!auth.token || !detail.value) return
  profileSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/profile`, {
      method: 'PATCH',
      token: auth.token,
      body: {
        displayName: profileForm.displayName || undefined,
        birthday: profileForm.birthday || undefined,
        gender: profileForm.gender || undefined,
        motto: profileForm.motto || undefined,
        timezone: profileForm.timezone || undefined,
        locale: profileForm.locale || undefined,
        // 额外资料：与用户端一致，采用扁平 extra 键
        extra: {
          phone: profileForm.phone || undefined,
          phoneCountry: profileForm.phoneCountry || undefined,
          regionCountry: profileForm.region?.country || undefined,
          regionProvince: profileForm.region?.province || undefined,
          regionCity: profileForm.region?.city || undefined,
          regionDistrict: profileForm.region?.district || undefined,
        },
      },
    })
    toast.add({ title: '资料已更新', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] update profile failed', error)
    toast.add({ title: '资料更新失败', color: 'error' })
  } finally {
    profileSaving.value = false
  }
}

async function saveJoinDate() {
  if (!auth.token || !detail.value) return
  if (!joinDateEditing.value) {
    toast.add({ title: '请填写有效的日期', color: 'warning' })
    return
  }
  joinDateSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/join-date`, {
      method: 'PATCH',
      token: auth.token,
      body: { joinDate: joinDateEditing.value },
    })
    toast.add({ title: '入服日期已更新', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] update join date failed', error)
    toast.add({ title: '入服日期更新失败', color: 'error' })
  } finally {
    joinDateSaving.value = false
  }
}

async function handleRolesUpdate(nextValue: unknown) {
  if (!auth.token || !detail.value) return
  const sorted = normalizeSelection(nextValue).sort()
  const previous = [...roleSelection.value]
  if (sorted.length === 0) {
    toast.add({ title: '至少需要一个角色', color: 'warning' })
    roleSelection.value = hydratedRoleKeys(detail.value)
    return
  }
  if (JSON.stringify(sorted) === JSON.stringify([...previous].sort())) {
    return
  }
  roleSelection.value = sorted
  roleSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/roles`, {
      method: 'POST',
      token: auth.token,
      body: { roleKeys: sorted },
    })
    toast.add({ title: '角色已更新', color: 'primary' })
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] assign roles failed', error)
    toast.add({ title: '角色更新失败', color: 'error' })
    roleSelection.value = previous
  } finally {
    roleSaving.value = false
  }
}

async function handleLabelsUpdate(nextValue: unknown) {
  if (!auth.token || !detail.value) return
  const sorted = normalizeSelection(nextValue).sort()
  const previous = [...labelSelection.value]
  if (JSON.stringify(sorted) === JSON.stringify([...previous].sort())) {
    return
  }
  labelSelection.value = sorted
  labelSaving.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/permission-labels`, {
      method: 'POST',
      token: auth.token,
      body: { labelKeys: sorted },
    })
    toast.add({ title: '标签已更新', color: 'primary' })
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] assign labels failed', error)
    toast.add({ title: '标签更新失败', color: 'error' })
    labelSelection.value = previous
  } finally {
    labelSaving.value = false
  }
}

function openPiicDialog() {
  if (!detail.value) return
  piicReason.value = ''
  piicDialogOpen.value = true
}

function closePiicDialog() {
  piicDialogOpen.value = false
  piicReason.value = ''
}

watch(piicDialogOpen, (value) => {
  if (!value) {
    piicReason.value = ''
  }
})

watch(passwordDialogOpen, (value) => {
  if (!value) {
    passwordMode.value = 'temporary'
    customPassword.value = ''
    showCustomPassword.value = false
  }
})

watch(deleteDialogOpen, (value) => {
  if (!value) {
    deleteSubmitting.value = false
  }
})

// 当出现重置结果时自动弹出结果对话框
watch(resetResult, (val) => {
  if (val) {
    resetResultDialogOpen.value = true
  }
})

// 当出现错误信息时自动弹出错误对话框
watch(errorMsg, (val) => {
  if (val) {
    errorDialogOpen.value = true
  }
})

async function confirmPiicRegeneration() {
  if (!auth.token || !detail.value) return
  piicSubmitting.value = true
  try {
    await apiFetch(`/auth/users/${detail.value.id}/piic/regenerate`, {
      method: 'POST',
      token: auth.token,
      body: piicReason.value.trim() ? { reason: piicReason.value.trim() } : {},
    })
    toast.add({ title: 'PIIC 已重新生成', color: 'primary' })
    closePiicDialog()
    await fetchDetail()
    await usersStore.fetch({ page: usersStore.pagination.page })
  } catch (error) {
    console.warn('[admin] regenerate piic failed', error)
    toast.add({ title: 'PIIC 生成失败', color: 'error' })
  } finally {
    piicSubmitting.value = false
  }
}

function openResetPasswordDialog() {
  if (!detail.value) return
  passwordDialogOpen.value = true
}

function closeResetPasswordDialog() {
  passwordDialogOpen.value = false
}

// closeResetResultDialog: 已由组件 ResetPasswordResultDialog 通过 v-model 处理

// closeErrorDialog: 已由组件 ErrorDialog 通过 v-model 处理

function copyTemporaryPassword() {
  const pwd = resetResult.value?.temporaryPassword
  if (pwd) {
    navigator.clipboard.writeText(pwd).catch(() => {})
    toast.add({ title: '已复制临时密码', color: 'primary' })
  }
}

async function confirmResetPassword() {
  if (!auth.token || !detail.value) return
  if (passwordMode.value === 'custom' && !customPassword.value.trim()) {
    toast.add({ title: '请填写要设置的密码', color: 'warning' })
    return
  }
  passwordSubmitting.value = true
  try {
    const result = await usersStore.resetPassword(
      detail.value.id,
      passwordMode.value === 'custom' ? customPassword.value : undefined,
    )
    resetResult.value = {
      temporaryPassword: result.temporaryPassword,
      message: result.temporaryPassword
        ? '已生成临时密码，请尽快通知用户并提示修改。'
        : '密码已重置，请尽快通知用户修改。',
    }
    toast.add({ title: '密码已重置', color: 'primary' })
    closeResetPasswordDialog()
  } catch (error) {
    console.warn('[admin] reset password failed', error)
    toast.add({ title: '密码重置失败', color: 'error' })
  } finally {
    passwordSubmitting.value = false
  }
}

function openDeleteDialog() {
  if (!detail.value) return
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  deleteDialogOpen.value = false
  deleteSubmitting.value = false
}

async function confirmDeleteUser() {
  if (!auth.token || !detail.value) return
  deleteSubmitting.value = true
  try {
    await usersStore.delete(detail.value.id)
    toast.add({ title: '用户已删除', color: 'primary' })
    closeDeleteDialog()
    emit('deleted')
  } catch (error) {
    console.warn('[admin] delete user failed', error)
    toast.add({ title: '删除失败', color: 'error' })
  } finally {
    deleteSubmitting.value = false
  }
}

async function markPrimaryBinding(bindingId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/bindings/${bindingId}/primary`,
      { method: 'PATCH', token: auth.token },
    )
    toast.add({ title: '已标记为主绑定', color: 'primary' })
    await fetchDetail()
    await fetchBindingHistory()
  } catch (error) {
    console.warn('[admin] mark primary binding failed', error)
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function unbind(bindingId: string) {
  if (!auth.token || !detail.value) return
  const detailId = detail.value.id
  deleteConfirmMessage.value = '确定要解绑该 AuthMe 账号吗？'
  deleteConfirmCallback.value = async () => {
    try {
      await apiFetch(`/auth/users/${detailId}/bindings/${bindingId}`, {
        method: 'DELETE',
        token: auth.token,
      })
      toast.add({ title: '已解绑', color: 'primary' })
      await fetchDetail()
      await fetchBindingHistory()
    } catch (error) {
      console.warn('[admin] unbind authme failed', error)
      toast.add({ title: '解绑失败', color: 'error' })
    }
  }
  deleteConfirmDialogOpen.value = true
}

onMounted(async () => {
  if (rbacStore.roles.length === 0) {
    await rbacStore.fetchRoles()
  }
  if (rbacStore.labels.length === 0) {
    await rbacStore.fetchLabels()
  }
})

// inline typed handler used in template for joinDate updates

watch(
  () => props.emailToken,
  (token) => {
    if (typeof token === 'number' && detail.value) {
      pendingEmailToken.value = token
      tryOpenEmailDialog()
    }
  },
)

watch(detail, () => {
  tryOpenEmailDialog()
}, { immediate: false })

watch(
  () => props.userId,
  async (next) => {
    if (!next) {
      detail.value = null
      bindingHistory.value = []
      joinDateEditing.value = null
      resetResult.value = null
      resetResultDialogOpen.value = false
      errorDialogOpen.value = false
      emailDialogOpen.value = false
      emailInputValue.value = ''
      emailSubmitting.value = false
      pendingEmailToken.value = null
      closeResetPasswordDialog()
      closePiicDialog()
      closeDeleteDialog()
      return
    }
    await fetchDetail()
  },
  { immediate: true },
)

async function confirmDelete() {
  deleteConfirmSubmitting.value = true
  try {
    if (deleteConfirmCallback.value) {
      await deleteConfirmCallback.value()
    }
  } finally {
    deleteConfirmSubmitting.value = false
    deleteConfirmDialogOpen.value = false
    deleteConfirmCallback.value = null
    deleteConfirmMessage.value = ''
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 text-sm">
    <UserDetailSectionOverview
      :detail="detail"
      :loading="loading"
      :role-selection="roleSelection"
      :label-selection="labelSelection"
      :role-options="roleOptions"
      :label-options="labelOptions"
      :role-saving="roleSaving"
      :label-saving="labelSaving"
      :join-date-editing="joinDateEditing"
      :join-date-saving="joinDateSaving"
      @reload="fetchDetail"
      @openContacts="contactsListDialogOpen = true"
  @openEmails="openEmailDialog"
      @resetPassword="openResetPasswordDialog"
      @deleteUser="openDeleteDialog"
      @editJoinDate="(val: string | null) => (joinDateEditing = val)"
      @saveJoinDate="saveJoinDate"
      @updateRoles="handleRolesUpdate"
      @updateLabels="handleLabelsUpdate"
      @refreshPiic="openPiicDialog"
      @openSessions="sessionsDialogOpen = true"
    />
    <UserDetailSectionProfile
      :detail="detail"
      :profile-form="profileForm"
      :profile-saving="profileSaving"
      @save="saveProfile"
    />
    <UserDetailSectionServerAccounts
      :detail="detail"
      :minecraft-profiles="minecraftProfiles"
      @openAddNickname="openMinecraftProfileDialog"
      @openCreateBinding="openCreateBindingDialog"
      @openBindingHistory="bindingHistoryDialogOpen = true"
      @markPrimaryBinding="markPrimaryBinding"
      @unbind="unbind"
      @markPrimaryMinecraft="markPrimaryMinecraft"
      @deleteMinecraftProfile="deleteMinecraftProfile"
    />
  </div>

  <!-- 绑定流转记录 对话框（组件化） -->
  <UserBindingHistoryDialog
    :open="bindingHistoryDialogOpen"
    :items="bindingHistory"
    :loading="historyLoading"
    @update:open="bindingHistoryDialogOpen = $event"
  />

  <!-- 登录轨迹对话框组件化 -->
  <UserSessionsDialog
    :open="sessionsDialogOpen"
    :sessions="sessions"
    @update:open="sessionsDialogOpen = $event"
  />

  <!-- 密码重置结果对话框组件化 -->
  <ResetPasswordResultDialog
    :open="resetResultDialogOpen"
    :result="resetResult"
    @update:open="resetResultDialogOpen = $event"
    @copy="copyTemporaryPassword"
  />

  <!-- 错误信息对话框组件化 -->
  <ErrorDialog
    :open="errorDialogOpen"
    :message="errorMsg"
    @update:open="errorDialogOpen = $event"
  />

  <!-- 删除确认对话框 -->
  <UModal
    :open="deleteConfirmDialogOpen"
    @update:open="deleteConfirmDialogOpen = $event"
    :ui="{
      content: 'z-[1105] w-full max-w-sm',
      wrapper: 'z-[1104] items-center justify-center',
      container: 'items-center justify-center',
      overlay: 'z-[1103] bg-slate-950/40 backdrop-blur-sm'
    }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <p class="text-base font-semibold text-slate-900 dark:text-white">
          {{ deleteConfirmMessage }}
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            @click="deleteConfirmDialogOpen = false"
            >取消</UButton
          >
          <UButton
            color="error"
            variant="soft"
            :loading="deleteConfirmSubmitting"
            @click="confirmDelete"
            >确定</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 登录轨迹 对话框 -->

  <UModal
    :open="emailDialogOpen"
    @update:open="emailDialogOpen = $event"
    :ui="{ content: 'w-full max-w-2xl' }"
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
            @click="closeEmailDialog"
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
                  :loading="loading"
                  :disabled="loading || emailSubmitting"
                  @click="handleSetPrimaryEmail(entry)"
                >
                  设为主
                </UButton>
                <UButton
                  v-if="canDeleteEmail(entry)"
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="loading"
                  :disabled="loading || emailSubmitting"
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
          暂无邮箱记录。
        </div>
        <div class="space-y-2">
          <label
            class="block text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            新增邮箱
          </label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <UInput
              v-model="emailInputValue"
              type="email"
              placeholder="user@example.com"
              class="flex-1"
              :disabled="emailSubmitting || !detail"
            />
            <UButton
              color="primary"
              variant="soft"
              class="sm:w-auto"
              :disabled="
                emailSubmitting || !detail || !emailInputValue || emailChannelMissing
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

  <!-- 联系方式列表 对话框 -->
  <UModal
    :open="contactsListDialogOpen"
    @update:open="contactsListDialogOpen = $event"
    :ui="{ content: 'w-full max-w-3xl' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            联系方式
          </h3>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              :disabled="!detail"
              @click="openCreateContactDialog"
              >新增联系方式</UButton
            >
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="contactsListDialogOpen = false"
            />
          </div>
        </div>
        <ul class="space-y-2 text-xs">
          <li
            v-for="c in detail?.contacts ?? []"
            :key="c.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-slate-100/60 px-4 py-2 dark:bg-slate-900/40"
          >
            <div class="flex flex-col">
              <span class="font-medium text-slate-900 dark:text-white">
                {{ c.channel?.displayName ?? c.channel?.key ?? '未知渠道' }}
                <span
                  v-if="c.isPrimary"
                  class="ml-2 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                  >主</span
                >
                <span
                  v-if="c.channel?.key === 'email'"
                  class="ml-2 inline-flex items-center gap-1 rounded px-1 py-px text-[10px] font-semibold"
                  :class="
                    c.verification === 'VERIFIED'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                  "
                >
                  <span>{{
                    c.verification === 'VERIFIED' ? '已验证' : '未验证'
                  }}</span>
                </span>
              </span>
              <span
                class="text-[11px] text-slate-600 dark:text-slate-300 break-all"
                >{{ c.value }}</span
              >
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="openEditContactDialog(c)"
                >编辑</UButton
              >
              <UButton
                v-if="
                  c.channel?.key === 'email' &&
                  c.verification === 'VERIFIED' &&
                  !c.isPrimary
                "
                size="xs"
                color="primary"
                variant="soft"
                :disabled="!detail"
                @click="submitSetPrimaryEmail(c.id)"
                >设为主邮箱</UButton
              >
              <UButton
                size="xs"
                color="error"
                variant="soft"
                @click="deleteContact(c.id)"
                >删除</UButton
              >
            </div>
          </li>
          <li
            v-if="(detail?.contacts?.length ?? 0) === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无联系方式。
          </li>
        </ul>
      </div>
    </template>
  </UModal>

  <!-- 错误信息弹窗 -->

  <UModal
    :open="piicDialogOpen"
    @update:open="piicDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">重新生成 PIIC</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closePiicDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          将为用户重新生成 PIIC 编号，历史编号会作废。请填写备注以便审计记录。
        </p>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            备注（可选）
          </label>
          <UTextarea
            v-model="piicReason"
            class="w-full"
            :rows="4"
            placeholder="说明原因或操作背景"
          />
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closePiicDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="piicSubmitting"
            @click="confirmPiicRegeneration"
            >确认重新生成</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 新增绑定对话框 -->
  <UModal
    :open="createBindingDialogOpen"
    @update:open="createBindingDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">新增 AuthMe 绑定</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeCreateBindingDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          输入 AuthMe 用户名或 Realname
          进行绑定，若已存在将更新信息；可选择设为当前用户主绑定。
        </p>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >标识</label
          >
          <UInput
            v-model="createBindingIdentifier"
            placeholder="AuthMe 用户名或 Realname"
            :disabled="createBindingSubmitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="createBindingSetPrimary"
            :disabled="createBindingSubmitting"
            class="h-4 w-4"
          />
          <span>设为主绑定</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="createBindingSubmitting"
            @click="closeCreateBindingDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="createBindingSubmitting"
            @click="submitCreateBinding"
            >绑定</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 新增 Minecraft 昵称对话框 -->
  <UModal
    :open="minecraftProfileDialogOpen"
    @update:open="minecraftProfileDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">添加 Minecraft 昵称</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeMinecraftProfileDialog"
          />
        </div>
        <div class="space-y-1">
          <label
            class="block text-xs font-medium text-slate-600 dark:text-slate-300"
            >昵称</label
          >
          <UInput
            v-model="minecraftNicknameInput"
            placeholder="输入昵称"
            :disabled="minecraftSubmitting"
          />
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
        >
          <input
            type="checkbox"
            v-model="minecraftPrimaryCheckbox"
            :disabled="minecraftSubmitting"
            class="h-4 w-4"
          />
          <span>设为主昵称</span>
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="minecraftSubmitting"
            @click="closeMinecraftProfileDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="minecraftSubmitting"
            @click="submitMinecraftProfile"
            >保存</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <!-- 联系方式编辑/新增对话框 -->
  <UModal
    :open="contactDialogOpen"
    @update:open="contactDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            {{ contactEditingId ? '编辑联系方式' : '新增联系方式' }}
          </h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeContactDialog"
          />
        </div>
        <div class="space-y-3">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-600 dark:text-slate-300"
              >渠道</span
            >
            <USelect
              v-model="contactChannelId"
              :items="
                contactChannels.map((c) => ({
                  label: c.displayName || c.key,
                  value: c.id,
                }))
              "
              placeholder="选择渠道"
              :disabled="contactSubmitting || Boolean(contactEditingId)"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-600 dark:text-slate-300"
              >内容</span
            >
            <UInput
              v-model="contactValue"
              :disabled="contactSubmitting"
              placeholder="例如: example@qq.com / Discord Tag / 电话"
            />
          </label>
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-xs dark:border-slate-800/60 dark:bg-slate-900/50"
          >
            <input
              type="checkbox"
              v-model="contactIsPrimary"
              :disabled="contactSubmitting"
              class="h-4 w-4"
            />
            <span>设为该渠道主联系方式</span>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="contactSubmitting"
            @click="closeContactDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="contactSubmitting"
            @click="submitContact"
            >保存</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="passwordDialogOpen"
    @update:open="passwordDialogOpen = $event"
    :ui="{ content: 'w-full max-w-lg' }"
  >
    <template #content>
      <div class="space-y-5 p-6 text-sm">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">重置密码</h3>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="closeResetPasswordDialog"
          />
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          请选择重置方式，可以生成临时密码或直接指定新密码。
        </p>
        <div class="space-y-3">
          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="temporary"
            />
            <div class="space-y-1">
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                生成临时密码
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                系统将自动生成随机密码并显示给你，用户首次登录需修改。
              </p>
            </div>
          </label>

          <label
            class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600"
          >
            <input
              v-model="passwordMode"
              class="mt-1 h-4 w-4"
              type="radio"
              value="custom"
            />
            <div class="flex-1 space-y-2">
              <div>
                <p class="text-sm font-medium text-slate-900 dark:text-white">
                  指定新密码
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  管理员自定义密码，系统不会额外生成临时密码。
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UInput
                  v-model="customPassword"
                  :disabled="passwordMode !== 'custom'"
                  :type="showCustomPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="输入要设置的新密码"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="passwordMode !== 'custom'"
                  @click="showCustomPassword = !showCustomPassword"
                >
                  <span v-if="showCustomPassword">隐藏</span>
                  <span v-else>显示</span>
                </UButton>
              </div>
            </div>
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="closeResetPasswordDialog"
            >取消</UButton
          >
          <UButton
            color="primary"
            :loading="passwordSubmitting"
            @click="confirmResetPassword"
          >
            确认重置
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="deleteDialogOpen"
    @update:open="deleteDialogOpen = $event"
    :ui="{ content: 'w-full max-w-md z-[1101]', overlay: 'z-[1100]' }"
  >
    <template #content>
      <div class="space-y-4 p-6 text-sm">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            确认删除用户
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            删除后将无法恢复该用户的账号、会话与绑定记录，请谨慎操作。
          </p>
        </div>
        <div
          class="rounded-lg bg-slate-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {{ detail?.profile?.displayName ?? detail?.email ?? detail?.id }}
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeDeleteDialog">
            取消
          </UButton>
          <UButton
            color="error"
            :loading="deleteSubmitting"
            @click="confirmDeleteUser"
          >
            确认删除
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
