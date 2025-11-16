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
  createdAt: string
  updatedAt: string
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
