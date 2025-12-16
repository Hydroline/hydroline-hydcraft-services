import type { PortalRole } from './portal'

export interface AdminMinecraftProfile {
  id: string
  nickname?: string | null
  isPrimary: boolean
}

export interface AdminAuthmeBindingListItem {
  id: string
  authmeUsername: string
  authmeRealname: string | null
  authmeUuid: string | null
  boundAt: string | Date | null
  status?: string | null
  isPrimary?: boolean
}

export interface AdminStatusSnapshot {
  status: string
  updatedAt?: string | Date | null
  statusEventId?: string | null
  event?: {
    id: string
    status: string
    reasonCode?: string | null
    reasonDetail?: string | null
    source?: string | null
    createdAt?: string | Date | null
    metadata?: unknown
  } | null
}

export interface AdminUserListItem {
  id: string
  email: string
  emailVerified?: boolean
  name: string | null
  avatarAttachmentId?: string | null
  avatarUrl?: string | null
  createdAt: string
  joinDate: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  profile: {
    displayName: string | null
    piic: string | null
    primaryAuthmeBindingId?: string | null
    primaryMinecraft?: AdminMinecraftProfile | null
    avatarUrl?: string | null
  } | null
  statusSnapshot?: AdminStatusSnapshot | null
  roles: Array<{
    id: string
    roleId: string
    role: PortalRole
  }>
  permissionLabels?: Array<{
    id: string
    labelId: string
    label: AdminPermissionLabelEntry
  }>
  // 新的列表后端不再返回 nicknames，保留可选避免旧代码报错
  nicknames?: AdminMinecraftProfile[]
  // 新增：AuthMe 绑定列表（列表页使用）
  authmeBindings?: AdminAuthmeBindingListItem[]
  // 新增：邮箱联系人（主邮箱优先排在前）
  contacts?: Array<{
    id: string
    value: string | null
    isPrimary?: boolean
    verification?: string | null
    verifiedAt?: string | null
  }>
}

export interface AdminUserListResponse {
  items: AdminUserListItem[]
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
}

export interface AdminOauthAccount {
  id: string
  provider: string
  providerId?: string | null
  providerAccountId: string
  type?: string | null
  profile?: unknown
  createdAt?: string | Date | null
  providerName?: string | null
  providerType?: string | null
}

export interface AdminAuthmeBindingEntry {
  id?: string
  authmeUsername: string
  authmeRealname: string | null
  authmeUuid?: string | null
  boundAt: string
  ip?: string | null
  regip?: string | null
  lastlogin?: number | null
  regdate?: number | null
  isPrimary?: boolean
  ipLocationRaw?: string | null
  ipLocation?: string | null
  regipLocationRaw?: string | null
  regipLocation?: string | null
}

export interface AdminUserDetail
  extends Omit<AdminUserListItem, 'authmeBindings'> {
  joinDate: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  lastLoginIpLocation?: string | null
  lastLoginIpLocationRaw?: string | null
  avatarUrl?: string | null
  avatarAttachmentId?: string | null
  profile:
    | (AdminUserListItem['profile'] & {
        birthday?: string | null
        gender?: string | null
        motto?: string | null
        timezone?: string | null
        locale?: string | null
        extra?: unknown
      })
    | null
  authmeBindings: AdminAuthmeBindingEntry[]
  nicknames?: AdminMinecraftProfile[]
  contacts?: Array<AdminContactEntry>
  phoneContacts?: Array<AdminPhoneContactEntry>
  permissionLabels?: Array<{
    id: string
    labelId: string
    label: AdminPermissionLabelEntry
  }>
  sessions?: Array<{
    id: string
    createdAt: string
    updatedAt: string
    ipAddress: string | null
    userAgent: string | null
  }>
  oauthAccounts?: AdminOauthAccount[]
  likesReceived?: {
    total: number
    latestAt: string | null
  } | null
}

export interface AdminContactEntry {
  id: string
  userId?: string
  channelId: string
  value: string | null
  isPrimary?: boolean
  verifiedAt?: string | null
  verification?: string | null
  metadata?: unknown
  channel?: {
    id: string
    key: string
    displayName: string | null
    description?: string | null
  } | null
}

export interface AdminPhoneContactEntry {
  id: string
  value: string | null
  isPrimary: boolean
  verification?: string | null
  verifiedAt?: string | null
  metadata?: unknown
}

export interface AdminAttachmentSummary {
  id: string
  name: string
  originalName: string
  mimeType: string | null
  size: number
  isPublic: boolean
  hash: string | null
  metadata: unknown
  description: string | null
  visibilityMode: 'inherit' | 'public' | 'restricted'
  visibilityRoles: string[]
  visibilityLabels: string[]
  resolvedVisibility: {
    mode: 'public' | 'restricted'
    roles: string[]
    labels: string[]
    source: 'attachment' | 'folder' | 'default'
    folderId?: string | null
    folderName?: string | null
  }
  createdAt: string
  updatedAt: string
  folder: {
    id: string
    name: string
    path: string
  } | null
  owner: {
    id: string | null
    name: string | null
    email: string | null
    deleted?: boolean
  }
  tags: Array<{
    id: string
    key: string
    name: string
  }>
  publicUrl: string | null
}

export interface AdminAttachmentListResponse {
  items: AdminAttachmentSummary[]
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
}

export interface AdminRoleEntry {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  metadata: unknown
  createdAt: string
  updatedAt: string
  rolePermissions: Array<{
    id: string
    permissionId: string
    permission: AdminPermissionEntry
  }>
}

export interface AdminPermissionEntry {
  id: string
  key: string
  description: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface AdminPermissionLabelEntry {
  id: string
  key: string
  name: string
  description: string | null
  color?: string | null
  permissions: Array<{
    id: string
    permission: AdminPermissionEntry
  }>
}

export interface AdminBindingHistoryEntry {
  id: string
  action: string
  reason: string | null
  createdAt: string
  payload?: unknown
  binding?: {
    id: string
    authmeUsername: string
    authmeRealname: string | null
    authmeUuid: string | null
    status?: string
  } | null
  operator: {
    id: string
    email: string
    profile?: { displayName: string | null } | null
  } | null
}

export interface AdminPlayerEntry {
  authme: {
    username: string
    realname: string
    uuid: number
    lastlogin: number | null
    regdate: number
    ip: string | null
    regip: string | null
    ipLocation?: string | null
    regipLocation?: string | null
    ip_location?: string | null
    ip_location_display?: string | null
    regip_location?: string | null
    regip_location_display?: string | null
  } | null
  binding:
    | (AdminAuthmeBindingEntry & {
        user?: {
          id: string
          email: string
          name: string | null
          profile?: { displayName: string | null } | null
        } | null
      })
    | null
  history: AdminBindingHistoryEntry[]
}

export interface AdminUserLikeEntry {
  id: string
  createdAt: string
  liker: {
    id: string
    email: string | null
    displayName: string | null
    avatarUrl: string | null
    primaryAuthmeUsername: string | null
    primaryAuthmeRealname: string | null
  }
}

export interface AdminPlayerListResponse {
  items: AdminPlayerEntry[]
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
  sourceStatus: 'ok' | 'degraded'
  error?: string
}

export interface AdminPermissionCatalogEntry {
  id: string
  key: string
  description: string | null
  metadata: unknown
  roles: Array<{
    id: string
    key: string
    name: string
  }>
  labels: Array<{
    id: string
    key: string
    name: string
    color?: string | null
  }>
}
