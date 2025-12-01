<script setup lang="ts">
import dayjs from 'dayjs'
import type { AdminUserDetail } from '@/types/admin'

const { detail, minecraftProfiles } = defineProps<{
  detail: AdminUserDetail | null
  minecraftProfiles: Array<{
    id: string
    isPrimary?: boolean
    nickname: string | null
  }>
}>()

const emit = defineEmits<{
  (e: 'openAddNickname'): void
  (e: 'openCreateBinding'): void
  (e: 'openBindingHistory'): void
  (e: 'markPrimaryBinding', bindingId: string): void
  (e: 'unbind', bindingId: string): void
  (e: 'markPrimaryMinecraft', profileId: string): void
  (e: 'deleteMinecraftProfile', profileId: string): void
}>()
</script>

<template>
  <section
    class="rounded-2xl p-6 border border-slate-200/70 dark:border-slate-800/70"
  >
    <div class="flex gap-2 items-center justify-between">
      <div class="text-sm tracking-wide text-slate-500 dark:text-slate-400">
        服务器账户
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="!detail"
          @click="emit('openAddNickname')"
          >添加昵称</UButton
        >
        <UButton
          size="sm"
          color="primary"
          variant="ghost"
          :disabled="!detail"
          @click="emit('openCreateBinding')"
          >新增绑定</UButton
        >
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="!detail"
          @click="emit('openBindingHistory')"
          >流转记录</UButton
        >
      </div>
    </div>

    <div class="mt-2 flex flex-row gap-6 md:grid md:grid-cols-2">
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500 mb-2">
          Minecraft ID
        </div>
        <ul class="space-y-2">
          <li
            v-for="binding in detail?.authmeBindings ?? []"
            :key="binding.id"
            class="rounded-lg bg-slate-100/60 px-4 py-2 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
          >
            <div class="flex justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-900 dark:text-white">{{
                  binding.authmeRealname ?? binding.authmeUsername ?? '未知'
                }}</span>
                <UBadge
                  v-if="
                    binding.id &&
                    binding.id === detail?.profile?.primaryAuthmeBindingId
                  "
                  variant="soft"
                  size="xs"
                  >主绑定</UBadge
                >
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-if="
                    binding.id &&
                    binding.id !== detail?.profile?.primaryAuthmeBindingId
                  "
                  size="xs"
                  color="primary"
                  variant="link"
                  @click="emit('markPrimaryBinding', binding.id)"
                  >设为主绑定</UButton
                >
                <UButton
                  v-if="binding.id"
                  size="xs"
                  color="error"
                  variant="link"
                  @click="emit('unbind', binding.id)"
                  >解绑</UButton
                >
              </div>
            </div>
            <div>
              <span class="text-xs font-semibold" v-if="binding.authmeUuid">{{
                binding.authmeUuid
              }}</span>
            </div>
          </li>
          <li v-if="!detail" class="text-xs text-slate-500 dark:text-slate-400">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </li>
          <li
            v-else-if="(detail?.authmeBindings?.length ?? 0) === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无绑定
          </li>
        </ul>
      </div>

      <div>
        <div class="text-xs text-slate-500 dark:text-slate-500 mb-2">昵称</div>
        <ul class="space-y-2">
          <li
            v-for="p in minecraftProfiles"
            :key="p.id"
            class="rounded-lg bg-slate-100/60 px-4 py-2 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
          >
            <div class="flex justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-900 dark:text-white">{{
                  p.nickname || '未命名'
                }}</span>
                <UBadge v-if="p.isPrimary" variant="soft" size="xs"
                  >主称呼</UBadge
                >
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-if="!p.isPrimary"
                  size="xs"
                  color="primary"
                  variant="link"
                  @click="emit('markPrimaryMinecraft', p.id)"
                  >设为主</UButton
                >
                <UButton
                  size="xs"
                  color="error"
                  variant="link"
                  @click="emit('deleteMinecraftProfile', p.id)"
                  >删除</UButton
                >
              </div>
            </div>
          </li>
          <li v-if="!detail" class="text-xs text-slate-500 dark:text-slate-400">
            <UIcon
              name="i-lucide-loader-2"
              class="inline-block h-4 w-4 animate-spin"
            />
          </li>
          <li
            v-else-if="minecraftProfiles.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
          >
            暂无昵称
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
