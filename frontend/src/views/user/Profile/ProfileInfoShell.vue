<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, type ComputedRef } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import ProfileHeader from './components/ProfileHeader.vue'
import ProfileSidebar from './components/ProfileSidebar.vue'
import { useAuthStore } from '@/stores/user/auth'
import { useUiStore } from '@/stores/shared/ui'
import dayjs from 'dayjs'

type SectionKey = 'basic' | 'minecraft' | 'sessions' | 'security'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()

const isAuthenticated = computed(() => auth.isAuthenticated)
const loading = ref(false)

const sections: Array<{ id: SectionKey; label: string }> = [
  { id: 'basic', label: '基础资料' },
  { id: 'minecraft', label: '服务器账户' },
  { id: 'security', label: '隐私与安全' },
  { id: 'sessions', label: '登录设备管理' },
]

const activeId = computed<SectionKey>(() => {
  const name = String(route.name || '')
  if (name.endsWith('sessions')) return 'sessions'
  if (name.endsWith('minecraft')) return 'minecraft'
  if (name.endsWith('security')) return 'security'
  return 'basic'
})

function gotoSection(id: SectionKey) {
  if (id === 'basic') router.push({ name: 'profile.basic' })
  else if (id === 'minecraft') router.push({ name: 'profile.minecraft' })
  else if (id === 'sessions') router.push({ name: 'profile.sessions' })
  else router.push({ name: 'profile.security' })
}

const avatarUrl = computed<string | null>(() => {
  const user = auth.user as Record<string, any> | null
  if (!user) return null
  if (user.profile?.avatarUrl) return user.profile.avatarUrl as string
  if (user.image) return user.image as string
  return null
})
const displayName: ComputedRef<string | null> = computed(() => {
  const name = auth.displayName
  if (typeof name === 'string' && name.length > 0) return name
  const mail = (auth.user as any)?.email as string | undefined
  return mail ?? null
})
const email: ComputedRef<string> = computed(() => {
  const mail = (auth.user as any)?.email as string | undefined
  return mail ?? ''
})
const registeredText = computed(() => {
  const user = auth.user as Record<string, any> | null
  if (!user?.createdAt) return ''
  return dayjs(user.createdAt).format('YYYY年M月D日 HH:mm')
})
const joinedText = computed(() => {
  const user = auth.user as Record<string, any> | null
  const joinDate = (user as any)?.joinDate ?? user?.createdAt
  if (!joinDate) return ''
  return dayjs(joinDate).format('YYYY年M月D日')
})
const lastLoginText = computed(() => {
  const user = auth.user as Record<string, any> | null
  const t = (user as any)?.lastLoginAt
  if (!t) return ''
  return dayjs(t).format('YYYY年MM月DD日 HH:mm')
})
const lastLoginIp = computed(() => {
  const user = auth.user as Record<string, any> | null
  return ((user as any)?.lastLoginIp as string | null) ?? null
})
const lastSyncedText = computed(() => {
  const t = (auth.user as any)?.updatedAt
  if (!t) return '尚未同步'
  return dayjs(t).format('YYYY年MM月DD日 HH:mm')
})

async function refresh() {
  if (!auth.token) {
    ui.openLoginDialog()
    return
  }
  loading.value = true
  try {
    await auth.fetchCurrentUser()
  } finally {
    loading.value = false
  }
}

function openLoginDialog() {
  ui.openLoginDialog()
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-8">
    <div v-if="isAuthenticated" class="space-y-6">
      <ProfileHeader
        :avatar-url="avatarUrl"
        :display-name="displayName"
        :email="email"
        :last-synced-text="lastSyncedText"
        :joined-text="joinedText"
        :registered-text="registeredText"
        :last-login-text="lastLoginText"
        :last-login-ip="lastLoginIp"
        :loading="loading"
        @refresh="refresh"
      />

      <div class="flex flex-col gap-2 relative xl:flex-row xl:gap-6">
        <ProfileSidebar
          :items="sections"
          :active-id="activeId"
          :editing="false"
          @update:active-id="(id: string) => gotoSection(id as SectionKey)"
        />

        <div class="flex-1 space-y-6">
          <RouterView />
        </div>
      </div>
    </div>

    <UCard
      v-else
      class="flex flex-col items-center gap-4 bg-white/85 py-12 text-center shadow-sm backdrop-blur-sm dark:bg-slate-900/65"
    >
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
        需要登录
      </h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">
        登录后即可管理个人资料和绑定。
      </p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>

<style scoped></style>
