import type { LuckpermsGroupMembership } from '../luckperms/luckperms.interfaces';

export type PortalOwnershipOverview = {
  authmeBindings: number;
  permissionGroups: number;
  rbacLabels: number;
};

export type PlayerLoginCluster = {
  id: string;
  count: number;
  lastSeenAt: string;
  province: string | null;
  city: string | null;
  country: string | null;
  isp: string | null;
  sampleIp: string | null;
};

export type PlayerLuckpermsGroupSnapshot = LuckpermsGroupMembership & {
  displayName: string | null;
};

export type PlayerLuckpermsSnapshot = {
  authmeUsername: string;
  username: string | null;
  uuid: string | null;
  primaryGroup: string | null;
  primaryGroupDisplayName: string | null;
  groups: PlayerLuckpermsGroupSnapshot[];
  synced: boolean;
};

export type PlayerLikeSummary = {
  total: number;
  viewerLiked: boolean;
};

export type PlayerLikeDetail = {
  id: string;
  createdAt: string;
  liker: {
    id: string;
    email: string | null;
    displayName: string | null;
    primaryAuthmeUsername: string | null;
    primaryAuthmeRealname: string | null;
  };
};
