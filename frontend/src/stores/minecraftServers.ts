import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/api'
import { useAuthStore } from './auth'
import type {
  MinecraftPingResult,
  MinecraftServer,
  MinecraftServerEdition,
  MinecraftPingHistoryItem,
  MinecraftPingSettings,
  McsmInstanceDetail,
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
  },
})
