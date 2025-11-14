export interface PortalHeroBackground {
  imageUrl: string;
  description: string | null;
}

export interface PortalHeroData {
  subtitle: string;
  background: PortalHeroBackground[];
}

export interface PortalNavigationLink {
  id: string;
  label: string;
  tooltip: string | null;
  url: string | null;
  available: boolean;
  icon: string | null;
}

export type PortalCardId = string;

export interface PortalHomeData {
  hero: PortalHeroData;
  navigation: PortalNavigationLink[];
  cards: PortalCardId[];
}

export interface PortalMinecraftProfile {
  id: string;
  nickname?: string | null;
  authmeUuid?: string | null;
  authmeBinding?: {
    id: string;
    username: string;
    realname: string | null;
    uuid: string | null;
  } | null;
}

export interface PortalRole {
  id: string;
  key: string;
  name: string;
}

export interface PortalAttachmentTag {
  id: string;
  key: string;
  name: string;
}

export interface AdminOverviewUser {
  id: string;
  email: string;
  name: string | null | undefined;
  createdAt: string;
  profile: {
    displayName: string | null;
    piic: string | null;
    primaryAuthmeBindingId?: string | null;
    primaryMinecraft: PortalMinecraftProfile | null;
  } | null;
  minecraftProfiles: Array<PortalMinecraftProfile & { isPrimary: boolean }>;
  roles: PortalRole[];
}

export interface AdminOverviewData {
  users: AdminOverviewUser[];
  attachments: {
    total: number;
    recent: Array<{
      id: string;
      name: string;
      isPublic: boolean;
      size: number;
      createdAt: string;
      owner: {
        id: string | null;
        name: string | null | undefined;
        email: string | null;
        deleted?: boolean;
      };
      folder: {
        id: string;
        name: string;
        path: string;
      } | null;
      tags: PortalAttachmentTag[];
      publicUrl: string | null;
    }>;
  };
  unlinkedPlayers: PortalMinecraftProfile[];
}
