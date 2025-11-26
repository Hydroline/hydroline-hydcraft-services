<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  PlayerActionsResponse,
  PlayerMinecraftResponse,
  PlayerStatsResponse,
  PlayerSummary,
  PortalOwnershipOverview,
} from '@/types/portal'

const props = defineProps<{
  isViewingSelf: boolean
  summary: PlayerSummary | null
  actions: PlayerActionsResponse | null
  ownership: PortalOwnershipOverview | null
  minecraft: PlayerMinecraftResponse | null
  stats: PlayerStatsResponse | null
  statsPeriod: string
  formatDateTime: (value: string | null | undefined) => string
  formatMetricValue: (value: number, unit: string) => string
}>()

const emit = defineEmits<{
  (e: 'update:statsPeriod', value: string): void
  (e: 'refresh-actions', page: number): void
  (e: 'authme-reset'): void
  (e: 'force-login'): void
  (e: 'open-permission-dialog'): void
  (e: 'open-restart-dialog'): void
}>()

const statsPeriodModel = computed({
  get: () => props.statsPeriod,
  set: (value: string) => emit('update:statsPeriod', value),
})

const showAuthmeBindingsModal = ref(false)
</script>

<template>
  <div class="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
    <div class="space-y-6">
      <div>
        <div v-if="props.summary" class="space-y-3">
          <div class="flex flex-col gap-4">
            <div class="flex gap-2 select-none">
              <img
                v-if="props.summary.avatarUrl"
                :src="props.summary.avatarUrl"
                :alt="props.summary.displayName ?? props.summary.email"
                class="h-16 w-16 rounded-xl border border-slate-200 object-cover dark:border-slate-700 shadow"
              />

              <img
                v-if="props.summary.authmeBindings[0]"
                :src="`https://mc-heads.net/avatar/${
                  props.summary.authmeBindings[0]?.username
                }/64`"
                :alt="props.summary.authmeBindings[0]?.username ?? 'MC Avatar'"
                class="h-16 w-16 rounded-xl border border-slate-200 object-cover dark:border-slate-700 shadow"
              />

              <button
                v-if="props.summary.authmeBindings.length > 1"
                @click="showAuthmeBindingsModal = true"
                class="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-lg font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                ...
              </button>
            </div>
            <div>
              <p class="font-semibold text-slate-700 dark:text-white">
                <span class="text-2xl">
                  {{
                    props.summary.minecraftProfiles[0].nickname ||
                    props.summary.authmeBindings[0]?.realname
                  }}
                </span>
                <span
                  class="mx-2 select-none"
                  v-if="
                    props.summary.authmeBindings[0]?.realname &&
                    props.summary.minecraftProfiles[0]?.nickname
                  "
                  >/</span
                >
                <span
                  v-if="
                    props.summary.authmeBindings[0]?.realname &&
                    props.summary.minecraftProfiles[0]?.nickname
                  "
                >
                  {{ props.summary.authmeBindings[0]?.realname }}
                </span>
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {{ props.summary.id }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="props.summary">
        <div
          class="grid grid-cols-1 gap-3 text-sm text-slate-700 dark:text-slate-200"
        >
          <div>
            <dt class="text-xs text-slate-500 dark:text-slate-400">注册时间</dt>
            <dd>{{ props.formatDateTime(props.summary.createdAt) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-slate-500 dark:text-slate-400">最近登录</dt>
            <dd>
              {{ props.formatDateTime(props.summary.lastLoginAt) }}
              <span
                v-if="props.summary.lastLoginLocation"
                class="text-xs text-slate-500 dark:text-slate-400"
              >
                · {{ props.summary.lastLoginLocation }}
              </span>
            </dd>
          </div>

          <RouterLink
            v-if="isViewingSelf"
            to="/profile"
            class="inline-flex items-center gap-2 rounded-full border border-primary-200 px-4 py-1.5 text-sm font-medium text-primary-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-primary-500/40 dark:text-primary-200"
          >
            <UIcon name="i-lucide-id-card" class="h-4 w-4" />
            管理用户信息
          </RouterLink>
        </div>
      </div>

      <div>
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          操作记录
        </p>
        <div v-if="props.actions?.items.length" class="space-y-3 text-sm">
          <div
            v-for="item in props.actions.items"
            :key="item.id"
            class="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800/70"
          >
            <p class="font-semibold text-slate-900 dark:text-white">
              {{ item.action }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ props.formatDateTime(item.createdAt) }}
            </p>
            <p
              v-if="item.reason"
              class="text-xs text-slate-600 dark:text-slate-300"
            >
              {{ item.reason }}
            </p>
          </div>
          <UButton
            v-if="
              props.actions?.pagination.pageCount &&
              props.actions.pagination.page < props.actions.pagination.pageCount
            "
            block
            variant="ghost"
            color="neutral"
            @click="emit('refresh-actions', props.actions.pagination.page + 1)"
          >
            查看更多
          </UButton>
        </div>
        <p
          v-else
          class="text-center text-sm text-slate-500 dark:text-slate-400"
        >
          暂无操作记录
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <div
        class="rounded-lg p-4 bg-white/85 backdrop-blur dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"
      >
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          名下资产
        </p>
        <div v-if="props.ownership" class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              AuthMe 绑定
            </p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.authmeBindings }}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Minecraft 档案
            </p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.minecraftProfiles }}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">公司/铁路</p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.companyCount + props.ownership.railwayCount }}
            </p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">角色授权</p>
            <p class="text-2xl font-semibold text-slate-900 dark:text-white">
              {{ props.ownership.roleAssignments }}
            </p>
          </div>
        </div>
        <USkeleton v-else class="h-28 w-full" />
      </div>

      <div
        class="rounded-lg p-4 bg-white/85 backdrop-blur dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"
      >
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            服务器账户
          </p>
          <UBadge color="primary" variant="soft">
            {{ props.minecraft?.permissionRoles.length ?? 0 }} 权限组
          </UBadge>
        </div>
        <div v-if="props.minecraft" class="space-y-4">
          <div
            v-for="binding in props.minecraft.bindings"
            :key="binding.id"
            class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800/70"
          >
            <p class="font-semibold text-slate-900 dark:text-white">
              {{ binding.username }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              绑定时间：{{ props.formatDateTime(binding.boundAt) }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="role in props.minecraft.permissionRoles"
              :key="role.id"
              color="neutral"
              variant="soft"
            >
              {{ role.name || role.key }}
            </UBadge>
          </div>
        </div>
        <USkeleton v-else class="h-32 w-full" />
      </div>

      <div
        class="rounded-lg p-4 bg-white/85 backdrop-blur dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"
      >
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            统计信息
          </p>
          <USelectMenu
            v-model="statsPeriodModel"
            :options="[
              { label: '近 30 天', value: '30d' },
              { label: '近 7 天', value: '7d' },
              { label: '全部', value: 'all' },
            ]"
            class="w-28"
          />
        </div>
        <div v-if="props.stats" class="grid gap-4 md:grid-cols-2">
          <div
            v-for="metric in props.stats.metrics"
            :key="metric.id"
            class="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800/70"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ metric.label }}
            </p>
            <p class="text-xl font-semibold text-slate-900 dark:text-white">
              {{ props.formatMetricValue(metric.value, metric.unit) }}
            </p>
          </div>
        </div>
        <USkeleton v-else class="h-28 w-full" />
      </div>

      <div
        class="rounded-lg p-4 bg-white/85 backdrop-blur dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"
      >
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
          自助操作
        </p>
        <div class="grid gap-3 md:grid-cols-2">
          <UButton color="primary" variant="soft" @click="emit('authme-reset')">
            AuthMe 密码重置
          </UButton>
          <UButton color="primary" variant="ghost" @click="emit('force-login')">
            强制登陆
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            @click="emit('open-permission-dialog')"
          >
            权限组调整申请
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="emit('open-restart-dialog')"
          >
            炸服重启申请
          </UButton>
        </div>
      </div>
    </div>
  </div>

  <!-- Multiple AuthMe Bindings Modal -->
  <Teleport to="body">
    <div
      v-if="showAuthmeBindingsModal && props.summary?.authmeBindings"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70"
      @click="showAuthmeBindingsModal = false"
    >
      <div
        class="max-h-96 w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-900"
        @click.stop
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            所有 AuthMe 绑定
          </h3>
          <button
            @click="showAuthmeBindingsModal = false"
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <div class="max-h-80 overflow-y-auto">
          <div
            v-for="binding in props.summary.authmeBindings"
            :key="binding.uuid || binding.username"
            class="mb-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
          >
            <div class="mb-2 flex items-start justify-between">
              <div>
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ binding.username }}
                </p>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  {{ binding.realname }}
                </p>
              </div>
              <span
                :class="[
                  'rounded-full px-2 py-1 text-xs font-medium',
                  binding.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                ]"
              >
                {{ binding.status }}
              </span>
            </div>
            <div class="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <p>
                UUID: <span class="font-mono">{{ binding.uuid }}</span>
              </p>
              <p>绑定于: {{ props.formatDateTime(binding.boundAt) }}</p>
            </div>
          </div>
        </div>

        <div class="mt-4 flex gap-2">
          <button
            @click="showAuthmeBindingsModal = false"
            class="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
