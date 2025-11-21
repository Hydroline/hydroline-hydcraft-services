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
  dashboard?: PortalHomeDashboard
  serverCards?: PortalDashboardCard[]
}

export interface PortalDashboardCard {
  id: string
  title: string
  description?: string | null
  value: string
  unit?: string | null
  trend?: 'up' | 'down' | 'flat'
  trendLabel?: string | null
  badge?: string | null
}

export interface PortalServerOverview {
  totalServers: number
  healthyServers: number
  onlinePlayers: number
  maxPlayers: number
  averageLatencyMs: number | null
  busiestServer: {
    id: string
    name: string
    onlinePlayers: number
    latency: number | null
  } | null
  lastUpdatedAt: string
}

export interface PortalOwnershipOverview {
  companyCount: number
  railwayCount: number
  authmeBindings: number
  minecraftProfiles: number
  roleAssignments: number
}

export interface PortalApplicationOverview {
  pendingContacts: number
  activeSessions: number
  securityHolds: number
  profileCompleteness: number
  profileCompletenessLabel: string
}

export interface PortalHomeDashboard {
  serverOverview: PortalServerOverview
  ownershipOverview: PortalOwnershipOverview
  applicationOverview: PortalApplicationOverview
  updatedAt: string
}

export interface PlayerSummary {
  id: string
  email: string
  name: string | null
  image: string | null
  createdAt: string
  joinDate: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  lastLoginLocation: string | null
  displayName: string | null
  piic: string | null
  gender: string | null
  profileExtra: Record<string, string | null>
  contacts: Array<{
    id: string
    value: string
    channel: string
    verified: boolean
  }>
  minecraftProfiles: Array<{
    id: string
    nickname: string | null
    isPrimary: boolean
    authmeBindingId: string | null
    verifiedAt: string | null
  }>
  authmeBindings: Array<{
    id: string
    username: string
    realname: string | null
    uuid: string | null
    boundAt: string
    status: string
    lastKnownLocation: string | null
  }>
  ownership: PortalOwnershipOverview
}

export interface PlayerLoginCluster {
  id: string
  count: number
  lastSeenAt: string
  province: string | null
  city: string | null
  country: string | null
  isp: string | null
  sampleIp: string | null
}

export interface PlayerLoginMap {
  range: { from: string; to: string }
  totalEntries: number
  clusters: PlayerLoginCluster[]
}

export interface PlayerActionItem {
  id: string
  action: string
  createdAt: string
  reason: string | null
  operator: { id: string; email: string; displayName: string } | null
  binding: { id: string; username: string } | null
  payload: Record<string, unknown> | null
}

export interface PlayerActionsResponse {
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
  items: PlayerActionItem[]
}

export interface PlayerAssetsResponse {
  ownership: PortalOwnershipOverview
  bindings: PlayerSummary['authmeBindings']
  minecraftProfiles: PlayerSummary['minecraftProfiles']
  roles: Array<{ id: string; key: string; name: string }>
  companies: unknown[]
  railways: unknown[]
}

export interface PlayerRegionResponse {
  region: {
    country: string | null
    province: string | null
    city: string | null
    district: string | null
    addressLine1: string | null
    addressLine2: string | null
    postalCode: string | null
  }
  lastLogin: {
    at: string | null
    ip: string | null
    location: string | null
  }
}

export interface PlayerMinecraftResponse {
  bindings: PlayerSummary['authmeBindings']
  minecraftProfiles: PlayerSummary['minecraftProfiles']
  permissionRoles: Array<{ id: string; key: string; name: string }>
}

export interface PlayerStatsResponse {
  period: string
  generatedAt: string
  metrics: Array<{
    id: string
    label: string
    value: number
    unit: string
  }>
}

export interface RankCategoryInfo {
  id: string
  name: string
  description: string
  unit: string
  source?: string
}

export interface RankLeaderboardItem {
  rank: number
  value: number
  user: {
    id: string
    displayName: string | null
    email: string | null
    minecraftName: string | null
  }
}

export interface RankLeaderboardResponse {
  category: RankCategoryInfo
  period: string
  pagination: {
    total: number
    page: number
    pageSize: number
    pageCount: number
  }
  items: RankLeaderboardItem[]
}

export interface RankContextResponse {
  category: RankCategoryInfo
  period: string
  me: { rank: number; value: number } | null
  around: RankLeaderboardItem[]
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
