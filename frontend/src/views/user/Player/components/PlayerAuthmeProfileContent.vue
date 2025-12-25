<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import PlayerGameStatsPanel from './PlayerGameStatsPanel.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import type {
  PlayerAuthmeProfileResponse,
  PlayerStatsResponse,
} from '@/types/portal'

const props = defineProps<{
  profile: PlayerAuthmeProfileResponse | null
  stats: PlayerStatsResponse | null
}>()

const profile = computed(() => props.profile)
const panelStats = computed(() => props.stats)
const displayName = computed(() => {
  if (!profile.value) return '玩家'
  return profile.value.realname || profile.value.username
})

const headAvatarUrl = computed(() => {
  if (!profile.value) return null
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
    profile.value.username,
  )}/128`
})

const lastLoginLabel = computed(() => {
  if (!profile.value?.lastlogin) return '—'
  return dayjs(profile.value.lastlogin).format('YYYY/MM/DD HH:mm:ss')
})

const regDateLabel = computed(() => {
  if (!profile.value?.regdate) return '—'
  return dayjs(profile.value.regdate).format('YYYY/MM/DD HH:mm:ss')
})

const locationLabel = computed(() => {
  if (profile.value?.lastKnownLocationDisplay) {
    return profile.value.lastKnownLocationDisplay
  }
  return profile.value?.ipLocationDisplay ?? '—'
})

const regLocationLabel = computed(() => {
  return profile.value?.regIpLocationDisplay ?? '—'
})

const groupDisplayList = computed(() => {
  if (!profile.value?.luckperms?.length) return []
  const names: string[] = []
  for (const entry of profile.value.luckperms) {
    for (const group of entry.groups ?? []) {
      if (!group) continue
      const label = group.displayName ?? group.group ?? null
      if (label && !names.includes(label)) {
        names.push(label)
      }
    }
  }
  return names
})

const linkedUser = computed(() => profile.value?.linkedUser)

const primaryLuckperms = computed(() => groupDisplayList.value[0] ?? null)

const noop = () => {
  /* no-op */
}
</script>

<template>
  <div v-if="profile" class="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
    <div class="space-y-6 md:pt-6">
      <div class="flex flex-col gap-3">
        <div
          class="h-16 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
        >
          <img
            v-if="headAvatarUrl"
            :src="headAvatarUrl"
            :alt="displayName"
            class="h-full w-full object-cover"
          />
        </div>
        <div>
          <p class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ displayName }}
          </p>
        </div>
      </div>

      <div class="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">最后登录</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ lastLoginLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">登录位置</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ locationLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">注册时间</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ regDateLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">注册地点</span>
          <span
            class="flex items-center flex-wrap break-all gap-2 text-base font-semibold text-slate-600 dark:text-slate-300"
            >{{ regLocationLabel }}</span
          >
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500 dark:text-slate-500">权限组</span>
          <span
            class="flex flex-wrap gap-2 text-base font-semibold text-slate-800 dark:text-slate-300"
          >
            <template v-if="groupDisplayList.length">
              <span
                v-for="groupName in groupDisplayList"
                :key="groupName"
                class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                {{ groupName }}
              </span>
            </template>
            <template v-else class="text-sm text-slate-500 dark:text-slate-400">
              位置
            </template>
          </span>
        </div>
        <div v-if="linkedUser" class="flex justify-between items-center">
          <span class="text-slate-500 dark:text-slate-500">关联用户</span>
          <RouterLink
            :to="`/user/${linkedUser.id}`"
            class="flex items-center gap-2 text-base font-semibold text-slate-600 hover:text-primary dark:text-slate-300 dark:hover:text-primary-400"
          >
            <UserAvatar
              :src="linkedUser.avatarUrl"
              :name="linkedUser.displayName"
              size="sm"
              class="!h-6 !w-6 !text-xs"
            />
            <span>{{ linkedUser.displayName }}</span>
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <PlayerGameStatsPanel
        :stats="panelStats"
        :bindings="[]"
        :is-viewing-self="false"
        :refreshing="false"
        @refresh="noop"
      />
    </div>
  </div>
</template>
