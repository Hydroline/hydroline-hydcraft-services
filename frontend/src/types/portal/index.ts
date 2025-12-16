export interface PortalHeroBackground {
  id: string
  imageUrl: string
  description: string | null
  title: string | null
  subtitle: string | null
  shootAt: string | null
  photographer: string | null
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
  authmeBindings: number
  permissionGroups: number
  rbacLabels: number
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
  avatarUrl: string | null
  createdAt: string
  joinDate: string | null
  birthday: string | null
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
    lastlogin: number | null
    regdate: number | null
    lastKnownLocation: string | null
    lastLoginLocation: string | null
    regIpLocation: string | null
  }>
  ownership: PortalOwnershipOverview
  rbacLabels: Array<{
    id: string
    key: string
    name: string
    color: string | null
  }>
  luckperms: PlayerLuckpermsSnapshot[]
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

export interface PlayerLuckpermsGroupSnapshot {
  group: string
  server: string | null
  world: string | null
  expiry: number | null
  contexts: Record<string, string> | null
  displayName: string | null
}

export interface PlayerLuckpermsSnapshot {
  authmeUsername: string
  username: string | null
  uuid: string | null
  primaryGroup: string | null
  primaryGroupDisplayName: string | null
  groups: PlayerLuckpermsGroupSnapshot[]
  synced: boolean
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
  gameStats?: PlayerGameStatsResponse | null
}

export interface PlayerLikeSummary {
  total: number
  viewerLiked: boolean
}

export type PlayerMessageReactionType = 'UP' | 'DOWN'

export interface PlayerBiography {
  markdown: string
  updatedAt: string
  updatedBy: {
    id: string
    displayName: string | null
  } | null
}

export interface PlayerMessageBoardEntry {
  id: string
  author: {
    id: string
    displayName: string | null
    email: string | null
  }
  content: string
  createdAt: string
  updatedAt: string
  positiveCount: number
  negativeCount: number
  viewerReaction: PlayerMessageReactionType | null
  viewerCanDelete: boolean
}

export interface PlayerGameStatsResponse {
  identity: { uuid: string | null; name: string | null }
  identityMissing: boolean
  updatedAt: string
  servers: PlayerGameServerStat[]
}

export interface PlayerGameServerStat {
  serverId: string
  serverName: string
  beaconEnabled: boolean
  beaconConfigured: boolean
  metrics: PlayerGameServerMetrics | null
  lastMtrLog: PlayerGameMtrLog | null
  mtrBalance: number | null
  mtrBalanceFetchedAt: string | null
  mtrBalanceError: string | null
  mtrBalanceErrorMessage: string | null
  fetchedAt: string | null
  error: string | null
  errorMessage: string | null
  mtrError: string | null
  mtrErrorMessage: string | null
  achievementsTotal: number | null
  nbtPosition: PlayerGameNbtPosition | null
  nbtPositionFetchedAt: string | null
  nbtPositionError: string | null
  nbtPositionErrorMessage: string | null
}

export interface PlayerGameServerMetrics {
  walkOneCm: number | null
  flyOneCm: number | null
  swimOneCm: number | null
  totalWorldTime: number | null
  playerKills: number | null
  deaths: number | null
  jump: number | null
  playTime: number | null
  useWand: number | null
  leaveGame: number | null
}

export interface PlayerGameMtrLog {
  id: number | null
  timestamp: string | null
  rawTimestamp: string | null
  changeType: string | null
  entryName: string | null
  entryId: string | null
  className: string | null
  dimensionContext: string | null
  description: string | null
}

export interface PlayerGameNbtPosition {
  x: number
  y: number
  z: number
}

export interface PlayerMtrBalanceResponse {
  success: true
  player: string
  balance: number
}

export interface PlayerStatusSnapshot {
  userId: string
  status: string
  updatedAt: string
  statusEventId: string
  event: {
    id: string
    status: string
    reasonCode: string | null
    source: string
    createdAt: string
    metadata: unknown | null
  } | null
}

export interface PlayerPortalProfileResponse {
  viewerId: string | null
  targetId: string
  summary: PlayerSummary
  assets: PlayerAssetsResponse
  region: PlayerRegionResponse
  minecraft: PlayerMinecraftResponse
  stats: PlayerStatsResponse
  likes: PlayerLikeSummary | null
  statusSnapshot: PlayerStatusSnapshot | null
  biography: PlayerBiography | null
  messages: PlayerMessageBoardEntry[]
}

export interface PlayerLoginRecommendation {
  id: string
  type: 'user' | 'authme'
  targetId: string
  displayName: string
  avatarUrl: string | null
}

export interface PlayerLoginRecommendationsResponse {
  items: PlayerLoginRecommendation[]
  total: number
  page: number
  pageSize: number
}

export interface PlayerAuthmeProfileResponse {
  username: string
  realname: string | null
  uuid: string | null
  lastlogin: number | null
  regdate: number | null
  ip: string | null
  ipLocation: string | null
  ipLocationDisplay: string | null
  regIp: string | null
  regIpLocation: string | null
  regIpLocationDisplay: string | null
  lastKnownLocation: string | null
  lastKnownLocationDisplay: string | null
  status: string | null
  boundAt: string | null
  luckperms: PlayerLuckpermsSnapshot[]
  linkedUser: {
    id: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  stats: PlayerStatsResponse
}

export interface PlayerIsLoggedResponse {
  logged: boolean
}

export interface PlayerLifecycleEvent {
  id: string
  source: string | null
  eventType: string
  occurredAt: string
  createdAt: string
  metadata: Record<string, unknown> | null
}

export interface PermissionAdjustmentOptions {
  currentGroup: string | null
  currentGroupLabel: string | null
  options: Array<{ value: string; label: string; priority: number }>
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
