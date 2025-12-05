export type RankSortField =
  | 'lastLogin'
  | 'registered'
  | 'walkDistance'
  | 'flyDistance'
  | 'swimDistance'
  | 'achievements'
  | 'deaths'
  | 'playerKilledBy'
  | 'jumpCount'
  | 'playTime'
  | 'wandUses'
  | 'logoutCount'
  | 'mtrBalance'

export type RankSortOrder = 'asc' | 'desc'

export interface RankPlayerItem {
  rank: number
  playerUuid: string | null
  playerName: string | null
  displayName: string | null
  bindingId: string | null
  lastLoginAt: string | null
  registeredAt: string | null
  walkDistanceKm: number | null
  flyDistanceKm: number | null
  swimDistanceKm: number | null
  achievements: number | null
  deaths: number | null
  playerKilledByCount: number | null
  jumpCount: number | null
  playTimeHours: number | null
  useWandCount: number | null
  logoutCount: number | null
  mtrBalance: number | null
  metrics: Record<string, unknown> | null
  stats: Record<string, unknown> | null
}

export interface RankServerItem {
  id: string
  displayName: string
}

export interface RankSelectedServer extends RankServerItem {
  lastSyncedAt: string | null
}

export interface RankPagination {
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface RankResponse {
  servers: RankServerItem[]
  selectedServer: RankSelectedServer
  pagination: RankPagination
  sortField: RankSortField
  sortOrder: RankSortOrder
  items: RankPlayerItem[]
}

export type RankSyncStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

export interface RankSyncJobStatus {
  id: string
  serverId: string | null
  initiatedById: string | null
  status: RankSyncStatus
  startedAt: string
  completedAt: string | null
  message: string | null
}
