<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ApiError, apiFetch } from '@/utils/api'
import type { RegionValue } from '@/views/user/Profile/components/RegionSelector.vue'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useAdminRbacStore } from '@/stores/adminRbac'
import type {
  AdminBindingHistoryEntry,
  AdminUserDetail,
  AdminUserLikeEntry,
} from '@/types/admin'
import UserDetailSectionOverview from './components/UserDetailSectionOverview.vue'
import UserDetailSectionProfile from './components/UserDetailSectionProfile.vue'
import UserDetailSectionServerAccounts from './components/UserDetailSectionServerAccounts.vue'
import UserDetailSectionOAuth from './components/UserDetailSectionOAuth.vue'
import UserBindingHistoryDialog from './components/UserBindingHistoryDialog.vue'
import UserLikeDetailDialog from './components/UserLikeDetailDialog.vue'
import UserSessionsDialog from './components/UserSessionsDialog.vue'
import ResetPasswordResultDialog from './components/ResetPasswordResultDialog.vue'
import ErrorDialog from './components/ErrorDialog.vue'
import UserStatusDialog from './components/UserStatusDialog.vue'
import UserEmailDialog from './components/UserEmailDialog.vue'
import UserPhoneDialog from './components/UserPhoneDialog.vue'
import UserPiicDialog from './components/UserPiicDialog.vue'
import UserBindingDialog from './components/UserBindingDialog.vue'
import UserMinecraftNicknameDialog from './components/UserMinecraftNicknameDialog.vue'
import UserResetPasswordDialog from './components/UserResetPasswordDialog.vue'
import UserDeleteDialog from './components/UserDeleteDialog.vue'
import AvatarCropperModal from '@/components/common/AvatarCropperModal.vue'
import UserLikeSummaryCard from './components/UserLikeSummaryCard.vue'

type ProfileForm = {
  displayName?: string
  birthday?: string
  gender?: string
  motto?: string
  timezone?: string
  locale?: string
  region?: RegionValue
}

const props = defineProps<{ userId: string | null; emailToken?: number }>()
const emit = defineEmits<{ (event: 'deleted'): void }>()
const auth = useAuthStore()
const featureStore = useFeatureStore()
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
const resetResultDialogOpen = ref(false)
const errorDialogOpen = ref(false)
const statusDialogOpen = ref(false)
const emailDialogOpen = ref(false)
const phoneDialogOpen = ref(false)
const piicDialogOpen = ref(false)
const createBindingDialogOpen = ref(false)
const minecraftProfileDialogOpen = ref(false)
const passwordDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const contactsListDialogOpen = ref(false)
const bindingHistoryDialogOpen = ref(false)
const sessionsDialogOpen = ref(false)
const likeDetailDialogOpen = ref(false)
const likeDetails = ref<AdminUserLikeEntry[]>([])
const likeDetailsLoading = ref(false)
const pendingEmailToken = ref<number | null>(null)
const oauthUnbindingId = ref<string | null>(null)

const profileForm = reactive<ProfileForm>({
  displayName: undefined,
  birthday: undefined,
  gender: undefined,
  motto: undefined,
  timezone: undefined,
  locale: undefined,
  region: undefined,
})

const profileSaving = ref(false)
const joinDateEditing = ref<string | null>(null)
const joinDateSaving = ref(false)

const roleSelection = ref<string[]>([])
const labelSelection = ref<string[]>([])
const roleSaving = ref(false)
const labelSaving = ref(false)

const contactDialogOpen = ref(false)
const contactEditingId = ref<string | null>(null)
const contactChannelId = ref<string | undefined>(undefined)
const contactValue = ref('')
const contactIsPrimary = ref(false)
const contactSubmitting = ref(false)
const contactChannels = ref<
  Array<{ id: string; key: string; displayName: string }>
>([])

const deleteConfirmDialogOpen = ref(false)
const deleteConfirmMessage = ref('')
const deleteConfirmCallback = ref<(() => Promise<void>) | null>(null)
const deleteConfirmSubmitting = ref(false)

const avatarFileInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
const avatarCropModalOpen = ref(false)
const avatarCropSubmitting = ref(false)
type AvatarCropSource = { url: string; name: string }
const avatarCropSource = ref<AvatarCropSource | null>(null)

const sessions = computed(() => detail.value?.sessions ?? [])
const oauthProviders = computed(() => featureStore.flags.oauthProviders ?? [])
const oauthAccounts = computed(() => detail.value?.oauthAccounts ?? [])
const minecraftProfiles = computed(() => {
  const list = detail.value?.nicknames ?? []
  return list.map((n) => ({
    id: n.id,
    isPrimary: n.isPrimary,
    nickname: n.nickname ?? null,
  }))
})
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
const likesSummary = computed(() => detail.value?.likesReceived ?? null)

function openStatusDialog() {
  if (!detail.value) return
  statusDialogOpen.value = true
}

function openEmailDialog() {
  if (!detail.value) return
  emailDialogOpen.value = true
}

function openPhoneDialog() {
  if (!detail.value) return
  phoneDialogOpen.value = true
}

function openPiicDialog() {
  if (!detail.value) return
  piicDialogOpen.value = true
}

function openCreateBindingDialog() {
  if (!detail.value) return
  createBindingDialogOpen.value = true
}

function openMinecraftProfileDialog() {
  if (!detail.value) return
  minecraftProfileDialogOpen.value = true
}

function openResetPasswordDialog() {
  if (!detail.value) return
  passwordDialogOpen.value = true
}

function openDeleteDialog() {
  if (!detail.value) return
  deleteDialogOpen.value = true
}

function triggerAvatarSelect() {
  if (!detail.value || avatarUploading.value) return
  avatarFileInput.value?.click()
}

function cleanupAvatarCropSource() {
  avatarCropSource.value = null
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('无法读取文件'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件'))
    reader.readAsDataURL(file)
  })
}

watch(
  () => avatarCropModalOpen.value,
  (open) => {
    if (!open) {
      avatarCropSubmitting.value = false
      cleanupAvatarCropSource()
    }
  },
)

async function handleAvatarFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file || !detail.value) return
  try {
    const dataUrl = await readFileAsDataUrl(file)
    avatarCropSource.value = { url: dataUrl, name: file.name }
    avatarCropModalOpen.value = true
  } catch (error) {
    console.error('[admin] failed to prepare avatar cropper', error)
    toast.add({
      title: '读取图片失败',
      description: '无法加载图片进行裁剪，请换一张图片重试。',
      color: 'error',
    })
  } finally {
    if (target) {
      target.value = ''
    }
  }
}

async function uploadAdminAvatar(file: File) {
  if (!auth.token || !detail.value) {
    throw new ApiError(401, '未登录')
  }
  avatarUploading.value = true
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    const response = await apiFetch<{ user: AdminUserDetail }>(
      `/auth/users/${detail.value.id}/avatar`,
      {
        method: 'PATCH',
        token: auth.token,
        body: formData,
      },
    )
    detail.value = response.user
    usersStore.updateUserAvatar(response.user.id, {
      avatarUrl:
        response.user.avatarUrl ?? response.user.profile?.avatarUrl ?? null,
      avatarAttachmentId: response.user.avatarAttachmentId ?? null,
    })
    toast.add({ title: '头像已更新', color: 'success' })
  } catch (error) {
    toast.add({
      title: '头像更新失败',
      description: error instanceof ApiError ? error.message : '请稍后重试',
      color: 'error',
    })
    throw error
  } finally {
    avatarUploading.value = false
  }
}

async function handleAdminAvatarCropConfirm(file: File) {
  avatarCropSubmitting.value = true
  try {
    await uploadAdminAvatar(file)
    avatarCropModalOpen.value = false
  } catch {
    // 失败时保留模态框，方便重试
  } finally {
    avatarCropSubmitting.value = false
  }
}

function tryOpenEmailDialog() {
  if (pendingEmailToken.value === null) return
  if (!detail.value) return
  pendingEmailToken.value = null
  emailDialogOpen.value = true
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
        toast.add({
          title: '无法确定联系方式渠道，请刷新后重试',
          color: 'error',
        })
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

async function submitSetPrimaryPhone(contactId: string) {
  if (!auth.token || !detail.value) return
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/contacts/phone/${contactId}/primary`,
      {
        method: 'PATCH',
        token: auth.token,
      },
    )
    toast.add({ title: '已设为主手机号', color: 'primary' })
    await fetchDetail()
  } catch (error) {
    console.warn('[admin] set primary phone failed', error)
    toast.add({ title: '设置主手机号失败', color: 'error' })
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

async function unbindOauthAccount(accountId: string) {
  if (!auth.token || !detail.value) return
  oauthUnbindingId.value = accountId
  try {
    await apiFetch(
      `/auth/users/${detail.value.id}/oauth/accounts/${accountId}`,
      {
        method: 'DELETE',
        token: auth.token,
      },
    )
    toast.add({ title: '已解除 OAuth 绑定', color: 'success' })
    await fetchDetail()
  } catch (error) {
    toast.add({
      title: '解绑失败',
      description: error instanceof ApiError ? error.message : '请稍后再试',
      color: 'error',
    })
  } finally {
    oauthUnbindingId.value = null
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

function copyTemporaryPassword() {
  const pwd = resetResult.value?.temporaryPassword
  if (pwd) {
    navigator.clipboard.writeText(pwd).catch(() => {})
    toast.add({ title: '已复制临时密码', color: 'primary' })
  }
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
    profileForm.birthday = data.profile?.birthday
      ? dayjs(data.profile.birthday).format('YYYY-MM-DD')
      : undefined
    profileForm.gender = data.profile?.gender ?? undefined
    profileForm.motto = data.profile?.motto ?? undefined
    profileForm.timezone = data.profile?.timezone ?? undefined
    profileForm.locale = data.profile?.locale ?? undefined
    const extra =
      data.profile?.extra && typeof data.profile.extra === 'object'
        ? (data.profile.extra as Record<string, unknown>)
        : {}
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

async function loadLikeDetails() {
  if (!detail.value?.id) return
  if (!auth.token) {
    toast.add({ title: '缺少登录信息', color: 'warning' })
    return
  }
  likeDetailsLoading.value = true
  try {
    const response = await apiFetch<AdminUserLikeEntry[]>(
      `/auth/users/${encodeURIComponent(detail.value.id)}/likes`,
      { token: auth.token },
    )
    likeDetails.value = response
  } catch (error) {
    toast.add({
      title: '加载点赞记录失败',
      description: error instanceof Error ? error.message : '请稍后再试',
      color: 'error',
    })
    likeDetails.value = []
  } finally {
    likeDetailsLoading.value = false
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
        extra: {
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

watch(resetResult, (val) => {
  if (val) {
    resetResultDialogOpen.value = true
  }
})

watch(errorMsg, (val) => {
  errorDialogOpen.value = Boolean(val)
})

watch(
  () => props.emailToken,
  (token) => {
    if (typeof token === 'number') {
      pendingEmailToken.value = token
      tryOpenEmailDialog()
    }
  },
)

watch(
  detail,
  () => {
    tryOpenEmailDialog()
  },
  { immediate: false },
)

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
      phoneDialogOpen.value = false
      piicDialogOpen.value = false
      createBindingDialogOpen.value = false
      minecraftProfileDialogOpen.value = false
      passwordDialogOpen.value = false
      statusDialogOpen.value = false
      deleteDialogOpen.value = false
      contactsListDialogOpen.value = false
      bindingHistoryDialogOpen.value = false
      sessionsDialogOpen.value = false
      pendingEmailToken.value = null
      return
    }
    await fetchDetail()
  },
  { immediate: true },
)

watch(
  () => likeDetailDialogOpen.value,
  (open) => {
    if (open) {
      void loadLikeDetails()
    }
  },
)

watch(
  () => detail.value?.id,
  () => {
    likeDetails.value = []
    if (likeDetailDialogOpen.value) {
      likeDetailDialogOpen.value = false
    }
  },
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

function handleStatusSaved() {
  void fetchDetail()
  void usersStore.fetch({ page: usersStore.pagination.page })
}

function handleGeneralRefresh() {
  void fetchDetail()
}

function handleBindingSaved() {
  void fetchDetail()
  void fetchBindingHistory()
}

function handlePiicSaved() {
  void fetchDetail()
  void usersStore.fetch({ page: usersStore.pagination.page })
}

function handleResetPasswordResult(payload: {
  temporaryPassword: string | null
  message: string
}) {
  resetResult.value = payload
}

function handleUserDeleted() {
  emit('deleted')
}

onMounted(async () => {
  if (rbacStore.roles.length === 0) {
    await rbacStore.fetchRoles()
  }
  if (rbacStore.labels.length === 0) {
    await rbacStore.fetchLabels()
  }
  if (!featureStore.loaded) {
    await featureStore.initialize()
  }
})

onBeforeUnmount(() => {
  cleanupAvatarCropSource()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 text-sm">
    <UserDetailSectionOverview
      :detail="detail"
      :loading="loading"
      :avatar-uploading="avatarUploading"
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
      @openPhones="openPhoneDialog"
      @openStatus="openStatusDialog"
      @resetPassword="openResetPasswordDialog"
      @deleteUser="openDeleteDialog"
      @editJoinDate="(val: string | null) => (joinDateEditing = val)"
      @saveJoinDate="saveJoinDate"
      @updateRoles="handleRolesUpdate"
      @updateLabels="handleLabelsUpdate"
      @refreshPiic="openPiicDialog"
      @openSessions="sessionsDialogOpen = true"
      @changeAvatar="triggerAvatarSelect"
    />
    <input
      ref="avatarFileInput"
      type="file"
      class="hidden"
      accept="image/*"
      @change="handleAvatarFileChange"
    />
    <AvatarCropperModal
      v-model:open="avatarCropModalOpen"
      :image-url="avatarCropSource?.url ?? null"
      :file-name="avatarCropSource?.name"
      :submitting="avatarCropSubmitting"
      confirm-label="保存头像"
      @confirm="handleAdminAvatarCropConfirm"
    />
    <UserDetailSectionProfile
      :detail="detail"
      :profile-form="profileForm"
      :profile-saving="profileSaving"
      @save="saveProfile"
    />
    <UserDetailSectionOAuth
      :providers="oauthProviders"
      :accounts="oauthAccounts"
      :loading="loading"
      :unbinding-id="oauthUnbindingId"
      @unbind="unbindOauthAccount"
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
    <UserLikeSummaryCard
      :detail="detail"
      :likes-summary="likesSummary"
      @openLikeDetail="likeDetailDialogOpen = true"
    />
  </div>

  <UserBindingHistoryDialog
    :open="bindingHistoryDialogOpen"
    :items="bindingHistory"
    :loading="historyLoading"
    @update:open="bindingHistoryDialogOpen = $event"
  />

  <UserLikeDetailDialog
    :open="likeDetailDialogOpen"
    :items="likeDetails"
    :loading="likeDetailsLoading"
    :user-name="detail?.profile?.displayName ?? detail?.name ?? null"
    @update:open="likeDetailDialogOpen = $event"
  />

  <UserSessionsDialog
    :open="sessionsDialogOpen"
    :sessions="sessions"
    @update:open="sessionsDialogOpen = $event"
  />

  <ResetPasswordResultDialog
    :open="resetResultDialogOpen"
    :result="resetResult"
    @update:open="resetResultDialogOpen = $event"
    @copy="copyTemporaryPassword"
  />

  <ErrorDialog
    :open="errorDialogOpen"
    :message="errorMsg"
    @update:open="errorDialogOpen = $event"
  />

  <UserStatusDialog
    :open="statusDialogOpen"
    :detail="detail"
    @update:open="statusDialogOpen = $event"
    @saved="handleStatusSaved"
  />

  <UserEmailDialog
    :open="emailDialogOpen"
    :detail="detail"
    :on-delete-contact="deleteContact"
    @update:open="emailDialogOpen = $event"
    @saved="handleGeneralRefresh"
  />

  <UserPhoneDialog
    :open="phoneDialogOpen"
    :detail="detail"
    :on-delete-contact="deleteContact"
    @update:open="phoneDialogOpen = $event"
    @saved="handleGeneralRefresh"
  />

  <UserPiicDialog
    :open="piicDialogOpen"
    :detail="detail"
    @update:open="piicDialogOpen = $event"
    @saved="handlePiicSaved"
  />

  <UserBindingDialog
    :open="createBindingDialogOpen"
    :detail="detail"
    @update:open="createBindingDialogOpen = $event"
    @saved="handleBindingSaved"
  />

  <UserMinecraftNicknameDialog
    :open="minecraftProfileDialogOpen"
    :detail="detail"
    @update:open="minecraftProfileDialogOpen = $event"
    @saved="handleGeneralRefresh"
  />

  <UserResetPasswordDialog
    :open="passwordDialogOpen"
    :detail="detail"
    @update:open="passwordDialogOpen = $event"
    @result="handleResetPasswordResult"
  />

  <UserDeleteDialog
    :open="deleteDialogOpen"
    :detail="detail"
    @update:open="deleteDialogOpen = $event"
    @deleted="handleUserDeleted"
  />

  <!-- 删除确认对话框 -->
  <UModal
    :open="deleteConfirmDialogOpen"
    @update:open="deleteConfirmDialogOpen = $event"
    :ui="{
      content:
        'z-[1105] w-full max-w-sm w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
      wrapper: 'z-[1104] items-center justify-center',
      overlay: 'z-[1103]',
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
  <!-- 联系方式列表 对话框 -->
  <UModal
    :open="contactsListDialogOpen"
    @update:open="contactsListDialogOpen = $event"
    :ui="{
      content:
        'w-full max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
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
            暂无联系方式
          </li>
        </ul>
      </div>
    </template>
  </UModal>
  <!-- 联系方式编辑/新增对话框 -->
  <UModal
    :open="contactDialogOpen"
    @update:open="contactDialogOpen = $event"
    :ui="{
      content: 'w-full max-w-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
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
</template>
