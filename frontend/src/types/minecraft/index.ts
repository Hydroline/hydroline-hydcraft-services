export type MinecraftServerEdition = 'JAVA' | 'BEDROCK'

export interface MinecraftServer {
  id: string
  displayName: string
  internalCodeCn: string
  internalCodeEn: string
  host: string
  port: number
  edition: MinecraftServerEdition
  description?: string | null
  isActive: boolean
  displayOrder: number
  metadata?: Record<string, unknown> | null
  mcsmPanelUrl?: string | null
  mcsmDaemonId?: string | null
  mcsmInstanceUuid?: string | null
  mcsmRequestTimeoutMs?: number | null
  mcsmConfigured?: boolean
  beaconEndpoint?: string | null
  beaconEnabled?: boolean | null
  beaconRequestTimeoutMs?: number | null
  beaconMaxRetry?: number | null
  beaconConfigured?: boolean
  createdAt: string
  updatedAt: string
}

// Hydroline Beacon DTOs

export interface BeaconServerStatusPayload {
  mtr_logs_total?: number
  advancements_total?: number
  interval_time_ticks?: number
  success?: boolean
  online_player_count?: number
  interval_time_seconds?: number
  server_max_players?: number
  stats_total?: number
  [key: string]: unknown
}

export interface BeaconStatusResponse {
  server: MinecraftServer
  status: BeaconServerStatusPayload
  lastHeartbeatAt: string
  fromCache: boolean
  connection?: BeaconConnectionStatus
}

export interface BeaconMtrLogRecord {
  id: number
  player_uuid?: string | null
  player_name?: string | null
  change_type?: string | null
  timestamp?: string | null
  source_file_path?: string | null
  dimension_context?: string | null
  class_name?: string | null
  position?: string | null
  entry_name?: string | null
  old_data?: string | null
  new_data?: string | null
  [key: string]: unknown
}

export interface BeaconMtrLogsResult {
  total?: number
  records?: BeaconMtrLogRecord[]
  page?: number
  page_size?: number
  success?: boolean
  [key: string]: unknown
}

export interface BeaconMtrLogsResponse {
  server: MinecraftServer
  result: BeaconMtrLogsResult
}

export interface BeaconRailwaySnapshotResponse {
  server: MinecraftServer
  result: Record<string, unknown>
}

export interface RailwaySyncJob {
  id: string
  serverId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  message: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface BeaconPlayerAdvancementsResult {
  success?: boolean
  player_uuid?: string
  advancements?: Record<string, string>
  total?: number
  page?: number
  page_size?: number
  [key: string]: unknown
}

export interface BeaconPlayerStatsResult {
  success?: boolean
  player_uuid?: string
  stats?: Record<string, number>
  total?: number
  page?: number
  page_size?: number
  [key: string]: unknown
}

export interface BeaconPlayerSessionsRecord {
  id: number
  player_uuid?: string | null
  player_name?: string | null
  event_type?: string | null
  timestamp?: string | null
  ip?: string | null
  [key: string]: unknown
}

export interface BeaconPlayerSessionsResult {
  total?: number
  records?: BeaconPlayerSessionsRecord[]
  page?: number
  page_size?: number
  success?: boolean
  [key: string]: unknown
}

export interface BeaconPlayerGenericResponse<T = unknown> {
  server: MinecraftServer
  result: T
}

export interface BeaconConnectionStatus {
  connected: boolean
  connecting: boolean
  lastConnectedAt?: string | null
  lastError?: string | null
  reconnectAttempts?: number
  endpoint?: string | null
}

export interface BeaconConnectionStatusResponse {
  server: MinecraftServer
  connection: BeaconConnectionStatus
  config?: {
    endpoint?: string | null
    enabled?: boolean
    configured?: boolean
    timeoutMs?: number
    maxRetry?: number
  }
}

export interface BeaconConnectivityCheckResponse {
  server: MinecraftServer
  ok: boolean
  latencyMs?: number
  error?: string
}

export interface JavaPingResponse {
  version: {
    name: string
    protocol: number
  }
  players: {
    online: number
    max: number
    sample?: { name: string; id: string }[]
  }
  description: string | Record<string, unknown>
  favicon?: string
  latency: number
}

export interface BedrockPingResponse {
  edition: string
  motd: string
  protocolVersion: string
  version: string
  players: {
    online: number
    max: number
  }
  gamemode: string
  serverId: string
  latency: number
}

export type MinecraftPingResult =
  | {
      edition: 'JAVA'
      response: JavaPingResponse
    }
  | {
      edition: 'BEDROCK'
      response: BedrockPingResponse
    }

export interface MinecraftPingHistoryItem {
  id: string
  serverId: string
  edition: MinecraftServerEdition
  latency: number | null
  onlinePlayers: number | null
  maxPlayers: number | null
  motd?: string | null
  createdAt: string
}

export interface MinecraftPingSettings {
  id: string
  intervalMinutes: number
  retentionDays: number
  createdAt: string
  updatedAt: string
}

export type McsmInstanceStatus = -1 | 0 | 1 | 2 | 3

export interface McsmProcessInfo {
  cpu?: number
  memory?: number
  ppid?: number
  pid?: number
  ctime?: number
  elapsed?: number
  uptime?: number
}

export interface McsmInstanceDetail {
  config?: Record<string, unknown>
  info?: Record<string, unknown> & {
    currentPlayers?: number
    maxPlayers?: number
    version?: string
    openFrpStatus?: boolean
    playersChart?: unknown[]
  }
  instanceUuid: string
  processInfo?: McsmProcessInfo
  space?: number
  started?: number
  status: McsmInstanceStatus
}
