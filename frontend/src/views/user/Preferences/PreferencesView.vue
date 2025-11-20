<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()

const isAuthenticated = computed(() => auth.isAuthenticated)

function openLoginDialog() {
  ui.openLoginDialog()
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        用户偏好设置
      </h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        管理您的站点使用体验。后续将逐步提供更多自定义选项。
      </p>
    </header>

    <div v-if="isAuthenticated" class="grid gap-6 md:grid-cols-2">
      <UCard class="bg-white/80 backdrop-blur-sm dark:bg-slate-900/60">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              主题偏好
            </h2>
            <UBadge color="primary" variant="soft">即将开放</UBadge>
          </div>
        </template>
        <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          我们正在构建更多个性化体验，敬请期待。当前可以通过右上角的主题切换快速在亮色与暗色之间切换。
        </p>
      </UCard>
      <UCard class="bg-white/80 backdrop-blur-sm dark:bg-slate-900/60">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              通知设置
            </h2>
            <UBadge color="primary" variant="soft">规划中</UBadge>
          </div>
        </template>
        <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          我们将提供邮件、站内信等通知渠道的开关配置，请关注后续更新。
        </p>
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
        登录后即可管理您的个性化设置。请先登录账号以继续。
      </p>
      <UButton color="primary" @click="openLoginDialog">立即登录</UButton>
    </UCard>
  </section>
</template>
