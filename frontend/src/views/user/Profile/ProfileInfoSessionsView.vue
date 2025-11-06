<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ProfileHeader from './components/ProfileHeader.vue'
import ProfileSidebar from './components/ProfileSidebar.vue'
import SessionsSection from './components/sections/SessionsSection.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/utils/api'

type SectionKey = 'basic' | 'minecraft' | 'sessions'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()

const isAuthenticated = computed(() => auth.isAuthenticated)
const loading = ref(false)

const sessions = ref<Array<{
  id: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  ipAddress: string | null
  ipLocation: string | null
  userAgent: string | null
  isCurrent: boolean
}>>([])
const sessionsLoading = ref(false)
const sessionsLoaded = ref(false)
const sessionsError = ref('')
const revokingSessionId = ref<string | null>(null)

const sections: Array<{ id: SectionKey; label: string }> = [
  { id: 'basic', label: '基础资料' },
  { id: 'minecraft', label: '服务器账户' },
  { id: 'sessions', label: '会话管理' },
]

const activeId = computed<SectionKey>(() => {
  if (route.name === 'profile.info.sessions') return 'sessions'
  if (route.name === 'profile.info.minecraft') return 'minecraft'
  return 'basic'
})

function gotoSection(id: SectionKey) {
  if (id === 'basic') router.push({ name: 'profile.info.basic' })
  else if (id === 'minecraft') router.push({ name: 'profile.info.minecraft' })
  else router.push({ name: 'profile.info.sessions' })
}

const avatarUrl = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user) return null
  if (user.profile?.avatarUrl) return user.profile.avatarUrl as string
  if (user.image) return user.image as string
  return null
})

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
      expiresAt: entry.expiresAt as string,
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
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-8">
    <div v-if="isAuthenticated" class="space-y-6">
      <ProfileHeader
        :avatar-url="avatarUrl"
        :display-name="auth.displayName ?? auth.user?.email ?? ''"
        :email="auth.user?.email ?? ''"
        :last-synced-text="''"
        :joined-text="''"
        :registered-text="''"
        :last-login-text="''"
        :last-login-ip="null"
        :loading="loading"
        @refresh="refreshSessions"
      />

      <div class="flex flex-col gap-2 relative xl:flex-row xl:gap-6">
        <ProfileSidebar
          :items="sections"
          :active-id="activeId"
          :editing="false"
          @update:active-id="(id: string) => gotoSection(id as SectionKey)"
        />

        <div class="flex-1 space-y-6">
          <SessionsSection
            :sessions="sessions"
            :loading="sessionsLoading"
            :error="sessionsError"
            :revoking-id="revokingSessionId"
            @refresh="refreshSessions"
            @revoke="handleRevokeSession"
          />
        </div>
      </div>
    </div>

    <UCard v-else class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65">
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">需要登录</h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">登录后可管理活跃会话。</p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
  
</template>

<style scoped></style>
