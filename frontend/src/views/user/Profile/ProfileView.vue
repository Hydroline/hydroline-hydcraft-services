<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const profile = computed(() => auth.user?.profile ?? {})
const contacts = computed(() => auth.user?.contacts ?? [])
</script>

<template>
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        个人资料
      </h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        后续将在此页面提供更完整的资料编辑能力，目前仅展示账号信息。
      </p>
    </header>

    <div class="grid gap-6 md:grid-cols-[1.2fr_1fr]">
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
  </section>
</template>
