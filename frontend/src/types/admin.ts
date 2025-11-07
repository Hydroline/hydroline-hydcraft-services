import type { PortalMinecraftProfile, PortalRole } from './portal';

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  profile: {
    displayName: string | null;
    piic: string | null;
    primaryAuthmeBindingId?: string | null;
    primaryMinecraft?: PortalMinecraftProfile | null;
  } | null;
  statusSnapshot?: {
    status: string;
  } | null;
  minecraftIds?: Array<PortalMinecraftProfile & { isPrimary: boolean }>;
  roles: Array<{
    id: string;
    roleId: string;
    role: PortalRole;
  }>;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

export interface AdminAuthmeBindingEntry {
  id?: string;
  authmeUsername: string;
  authmeRealname: string | null;
  authmeUuid?: string | null;
  boundAt: string;
  ip?: string | null;
  regip?: string | null;
  lastlogin?: number | null;
  regdate?: number | null;
  isPrimary?: boolean;
}

export interface AdminUserDetail extends AdminUserListItem {
  joinDate: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  profile: (AdminUserListItem['profile'] & {
    birthday?: string | null;
    gender?: string | null;
    motto?: string | null;
    timezone?: string | null;
    locale?: string | null;
    extra?: unknown;
  }) | null;
  authmeBindings: AdminAuthmeBindingEntry[];
  permissionLabels?: Array<{
    id: string;
    labelId: string;
    label: AdminPermissionLabelEntry;
  }>;
}

export interface AdminAttachmentSummary {
  id: string;
  name: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  isPublic: boolean;
  hash: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  folder: {
    id: string;
    name: string;
    path: string;
  } | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  tags: Array<{
    id: string;
    key: string;
    name: string;
  }>;
  publicUrl: string | null;
}

export interface AdminRoleEntry {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  rolePermissions: Array<{
    id: string;
    permissionId: string;
    permission: AdminPermissionEntry;
  }>;
}

export interface AdminPermissionEntry {
  id: string;
  key: string;
  description: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPermissionLabelEntry {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color?: string | null;
  permissions: Array<{
    id: string;
    permission: AdminPermissionEntry;
  }>;
}

export interface AdminBindingHistoryEntry {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
  payload?: unknown;
  binding?: {
    id: string;
    authmeUsername: string;
    authmeRealname: string | null;
    authmeUuid: string | null;
    status?: string;
  } | null;
  operator: {
    id: string;
    email: string;
    profile?: { displayName: string | null } | null;
  } | null;
}

export interface AdminPlayerEntry {
  authme: {
    username: string;
    realname: string;
    uuid: number;
    lastlogin: number | null;
    regdate: number;
    ip: string | null;
    regip: string | null;
  } | null;
  binding: (AdminAuthmeBindingEntry & {
    user?: {
      id: string;
      email: string;
      name: string | null;
      profile?: { displayName: string | null } | null;
    } | null;
  }) | null;
  history: AdminBindingHistoryEntry[];
}

export interface AdminPlayerListResponse {
  items: AdminPlayerEntry[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
  sourceStatus: 'ok' | 'degraded';
  error?: string;
}

export interface AdminPermissionCatalogEntry {
  id: string;
  key: string;
  description: string | null;
  metadata: unknown;
  roles: Array<{
    id: string;
    key: string;
    name: string;
  }>;
  labels: Array<{
    id: string;
    key: string;
    name: string;
    color?: string | null;
  }>;
}
