import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  BeaconRailwaySnapshotResponse,
  MinecraftPingResult,
  MinecraftServer,
  MinecraftServerEdition,
  MinecraftPingHistoryItem,
  MinecraftPingSettings,
  McsmInstanceDetail,
  RailwaySyncJob,
} from '@/types/minecraft'

type CreateServerPayload = {
  displayName: string
  internalCodeCn: string
  internalCodeEn: string
  host: string
  port?: number
  edition: MinecraftServerEdition
  description?: string
  isActive?: boolean
  displayOrder?: number
  mcsmPanelUrl?: string
  mcsmDaemonId?: string
  mcsmInstanceUuid?: string
  mcsmApiKey?: string
  mcsmRequestTimeoutMs?: number
  // Hydroline Beacon
  beaconEndpoint?: string
  beaconKey?: string
  beaconEnabled?: boolean
  beaconRequestTimeoutMs?: number
  beaconMaxRetry?: number
}

type UpdateServerPayload = Partial<CreateServerPayload>

export const useMinecraftServerStore = defineStore('minecraft-servers', {
  state: () => ({
    items: [] as MinecraftServer[],
    pingResults: new Map<string, MinecraftPingResult>(),
    loading: false,
  }),
  actions: {
    authHeaders() {
      const auth = useAuthStore()
      if (!auth.token) {
        throw new Error('未登录，无法请求服务器配置')
      }
      return auth.token
    },
    async fetchAll() {
      this.loading = true
      try {
        const token = this.authHeaders()
        const data = await apiFetch<MinecraftServer[]>(
          '/admin/minecraft/servers',
          {
            token,
          },
        )
        this.items = data
        return data
      } finally {
        this.loading = false
      }
    },
    async create(payload: CreateServerPayload) {
      const token = this.authHeaders()
      const server = await apiFetch<MinecraftServer>(
        '/admin/minecraft/servers',
        {
          method: 'POST',
          token,
          body: payload,
        },
      )
      this.items.push(server)
      return server
    },
    async update(id: string, payload: UpdateServerPayload) {
      const token = this.authHeaders()
      const server = await apiFetch<MinecraftServer>(
        `/admin/minecraft/servers/${id}`,
        {
          method: 'PATCH',
          token,
          body: payload,
        },
      )
      this.items = this.items.map((item) => (item.id === id ? server : item))
      return server
    },
    async remove(id: string) {
      const token = this.authHeaders()
      await apiFetch(`/admin/minecraft/servers/${id}`, {
        method: 'DELETE',
        token,
      })
      this.items = this.items.filter((item) => item.id !== id)
      this.pingResults.delete(id)
    },
    async ping(id: string) {
      const token = this.authHeaders()
      const result = await apiFetch<{
        edition: MinecraftPingResult['edition']
        response: MinecraftPingResult['response']
      }>(`/admin/minecraft/servers/${id}/ping`, {
        method: 'POST',
        token,
      })
      this.pingResults.set(id, result as MinecraftPingResult)
      return result as MinecraftPingResult
    },
    async getPingSettings() {
      const token = this.authHeaders()
      return await apiFetch<MinecraftPingSettings>(
        '/admin/minecraft/servers/ping/settings',
        { token },
      )
    },
    async updatePingSettings(
      payload: Partial<{
        intervalMinutes: number
        retentionDays: number
      }>,
    ) {
      const token = this.authHeaders()
      return await apiFetch<MinecraftPingSettings>(
        '/admin/minecraft/servers/ping/settings',
        { method: 'PATCH', token, body: payload },
      )
    },
    async listPingHistory(id: string, days = 1) {
      const token = this.authHeaders()
      const q = new URLSearchParams({ days: String(days) }).toString()
      return await apiFetch<MinecraftPingHistoryItem[]>(
        `/admin/minecraft/servers/${id}/ping/history?${q}`,
        { token },
      )
    },
    async adhocPing(payload: {
      host: string
      port?: number
      edition: MinecraftServerEdition
    }) {
      // 工具接口不要求鉴权
      return await apiFetch<MinecraftPingResult>('/minecraft/ping/adhoc', {
        method: 'POST',
        body: payload,
      })
    },

    async fetchMcsmStatus(id: string) {
      const token = this.authHeaders()
      return await apiFetch<{
        server: MinecraftServer
        detail: McsmInstanceDetail
      }>(`/admin/minecraft/servers/${id}/mcsm/status`, { token })
    },

    async fetchMcsmOutput(id: string, size?: number) {
      const token = this.authHeaders()
      const q = new URLSearchParams()
      if (size) q.set('size', String(size))
      return await apiFetch<{ server: MinecraftServer; output: string }>(
        `/admin/minecraft/servers/${id}/mcsm/output${q.toString() ? `?${q.toString()}` : ''}`,
        { token },
      )
    },

    async sendMcsmCommand(id: string, command: string) {
      const token = this.authHeaders()
      return await apiFetch<{ server: MinecraftServer; result: unknown }>(
        `/admin/minecraft/servers/${id}/mcsm/command`,
        { method: 'POST', token, body: { command } },
      )
    },

    async startMcsm(id: string) {
      const token = this.authHeaders()
      return await apiFetch<{ server: MinecraftServer; result: unknown }>(
        `/admin/minecraft/servers/${id}/mcsm/start`,
        { method: 'POST', token },
      )
    },

    async stopMcsm(id: string) {
      const token = this.authHeaders()
      return await apiFetch<{ server: MinecraftServer; result: unknown }>(
        `/admin/minecraft/servers/${id}/mcsm/stop`,
        { method: 'POST', token },
      )
    },

    async restartMcsm(id: string) {
      const token = this.authHeaders()
      return await apiFetch<{ server: MinecraftServer; result: unknown }>(
        `/admin/minecraft/servers/${id}/mcsm/restart`,
        { method: 'POST', token },
      )
    },

    async killMcsm(id: string) {
      const token = this.authHeaders()
      return await apiFetch<{ server: MinecraftServer; result: unknown }>(
        `/admin/minecraft/servers/${id}/mcsm/kill`,
        { method: 'POST', token },
      )
    },

    // Hydroline Beacon HTTP 代理
    async getBeaconStatus(id: string) {
      const token = this.authHeaders()
      return await apiFetch(`/admin/minecraft/servers/${id}/beacon/status`, {
        token,
      })
    },

    async getBeaconRailwaySnapshot(id: string) {
      const token = this.authHeaders()
      return await apiFetch<BeaconRailwaySnapshotResponse>(
        `/admin/minecraft/servers/${id}/beacon/railway-snapshot`,
        { token },
      )
    },

    async syncRailwayEntities(id: string) {
      const token = this.authHeaders()
      return await apiFetch<RailwaySyncJob>(
        `/admin/minecraft/servers/${id}/beacon/railway-sync`,
        { method: 'POST', token },
      )
    },

    async getRailwaySyncJob(id: string, jobId: string) {
      const token = this.authHeaders()
      return await apiFetch<RailwaySyncJob>(
        `/admin/minecraft/servers/${id}/beacon/railway-sync/${jobId}`,
        { token },
      )
    },

    async getLatestRailwaySyncJob(id: string) {
      const token = this.authHeaders()
      return await apiFetch<RailwaySyncJob | null>(
        `/admin/minecraft/servers/${id}/beacon/railway-sync`,
        { token },
      )
    },

    async getBeaconConnectionStatus(id: string) {
      const token = this.authHeaders()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/connection-status`,
        { token },
      )
    },

    async connectBeacon(id: string) {
      const token = this.authHeaders()
      return await apiFetch(`/admin/minecraft/servers/${id}/beacon/connect`, {
        method: 'POST',
        token,
      })
    },

    async disconnectBeacon(id: string) {
      const token = this.authHeaders()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/disconnect`,
        { method: 'POST', token },
      )
    },

    async reconnectBeacon(id: string) {
      const token = this.authHeaders()
      return await apiFetch(`/admin/minecraft/servers/${id}/beacon/reconnect`, {
        method: 'POST',
        token,
      })
    },

    async checkBeaconConnectivity(id: string) {
      const token = this.authHeaders()
      return await apiFetch(`/admin/minecraft/servers/${id}/beacon/check`, {
        method: 'POST',
        token,
      })
    },

    async getBeaconMtrLogs(
      id: string,
      params: Record<string, string | number | undefined>,
    ) {
      const token = this.authHeaders()
      const search = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return
        search.set(key, String(value))
      })
      const query = search.toString()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/mtr-logs${
          query ? `?${query}` : ''
        }`,
        { token },
      )
    },

    async getBeaconMtrLogDetail(id: string, logId: string | number) {
      const token = this.authHeaders()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/mtr-logs/${logId}`,
        { token },
      )
    },

    async getBeaconPlayerAdvancements(
      id: string,
      params: {
        playerUuid?: string
        playerName?: string
        page?: number
        pageSize?: number
      },
    ) {
      const token = this.authHeaders()
      const search = new URLSearchParams()
      if (params.playerUuid) search.set('playerUuid', params.playerUuid)
      if (params.playerName) search.set('playerName', params.playerName)
      if (params.page) search.set('page', String(params.page))
      if (params.pageSize) search.set('pageSize', String(params.pageSize))
      const query = search.toString()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/players/advancements${
          query ? `?${query}` : ''
        }`,
        { token },
      )
    },

    async getBeaconPlayerStats(
      id: string,
      params: {
        playerUuid?: string
        playerName?: string
        page?: number
        pageSize?: number
      },
    ) {
      const token = this.authHeaders()
      const search = new URLSearchParams()
      if (params.playerUuid) search.set('playerUuid', params.playerUuid)
      if (params.playerName) search.set('playerName', params.playerName)
      if (params.page) search.set('page', String(params.page))
      if (params.pageSize) search.set('pageSize', String(params.pageSize))
      const query = search.toString()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/players/stats${
          query ? `?${query}` : ''
        }`,
        { token },
      )
    },

    async getBeaconPlayerSessions(
      id: string,
      params: Record<string, string | number | undefined>,
    ) {
      const token = this.authHeaders()
      const search = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return
        search.set(key, String(value))
      })
      const query = search.toString()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/players/sessions${
          query ? `?${query}` : ''
        }`,
        { token },
      )
    },

    async getBeaconPlayerNbt(
      id: string,
      params: { playerUuid?: string; playerName?: string },
    ) {
      const token = this.authHeaders()
      const search = new URLSearchParams()
      if (params.playerUuid) search.set('playerUuid', params.playerUuid)
      if (params.playerName) search.set('playerName', params.playerName)
      const query = search.toString()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/players/nbt${
          query ? `?${query}` : ''
        }`,
        { token },
      )
    },

    async lookupBeaconPlayerIdentity(
      id: string,
      params: { playerUuid?: string; playerName?: string },
    ) {
      const token = this.authHeaders()
      const search = new URLSearchParams()
      if (params.playerUuid) search.set('playerUuid', params.playerUuid)
      if (params.playerName) search.set('playerName', params.playerName)
      const query = search.toString()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/players/identity${
          query ? `?${query}` : ''
        }`,
        { token },
      )
    },

    async triggerBeaconForceUpdate(id: string) {
      const token = this.authHeaders()
      return await apiFetch(
        `/admin/minecraft/servers/${id}/beacon/force-update`,
        { method: 'POST', token },
      )
    },
  },
})
