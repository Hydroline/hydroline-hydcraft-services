<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, onMounted, ref } from 'vue'
import SessionsSection from './components/sections/SessionsSection.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/utils/api'
const auth = useAuthStore()
const ui = useUiStore()

const isAuthenticated = computed(() => auth.isAuthenticated)

const sessions = ref<Array<{
  id: string
  createdAt: string
  updatedAt: string
  ipAddress: string | null
  ipLocation: string | null
  userAgent: string | null
  isCurrent: boolean
}>>([])
const sessionsLoading = ref(false)
const sessionsLoaded = ref(false)
const sessionsError = ref('')
const revokingSessionId = ref<string | null>(null)


onMounted(() => {
  if (auth.isAuthenticated) {
    void loadSessions(true)
  }
})

async function loadSessions(force = false) {
  if (!auth.token) {
    sessions.value = []
    sessionsLoaded.value = false
    sessionsError.value = ''
    return
  }
  if (sessionsLoading.value) return
  if (!force && sessionsLoaded.value) return
  sessionsError.value = ''
  sessionsLoading.value = true
  try {
    const response = await auth.listSessions()
    const list = Array.isArray(response?.sessions) ? response.sessions : []
    sessions.value = list.map((entry: any) => ({
      id: entry.id as string,
      createdAt: entry.createdAt as string,
      updatedAt: entry.updatedAt as string,
      ipAddress: (entry.ipAddress as string | null | undefined) ?? null,
      ipLocation: (entry.ipLocation as string | null | undefined) ?? null,
      userAgent: (entry.userAgent as string | null | undefined) ?? null,
      isCurrent: Boolean(entry.isCurrent),
    }))
    sessionsLoaded.value = true
  } catch (error) {
    if (error instanceof ApiError) {
      sessionsError.value = error.message
    } else {
      sessionsError.value = '无法加载会话列表，请稍后再试'
    }
  } finally {
    sessionsLoading.value = false
  }
}

function refreshSessions() {
  void loadSessions(true)
}

function openLoginDialog() {
  ui.openLoginDialog()
}

async function handleRevokeSession(sessionId: string) {
  if (!auth.token) {
    openLoginDialog()
    return
  }
  revokingSessionId.value = sessionId
  try {
    const result = await auth.revokeSession(sessionId)
    if (result?.current) {
      auth.clear()
      sessions.value = []
      sessionsLoaded.value = false
      ui.openLoginDialog()
      return
    }
    await loadSessions(true)
  } finally {
    revokingSessionId.value = null
  }
}
</script>

<template>
  <div v-if="isAuthenticated" class="space-y-6">
    <SessionsSection
      :sessions="sessions"
      :loading="sessionsLoading"
      :error="sessionsError"
      :revoking-id="revokingSessionId"
      @refresh="refreshSessions"
      @revoke="handleRevokeSession"
    />
  </div>
  <UCard v-else class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65">
    <h2 class="text-xl font-semibold text-slate-900 dark:text-white">需要登录</h2>
    <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">登录后可管理活跃会话。</p>
    <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
  </UCard>
</template>

<style scoped></style>
