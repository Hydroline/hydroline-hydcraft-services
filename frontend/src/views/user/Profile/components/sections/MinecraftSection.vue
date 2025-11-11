<script setup lang="ts">
import { ref } from 'vue'
import type { NormalizedLuckpermsGroup } from '@/utils/luckperms'

const imageLoadStates = ref<Record<string, boolean>>({})

const props = defineProps<{
  bindings: Array<{
    id?: string | null
    username: string
    realname?: string | null
    boundAt?: string | Date | null
    ip?: string | null
    ipLocation?: string | null
    regip?: string | null
    regipLocation?: string | null
    lastlogin?: number | null
    regdate?: number | null
    permissions?: {
      primaryGroup: string | null
      primaryGroupDisplayName: string | null
      groups: NormalizedLuckpermsGroup[]
    } | null
    isPrimary?: boolean
  }>
  isEditing: boolean
  loading?: boolean
  primaryLoadingId?: string | null
}>()
const emit = defineEmits<{
  (e: 'add'): void
  (e: 'unbind', payload: { username: string; realname?: string | null }): void
  (e: 'set-primary', payload: { id: string | null }): void
}>()

function resolveGroupLabel(
  name: string | null | undefined,
  displayName: string | null | undefined,
) {
  if (displayName && name && displayName !== name) {
    return `${displayName}（${name}）`
  }
  return displayName || name || ''
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="px-1 text-lg text-slate-600 dark:text-slate-300">账户绑定</h3>
      <div>
        <UButton
          size="sm"
          variant="ghost"
          :loading="props.loading"
          @click="emit('add')"
          >添加绑定</UButton
        >
      </div>
    </div>

    <div v-if="props.loading" class="space-y-3">
      <div
        v-for="n in 2"
        :key="n"
        class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        <div class="flex items-center gap-3">
          <USkeleton class="h-8 w-8 rounded" animated />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-32" animated />
            <USkeleton class="h-3 w-24" animated />
          </div>
        </div>
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <USkeleton v-for="m in 3" :key="m" class="h-3 w-full" animated />
        </div>
        <div class="mt-4 space-y-2">
          <USkeleton class="h-3 w-16" animated />
          <div class="flex flex-wrap gap-2">
            <USkeleton v-for="k in 3" :key="k" class="h-6 w-16" animated />
          </div>
        </div>
        <div class="mt-4 flex items-center gap-2">
          <USkeleton class="h-9 flex-1 rounded" animated />
        </div>
      </div>
    </div>
    <div v-else class="space-y-3">
      <div
        v-if="props.bindings.length === 0"
        class="rounded-xl border border-dashed border-slate-200/70 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
      >
        尚未绑定 AuthMe 账号，点击右上方“添加绑定”以绑定账号。
      </div>

      <div
        v-for="b in props.bindings"
        :key="b.username"
        class="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-700/60"
      >
        <div class="flex flex-col">
          <div
            class="flex gap-2 text-lg font-medium text-slate-700 dark:text-slate-200"
          >
            <div class="flex-1 flex items-center gap-2">
              <span class="relative">
                <USkeleton
                  v-show="!imageLoadStates[b.username]"
                  class="h-6 w-6 rounded"
                  animated
                />
                <img
                  :src="'https://mc-heads.net/avatar/' + b.username"
                  class="h-6 w-6 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                  :class="{
                    'opacity-0 absolute': !imageLoadStates[b.username],
                  }"
                  @load="imageLoadStates[b.username] = true"
                  @error="imageLoadStates[b.username] = true"
                />
              </span>
              <span class="leading-none">
                {{ b.realname || b.username }}
              </span>
              <UBadge
                v-if="b.isPrimary"
                size="xs"
                color="primary"
                variant="soft"
              >
                主账号
              </UBadge>
            </div>

            <div class="flex items-center gap-1">
              <UTooltip v-if="!b.isPrimary && b.id" text="设为主账号">
                <UButton
                  type="button"
                  color="primary"
                  variant="ghost"
                  icon="i-lucide-star"
                  aria-label="设为主账号"
                  :loading="props.primaryLoadingId === b.id"
                  @click="emit('set-primary', { id: b.id ?? null })"
                />
              </UTooltip>
              <UTooltip text="解除绑定">
                <UButton
                  type="button"
                  color="error"
                  variant="ghost"
                  :loading="props.loading"
                  icon="i-lucide-link-2-off"
                  aria-label="解除绑定"
                  @click="
                    emit('unbind', {
                      username: b.username,
                      realname: b.realname,
                    })
                  "
                />
              </UTooltip>
            </div>
          </div>
          <div
            class="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 md:grid-cols-3"
          >
            <div v-if="b.boundAt" class="text-xs">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                账户绑定时间
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{
                  typeof b.boundAt === 'string'
                    ? new Date(b.boundAt).toLocaleString()
                    : b.boundAt?.toLocaleString?.()
                }}
              </div>
            </div>

            <div v-if="b.lastlogin">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                上次登录时间
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ new Date(b.lastlogin).toLocaleString() }}
              </div>
            </div>

            <div v-if="b.regdate">
              <div
                class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500"
              >
                注册时间
                <UTooltip
                  text="服务器登录数据库在2023年7月重置过一次，此前已经登录服务器注册过的玩家的信息已丢失"
                >
                  <button
                    type="button"
                    class="text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    <UIcon name="i-lucide-info" class="h-3 w-3" />
                  </button>
                </UTooltip>
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ new Date(b.regdate).toLocaleString() }}
              </div>
            </div>

            <div v-if="b.ip">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                上次登录 IP
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ b.ip }}
                <span class="block text-[10px] leading-none">
                  {{ b.ipLocation }}
                </span>
              </div>
            </div>

            <div v-if="b.regip">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                注册 IP
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ b.regip }}
                <span class="block text-[10px] leading-none">
                  {{ b.regipLocation }}
                </span>
              </div>
            </div>

            <div v-if="b.permissions?.primaryGroupDisplayName">
              <div class="text-xs text-slate-500 dark:text-slate-500">
                服务器权限组
              </div>
              <div
                class="text-base font-semibold text-slate-800 dark:text-slate-300"
              >
                {{ b.permissions?.primaryGroupDisplayName }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
