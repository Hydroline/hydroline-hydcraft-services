import type { PortalMinecraftProfile, PortalRole } from './portal';

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  profile: {
    displayName: string | null;
    piic: string | null;
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
