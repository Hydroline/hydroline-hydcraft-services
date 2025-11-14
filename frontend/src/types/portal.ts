export interface PortalHeroBackground {
  imageUrl: string
  description: string | null
}

export interface PortalHeroData {
  subtitle: string
  background: PortalHeroBackground[]
}

export interface PortalNavigationLink {
  id: string
  label: string
  tooltip: string | null
  url: string | null
  available: boolean
  icon: string | null
}

export type PortalCardId = string

export interface PortalHomeData {
  hero: PortalHeroData
  navigation: PortalNavigationLink[]
  cards: PortalCardId[]
}

export interface PortalMinecraftProfile {
  id: string
  nickname?: string | null
  authmeUuid?: string | null
  authmeBinding?: {
    id: string
    username: string
    realname: string | null
    uuid: string | null
  } | null
}

export interface PortalRole {
  id: string
  key: string
  name: string
}

export interface PortalAttachmentTag {
  id: string
  key: string
  name: string
}

export type AdminHealthStatus = 'normal' | 'warning' | 'critical'

export interface AdminOverviewHighlight {
  label: string
  value: string
  trend: 'up' | 'down' | 'flat'
  trendLabel?: string
}

export interface AdminOverviewTrendPoint {
  date: string
  registrations: number
  attachments: number
}

export interface AdminSystemMetric {
  id: string
  label: string
  value: string
  hint?: string
}

export interface AdminIntegrationMetric {
  label: string
  value: string
}

export interface AdminIntegrationStatus {
  id: string
  name: string
  status: AdminHealthStatus
  lastSync: string
  metrics: AdminIntegrationMetric[]
}

export interface AdminOverviewQuickAction {
  id: string
  title: string
  description: string
  to: string
  badge?: string
}

export interface AdminOverviewData {
  greeting: {
    operator: string
    periodLabel: string
    message: string
    subtext: string
    highlights: AdminOverviewHighlight[]
  }
  summary: {
    totalUsers: number
    totalAttachments: number
    pendingBindings: number
    recentActivity: string
  }
  activity: {
    rangeLabel: string
    registrationsThisWeek: number
    attachmentsThisWeek: number
    points: AdminOverviewTrendPoint[]
  }
  system: {
    updatedAt: string
    metrics: AdminSystemMetric[]
  }
  integrations: AdminIntegrationStatus[]
  quickActions: AdminOverviewQuickAction[]
}
