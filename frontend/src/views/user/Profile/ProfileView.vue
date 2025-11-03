<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()

const isAuthenticated = computed(() => auth.isAuthenticated)
const profile = computed(() => auth.user?.profile ?? {})
const contacts = computed(() => auth.user?.contacts ?? [])

function openLoginDialog() {
  ui.openLoginDialog()
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8">
    <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          玩家档案
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          在这里浏览 Minecraft 绑定、状态事件等档案数据。若需修改账户资料，请使用“用户信息”页面。
        </p>
      </div>
      <RouterLink
        v-if="isAuthenticated"
        to="/profile/info"
        class="inline-flex items-center gap-2 rounded-full border border-primary-200 px-4 py-1.5 text-sm font-medium text-primary-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-primary-500/40 dark:text-primary-200"
      >
        <UIcon name="i-lucide-id-card" class="h-4 w-4" />
        管理用户信息
      </RouterLink>
    </header>

    <div v-if="isAuthenticated" class="grid gap-6 md:grid-cols-[1.2fr_1fr]">
      <UCard class="bg-white/80 backdrop-blur-sm dark:bg-slate-900/60">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              基础信息
            </h2>
            <UBadge color="primary" variant="soft">账户</UBadge>
          </div>
        </template>

        <dl class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">
              显示名称
            </dt>
            <dd class="mt-1 text-slate-900 dark:text-slate-100">
              {{ profile.displayName ?? auth.displayName ?? auth.user?.email }}
            </dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">邮箱</dt>
            <dd class="mt-1 text-slate-900 dark:text-slate-100">
              {{ auth.user?.email }}
            </dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">PIIC</dt>
            <dd class="mt-1 text-slate-900 dark:text-slate-100">
              {{ profile.piic ?? '-' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-500">
              注册时间
            </dt>
            <dd class="mt-1 text-slate-900 dark:text-slate-100">
              {{
                auth.user?.createdAt
                  ? new Date(auth.user.createdAt).toLocaleString()
                  : '-'
              }}
            </dd>
          </div>
        </dl>
      </UCard>

      <UCard class="bg-white/80 backdrop-blur-sm dark:bg-slate-900/60">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              联系方式
            </h2>
            <UBadge color="primary" variant="soft">同步</UBadge>
          </div>
        </template>

        <div v-if="contacts.length" class="space-y-3">
          <div
            v-for="contact in contacts"
            :key="contact.id"
            class="rounded-xl border border-slate-200/70 p-3 text-sm dark:border-slate-700/70"
          >
            <p class="font-medium text-slate-900 dark:text-white">
              {{ contact.channel?.displayName ?? contact.channel?.key }}
            </p>
            <p class="text-slate-600 dark:text-slate-300">
              {{ contact.value }}
            </p>
          </div>
        </div>
        <div
          v-else
          class="flex h-32 items-center justify-center text-sm text-slate-500 dark:text-slate-400"
        >
          暂无联系方式记录。
        </div>
      </UCard>
    </div>

    <UCard
      v-else
      class="flex flex-col items-center gap-4 bg-white/80 py-12 text-center backdrop-blur-sm dark:bg-slate-900/60"
    >
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
        需要登录
      </h2>
      <p class="max-w-sm text-sm text-slate-600 dark:text-slate-300">
        登录后即可查看您的玩家档案，了解账号与联系方式等信息。
      </p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>
